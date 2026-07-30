import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = path.join(__dirname, '../index.html');
const MAIN_JS = path.join(__dirname, '../js/main.js');
const ENGINE_JS = path.join(__dirname, '../js/engine.js');

// --- index.html ---
let html = fs.readFileSync(INDEX_HTML, 'utf-8');

// B1 & B3: Fixer layout and Stepper
const oldFixerHtml = `        <div class="fixer">
            <div class="fixer-input-row">
                <input type="text" id="fix-input" class="mono" placeholder="#0055FF #FF3300 #FFEE00 #222222" spellcheck="false" aria-label="Paste 2 to 6 hex codes">
                <button class="btn btn-primary" id="fix-run" type="button">Diagnose and fix</button>
            </div>
            <p class="hint">2 to 6 hex codes, any separator. Try pasting a palette that breaks the rules.</p>

            <div class="fixer-image-row">
                <label class="btn-mini fixer-image-btn" for="fix-image">Or extract from an image <span class="studio-tag mono">Studio</span></label>
                <input type="file" id="fix-image" accept="image/*" hidden>
                <span class="hint fixer-image-hint">Upload a logo, moodboard, or photo. The dominant colors get pulled out, then diagnosed like any other palette. The image never leaves your browser.</span>
            </div>
        </div>

        <!-- Before/after rendering escapes the measure, just like the
             the shared measure below it. -->
        <div class="fixer-compare bleed-full" id="fixer-compare" hidden>
            <figure class="compare-band">
                <figcaption>Before</figcaption>
                <div class="strip" id="strip-before"></div>
                <div class="strip-captions" id="strip-before-caps"></div>
            </figure>
            <figure class="compare-band">
                <figcaption>After, with jobs assigned</figcaption>
                <div class="strip" id="strip-after"></div>
                <div class="strip-captions" id="strip-after-caps"></div>
            </figure>
        </div>

        <div class="fixer-results" id="fixer-results" hidden>
            <div class="diagnosis" id="diagnosis"></div>
            <div class="mapping" id="mapping" aria-label="What happened to each color"></div>
            <button class="btn btn-ghost" id="fix-adopt" type="button">Load into the Engine</button>
        </div>`;

const newFixerHtml = `        <div class="fixer-stepper mono" id="fixer-stepper" style="margin-bottom: 2rem; font-size: 0.85rem; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: 1rem; display: none;">
            <span id="step-import" style="color: var(--ink);">Import</span> &rarr;
            <span id="step-review">Review</span> &rarr;
            <span id="step-build">Build Design System</span> &rarr;
            <span id="step-export">Export</span>
        </div>

        <div class="fixer">
            <div class="fixer-strategy field field-inline" style="margin-bottom: 1rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                <label style="margin: 0;"><input type="radio" name="fix-strategy" value="preserve"> Preserve brand personality</label>
                <label style="margin: 0;"><input type="radio" name="fix-strategy" value="balanced" checked> Balanced</label>
                <label style="margin: 0;"><input type="radio" name="fix-strategy" value="maximize"> Maximize system quality</label>
            </div>
            <div class="fixer-input-row">
                <input type="text" id="fix-input" class="mono" placeholder="#0055FF #FF3300 #FFEE00 #222222" spellcheck="false" aria-label="Paste 2 to 6 hex codes">
                <button class="btn btn-primary" id="fix-run" type="button">Diagnose and fix</button>
            </div>
            <p class="hint">2 to 6 hex codes, any separator. Try pasting a palette that breaks the rules.</p>

            <div class="fixer-image-row">
                <label class="btn-mini fixer-image-btn" for="fix-image">Or extract from an image <span class="studio-tag mono">Studio</span></label>
                <input type="file" id="fix-image" accept="image/*" hidden>
                <span class="hint fixer-image-hint">Upload a logo, moodboard, or photo. The dominant colors get pulled out, then diagnosed like any other palette. The image never leaves your browser.</span>
            </div>
        </div>

        <div class="fixer-results" id="fixer-results" hidden>
            <h3 style="margin-top: 3rem; margin-bottom: 1.5rem;">Your palette, optimized &mdash; brand preserved where possible.</h3>
            
            <div id="fixer-summary" style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;"></div>
            <div id="fixer-magnitude" class="hint" style="margin-bottom: 2rem;"></div>

            <div class="fixer-compare bleed-full" id="fixer-compare" style="margin-bottom: 2rem;">
                <figure class="compare-band">
                    <figcaption>Before</figcaption>
                    <div class="strip" id="strip-before"></div>
                    <div class="strip-captions" id="strip-before-caps"></div>
                </figure>
                <figure class="compare-band">
                    <figcaption>After, with jobs assigned</figcaption>
                    <div class="strip" id="strip-after"></div>
                    <div class="strip-captions" id="strip-after-caps"></div>
                </figure>
            </div>

            <div style="margin-bottom: 3rem;">
                <button class="btn btn-primary" id="fix-adopt" type="button">Build the design system &rarr;</button>
            </div>

            <div class="diagnosis" id="diagnosis"></div>
            <div class="mapping" id="mapping" aria-label="What happened to each color"></div>
        </div>`;

if (html.includes('id="fixer-compare" hidden>')) {
    html = html.replace(oldFixerHtml, newFixerHtml);
}

// B1: Add system-from-fixer export box
const systemInsert = `            <p>Color was never the whole system. Every palette also ships a matched spacing rhythm, corner personality, and elevation family &mdash; generated from the same archetype signal as the colors, not bolted on after. Component states (hover, active, disabled, focus) come from the same contrast math as the palette itself.</p>
        </div>

        <div id="system-from-fixer" style="display: none; padding: 1.5rem; background: var(--surface-2); border-left: 2px solid var(--line); margin-bottom: 3rem;">
            <p style="margin: 0 0 1rem 0; color: var(--ink);">Your optimized palette is now loaded into the system. Check the token scales below, or head straight to export.</p>
            <a href="#exports-row" class="btn btn-primary btn-mini" style="text-decoration: none;">Export</a>
        </div>`;

if (!html.includes('id="system-from-fixer"')) {
    html = html.replace(`            <p>Color was never the whole system. Every palette also ships a matched spacing rhythm, corner personality, and elevation family &mdash; generated from the same archetype signal as the colors, not bolted on after. Component states (hover, active, disabled, focus) come from the same contrast math as the palette itself.</p>
        </div>`, systemInsert);
    // Add id to exports row
    html = html.replace('<div class="exports">', '<div class="exports" id="exports-row">');
}

fs.writeFileSync(INDEX_HTML, html);


// --- engine.js ---
let engine = fs.readFileSync(ENGINE_JS, 'utf-8');

// Update fixPalette signature and logic
if (!engine.includes('options = {}')) {
    engine = engine.replace(
        'function fixPalette(paletteHexes) {',
        `function fixPalette(paletteHexes, options = { strategy: 'balanced' }) {`
    );
    
    // Inject strategy scaling factors
    const strategyInject = `    const strat = options.strategy;
    const hueThresh = strat === 'preserve' ? 10 : strat === 'maximize' ? 45 : 20;
    const satThresh = strat === 'preserve' ? 10 : strat === 'maximize' ? 30 : 20;
    const retireAggressive = strat === 'maximize';`;

    engine = engine.replace(
        'const mapping = [];',
        `const mapping = [];
${strategyInject}`
    );
}

fs.writeFileSync(ENGINE_JS, engine);


// --- main.js ---
let main = fs.readFileSync(MAIN_JS, 'utf-8');

// Update runFixer to read strategy, compute summary/magnitude, update stepper
if (!main.includes('function runStepper')) {
    const stepperFuncs = `
function updateStepper(step) {
    const s = $("fixer-stepper");
    if (!s) return;
    s.style.display = "block";
    ["import", "review", "build", "export"].forEach(id => {
        $("step-" + id).style.color = "var(--muted)";
    });
    $("step-" + step).style.color = "var(--ink)";
}
`;
    main = main.replace('function runFixer() {', stepperFuncs + 'function runFixer() {');
}

if (!main.includes('const strategy = document.querySelector')) {
    const replacement = `
    const strategy = document.querySelector('input[name="fix-strategy"]:checked')?.value || 'balanced';
    const originalHexes = [...hexes];
    
    const diag = E.diagnosePalette(hexes);
    renderDiagnosis(diag, $("diagnosis"));
    
    const fixed = E.fixPalette(hexes, { strategy });
    `;
    main = main.replace(
        `    const diag = E.diagnosePalette(hexes);
    renderDiagnosis(diag, $("diagnosis"));
    
    const fixed = E.fixPalette(hexes);`,
        replacement
    );
}

if (!main.includes('updateStepper("review")')) {
    main = main.replace(
        `    $("fixer-compare").hidden = false;
    $("fixer-results").hidden = false;`,
        `    $("fixer-compare").hidden = false;
    $("fixer-results").hidden = false;
    
    updateStepper("review");
    
    // Summary Chips
    const summary = [];
    if (fixed.mapping.some(m => m.action === "adjusted" && (m.reason.includes("contrast") || m.reason.includes("Law 2")))) summary.push("✓ Contrast & legibility raised to floor");
    const retired = fixed.mapping.filter(m => m.action === "retired").length;
    if (retired > 0) summary.push(\`✓ \${hexes.length} colors &rarr; \${fixed.palette.swatches.length} roles\`);
    
    $("fixer-summary").innerHTML = summary.map(s => \`<span class="btn-mini" style="pointer-events: none; border-color: var(--line);">\${s}</span>\`).join("");
    
    // Magnitude notice
    let totalHueDelta = 0, totalSatDelta = 0, count = 0;
    fixed.mapping.forEach((m, i) => {
        if (m.action !== "retired" && originalHexes[i] && m.swatch) {
            const h1 = E.hexToHsl(originalHexes[i]);
            const h2 = E.hexToHsl(m.swatch.hex);
            totalHueDelta += Math.abs(h1[0] - h2[0]);
            totalSatDelta += Math.abs(h1[1] - h2[1]);
            count++;
        }
    });
    const avgHueDelta = count ? totalHueDelta / count : 0;
    const avgSatDelta = count ? totalSatDelta / count : 0;
    
    if (avgHueDelta > 15 || avgSatDelta > 15) {
        $("fixer-magnitude").textContent = "This optimization noticeably changes the visual character of your brand to meet the laws.";
    } else {
        $("fixer-magnitude").textContent = "";
    }`
    );
}

if (!main.includes('updateStepper("build")')) {
    main = main.replace(
        `function adoptFixed() {`,
        `function adoptFixed() {
    updateStepper("build");
    const sf = $("system-from-fixer");
    if (sf) sf.style.display = "block";
    $("system").scrollIntoView({ behavior: scrollBehavior(), block: "start" });`
    );
}

if (!main.includes('window.addEventListener("scroll", () => {')) {
    main += `\n
window.addEventListener("scroll", () => {
    if ($("fixer-stepper") && $("fixer-stepper").style.display !== "none") {
        const sys = $("system");
        if (sys && sys.getBoundingClientRect().top < window.innerHeight / 2) {
            updateStepper("export");
        } else {
            // we don't downgrade back to build to avoid flickering
        }
    }
});
`;
}

fs.writeFileSync(MAIN_JS, main);
console.log("Applied B1-B3 patches.");
