import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const { subtle } = webcrypto;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.jwk');
const ISSUED_PATH = path.join(__dirname, 'issued.json');
const REVOKED_PATH = path.join(root, 'licenses', 'revoked.json');
const WORKER_DIR = path.join(root, 'worker');

function buf2b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`Warning: ${filePath} is corrupt JSON, treating as empty. (${e.message})`);
        return fallback;
    }
}

async function keygen() {
    if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
    if (fs.existsSync(PRIVATE_KEY_PATH)) {
        console.error(`A private key already exists at ${PRIVATE_KEY_PATH}. Refusing to overwrite it - that would invalidate every code you've already issued. Delete it manually first if you really mean to rotate keys.`);
        process.exit(1);
    }

    const keyPair = await subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );

    const privateJwk = await subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);

    fs.writeFileSync(PRIVATE_KEY_PATH, JSON.stringify(privateJwk, null, 2));

    console.log("Keys generated successfully.");
    console.log(`Private JWK written to ${PRIVATE_KEY_PATH} (never commit this).`);
    console.log("\nPublic JWK - embed this exact object in BOTH js/license.js (PUBLIC_JWK)");
    console.log("and worker/src/index.js (SIGNING_PUBLIC_JWK). It is not a secret.");
    console.log(JSON.stringify(publicJwk, null, 2));
}

async function loadPrivateKey() {
    if (!fs.existsSync(PRIVATE_KEY_PATH)) {
        console.error("No private key found. Run 'keygen' first.");
        process.exit(1);
    }
    const jwk = JSON.parse(fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'));
    return subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

function generateId() {
    return Buffer.from(webcrypto.getRandomValues(new Uint8Array(4))).toString('hex');
}

async function signCode(id, tier, exp) {
    const privateKey = await loadPrivateKey();
    const payload = { id, tier, exp };
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = buf2b64url(Buffer.from(payloadStr));
    const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, Buffer.from(payloadStr));
    const sigB64 = buf2b64url(signature);
    return `GAMUT-${payloadB64}.${sigB64}`;
}

// Passing the JSON value as a raw CLI argument is not safe on this
// machine: execSync spawns through cmd.exe on Windows, and manual
// single-quote wrapping (the original approach) does NOT survive it -
// cmd.exe strips embedded double-quotes and leaves the literal single
// quotes in the stored value, corrupting every record so JSON.parse
// on the read side throws. Confirmed by testing both execSync string
// quoting and execFileSync with shell:true - neither round-trips a
// JSON string correctly on Windows. `wrangler kv key put --path`
// reads the value from a file instead, which sidesteps the problem
// entirely: only a plain, self-controlled temp file path needs to
// survive shell quoting, never the JSON content itself.
function remoteKvPut(key, value) {
    const tmpFile = path.join(os.tmpdir(), `gamut-kv-${crypto_randomHex()}.json`);
    fs.writeFileSync(tmpFile, value, 'utf8');
    try {
        execSync(`wrangler kv key put --binding LICENSES "${key}" --path "${tmpFile}" --remote`, { cwd: WORKER_DIR, stdio: 'inherit' });
    } finally {
        fs.unlinkSync(tmpFile);
    }
}

function crypto_randomHex() {
    return Buffer.from(webcrypto.getRandomValues(new Uint8Array(8))).toString('hex');
}

function remoteKvGet(key) {
    // --text forces utf8 decoding instead of wrangler's default of
    // guessing/base64-ing binary-looking output - keys here are only
    // ever written by this tool or the worker, both plain JSON text.
    try {
        const out = execSync(`wrangler kv key get --binding LICENSES "${key}" --remote --text`, { cwd: WORKER_DIR, encoding: 'utf-8' });
        return out && out.trim() ? out : null;
    } catch (e) {
        return null; // not found, or wrangler/auth unavailable - caller decides how to handle
    }
}

function remoteKvList() {
    const output = execSync(`wrangler kv key list --binding LICENSES --remote`, { cwd: WORKER_DIR, encoding: 'utf-8' });
    const keys = JSON.parse(output);
    const results = [];
    for (const k of keys) {
        const val = remoteKvGet(k.name);
        if (val) {
            try { results.push({ key: k.name, data: JSON.parse(val) }); }
            catch { results.push({ key: k.name, data: val }); }
        }
    }
    return results;
}

async function issue(args) {
    if (!args.values.tier || !args.values.expires || !args.values.note) {
        console.error("Missing required arguments for issue: --tier, --expires, --note");
        process.exit(1);
    }

    const tier = args.values.tier;
    let exp = null;
    if (args.values.expires !== 'never') {
        const d = new Date(args.values.expires);
        if (isNaN(d.getTime())) {
            console.error("Invalid expires format. Use YYYY-MM-DD or 'never'");
            process.exit(1);
        }
        exp = d.getTime();
    }

    const id = generateId();
    const code = await signCode(id, tier, exp);

    const record = {
        id, tier, status: "active", exp,
        source: "manual",
        note: args.values.note,
        issuedAt: Date.now(),
        code
    };

    // Always keep the local ledger regardless of --remote, so `list`
    // and offline auditing work without a network call.
    const issued = readJson(ISSUED_PATH, []);
    issued.push(record);
    fs.writeFileSync(ISSUED_PATH, JSON.stringify(issued, null, 2));

    if (args.values.remote) {
        try {
            remoteKvPut(`license:${id}`, JSON.stringify(record));
            console.log("License issued (local ledger + remote KV):");
        } catch (e) {
            console.error(`Remote KV write failed (${e.message}). The code below is still valid via offline signature verification, but instant server-side revocation won't work for it until you retry: node tools/license-admin.mjs sync-remote ${id}`);
        }
    } else {
        console.log("License issued (local ledger only - the site's /verify won't know about it until it's synced remotely):");
        console.log(`Tip: re-run with --remote, or later run: node tools/license-admin.mjs sync-remote ${id}`);
    }

    console.log(code);
}

// Revocation is the one place a mistake actually costs the owner
// money (a customer keeps access they shouldn't), so this does NOT
// take a --remote flag - it always writes both places it can reach.
// The static licenses/revoked.json remains the fallback for clients
// that can't reach the worker (offline, CSP misconfigured, outage);
// remote KV is what /verify actually checks day to day. Silently
// doing only one of the two, depending on a flag the owner has to
// remember, is exactly the trap that caused this rewrite.
async function revoke(id) {
    if (!id) {
        console.error("Missing license ID to revoke.");
        process.exit(1);
    }

    // 1. Static file (always - offline/CSP-down fallback)
    const revokedData = readJson(REVOKED_PATH, { revoked: [] });
    if (!revokedData.revoked.includes(id)) {
        revokedData.revoked.push(id);
        fs.mkdirSync(path.dirname(REVOKED_PATH), { recursive: true });
        fs.writeFileSync(REVOKED_PATH, JSON.stringify(revokedData, null, 2));
        console.log(`[static] Added ${id} to licenses/revoked.json - commit and push this file to deploy it.`);
    } else {
        console.log(`[static] ${id} was already in licenses/revoked.json.`);
    }

    // 2. Remote KV (the one that actually matters once the backend is live)
    let existing = remoteKvGet(`license:${id}`);
    let record;
    if (existing) {
        try { record = JSON.parse(existing); } catch { record = null; }
    }
    if (!record) {
        // Not in KV yet (issued before the backend existed, or issued
        // without --remote). Write a minimal revoked stub anyway so
        // /verify's KV check - which only looks at what's IN KV -
        // actually blocks it, instead of silently treating "not
        // found" as "must be fine".
        record = { id, status: 'revoked', tier: null, exp: null, source: 'manual-revoke-stub' };
        console.log(`[remote] ${id} was not in remote KV yet - writing a revoked stub so /verify blocks it.`);
    } else {
        record.status = 'revoked';
    }

    try {
        remoteKvPut(`license:${id}`, JSON.stringify(record));
        console.log(`[remote] ${id} is now revoked in KV - takes effect immediately, no push needed.`);
    } catch (e) {
        console.error(`[remote] Could not reach KV (${e.message}). The static-file revocation above still protects offline/CSP-blocked clients, but any client that CAN reach the worker will keep treating this code as valid until you retry this command with wrangler auth working.`);
    }
}

async function syncRemote(id) {
    if (!id) { console.error("Usage: sync-remote <id>"); process.exit(1); }
    const issued = readJson(ISSUED_PATH, []);
    const record = issued.find(r => r.id === id);
    if (!record) {
        console.error(`No local record for ${id}. Only locally-issued codes can be synced this way.`);
        process.exit(1);
    }
    remoteKvPut(`license:${id}`, JSON.stringify(record));
    console.log(`Synced ${id} to remote KV.`);
}

async function setPlanMap(args) {
    // e.g. node tools/license-admin.mjs set-plan-map plan_abc123=studio plan_def456=commercial
    const pairs = args.positionals.slice(1);
    if (pairs.length === 0) {
        console.error("Usage: set-plan-map <razorpay_plan_id>=<tier> [<razorpay_plan_id>=<tier> ...]");
        process.exit(1);
    }
    const existingRaw = remoteKvGet('config:planTierMap');
    const map = existingRaw ? JSON.parse(existingRaw) : {};
    for (const pair of pairs) {
        const [planId, tier] = pair.split('=');
        if (!planId || !tier || !['studio', 'commercial'].includes(tier)) {
            console.error(`Bad entry "${pair}" - expected <plan_id>=studio or <plan_id>=commercial`);
            process.exit(1);
        }
        map[planId] = tier;
    }
    remoteKvPut('config:planTierMap', JSON.stringify(map));
    console.log("Updated config:planTierMap:");
    console.log(JSON.stringify(map, null, 2));
}

function listUnmappedFlags() {
    const output = execSync(`wrangler kv key list --binding LICENSES --remote`, { cwd: WORKER_DIR, encoding: 'utf-8' });
    const keys = JSON.parse(output).filter(k => k.name.startsWith('flag:planmap:'));
    if (keys.length === 0) return;
    console.log(`\n⚠ ${keys.length} subscription(s) were issued at a fallback tier because their Razorpay plan_id had no mapping. Run set-plan-map, then re-issue correctly if needed:`);
    for (const k of keys) {
        const val = remoteKvGet(k.name);
        if (val) console.log(`  ${val}`);
    }
}

function list() {
    const issued = readJson(ISSUED_PATH, []);
    const revokedData = readJson(REVOKED_PATH, { revoked: [] });
    const revokedSet = new Set(revokedData.revoked);

    console.log(`Local ledger: ${issued.length} issued license(s).\n`);
    issued.forEach(item => {
        const isRevoked = revokedSet.has(item.id) || item.status === 'revoked';
        const expStr = item.exp ? new Date(item.exp).toISOString().split('T')[0] : 'never';
        const dateStr = new Date(item.issuedAt).toISOString().split('T')[0];
        console.log(`ID: ${item.id} | Tier: ${(item.tier||'').padEnd(10)} | Exp: ${expStr.padEnd(10)} | Revoked: ${isRevoked ? 'YES' : 'NO '} | Date: ${dateStr}`);
        console.log(`Note: ${item.note || ''}`);
        console.log(`Code: ${item.code}`);
        console.log('---');
    });
}

async function listRemote() {
    const records = remoteKvList().filter(r => r.key.startsWith('license:'));
    console.log(`Remote KV: ${records.length} license record(s).\n`);
    records.forEach(r => {
        const item = r.data;
        if (typeof item !== 'object') { console.log(`${r.key}: ${item}`); return; }
        const isRevoked = item.status === 'revoked';
        const expStr = item.exp ? new Date(item.exp).toISOString().split('T')[0] : 'never';
        const dateStr = item.issuedAt ? new Date(item.issuedAt).toISOString().split('T')[0] : 'unknown';
        console.log(`ID: ${item.id} | Tier: ${(item.tier||'').padEnd(10)} | Exp: ${expStr.padEnd(10)} | Revoked: ${isRevoked ? 'YES' : 'NO '} | Date: ${dateStr}`);
        console.log(`Source: ${item.source || 'manual'} | Ref: ${item.rzp_ref || 'none'} | TierSource: ${item.tierSource || 'n/a'}`);
        console.log(`Code: ${item.code || '(hidden)'}`);
        console.log('---');
    });
    listUnmappedFlags();
}

const args = parseArgs({
    allowPositionals: true,
    options: {
        tier: { type: 'string' },
        expires: { type: 'string' },
        note: { type: 'string' },
        remote: { type: 'boolean' }
    }
});

const command = args.positionals[0];

switch (command) {
    case 'keygen':
        await keygen();
        break;
    case 'issue':
        await issue(args);
        break;
    case 'revoke':
        await revoke(args.positionals[1]);
        break;
    case 'sync-remote':
        await syncRemote(args.positionals[1]);
        break;
    case 'set-plan-map':
        await setPlanMap(args);
        break;
    case 'list':
        if (args.values.remote) await listRemote();
        else list();
        break;
    default:
        console.error("Unknown command. Available: keygen, issue, revoke, sync-remote, set-plan-map, list [--remote]");
        console.error("revoke always updates both licenses/revoked.json (static fallback) and remote KV (instant, requires wrangler auth).");
        process.exit(1);
}
