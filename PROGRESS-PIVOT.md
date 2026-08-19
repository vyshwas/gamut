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
