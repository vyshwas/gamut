import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { subtle } = webcrypto;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.jwk');
const ISSUED_PATH = path.join(__dirname, 'issued.json');
const REVOKED_PATH = path.join(__dirname, '../licenses/revoked.json');

function buf2b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

async function keygen() {
    if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
    
    const keyPair = await subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );
    
    const privateJwk = await subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
    
    fs.writeFileSync(PRIVATE_KEY_PATH, JSON.stringify(privateJwk, null, 2));
    
    console.log("Keys generated successfully.");
    console.log(`Private JWK written to ${PRIVATE_KEY_PATH}`);
    console.log("\nPublic JWK (Embed this in js/license.js):");
    console.log(JSON.stringify(publicJwk, null, 2));
}

async function loadPrivateKey() {
    if (!fs.existsSync(PRIVATE_KEY_PATH)) {
        console.error("No private key found. Run 'keygen' first.");
        process.exit(1);
    }
    const jwk = JSON.parse(fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'));
    return subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
}

function generateId() {
    return Buffer.from(webcrypto.getRandomValues(new Uint8Array(4))).toString('hex');
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
    
    const privateKey = await loadPrivateKey();
    const id = generateId();
    const payload = { id, tier, exp };
    
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = buf2b64url(Buffer.from(payloadStr));
    
    const signature = await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        Buffer.from(payloadStr)
    );
    
    const sigB64 = buf2b64url(signature);
    
    const code = `GAMUT-${payloadB64}.${sigB64}`;
    
    let issued = [];
    if (fs.existsSync(ISSUED_PATH)) {
        issued = JSON.parse(fs.readFileSync(ISSUED_PATH, 'utf-8'));
    }
    
    issued.push({
        id,
        tier,
        exp,
        note: args.values.note,
        issuedAt: Date.now(),
        code
    });
    
    fs.writeFileSync(ISSUED_PATH, JSON.stringify(issued, null, 2));
    
    console.log("License issued successfully:");
    console.log(code);
}

function revoke(id) {
    if (!id) {
        console.error("Missing license ID to revoke.");
        process.exit(1);
    }
    
    let revokedData = { revoked: [] };
    if (fs.existsSync(REVOKED_PATH)) {
        revokedData = JSON.parse(fs.readFileSync(REVOKED_PATH, 'utf-8'));
    }
    
    if (!revokedData.revoked.includes(id)) {
        revokedData.revoked.push(id);
        fs.writeFileSync(REVOKED_PATH, JSON.stringify(revokedData, null, 2));
        console.log(`License ${id} has been added to revoked.json`);
        console.log("Remember to commit and push revoked.json to deploy the revocation.");
    } else {
        console.log(`License ${id} is already revoked.`);
    }
}

function list() {
    let issued = [];
    if (fs.existsSync(ISSUED_PATH)) {
        issued = JSON.parse(fs.readFileSync(ISSUED_PATH, 'utf-8'));
    }
    
    let revokedData = { revoked: [] };
    if (fs.existsSync(REVOKED_PATH)) {
        revokedData = JSON.parse(fs.readFileSync(REVOKED_PATH, 'utf-8'));
    }
    
    const revokedSet = new Set(revokedData.revoked);
    
    console.log(`Found ${issued.length} issued licenses.\n`);
    issued.forEach(item => {
        const isRevoked = revokedSet.has(item.id);
        const expStr = item.exp ? new Date(item.exp).toISOString().split('T')[0] : 'never';
        const dateStr = new Date(item.issuedAt).toISOString().split('T')[0];
        console.log(`ID: ${item.id} | Tier: ${item.tier.padEnd(10)} | Exp: ${expStr.padEnd(10)} | Revoked: ${isRevoked ? 'YES' : 'NO '} | Date: ${dateStr}`);
        console.log(`Note: ${item.note}`);
        console.log(`Code: ${item.code}`);
        console.log('---');
    });
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

const isRemote = args.values.remote;

import { execSync } from 'node:child_process';
const WORKER_DIR = path.join(__dirname, '../worker');

function remoteKvPut(key, value) {
    console.log(`Writing ${key} to remote KV...`);
    execSync(`wrangler kv key put --binding LICENSES "${key}" '${value}' --remote`, { cwd: WORKER_DIR, stdio: 'inherit' });
}

function remoteKvList() {
    console.log(`Fetching remote KV keys...`);
    const output = execSync(`wrangler kv key list --binding LICENSES --remote`, { cwd: WORKER_DIR, encoding: 'utf-8' });
    const keys = JSON.parse(output);
    const results = [];
    for (const k of keys) {
        const val = execSync(`wrangler kv key get --binding LICENSES "${k.name}" --remote`, { cwd: WORKER_DIR, encoding: 'utf-8' });
        results.push({ key: k.name, data: JSON.parse(val) });
    }
    return results;
}

const command = args.positionals[0];

// Redefining issue to support remote
const originalIssue = issue;
issue = async function(args) {
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
    
    const privateKey = await loadPrivateKey();
    const id = generateId();
    const payload = { id, tier, exp };
    
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = buf2b64url(Buffer.from(payloadStr));
    
    const signature = await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        Buffer.from(payloadStr)
    );
    
    const sigB64 = buf2b64url(signature);
    const code = `GAMUT-${payloadB64}.${sigB64}`;
    
    const record = {
        id,
        tier,
        status: "active",
        exp,
        source: "manual",
        note: args.values.note,
        issuedAt: Date.now(),
        code
    };

    if (isRemote) {
        remoteKvPut(`license:${id}`, JSON.stringify(record));
        console.log(`License ${id} issued remotely.`);
    } else {
        let issued = [];
        if (fs.existsSync(ISSUED_PATH)) {
            issued = JSON.parse(fs.readFileSync(ISSUED_PATH, 'utf-8'));
        }
        issued.push(record);
        fs.writeFileSync(ISSUED_PATH, JSON.stringify(issued, null, 2));
    }
    
    console.log("License issued successfully:");
    console.log(code);
};

const originalRevoke = revoke;
revoke = function(id) {
    if (!id) {
        console.error("Missing license ID to revoke.");
        process.exit(1);
    }
    if (isRemote) {
        try {
            const val = execSync(`wrangler kv key get --binding LICENSES "license:${id}" --remote`, { cwd: WORKER_DIR, encoding: 'utf-8' });
            if (!val || val.trim() === '') {
                console.error(`License ${id} not found in remote KV.`);
                return;
            }
            const record = JSON.parse(val);
            record.status = 'revoked';
            remoteKvPut(`license:${id}`, JSON.stringify(record));
            console.log(`License ${id} instantly revoked remotely.`);
        } catch (e) {
            console.error("Failed to revoke remotely.", e.message);
        }
    } else {
        originalRevoke(id);
    }
};

const originalList = list;
list = function() {
    if (isRemote) {
        const records = remoteKvList();
        console.log(`Found ${records.length} remote licenses.\n`);
        records.forEach(r => {
            const item = r.data;
            const isRevoked = item.status === 'revoked';
            const expStr = item.exp ? new Date(item.exp).toISOString().split('T')[0] : 'never';
            const dateStr = new Date(item.issuedAt).toISOString().split('T')[0];
            console.log(`ID: ${item.id} | Tier: ${item.tier.padEnd(10)} | Exp: ${expStr.padEnd(10)} | Revoked: ${isRevoked ? 'YES' : 'NO '} | Date: ${dateStr}`);
            console.log(`Source: ${item.source || 'manual'} | Ref: ${item.rzp_ref || 'none'}`);
            console.log(`Note: ${item.note || ''}`);
            console.log(`Code: ${item.code || '(hidden)'}`);
            console.log('---');
        });
    } else {
        originalList();
    }
};

switch (command) {
    case 'keygen':
        keygen();
        break;
    case 'issue':
        issue(args);
        break;
    case 'revoke':
        revoke(args.positionals[1]);
        break;
    case 'list':
        list();
        break;
    default:
        console.error("Unknown command. Available commands: keygen, issue, revoke, list");
        process.exit(1);
}
