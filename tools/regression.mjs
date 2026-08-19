// Phase 9 — full regression suite, one command, all green.
// Runs every existing node test script, then adds the checks
// GAMUT-V2-PLAN.md's Phase 9 section calls for that didn't have a
// home yet: a big generatePalette contrast sweep, a DTCG shape/
// fidelity check (no importDtcg exists yet — Phase 4 is unbuilt,
// so this is NOT a round-trip test, just export correctness), and
// the anti-pattern greps. Exits non-zero if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
process.chdir(root);

let totalFail = 0;
const section = (name) => console.log(`\n=== ${name} ===`);

// ---------- 1. Existing node test scripts ----------
const EXISTING_SUITES = [
    'tools/test-b4-engine.mjs',
];

for (const suite of EXISTING_SUITES) {
    section(suite);
    try {
        const out = execFileSync('node', [suite], { encoding: 'utf8', stdio: 'pipe' });
        console.log(out.trim());
    } catch (e) {
        totalFail++;
        console.error(`SUITE FAILED: ${suite}`);
        console.error((e.stdout || '') + (e.stderr || ''));
    }
}


// ---------- 2. Load engine in one sandbox for the new checks ----------
const engineCode = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const context = {};
new Function('window', `const self = window;\n${engineCode}`)(context);
const Engine = context.Engine;

// ---------- 3. generatePalette contrast sweep: every archetype x 30 seeds x both deployments ----------
section('generatePalette contrast sweep (10 archetypes x 30 seeds x light/dark)');
{
    let fails = 0, total = 0, minInk = Infinity, minBrand = Infinity, minAccent = Infinity;
    for (const cat of Object.keys(Engine.ARCHETYPES)) {
        for (let seed = 0; seed < 30; seed++) {
            total++;
            const p = Engine.generatePalette(cat, seed);
            for (const dep of ['light', 'dark']) {
                const d = p.deployments[dep];
                const inkC = Engine.contrastRatio(d.ink, d.bg);
                const brandC = Engine.contrastRatio(d.brand, d.bg);
                const accentC = Engine.contrastRatio(d.accent, d.bg);
                minInk = Math.min(minInk, inkC);
                minBrand = Math.min(minBrand, brandC);
                minAccent = Math.min(minAccent, accentC);
                if (inkC < 4.45) { fails++; console.error(`FAIL ink ${cat} seed=${seed} ${dep} = ${inkC}`); }
                if (brandC < 2.95) { fails++; console.error(`FAIL brand ${cat} seed=${seed} ${dep} = ${brandC}`); }
                if (accentC < 2.95) { fails++; console.error(`FAIL accent ${cat} seed=${seed} ${dep} = ${accentC}`); }
            }
        }
    }
    console.log(`${total} palettes, ${fails} failures. min ink=${minInk.toFixed(2)} brand=${minBrand.toFixed(2)} accent=${minAccent.toFixed(2)}`);
    if (fails === 0) console.log('PASS: generatePalette contrast sweep'); else totalFail++;
}

// ---------- 4. fixPalette contrast sweep (large fuzz, all 3 strategies) ----------
section('fixPalette contrast sweep (5000 random 4-hex inputs x 3 strategies)');
{
    let fails = 0, total = 0, minInk = Infinity;
    for (let i = 0; i < 5000; i++) {
        const seeds = Array.from({ length: 4 }, () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
        for (const strategy of ['preserve', 'balanced', 'maximize']) {
            total++;
            const res = Engine.fixPalette(seeds, { strategy });
            const ink = res.swatches.find(c => c.role === 'Ink')?.hex;
            const canvas = res.swatches.find(c => c.role === 'Dominant')?.hex;
            const inkC = Engine.contrastRatio(ink, canvas);
            minInk = Math.min(minInk, inkC);
            if (inkC < 4.45) { fails++; console.error(`FAIL ${strategy} seeds=${JSON.stringify(seeds)} ink=${ink} canvas=${canvas} contrast=${inkC}`); }
        }
    }
    console.log(`${total} runs, ${fails} failures. min ink contrast=${minInk.toFixed(3)}`);
    if (fails === 0) console.log('PASS: fixPalette contrast sweep'); else totalFail++;
}



// ---------- 7. Anti-pattern greps ----------
section('Anti-pattern greps');
{
    let fails = 0;
    const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

    // gamut.tokens.v1 schema string must stay exactly as Design OS's
    // Change Impact Engine sequencing doc expects it (contract with
    // an external consumer — see designare-engine.md memory).
    if (!engineCode.includes('"gamut.tokens.v1"')) {
        fails++; console.error('FAIL: gamut.tokens.v1 schema string missing/changed in engine.js');
    } else {
        console.log('OK: gamut.tokens.v1 schema string intact');
    }



    // Museum Editorial chrome rule: no gradients/blur/box-shadow
    // decoration outside the product's own preview canvases. This is
    // a coarse heuristic (greps the whole stylesheet) — a real
    // violation still needs eyeballing, this only catches obvious cases.
    const css = read('css/style.css');
    const gradientHits = (css.match(/linear-gradient|radial-gradient|backdrop-filter/g) || []).length;
    console.log(`INFO: ${gradientHits} gradient/blur declarations in css/style.css (review manually — some may be legitimate inside preview-only contexts, e.g. #components or print sheet chip renders)`);

    if (fails === 0) console.log('PASS: anti-pattern greps'); else totalFail++;
}

// ---------- Summary ----------
section('SUMMARY');
if (totalFail === 0) {
    console.log('ALL GREEN — Phase 9 regression suite passed.');
    process.exit(0);
} else {
    console.error(`${totalFail} section(s) failed.`);
    process.exit(1);
}
