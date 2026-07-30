import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Mock browser environment globally

global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

const localStorageData = {};
global.localStorage = {
    getItem: key => localStorageData[key] || null,
    setItem: (key, val) => { localStorageData[key] = String(val); },
    removeItem: key => { delete localStorageData[key]; }
};

global.fetch = async (url) => {
    if (url === 'licenses/revoked.json') {
        const p = path.join(process.cwd(), 'licenses', 'revoked.json');
        if (fs.existsSync(p)) {
            return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
        }
        return { ok: true, json: async () => ({ revoked: [] }) };
    }
    return { ok: false };
};

global.window = global;

// Evaluate license.js
const licenseCode = fs.readFileSync(path.join(process.cwd(), 'js', 'license.js'), 'utf8');
eval(licenseCode.replace('return await crypto.subtle.verify', 'return await crypto.subtle.verify'));

const License = global.License; global.console.log = console.log; License.testVerify = async (c) => await License.redeem(c);

async function runTests() {
    let failed = 0;
    
    // Test 1: Gate.has matrix
    localStorage.removeItem('gamut.license');
    await License.init();
    
    if (License.tier() !== 'free') {
        console.error("FAIL: Default tier should be free");
        failed++;
    }
    
    if (License.Gate.has('export-tailwind')) {
        console.error("FAIL: export-tailwind should be blocked on free");
        failed++;
    }
    
    // Ensure keys exist
    
    
    // Issue studio code
    const res = execSync('node tools/license-admin.mjs issue --tier studio --expires never --note "test"').toString();
    const code = res.match(/GAMUT-[A-Za-z0-9\-_]+.[A-Za-z0-9\-_]+/)[0];
    
    // Redeem valid code
    const r1 = await License.redeem(code);
    if (!r1.ok || r1.tier !== 'studio') {
        console.error("FAIL: Valid code failed to redeem", r1);
        failed++;
    }
    
    // Verify Gate changed
    if (!License.Gate.has('export-tailwind')) {
        console.error("FAIL: Gate did not open for studio");
        failed++;
    }
    
    // Tampered payload
    const tampered = code.replace('.', 'X.');
    const r2 = await License.redeem(tampered);
    if (r2.ok) {
        console.error("FAIL: Tampered code succeeded");
        failed++;
    }
    
    // Expired
    const expiredRes = execSync('node tools/license-admin.mjs issue --tier commercial --expires 2020-01-01 --note "expired"').toString();
    const expiredCode = expiredRes.match(/GAMUT-[A-Za-z0-9\-_]+.[A-Za-z0-9\-_]+/)[0];
    const r3 = await License.redeem(expiredCode);
    if (r3.ok) {
        console.error("FAIL: Expired code succeeded");
        failed++;
    }
    
    // Revoked
    const revokedRes = execSync('node tools/license-admin.mjs issue --tier studio --expires never --note "revoked"').toString();
    const revokedCode = revokedRes.match(/GAMUT-[A-Za-z0-9\-_]+.[A-Za-z0-9\-_]+/)[0];
    const payload = JSON.parse(Buffer.from(revokedCode.substring(6).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    execSync(`node tools/license-admin.mjs revoke ${payload.id}`);
    
    const r4 = await License.redeem(revokedCode);
    if (r4.ok) {
        console.error("FAIL: Revoked code succeeded");
        failed++;
    }
    
    if (failed === 0) {
        console.log("PASS: L4 Node tests completed successfully");
    } else {
        console.error(`FAILED ${failed} tests`);
        process.exit(1);
    }
}

runTests().catch(console.error);
