# Pivot Progress Log

## Phase 0 — Safety net and baseline
**Date:** 2026-08-19
**Status:** PASS (with deviation — see below)

### Actions completed
- `git tag v2-full-archive` — created and pushed ✓
- `git branch archive/v2-two-door` — created and pushed ✓
- Baseline regression run — 2 failures, both in doomed code (see below)
- Baseline line counts recorded ✓

### Baseline regression output

| Test | Result |
|---|---|
| tools/test-b4-engine.mjs | **PASS** |
| tools/test-p6-extract.mjs (1000 fuzz + edge cases) | **PASS** |
| tools/test-l4.mjs | **PASS** |
| figma-plugin/test/plugin.test.mjs (Phase 5 + 7) | **PASS** |
| figma-plugin/test/extract-to-variables.test.mjs | **FAIL** — `dtcg.Light.color.brand.$value` undefined |
| generatePalette contrast sweep (300 palettes) | **PASS** — min ink=13.72 brand=3.00 accent=3.01 |
| fixPalette contrast sweep (15000 runs) | **PASS** — min ink=4.591 |
| DTCG export shape + fidelity | **FAIL** — `dtcg.Dark.color.brand.$value` undefined |

**Exit code: 1**

### Deviation: proceeding past red baseline
**Owner decision (2026-08-19):** Both failures are isolated to code Phase 2 deletes outright (`figma-plugin/`, `exportDtcg`, the DTCG shape check in `regression.mjs`). Everything the plan keeps passed clean. This is a pre-existing DTCG export bug, not the kind of unknown breakage the stop-on-red rule is meant to catch. Owner directed: don't fix `exportDtcg`, proceed with Phase 1. Added to Phase 2 verification: after deleting the failing code, confirm regression suite is fully green (exit 0), not just that the two specific tests are gone.

### Baseline line counts (before-state)

| File | Lines |
|---|---|
| index.html | 650 |
| css/style.css | 2,123 |
| js/engine.js | 1,175 |
| js/main.js | 1,930 |
| js/license.js | 204 |
| js/extract.js | 158 |
| js/assistant.js | 214 |
| js/mood.js | 123 |
| js/aipack.js | 345 |
| tools/regression.mjs | 190 |
| tools/test-b4-engine.mjs | 70 |
| tools/test-l4.mjs | 105 |
| tools/test-p6-extract.mjs | 125 |
| tools/license-admin.mjs | 311 |
| tools/generate-legal.mjs | 118 |
| tools/export-worker-secrets.mjs | 17 |
| figma-plugin/code.js | 257 |
| figma-plugin/ui.html | 186 |
| figma-plugin/test/plugin.test.mjs | 97 |
| figma-plugin/test/extract-to-variables.test.mjs | 155 |
| worker/src/index.js | 388 |
| claim.html | 113 |
| legal/refunds.html | 60 |
| legal/terms.html | 63 |
| legal/privacy.html | 64 |
| legal/contact.html | 59 |
| bible/brand-color-bible-v2.html | 508 |
| **TOTAL** | **9,679** |

## Phase 1 — Delete the licensing and payments layer
**Date:** 2026-08-19
**Status:** PASS

### Actions completed
- Deleted files: `js/license.js`, `worker/`, `tools/license-admin.mjs`, `tools/test-l4.mjs`, `tools/export-worker-secrets.mjs`, `tools/generate-legal.mjs`, `licenses/`, `claim.html`, `legal/refunds.html`. ✓
- `index.html`: Removed `license.js` script tag, 15 `studio-tag` badges, commented pricing block, CSP references to Razorpay and workers.dev, and license-related FAQ items. ✓
- `js/main.js`: Removed 14 `Gate.has()` guards, `lockedToast()`, `updateLicenseUI()`, and redeem handlers. ✓
- `css/style.css`: Removed all `.pricing`, `.price-card`, `.studio-tag`, `.price-card-featured` CSS styles. ✓
- `tools/regression.mjs`: Removed `tools/test-l4.mjs` execution and `licenses/revoked.json` snapshot/restoration logic. ✓
- Verified that grep for keywords `license`, `Gate.`, `razorpay`, `studio-tag`, `worker` yields zero hits in edited files. ✓

## Phase 2 — Delete the Extract door
**Date:** 2026-08-19
**Status:** PASS

### Actions completed
- Deleted files and folders: `js/extract.js`, `figma-plugin/`, `tools/test-p6-extract.mjs`. ✓
- `index.html`: Removed `#extract` link in navigation, the Extractor `#extract` section, and the script tag for `js/extract.js`. ✓
- `js/main.js`: Removed `runExtractor()`, `adoptExtracted()`, `copyExtractedForFigma()`, and all their associated DOM event listeners. ✓
- `js/engine.js`: Removed `exportDtcg()` and its exports mapping in `window.Engine`. ✓
- `css/style.css`: Removed all `.extract-input-row`, `.extract-actions`, `.extract-results`, `.extract-drift`, `.extract-stat`, `.extract-confidence`, and `.extract-adopt-row` rules. ✓
- `README.md` & `PRODUCT.md`: Removed all paragraphs, sections, file structures, and positioning remarks regarding Figma Extract and DTCG variables. ✓
- `tools/regression.mjs`: Removed `tools/test-p6-extract.mjs` and both plugin test files from suite registry, removed DTCG shape/fidelity check section, removed the figma-plugin fetch grep check, and removed the load of `js/extract.js` in the sandbox. ✓
- **Verification:** Ran `node tools/regression.mjs` and verified the suite is fully green (Exit Code: 0). ✓

## Phase 3 — Delete the Studio Assistant and the LLM layer
**Date:** 2026-08-19
**Status:** PASS

### Actions completed
- Deleted files: `js/assistant.js`. (Kept `js/mood.js` as it is re-consumed in Phase 6). ✓
- `index.html`: Removed `#assistant` link in navigation, the prompt helper link under hero buttons, the Assistant `#assistant` section, and the script tag for `js/assistant.js`. Removed generative APIs (Ollama localhost and Google Gemini) from the CSP. ✓
- `js/main.js`: Removed `toggleAssistantFields()`, `syncAssistantSettings()`, `renderAssistantResult()`, `generateFromAssistant()`, their event listeners, `assistantResult` state initialization, and removed `.assistant` and `.pricing` from the intersection observer query selector. ✓
- `css/style.css`: Removed all `.assistant`, `.assistant-input-row`, `.assistant-config`, `.assistant-settings`, `.assistant-result`, `.assistant-provider`, `.assistant-explanation`, `.assistant-chips`, `.assistant-chip*` rules, and removed references in structured depth comments. ✓
- `README.md` & `PRODUCT.md`: Removed the "Studio Assistant" sections, quick start notes, and references to local Ollama and Gemini API configurations. ✓
- **Verification:** Ran `node tools/regression.mjs` and verified the suite is fully green (Exit Code: 0). ✓



