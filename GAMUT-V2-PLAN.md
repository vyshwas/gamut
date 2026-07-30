# Gamut V2 — Brand System Studio: Implementation Plan

**Date:** 2026-07-29
**Status:** Plan only. Nothing here is built. Written for phased execution in fresh chat contexts (Sonnet), one phase per session.
**Product thesis:** Gamut stops being "a palette tool with extras" and becomes a **brand-system studio** with two doors:

1. **Generate** — brief in, complete law-checked brand design system out (color, type scale, spacing, radius, elevation, states, components preview, brand book). Deletes the days a brand designer spends assembling tokens + a guidelines document after the creative decisions are made.
2. **Extract** — Figma screens in, reverse-engineered design system out. Scan real screens, inventory every color/text/spacing/radius/shadow actually used, diagnose the drift ("14 blues, 11 font sizes, 9 radii"), and normalize it into a law-compliant system with full per-value provenance — the Fixer, promoted from palettes to whole systems. Deletes the "audit the file and write the token sheet by hand" workflow.

Both doors end at the same place: one system, exported as CSS/Tailwind/SCSS/`gamut.tokens.v1`/**W3C DTCG JSON**, pushed into **Figma Variables**, or printed as a client-ready **brand book**.

**Relay relationship (settled, do not reopen):** Relay stays an independent product (decided 2026-07-18, reconfirmed since). The synergy is *pattern reuse and data handoff*, not a merge: Gamut gets its **own** Figma plugin, copying Relay's verified plugin patterns (node traversal, fill-walk contrast logic, Node test harness with a stubbed `global.figma`), and Relay remains the per-element audit tool a designer uses *while building* the screens Gamut later extracts from. No shared runtime, no shared repo.

---

## Phase 0 — Documentation Discovery (CONSOLIDATED — done 2026-07-29)

### Existing code map (verified by direct read)

| File | Lines | Role |
|---|---|---|
| `js/engine.js` | 1169 | All color math + generation + fixing + system tokens. **No DOM.** |
| `js/main.js` | 1445 | UI wiring, rendering, exports menu |
| `js/assistant.js` | 192 | LLM brief interpreter (Ollama / Claude API / offline), validates against code-owned vocab |
| `js/mood.js` | 142 | ~40-keyword mood lexicon |
| `index.html` | 607 | All structure + copy, single page |
| `css/style.css` | 2004 | Site tokens + styles + print sheet |

### Allowed internal APIs (exact names, `js/engine.js`)

- Color math: `hexToRgb/rgbToHex/rgbToHsl/hslToRgb/hslToHex/hexToHsl` (14–57), `rgbToCmyk` (61), `gamutRisk` (79), `relativeLuminance` (96), `contrastRatio` (104), `contrastGrade` (111), `ensureContrast` (120), `ensureContrastVivid` (137), `readableOn` (163), `nameColor` (218), `shadeScale` (241), `quantizeColors` (259 — image→palette k-ish clustering, 4-bit bucket + greedy distinct pick)
- Generation: `ARCHETYPES` (295, ten business archetypes), `ACCENT_HARMONIES`/`pickAccentHarmony` (372/390), `generatePalette` (422), `mulberry32` seeded RNG (185)
- Fixing: `parseHexList` (554), `diagnosePalette` (568), `fixPalette` (629 — returns per-input `mapping`: kept/adjusted/retired + law). **This provenance shape is the template for extraction output.**
- Type: `TYPE_PAIRS` (768), `TYPE_PAIRS_MOOD` (803), `getTypePairs` (838), `googleFontsUrl` (842)
- System: `SYSTEM_PROFILE` (858 — density + corner per archetype), `spacingScale` (880), `radiusScale` (895), `elevationScale` (914), `stateVariants` (949), `systemTokens` (968 — shared derivation), exporters `exportCss/exportTailwind/exportScss/exportJson/exportTokensJson` (982–1088), `exportSvgCard` (1120)

### External standards (verified by web search 2026-07-29)

- **W3C DTCG Design Tokens Format Module 2025.10** — first **stable** version, shipped 2025-10-28, backed by Adobe/Google/Meta/Figma. `$value` + `$type` JSON shape; types include `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `shadow`, `typography` (composite). Spec: https://www.designtokens.org/tr/drafts/format/ . Announcement: https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/ . Industry adoption ~84% of teams (zeroheight survey). **This is the interchange format Gamut must speak to be taken seriously in 2026** — it is what Tokens Studio, Style Dictionary, and Figma-ecosystem importers consume.
- **Figma Variables**: writable from the **Plugin API** (`figma.variables.createVariableCollection`, `createVariable`, `setValueForMode`, plus `getLocalPaintStylesAsync`/`getLocalTextStylesAsync` for reading styles). Reference: https://deepwiki.com/figma/plugin-typings/2.4-variables-and-design-tokens and https://github.com/davo/figma-variables-import (working DTCG→variables importer to copy shape from). The REST Variables **write** endpoint is Enterprise-plan-gated — a plugin is the only universally-available write path. Community plugins (Variables Import/Export, Token Importer) confirm the pattern.

### Relay patterns available to copy (verified in `C:\Users\vyshw\Relay`)

- `figma-plugin/code.js` — selection traversal, nearest-visible-SOLID-fill walk (element-first, the bug-fixed version), `INTERACTIVE_NAME` word-boundary regex (`\b(...)\b` — substring matching false-positived "re**cta**ngle"), `if (typeof module !== 'undefined') module.exports = {...}` export guard for Node-testability.
- `figma-plugin/test/audit.test.js` — the Node test harness pattern: stub `global.figma = { mixed, showUI(){}, on(){}, ... }` + `global.__html__ = ''`, call exported pure functions against hand-built fake node objects. **Known limit:** this never exercises plugin load/selection/postMessage in a real Figma session — manual Import-from-manifest verification is required for UI-layer changes.

### Verification patterns established in THIS repo (reuse, don't reinvent)

1. **Node sweeps**: archetypes × seeds, assert shape + determinism + contrast floors (e.g. 1,500 chip/label pairs ≥3:1 in the system-tokens pass).
2. **Headless Chrome**: `npm install puppeteer-core --no-save` in scratchpad, `executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"` (forward slashes — backslashes mangle through heredocs). Drive the real page, screenshot, assert zero console errors.
3. **file:// gotcha**: Assistant LLM providers need `http://` serving (Ollama 403s `Origin: null`). Any new fetch-using feature inherits this; static features must keep working from `file://`.

### Global anti-patterns (all phases)

- **No build step, no framework, no backend.** Plain HTML/CSS/JS stays. Anything needing a server is out of scope for V2 (payments/auth remain a separately-decided track — see README "Turning the demo into a paid subscription product").
- **The LLM never invents values.** Every assistant output is validated against code-owned vocabularies; hallucinated values are dropped. This rule extends to extraction: extracted values come from the inventory JSON, never from a model.
- **Laws are the floor.** No generated or normalized output may bypass contrast floors, 60-30-10, or Law 2. Taste chooses *which* compliant answer, never *whether* to comply.
- **Museum Editorial chrome holds** (DESIGN.md): no gradients/shadows/blur/texture in site chrome, lime = primary action only, hairline dividers, type carries hierarchy. Do not reintroduce print-lab devices. New UI sections must be composed within this system.
- **Do not merge Relay** (or Design OS). Data handoff only.
- **Honest approximation labeling** — extraction confidence, CMYK, and any heuristic must be labeled as heuristic in the UI.
- **Never fabricate evidence** — no testimonials, usage stats, or fake customer names anywhere (PRODUCT.md "Evidence on Hand: none").

---

## Phase 1 — Complete the token surface: type scale + grid/breakpoints + motion

**Why first:** "Full design system generator" currently ships no type *ramp* (only pairings), no layout tokens, no motion tokens. A brand designer's deliverable needs all three; extraction (Phase 6) also needs a type-scale model to snap extracted sizes onto.

**What to implement (in `js/engine.js`, following the `spacingScale`/`SYSTEM_PROFILE` pattern at 858–911):**

1. `TYPE_RATIOS` per typography bucket + `typeScale(recipeKey, pair)` → a named ramp: `caption / body-sm / body / body-lg / h6…h1 / display`, each `{ px, rem, lineHeight, weight, family }`. Ratio rides the archetype's existing `mood` bucket (e.g. editorial 1.25, technical/mono 1.2, playful 1.333, brutalist 1.414). Line-height derived from size band (tight for display, 1.6 body — mirror the site's own DESIGN.md values). Weights come from the already-loaded Google Fonts pair — never a weight the pair doesn't ship.
2. `gridTokens(recipeKey)` → container max-width, column count (12), gutter = a step of the archetype's own `spacingScale`, and 3 breakpoints (`sm/md/lg`). Density-aware gutters (compact archetypes get tighter gutters), same `SYSTEM_PROFILE` field, **no new archetype concept**.
3. `motionTokens(recipeKey)` → duration trio (`fast/base/slow`) + one easing per corner personality (sharp → `cubic-bezier(0.2, 0, 0, 1)`-family snappy; soft → gentle ease-out; balanced → standard). Small, honest, DTCG-`duration`-compatible.
4. Extend `systemTokens(p)` (engine.js:968) to include all three; extend `exportCss/exportTailwind/exportScss/exportTokensJson` **in place** (the established pattern — one export, not a second one to remember). Bump nothing: `gamut.tokens.v1` gains keys additively (additive = non-breaking for Design OS's ingest).
5. `js/main.js`: extend `renderSystem(palette)` to render the type ramp (set in the pair's real fonts), grid diagram, and motion chips inside the existing `#system` section.

**Doc refs:** `DESIGN-SYSTEM-SPEC.md` (the pattern this phase extends), `js/engine.js:858-980`, `js/main.js` `renderSystem`.

**Verification checklist:**
- [ ] Node sweep: 10 archetypes × 20 seeds — ramp monotonic, every rem = px/16, deterministic per seed, valid JSON export for all.
- [ ] Node: every ramp text color/bg pairing rendered in `#system` passes ≥3:1 (reuse the 1,500-pair chip methodology).
- [ ] Headless Chrome: `#system` renders ramp in the correct live fonts, reacts to category change, zero console errors.

**Anti-pattern guards:** no `clamp()` fluid-type magic in exported tokens (tools consuming tokens need discrete values; fluid type is a consumer decision); no new archetype fields beyond `SYSTEM_PROFILE`; don't touch `generatePalette`.

---

## Phase 2 — Component preview gallery (tokens made legible)

**Why:** A new user "instantly understands what is going on" when they see *their* system as UI, not as chips. This was an explicit scope cut in DESIGN-SYSTEM-SPEC.md ("No component library") — that cut is now reopened **as rendered previews + component tokens only**, still not a shipped component-code library.

**What to implement:**

1. `componentTokens(p, sys)` in `js/engine.js`: for button (primary/secondary/ghost), input, card, badge, alert, nav item — each a small spec object referencing *existing* tokens by name (padding = spacing steps, radius = radius steps, colors = role+state variants from `stateVariants`, type = ramp steps from Phase 1). Follow the DESIGN.md frontmatter `components:` shape (`{colors.accent}`-style references) so specs read as token references, not baked values.
2. `#components` section in `index.html` after `#system`: a live gallery rendering each component from the generated tokens via inline CSS custom properties — hover/active/disabled/focus states shown using the existing `stateVariants` output. Both light and dark deployments side by side (Law 4 made visible).
3. Add `components` to `exportTokensJson` and as custom properties in CSS/Tailwind/SCSS exports.

**Doc refs:** `js/engine.js:949` (`stateVariants`), DESIGN.md frontmatter (reference syntax), existing deployment-mock render code in `js/main.js` (contrast-computed button colors — copy that approach, it was a deliberate fix).

**Verification checklist:**
- [ ] Node: 10 archetypes × 15 seeds × every component text/bg pair ≥ 4.5:1 (interactive text) or ≥3:1 (large/secondary) — 0 failures.
- [ ] Headless Chrome: gallery renders, states visibly differ, dark/light both present, screenshot review, zero console errors.
- [ ] `grep` check: no hex literals in `componentTokens` — every value must be derived from palette/system tokens.

**Anti-pattern guards:** no component HTML/CSS *export* (preview + token specs only — exporting component code is a future, separate decision); no shadows/gradients leaking into site chrome (they belong only inside the preview canvas, which is product output).

---

## Phase 3 — The Brand Book (the deliverable that deletes a workflow)

**Why:** The thing a brand designer actually hands a client is a guidelines document. Gamut has a 1-page print sheet; the workflow-deleting artifact is a **multi-page brand book**: cover, palette + roles + laws passed, shade ramps, type system, spacing/radius/elevation, component gallery, usage do/don'ts, both deployments.

**What to implement:**

1. Extend the existing print-sheet path (`window.print()` + `print-color-adjust: exact` styles in `css/style.css`) into a paged document: a hidden `#brandbook` DOM subtree populated by a new `renderBrandBook(p, pair, sys)` in `js/main.js`, with CSS `@page` + `break-after: page` sections. Cover page carries brand name (new optional text input, persisted in URL state alongside `?cat&seed&borrow&lock`), palette strip, date, seed (provenance).
2. Do/don't page is **generated, not generic**: statements derived from the actual system ("Accent `#XXXXXX` is for actions only — 10% of any layout", "Never set body text in Display weight", contrast pairs that fail get listed as forbidden combinations, computed via `contrastRatio`).
3. Existing white-label/client-doc positioning (Studio tier) applies to the brand book — keep the existing honest non-gating (demo unlocked).

**Doc refs:** existing print styles in `css/style.css` (search `@media print`), `exportSvgCard` (engine.js:1120) for the swatch-card composition patterns, memory of the print sheet already including type pairing + CMYK.

**Verification checklist:**
- [ ] Headless Chrome `page.pdf()`: generate PDFs for 3 contrasting archetypes (fintech/wellness/heritage) — correct page count, no clipped content, visual review of each page.
- [ ] Do/don't statements change when the palette changes (assert 2 different seeds produce different forbidden-pair lists).
- [ ] Print sheet still works (regression).

**Anti-pattern guards:** no fabricated brand narrative copy in the book (facts about the system only); CMYK stays labeled as uncoated approximation; don't build a PDF library — browser print is the pipeline.

---

## Phase 4 — Speak the standard: W3C DTCG export + import

**Why:** DTCG 2025.10 is the stable industry interchange format (~84% team adoption). Without it Gamut's output dead-ends; with it, Gamut plugs into Tokens Studio, Style Dictionary, and every 2026-era pipeline — and the Figma round-trip (Phase 7) gets its wire format for free.

**What to implement (in `js/engine.js` + `js/main.js` exports menu):**

1. `exportDtcg(p, pair)` — map `systemTokens` onto the DTCG format: groups `color` (roles, shades, states — `$type: "color"`), `dimension` (spacing/radius — `$type: "dimension"`, px), `shadow` (elevation — composite `$type: "shadow"`), `typography` (ramp steps — composite `$type: "typography"`), `duration`/`cubicBezier` (motion). Include `$description` on roles (e.g. "Brand — 30% role, Law 2 anchor"). Light/dark deployments as two top-level groups (DTCG has no first-class modes; two groups is the interoperable convention — Figma modes are constructed plugin-side in Phase 7).
2. `importDtcg(json)` — parse a DTCG file, harvest its colors, and feed them into the **Fixer** (`fixPalette`) exactly like pasted hexes: "import your existing tokens, get them diagnosed against the laws." Non-color tokens are surfaced read-only in the import report (V2 does not round-trip foreign spacing — honest scope).
3. Read the format spec section-by-section **before writing the mapper**: https://www.designtokens.org/tr/drafts/format/ — types, `$value` shapes (color is an object with `colorSpace`/`components` in 2025.10, NOT a bare hex string — verify against the spec and emit the compliant shape, with hex provided via the spec's allowed hex representation if defined, otherwise sRGB components).

**Doc refs:** DTCG spec (URL above), `exportTokensJson` (engine.js:1088) as the source-of-truth data shape, `parseHexList`/`fixPalette` for the import path.

**Verification checklist:**
- [ ] Validate exported JSON against the spec's own examples (spot-check every `$type` used, at minimum one token per type pasted next to a spec example in the test output).
- [ ] Round-trip: `importDtcg(exportDtcg(p))` recovers the same role hexes.
- [ ] Cross-tool smoke test: exported file loads without error in the Tokens Studio community importer or `figma-variables-import`'s parser (clone the repo, run its parse step in Node against Gamut's output).
- [ ] `gamut.tokens.v1` export unchanged (Design OS contract intact — grep the schema string).

**Anti-pattern guards:** do NOT invent DTCG properties (no `$extensions` abuse for core data — use `$extensions.studio.gamut` only for provenance like seed/category); do not emit bare-string color `$value` if the stable spec requires the object form — check, don't assume; keep `exportJson`/`exportTokensJson` untouched alongside.

---

## Phase 4b — AI Import Package (universal AI-assistant handoff) — **IMPLEMENTED 2026-07-30**

**Why:** Not everyone runs a Figma plugin. A deterministic, self-contained ZIP lets any AI coding/design assistant (Claude Code, Codex, Cursor, Gemini CLI, Windsurf) recreate the design system inside Figma from attached files. This is a universal fallback beside — never instead of — the plugin round-trip (Phase 7). Buildable immediately against the current token surface; the builders are data-driven, so when Phases 1–2 add type-scale/motion/component tokens they appear in the package without rework.

**Architecture fit (decided before implementation):**
1. The `EXPORTERS` map in `js/main.js` is clipboard-copy only (`[label, text]`); *downloads* follow the `downloadSvgCard` pattern (builder → Blob → anchor → revoke → toast). The ZIP export uses the download pattern: new **`js/aipack.js`** (`window.AiPack`, pure builders + a zero-dep STORE-method ZIP writer over `Uint8Array`), minimal wiring in `main.js`, one `btn-mini` + hint line in `index.html`. `js/engine.js` is **not modified** (hard requirement — no engine/extraction/law changes).
2. **Reused utilities:** `Engine.exportTokensJson(p, pair)` parsed as the canonical token source (with `generatedAt` stripped for determinism); `Engine.contrastGrade`/`contrastRatio` for the honest contrast table; `palette.signal`/`recipeKey`/`seed` for provenance; `currentPair()` for typography; the `downloadSvgCard` blob/anchor pattern and `toast()`.
3. **Edge cases handled:** Fixer palettes (seed `null` → filename suffix `fixer`, no category claimed in prose); token groups enumerated dynamically (today Colors/Typography/Spacing/Radius/Shadows — Motion auto-appears once Phase 1 lands; `figma-import.md` never names a collection the data doesn't contain); modes derived from `deployments` keys, not assumed; optional `mono` font; locked brand colors that legitimately fail contrast ship with honest grades; no localStorage/agency state in the package (identical systems → identical bytes on any device); export guarded when no palette exists yet.

**Package contents (ZIP, fixed file order):** `README.md` (what each file is, how to attach), `brand-system.json` (schema `gamut.ai-package.v1`: provenance, brand description from the palette's own signal, the ten laws, modes, contrast report), `tokens.json` (the `gamut.tokens.v1` payload minus timestamp), `brand-book.md` (generated markdown documentation: roles/jobs, both deployments, contrast grades, type pairing, spacing/radius/elevation/states tables), `figma-import.md` (the ready-to-paste agent prompt, **generated from the exported data** — collections list, mode list, and token counts enumerated from what's actually present; instructs: preserve names/values exactly, create Light/Dark modes, build starter components — Buttons, Inputs, Cards, Navigation, Form Fields, Badges, Modals — from the variables, never invent values, prefer supplied tokens on conflict).

**Determinism requirements (all verified):** no timestamps or locale formatting anywhere; ZIP entries use STORE (no compression), a fixed DOS date, no extra fields — identical palette+pair input produces **byte-identical** ZIP output; no LLM, no network, works offline.

**Verification:** Node (window-stubbed): build twice → byte-identical; PowerShell `Expand-Archive` → all five files extract, JSONs parse, prompt lists exactly the present collections; browser: button downloads a valid ZIP, toast "AI Import Package ready.", existing exports regression-checked.

**Anti-pattern guards:** don't fold into `EXPORTERS` (it's a download, not a copy); no compression libraries; no `Date.now()`; menu must not advertise "Push to Figma" until Phase 7 ships.

## Phase 5 — Gamut for Figma (plugin, part 1: the scanner)

**Why:** The Extract door needs eyes. A Figma plugin walks selected frames and emits a **screen inventory** — every value actually used, usage-weighted — as `gamut.inventory.v1` JSON via copy-to-clipboard/file download. Clipboard-first matches the Relay philosophy (zero integration, works today) and needs no network permission.

**What to implement (new `figma-plugin/` directory in this repo: `manifest.json`, `code.js`, `ui.html`):**

1. **Copy the Relay plugin skeleton** (`C:\Users\vyshw\Relay\figma-plugin\`): manifest shape, `figma.on('selectionchange')` wiring, sandbox/UI postMessage split, dark-panel UI styling adapted to Gamut's Museum Editorial (near-black panel, lime primary action only).
2. `scanNodes(nodes)` in `code.js` — recursive walk of selection (or current page if nothing selected; cap ~3000 nodes with an honest "capped" flag). Collect, with **area weighting** (`node.width * node.height`) on every sample:
   - fills/strokes: visible `SOLID` paints → `{ hex, area, nodeType, count }` (copy Relay's element-first fill-walk)
   - text: `{ fontFamily, fontWeight/style, fontSizePx, lineHeight, area, chars }` (handle `figma.mixed` per range coarsely: sample `getRangeFontSize` on segment boundaries or skip mixed with a `mixed: true` flag — do not average silently)
   - auto-layout: `itemSpacing`, `paddingTop/Right/Bottom/Left`
   - geometry: `cornerRadius` (and per-corner variants), effects of type `DROP_SHADOW` → `{ offsetY, blur, colorAlpha }`
   - existing intent, if any: `getLocalPaintStylesAsync()`, `getLocalTextStylesAsync()`, local variable collections via the Variables plugin API — recorded separately as `declared` vs the walked `observed` values (the drift between the two IS the audit finding)
3. `buildInventory()` → `{ schema: "gamut.inventory.v1", source: { fileName, pageName, selection, scannedAt, nodeCount, capped }, observed: { colors[], text[], spacing[], radii[], shadows[] }, declared: { paintStyles[], textStyles[], variables[] } }`. UI: one primary button — **"Copy inventory"** (clipboard) + secondary "Download .json".
4. Export pure functions via the `module.exports` guard for Node tests (Relay pattern).

**Doc refs:** Relay `figma-plugin/code.js` + `test/audit.test.js` (patterns + their known bugs already fixed: word-boundary regexes, element-first fill walk), Figma plugin variables/styles API: https://deepwiki.com/figma/plugin-typings/2.4-variables-and-design-tokens .

**Verification checklist:**
- [ ] Node test with stubbed `global.figma` + hand-built fake node trees: correct area weighting, mixed-text handled, per-corner radii collected, `declared` vs `observed` separation, inventory schema shape asserted.
- [ ] Manual: Import-plugin-from-manifest in Figma desktop against a real design file; confirm selection scan, clipboard copy, and a >1000-node page hitting the cap flag. (The Node harness cannot cover plugin load/postMessage — Relay memory says so explicitly.)

**Anti-pattern guards:** no network calls in the plugin (clipboard/file only — keeps manifest permissions empty and trust high); don't guess at Figma API names — every `figma.*` call must exist in plugin-typings (check the deepwiki/typings before writing); don't reuse Relay's audit heuristics here (that's Relay's product — Gamut scans values, it does not per-element critique).

---

## Phase 6 — The Extractor (reverse engineering engine + System Audit UI)

**Why:** This is the headline capability. Inventory in → drift report + normalized, law-compliant system out, with per-value provenance. It must feel like the Fixer, because it *is* the Fixer generalized: same kept/adjusted/retired vocabulary, same law citations, same "load result into the Engine" ending.

**What to implement:**

1. **`js/extract.js` (new, no DOM — mirrors engine.js discipline):**
   - `clusterColors(observed.colors)` — perceptual clustering: convert to HSL, merge within a distance threshold (reuse the bucketing instinct of `quantizeColors` engine.js:259, but weight by area not pixel count). Output clusters sorted by total area share.
   - `inferRoles(clusters)` — 60-30-10 role inference from area share: dominant candidate = largest near-neutral-or-large cluster, brand = largest saturated cluster, accent = high-sat low-share cluster, ink = darkest text-associated cluster. Confidence score per assignment (share ratios), **surfaced in UI, never hidden**.
   - `clusterScale(values, base)` — shared 1-D clusterer for font sizes (snap to nearest modular-scale from Phase 1's `TYPE_RATIOS`), spacing (snap to 4px-grid `SPACING_STEPS`), radii (snap to nearest of the three `RADIUS_SCALES` curves), shadows (map onto `elevationScale` steps).
   - `extractSystem(inventory)` — orchestrates: returns `{ proposed: <same shape as systemTokens+palette>, drift: { colors: {observedCount, proposedCount, merges[]}, text: {...}, spacing: {...}, radii: {...} }, mapping: [ {observed, fate: kept|merged|adjusted|retired, into, reason, law} ], confidence }`. The proposed palette runs through `fixPalette`/`ensureContrastVivid` so **extraction output obeys the same laws as generation output** — extraction proposes, the laws dispose.
2. **UI — new `#extract` section (the second door):** paste/upload `gamut.inventory.v1` JSON (from the Phase 5 plugin), OR fall back to the existing lighter inputs (image via `quantizeColors`, pasted hexes via the Fixer) presented as "no Figma? start here". Renders: the drift report as headline numbers ("You used **14** blues → proposed **4**"), the mapping table (observed swatch → fate → destination → law, exactly the Fixer's provenance table style), confidence labels, and one primary action: **"Load into the Engine"** — after which every existing feature (system section, components, brand book, all exports, Figma round-trip) applies to the extracted system with zero extra code.
3. Wire the Studio Assistant minimally: on load-in, the archetype is inferred from `inferRoles` hue/sat character via `moodFromColor` (engine.js:1147) — a *suggestion* chip the user can change, never auto-committed.

**Doc refs:** `fixPalette` mapping shape (engine.js:629 — copy its provenance vocabulary exactly), `quantizeColors` (259), `SPACING_STEPS`/`RADIUS_SCALES` (877/888), Phase 5 inventory schema.

**Verification checklist:**
- [ ] Node: synthetic inventories with known ground truth (build fixtures: a "clean" system → extraction recovers it ~exactly, all `kept`; a "drifted" system with 14 near-identical blues/9 radii → correct merge counts, correct role inference, every proposed pair passes contrast floors).
- [ ] Node: fuzz 50 random inventories — `extractSystem` never throws, output always law-compliant, deterministic for identical input.
- [ ] Headless Chrome: paste fixture inventory → drift report renders → "Load into the Engine" → `#system`/`#components` populate → export produces valid DTCG. Screenshot review. Zero console errors.
- [ ] Real-world: run the Phase 5 plugin on one of the user's actual Figma files (e.g. Munim or Awara screens), extract, and eyeball the proposed system against the real design.

**Anti-pattern guards:** no LLM anywhere in the extraction math (deterministic, explainable, every merge cites a distance/threshold or law — the "constrained interpretation" principle extended); never silently discard an observed value (everything appears in `mapping` with a fate); don't add extraction-specific token shapes — proposed output must be the same object `generatePalette`+`systemTokens` produce, or downstream features fork.

---

## Phase 7 — Figma round-trip (plugin, part 2: Apply system)

**Why:** Closing the loop makes Gamut a workflow, not a website: extract from Figma → normalize → push the clean system back as **Figma Variables** + text styles. Also serves the Generate door (brief → tokens → straight into the designer's file).

**What to implement (extends `figma-plugin/`):**

1. "Apply" tab in `ui.html`: paste the DTCG JSON exported by Phase 4 (clipboard-first again — no network).
2. `applyTokens(dtcg)` in `code.js`: create/update a variable collection named `Gamut` with **two modes (Light/Dark)** from the two DTCG deployment groups — `figma.variables.createVariableCollection`, `collection.addMode`/`renameMode`, `figma.variables.createVariable(name, collection, 'COLOR'|'FLOAT')`, `variable.setValueForMode(modeId, value)`. Colors → COLOR variables (convert hex → `{r,g,b}` 0–1 floats), spacing/radius → FLOAT. Type ramp → `figma.createTextStyle()` per step (load fonts via `figma.loadFontAsync` first; handle unavailable fonts by reporting, not substituting silently). Re-running updates in place (match by name) instead of duplicating — idempotency is the difference between a tool and a toy.
3. **Copy the import mechanics from `https://github.com/davo/figma-variables-import`** (a working DTCG→variables importer) rather than deriving from scratch — read its parse+create flow first, then implement Gamut's subset.

**Doc refs:** Phase 4 DTCG output, plugin-typings variables docs (deepwiki link in Phase 0), `davo/figma-variables-import` source.

**Verification checklist:**
- [ ] Node test (stubbed `figma.variables`): correct create-vs-update branching, hex→float conversion exact for known values, mode mapping correct, font-missing path reports and skips.
- [ ] Manual in Figma desktop: apply a fintech system → variables panel shows collection with Light/Dark modes and correct swatches; re-apply after a seed change → values update, **no duplicate collection**; text styles appear and are usable.

**Anti-pattern guards:** plugin API only — do NOT write against the REST Variables endpoint (Enterprise-gated; would silently exclude almost all users); never delete user variables not owned by the `Gamut` collection; no silent font substitution.

---

## Phase 8 — The two-door experience (IA + onboarding recomposition)

**Why last-but-one:** Only now do both doors have real rooms behind them. This phase makes a first-time brand designer understand the product in one screen — the explicit product bar ("instantly understands what is going on").

**What to implement:**

1. **Recompose `index.html`'s opening:** hero states the promise in one line ("A complete brand design system — generated from a brief, or extracted from your Figma file"), followed by exactly two equal doors: **Generate** (→ brief bar / category pick, the existing flow) and **Extract** (→ the Phase 6 ingest). The current single-scroll tool page becomes the shared workspace both doors land in.
2. **A persistent progress rail** (nav evolution, not a new device): `Brief → Color → Type → System → Components → Ship`. Each item is the existing section anchor; "Ship" gathers exports + brand book + Figma apply into one closing section, so the narrative arc is legible: *decide → refine → deliver*. Museum Editorial rules hold — the rail is type + hairlines, no icons/ornament.
3. **First-run legibility, not a tour:** every section keeps a one-line explainer in muted text (most already have copy — audit and tighten); the Extract door shows a worked example inventory ("try a sample scan") so an empty state teaches; the Assistant bar carries a rotating placeholder brief. No modal onboarding, no tooltips-on-rails — the page explains itself or the copy failed.
4. URL state extended: `?mode=generate|extract` joins `?cat&seed&borrow&lock` (+ brand name from Phase 3) so both doors are shareable/bookmarkable.

**Doc refs:** DESIGN.md (the chrome rules + motion grammar — one fade+rise, used once per element class), LAYOUT-BLUEPRINT.md, current `index.html` section order.

**Verification checklist:**
- [ ] Headless Chrome: fresh load → two doors visible above the fold at 1280w and 375w (iframe trick for narrow — the ~496px Windows headless minimum is a known machine gotcha); both doors reach their flows; URL state round-trips; zero console errors.
- [ ] Copy audit: every section's first line answers "what is this / why do I care" — read aloud test against the transcript of a cold user.
- [ ] Full regression: Engine, Fixer, Assistant, exports, print, saved palettes, history all still function (the IA moved walls — nothing behind them may break).

**Anti-pattern guards:** no marketing-site bloat (the tool IS the landing page — that's the product's charm, keep it); no third door (curated galleries, community feeds etc. are out of scope); don't hide the Fixer — it's a differentiator, it lives inside Extract as the lightweight path.

---

## Phase 9 — Final verification + docs

1. **Full node regression suite** in one script: generation sweep (10 archetypes × 30 seeds), extraction fixtures, DTCG round-trip, contrast floors everywhere — one command, all green.
2. **Headless Chrome end-to-end of both doors:** Generate: brief → system → components → brand book PDF → DTCG export. Extract: sample inventory → drift report → load → export. Screenshots reviewed.
3. **Anti-pattern greps:** no hex literals in `componentTokens`/`extract.js` mappings; `gamut.tokens.v1` schema string unchanged; no `fetch(` in `figma-plugin/`; no gradients/shadows added to site chrome CSS outside preview canvases.
4. **Figma plugin manual pass** (Import-from-manifest): scan → extract → apply loop on a real file.
5. **Docs:** README rewritten around the two doors; `DESIGN-SYSTEM-SPEC.md` gains V2 sections; PRODUCT.md capabilities/positioning updated (extraction is now the second pillar); this plan file marked with per-phase completion status.
6. **Deploy:** commit + push to `github.com/vyshwas/gamut` (Pages auto-publishes). Note: the 2026-07-25 off-white light-theme change may still be uncommitted — verify `git status` and fold it into the first commit rather than losing it.

---

## Explicitly out of scope for V2 (documented so they aren't accidentally started)

- **Payments/auth/accounts** — separate decision track, unchanged from README.
- **Component code export** (React/HTML component library generation) — previews and token specs only.
- **DTCG import of foreign spacing/type as live tokens** — colors only feed the Fixer; the rest is read-only reporting.
- **REST-API Figma integration, Chrome extension, MCP delivery** — plugin + clipboard is the V2 surface.
- **Multi-brand workspaces / saved cloud projects** — localStorage save (cap 30) remains the persistence story.
- **Relay merge or shared runtime** — settled repeatedly; pattern reuse only.
