/* End-to-end, offline, zero-LLM verification of the Extract door's
   capstone step: a drifted gamut.inventory.v1 scan (as the plugin's
   scanNodes() would produce from a real Figma file) -> Extractor.
   extractSystem() (perceptual clustering + 60-30-10 role inference +
   law-compliant fixPalette, js/extract.js) -> Engine.exportDtcg()
   (js/engine.js) -> code.js's applyDtcg() actually creating Figma
   Variables. Nothing in this chain calls an LLM or a network - every
   step is deterministic and explainable, per GAMUT-V2-PLAN.md Phase 6's
   anti-pattern guard.

   engine.js/extract.js are plain classic <script> files (no module
   system), so they're loaded into a vm context whose sandbox IS the
   global object aliased as `window` - this reproduces browser global
   semantics (top-level `function` declarations become window.* props)
   without needing a real browser for pure logic. code.js already has a
   Node-testable module.exports guard (Relay pattern) and is required
   normally. */

import vm from "vm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

/* code.js's top level guards `figma.showUI(...)` behind `typeof figma
   !== 'undefined'`, using __html__ which only exists in a real Figma
   plugin runtime. It must be require()'d BEFORE global.figma is stubbed
   below (require() runs synchronously at the call site, unlike ESM
   import hoisting) or that guard trips and throws. */
const { createRequire } = await import("module");
const require = createRequire(import.meta.url);
const { applyDtcg } = require(path.join(repoRoot, "figma-plugin/code.js"));

const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
vm.createContext(sandbox);

for (const rel of ["js/engine.js", "js/extract.js"]) {
    const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
    vm.runInContext(src, sandbox, { filename: rel });
}

const Engine = sandbox.window.Engine;
const Extractor = sandbox.window.Extractor;
assert(Engine && typeof Engine.exportDtcg === "function", "Engine.exportDtcg must exist");
assert(Extractor && typeof Extractor.extractSystem === "function", "Extractor.extractSystem must exist");

/* ---- Stub Figma (same shape as plugin.test.mjs's stub, reused) ---- */
function makeFigmaStub() {
    const state = { _collections: [], _vars: [], _textStyles: [] };
    global.figma = {
        mixed: Symbol("mixed"),
        variables: {
            getLocalVariableCollectionsAsync: async () => state._collections,
            getLocalVariablesAsync: async () => state._vars,
            createVariableCollection: (name) => {
                const coll = {
                    id: `coll:${state._collections.length}`, name,
                    modes: [{ modeId: "1:0", name: "Mode 1" }],
                    renameMode(id, n) { this.modes.find(m => m.modeId === id).name = n; },
                    addMode(n) { this.modes.push({ modeId: `1:${this.modes.length}`, name: n }); }
                };
                state._collections.push(coll);
                return coll;
            },
            createVariable: (name, collId, type) => {
                const v = { name, variableCollectionId: collId, type, values: {}, setValueForMode(id, val) { this.values[id] = val; } };
                state._vars.push(v);
                return v;
            }
        },
        getLocalTextStylesAsync: async () => state._textStyles,
        createTextStyle: () => { const s = {}; state._textStyles.push(s); return s; },
        loadFontAsync: async () => {},
        notify: () => {}
    };
    return state;
}

/* ---- A realistic drifted inventory: 6 near-identical blues that
   should cluster into one Brand, plus a wide neutral/near-black spread
   for Dominant/Ink, an off-scale accent, and spacing/radii scattered
   around real steps (should snap, not vanish). Mirrors the "14 blues,
   11 font sizes, 9 radii" drift story from GAMUT-V2-PLAN.md. ---- */
const inventory = {
    schema: "gamut.inventory.v1",
    source: { fileName: "Client Redline.fig", pageName: "Screens", scannedAt: "2026-08-03T00:00:00.000Z", nodeCount: 42, capped: false },
    observed: {
        colors: [
            { hex: "#1E4FD8", area: 40000, count: 12, nodeType: "RECTANGLE" },
            { hex: "#1E50D9", area: 30000, count: 8, nodeType: "RECTANGLE" },
            { hex: "#1F4FD6", area: 20000, count: 5, nodeType: "ELLIPSE" },
            { hex: "#2050DA", area: 15000, count: 4, nodeType: "RECTANGLE" },
            { hex: "#FFFFFF", area: 500000, count: 30, nodeType: "FRAME" },
            { hex: "#FEFEFE", area: 20000, count: 3, nodeType: "FRAME" },
            { hex: "#111111", area: 60000, count: 20, nodeType: "TEXT" },
            { hex: "#161616", area: 8000, count: 6, nodeType: "TEXT" },
            { hex: "#FF6A00", area: 5000, count: 2, nodeType: "RECTANGLE" }
        ],
        text: [],
        spacing: [
            { value: 15, area: 9000, count: 5 },
            { value: 16, area: 9000, count: 5 },
            { value: 17, area: 4000, count: 2 },
            { value: 23, area: 3000, count: 2 },
            { value: 24, area: 6000, count: 4 }
        ],
        radii: [
            { value: 7, area: 12000, count: 6 },
            { value: 8, area: 15000, count: 8 },
            { value: 9, area: 3000, count: 1 }
        ],
        shadows: []
    },
    declared: { paintStyles: [], textStyles: [], variables: [] }
};

/* ---- Run the real chain ---- */
const result = Extractor.extractSystem(inventory);

assert(result.proposed.palette.deployments, "extracted palette must carry deployments (light/dark)");
assert(result.drift.colors.observedCount === 9, "should see all 9 observed swatches");
assert(result.drift.colors.merges.length >= 3, `expected the 4 near-blues to merge into fewer clusters, got ${result.drift.colors.merges.length} merges`);
console.log(`PASS: extractSystem clustered ${result.drift.colors.observedCount} observed colors -> ${result.drift.colors.proposedCount} proposed roles (${result.drift.colors.merges.length} merges)`);

const pair = { display: "Fraunces", body: "Inter", mono: null };
const dtcg = Engine.exportDtcg(result.proposed.palette, pair);

assert.strictEqual(dtcg.schema, "gamut.dtcg.v1");
assert(dtcg.Light.color.brand.$value.startsWith("#"), "Light brand color must be a hex value");
assert(dtcg.Dark.color.brand.$value.startsWith("#"), "Dark brand color must be a hex value");
assert(Object.keys(dtcg.Light.dimension).length > 0, "must export spacing/radius dimension tokens");
assert.strictEqual(dtcg.Light.typography.display.$value.fontFamily, "Fraunces");
console.log("PASS: exportDtcg produced a well-formed Light/Dark DTCG payload from the extracted (not generated) palette");

/* ---- Feed it into the REAL plugin code (not a re-implementation) ---- */
const state = makeFigmaStub();

await applyDtcg(dtcg);

const gamutColl = state._collections.find(c => c.name === "Gamut");
assert(gamutColl, "applyDtcg must create the Gamut variable collection");
assert.strictEqual(gamutColl.modes.length, 2, "must create exactly Light + Dark modes");

const lightModeId = gamutColl.modes.find(m => m.name === "Light").modeId;
const darkModeId = gamutColl.modes.find(m => m.name === "Dark").modeId;

for (const role of ["dominant", "brand", "accent", "ink"]) {
    const v = state._vars.find(v => v.name === `color/${role}`);
    assert(v, `color/${role} variable must exist`);
    assert.strictEqual(v.type, "COLOR");
    assert(v.values[lightModeId], `color/${role} must have a Light value`);
    assert(v.values[darkModeId], `color/${role} must have a Dark value`);
}

const dimVars = state._vars.filter(v => v.name.startsWith("dimension/"));
assert(dimVars.length >= 2, "spacing/radius FLOAT variables must be created");
dimVars.forEach(v => assert.strictEqual(v.type, "FLOAT"));

assert(state._textStyles.some(s => s.fontName && s.fontName.family === "Fraunces"), "a Fraunces text style must be created");
assert(state._textStyles.some(s => s.fontName && s.fontName.family === "Inter"), "an Inter text style must be created");

console.log(`PASS: applyDtcg (real figma-plugin/code.js) created ${state._vars.length} real Figma Variables across ${gamutColl.modes.length} modes + ${state._textStyles.length} text styles — no LLM, no network, fully deterministic.`);

/* ---- Idempotency: re-applying must update in place, never duplicate
   (the plan's Phase 7 anti-pattern guard: "a tool, not a toy") ---- */
const varCountBefore = state._vars.length;
const collCountBefore = state._collections.length;
await applyDtcg(dtcg);
assert.strictEqual(state._collections.length, collCountBefore, "re-apply must not create a second Gamut collection");
assert.strictEqual(state._vars.length, varCountBefore, "re-apply must not duplicate variables");
console.log("PASS: re-applying the same system is idempotent (matched by name, no duplicates)");

console.log("\nALL GREEN: existing screens -> inventory -> extraction -> DTCG -> real Figma Variables, zero LLM calls in the entire path.");
