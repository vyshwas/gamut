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
    'tools/test-p6-extract.mjs',
    'figma-plugin/test/plugin.test.mjs',
    'figma-plugin/test/extract-to-variables.test.mjs',
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


// ---------- 2. Load engine + extract in one sandbox for the new checks ----------
const engineCode = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const extractCode = fs.readFileSync(path.join(root, 'js', 'extract.js'), 'utf8');
const context = {};
new Function('window', `const self = window;\n${engineCode}`)(context);
const Engine = context.Engine;
new Function('window', 'Engine', `const self = window;\n${extractCode}`)(context, Engine);
const Extractor = context.Extractor;

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

// ---------- 5. DTCG export shape + color fidelity ----------
// NOT a round-trip test: importDtcg doesn't exist yet (Phase 4 of
// GAMUT-V2-PLAN.md, unbuilt). This only checks exportDtcg's shape
// is well-formed and its values match the source palette exactly.
section('DTCG export shape + fidelity (no importer exists yet — export-only check)');
{
    let fails = 0;
    const p = Engine.generatePalette('fintech', 7);
    const pair = Engine.getTypePairs ? Engine.getTypePairs(p.recipeKey || 'fintech')[0] : null;
    const dtcg = Engine.exportDtcg(p, pair);
    const checks = [
        ['schema tag present', dtcg.schema === 'gamut.dtcg.v1'],
        ['Light group present', !!dtcg.Light],
        ['Dark group present', !!dtcg.Dark],
        ['Light.color.dominant $type', dtcg.Light.color.dominant.$type === 'color'],
        ['Light.color.dominant value matches deployment', dtcg.Light.color.dominant.$value === p.deployments.light.bg],
        ['Light.color.ink value matches deployment', dtcg.Light.color.ink.$value === p.deployments.light.ink],
        ['Dark.color.brand value matches deployment', dtcg.Dark.color.brand.$value === p.deployments.dark.brand],
        ['dimension group has $type dimension entries', Object.values(dtcg.Light.dimension).every(v => v.$type === 'dimension')],
    ];
    for (const [label, ok] of checks) {
        if (!ok) { fails++; console.error(`FAIL: ${label}`); }
    }
    console.log(`${checks.length} checks, ${fails} failures.`);
    if (fails === 0) console.log('PASS: DTCG export shape + fidelity'); else totalFail++;
}

// ---------- 6. Extractor -> Engine parity (extraction output obeys the same laws) ----------
section('Extractor output law-compliance (50 synthetic inventories)');
{
    let fails = 0;
    for (let i = 0; i < 50; i++) {
        const numColors = 2 + Math.floor(Math.random() * 20);
        const colors = Array.from({ length: numColors }, () => ({
            hex: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            count: 1 + Math.floor(Math.random() * 50),
            area: 1 + Math.floor(Math.random() * 100000),
        }));
        const inventory = { schema: 'gamut.inventory.v1', observed: { colors, text: [], spacing: [], radii: [], shadows: [] }, declared: {} };
        try {
            const result = Extractor.extractSystem(inventory);
            const ink = result.proposed.palette.swatches.find(c => c.role === 'Ink')?.hex;
            const canvas = result.proposed.palette.swatches.find(c => c.role === 'Dominant')?.hex;
            const inkC = Engine.contrastRatio(ink, canvas);
            if (inkC < 4.45) { fails++; console.error(`FAIL extraction #${i} ink contrast ${inkC}`); }
        } catch (e) {
            fails++; console.error(`FAIL extraction #${i} threw: ${e.message}`);
        }
    }
    console.log(`50 extractions, ${fails} failures.`);
    if (fails === 0) console.log('PASS: Extractor law-compliance'); else totalFail++;
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

    // No network calls inside the Figma plugin sandbox (code.js) —
    // manifest declares empty network permissions, trust surface.
    const pluginCode = read('figma-plugin/code.js');
    if (/\bfetch\s*\(/.test(pluginCode)) {
        fails++; console.error('FAIL: fetch( found in figma-plugin/code.js — plugin must stay network-free');
    } else {
        console.log('OK: no fetch( in figma-plugin/code.js');
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
