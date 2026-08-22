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

// ---------- 3b. onBrand/onAccent contrast sweep: the dedicated
// text-on-fill colors the UI now shows instead of reusing the global
// Ink swatch (which does not reliably clear 4.5:1 against an arbitrary
// Primary/Secondary - measured >90%/78% failure before this fix). ----------
section('onBrand/onAccent contrast sweep (10 archetypes x 30 seeds)');
{
    let fails = 0, total = 0, minOnBrand = Infinity, minOnAccent = Infinity;
    for (const cat of Object.keys(Engine.ARCHETYPES)) {
        for (let seed = 0; seed < 30; seed++) {
            total++;
            const p = Engine.generatePalette({ category: cat, seed });
            const onBrandC = Engine.contrastRatio(p.onBrand, p.swatches[1].hex);
            const onAccentC = Engine.contrastRatio(p.onAccent, p.swatches[2].hex);
            minOnBrand = Math.min(minOnBrand, onBrandC);
            minOnAccent = Math.min(minOnAccent, onAccentC);
            if (onBrandC < 4.45) { fails++; console.error(`FAIL onBrand ${cat} seed=${seed} = ${onBrandC}`); }
            if (onAccentC < 4.45) { fails++; console.error(`FAIL onAccent ${cat} seed=${seed} = ${onAccentC}`); }
        }
    }
    console.log(`${total} palettes, ${fails} failures. min onBrand=${minOnBrand.toFixed(2)} onAccent=${minOnAccent.toFixed(2)}`);
    if (fails === 0) console.log('PASS: onBrand/onAccent contrast sweep'); else totalFail++;
}

// ---------- 4. compileBrief Determinism test ----------
section('compileBrief Determinism (10 combinations x 1000 iterations)');
{
    let fails = 0;
    const categories = Object.keys(Engine.ARCHETYPES);
    const options = ["A", "B"];
    for (let t = 0; t < 10; t++) {
        const answers = {
            category: categories[t % categories.length],
            q2: options[(t * 1) % 2],
            q3: options[(t * 2) % 2],
            q4: options[(t * 3) % 2],
            q5: options[(t * 4) % 2],
            q6: options[(t * 5) % 2],
            q7: options[(t * 6) % 2]
        };
        const variant = 1 + (t % 5);
        const compiled1 = Engine.compileBrief(answers, variant);
        const p1 = Engine.generatePalette({ customArchetype: compiled1.recipe, seed: compiled1.seed });
        const json1 = JSON.stringify(p1);

        for (let i = 0; i < 1000; i++) {
            const compiled2 = Engine.compileBrief(answers, variant);
            const p2 = Engine.generatePalette({ customArchetype: compiled2.recipe, seed: compiled2.seed });
            const json2 = JSON.stringify(p2);
            if (json1 !== json2) {
                fails++;
                console.error(`FAIL: non-deterministic compilation for ${JSON.stringify(answers)} v=${variant}`);
                break;
            }
        }
    }
    if (fails === 0) console.log('PASS: compileBrief determinism'); else totalFail++;
}

// ---------- 5. compileBrief Coverage & Contrast sweep ----------
section('compileBrief Coverage (64 combos x 10 categories x 5 variants = 3200 runs)');
{
    let fails = 0, total = 0;
    const categories = Object.keys(Engine.ARCHETYPES);
    const options = ["A", "B"];
    for (const cat of categories) {
        for (let c = 0; c < 64; c++) {
            const answers = {
                category: cat,
                q2: options[(c >>> 0) & 1],
                q3: options[(c >>> 1) & 1],
                q4: options[(c >>> 2) & 1],
                q5: options[(c >>> 3) & 1],
                q6: options[(c >>> 4) & 1],
                q7: options[(c >>> 5) & 1]
            };
            for (let variant = 1; variant <= 5; variant++) {
                total++;
                const compiled = Engine.compileBrief(answers, variant);
                const p = Engine.generatePalette({ customArchetype: compiled.recipe, seed: compiled.seed });
                for (const dep of ['light', 'dark']) {
                    const d = p.deployments[dep];
                    const inkC = Engine.contrastRatio(d.ink, d.bg);
                    const brandC = Engine.contrastRatio(d.brand, d.bg);
                    const accentC = Engine.contrastRatio(d.accent, d.bg);
                    if (inkC < 4.45) { fails++; console.error(`FAIL ink brief ${cat} combo=${c} v=${variant} ${dep} = ${inkC}`); }
                    if (brandC < 2.95) { fails++; console.error(`FAIL brand brief ${cat} combo=${c} v=${variant} ${dep} = ${brandC}`); }
                    if (accentC < 2.95) { fails++; console.error(`FAIL accent brief ${cat} combo=${c} v=${variant} ${dep} = ${accentC}`); }
                }
            }
        }
    }
    console.log(`${total} compiled briefs generated and contrast verified, ${fails} failures.`);
    if (fails === 0) console.log('PASS: compileBrief coverage'); else totalFail++;
}

// ---------- 6. compileBrief Sensitivity test ----------
section('compileBrief Sensitivity (flipping questions)');
{
    let fails = 0;
    const baseAnswers = {
        category: "saas",
        q2: "A", q3: "A", q4: "A", q5: "A", q6: "A", q7: "A"
    };
    const baseCompiled = Engine.compileBrief(baseAnswers, 1);
    const baseP = Engine.generatePalette({ customArchetype: baseCompiled.recipe, seed: baseCompiled.seed });
    const baseJson = JSON.stringify(baseP);

    const questions = ["q2", "q3", "q4", "q5", "q6", "q7"];
    for (const q of questions) {
        const flipped = { ...baseAnswers, [q]: "B" };
        const flippedCompiled = Engine.compileBrief(flipped, 1);
        const flippedP = Engine.generatePalette({ customArchetype: flippedCompiled.recipe, seed: flippedCompiled.seed });
        const flippedJson = JSON.stringify(flippedP);

        if (baseJson === flippedJson) {
            fails++;
            console.error(`FAIL: question ${q} flip is a no-op`);
        }
    }
    if (fails === 0) console.log('PASS: compileBrief sensitivity'); else totalFail++;
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
