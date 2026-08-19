# Gamut Pivot Plan: From Two-Door Design-System Studio to One-Problem Decision Tool

Status: PLANNED, not yet executed. Written by an Opus planning pass (2026-08-19) against two
research documents (`business_opportunity_strategy.md` and `Pain_Point_Analysis_Summary.md`,
both in the owner's Downloads folder, Reddit-sourced pain-point research — not committed to this
repo) and a direct read of the codebase as it stood at commit `71b7f1b`.

This plan supersedes `GAMUT-V2-PLAN.md`, `LAUNCH-CHECKLIST.md`, `PROGRESS-LAUNCH.md`,
`DESIGN-SYSTEM-SPEC.md`, and `LAYOUT-BLUEPRINT.md` — those documented the two-door vision this
plan cuts down from. They get archived (git tag), not deleted from history, in Phase 0/9 below.

---

## 0. What was actually verified (and one correction to the original brief)

Verified by direct read of the repo at commit `71b7f1b`:

- `js/engine.js` (1,288 lines) contains: color math, contrast enforcement (`ensureContrast`,
  `ensureContrastVivid`), 10 `ARCHETYPES` (each a recipe of `brandHue`/`brandSat`/`brandLight`/
  `accentHue`/`dominant`/`mood` bands), an 8-way `ACCENT_HARMONIES` taste layer, `generatePalette`,
  `diagnosePalette`/`fixPalette`, two typography tables, `systemTokens` (spacing/radius/elevation/
  states), and six exporters.
- `js/main.js` (2,140 lines) — roughly 90 functions, of which roughly a third serve doors this
  plan cuts.
- `index.html` (707 lines) has 9 sections: Assistant, Engine, Extract, Fixer, Type, System,
  Method, Pricing (already commented out as of `71b7f1b`), FAQ — plus a nav with 7 links, 15
  `studio-tag` "Studio" badges, and 18 `License.Gate.has()` call sites in `main.js`.
- Licensing is real and complete but neutered: `js/license.js` `tier()` returns `"studio"`
  unconditionally.
- There is no analytics of any kind in the codebase. The CSP `connect-src` allow-list contains
  only Google Fonts, Gemini, localhost Ollama, and the license worker. The site is live at
  `vyshwas.github.io/gamut/` with zero usage data of any kind.

**Correction to the framing that started this plan.** `engine.js` was described as "a real
deterministic strategy-to-token compiler already." That's half true, and the false half is the
pivot. It's deterministic *given a seed*, but `generatePalette` defaults to `seed = Date.now()`
(line ~459) and `main.js` `generate(newSeed = true)` rolls a fresh one on every click and on the
spacebar. The only "strategy" input today is a 10-item industry dropdown. Today's actual behavior
is: pick your industry, then roll dice until you like it. That's a good random palette generator
with law-based guardrails — not yet a compiler, because a compiler's defining property is that the
same input always produces the same output, and "which industry are you in" is not a strategy.

This gap **is** the product. The existing engine is the expensive half (mapping a constraint
region to a law-compliant token system, with contrast proven numerically). The missing half is
cheap: a real strategic input, and a seed derived from it instead of from the clock.

---

## 1. The problem: pain point #2, "Vague Guidance vs. Micromanagement"

**Pick: the client paradox** — designers get vague guidance up front, then get micromanaged once
work starts, worsened by clients dumping unexplained AI-image references. Sold to the designer.
Pain point #1 (Rebranding ROI Remorse) is retained as the *stakes* in the pitch, not as the
problem being solved.

### Why not #1 (Rebranding ROI Remorse), despite ranking highest on intensity

1. The literal problem is unsolvable with this codebase — "we spent $46k and nothing changed" is
   a claim about business outcomes (market data, awareness tracking, conversion attribution).
   `engine.js` contributes nothing to that; building for it means starting over and keeping only
   the name.
2. The buying moment is wrong — remorse is felt *after* the money's spent, once every ~5 years, by
   someone who now wants to spend nothing.
3. Frequency is fatal for a zero-user product — a five-year cycle means you can't learn fast.

What #1 *does* give: the pitch. "The rebrand changed the logo, colors, buttons, website — not the
underlying positioning or strategy" is the sentence that makes a designer's client sit up. Use it
as marketing copy; don't build the product for it.

### Why not #4 (Execution Gap), which is what Gamut already does

This is the honest gut-check. #4 is the problem Gamut has been solving for months, the research
ranks it **last** (medium frequency, medium intensity, medium specificity), and Gamut solved it
and got zero users. Not conclusive alone (no distribution effort either), but it points the same
direction as the research. Deeper reason: the Execution Gap is a problem designers enjoy having —
translating strategy into visuals is the craft. Nobody buys a tool to do the fun part faster. What
they buy a tool for is the part that makes them want to quit — which is #2.

### Why not #3 (Niche Anxiety)

Requires TAM data, search volume, competitor scraping. Nothing in the codebase serves it;
`engine.js` becomes decoration. Rejected on the reuse constraint alone.

### Why #2 wins

| Axis | #2 (Client Paradox) |
|---|---|
| Frequency | Highest in the dataset — felt weekly, on every project |
| Buyer | The freelance/solo designer — reachable, tool-buying, the owner's own peer group |
| Reuse of `engine.js` | ~90%, core untouched |
| What's missing | A real input and a real output artifact — both small, both additive |
| Falsifiable fast | Yes — show one designer one brief; they recognize it or they don't |

Critically, `generatePalette` already accepts a `customArchetype` parameter (line ~468) — an
arbitrary recipe object of the same shape as the ten fixed archetypes, which skips the lookup/
borrow step but flows through identical generation, contrast, and law logic. The Studio Assistant
already uses this seam. A forced-tradeoff compiler is therefore a new producer for an input
contract that already exists and is already exercised — roughly 200-250 lines of pure, DOM-free,
Node-testable function, and everything downstream (contrast enforcement, the laws, dual light/
dark deployments, typography, spacing, radius, elevation, states, CSS export) comes for free.

### The synthesis

#1 and #2 are the same failure with two victims. The founder's version: "we changed how it looks
and nothing changed" — no success criterion was ever set, so nothing could be evaluated. The
designer's version: "make the blue more blue" — no criterion was ever set, so taste wins the
argument by default. In both cases a visual decision was made and no record exists of what it was
supposed to accomplish. The intervention is identical: force the criterion to be written down and
made binding *before* visuals exist, then make every visual decision cite it. Build it for the
designer — they feel it weekly and will pay to stop feeling it.

---

## 2. What the new product is

> Gamut turns a 10-minute forced-choice kickoff into a one-page, client-signable direction brief
> where every color and type decision cites the trade-off the client themselves chose — so
> "I don't like the blue" becomes "I want to change my answer to question 4."

- **One user:** the solo or freelance brand/product designer doing client work.
- **One job:** end subjective revision loops by making the visual direction auditable against a
  strategy the client already approved.
- **One artifact:** the Direction Brief. Not a palette. Not a design system. A document with a
  signature line.

### Three design constraints, decided now

**a) The designer runs the tool, not the client.** The research itself flags the killer objection
for client-facing intake tools: "getting designers to change their workflow and risk alienating
clients who demand total control." Don't build a collaboration platform. The designer answers the
seven questions live on the kickoff call, or from call notes afterward. The client's only
interaction is receiving a link/PDF and approving it. Keeps the product a static site, no accounts,
no backend — preserves the existing architecture and deletes an entire category of work.

**b) The seed dies. Determinism is the entire pitch.** If the same answers can produce a different
palette, "this color is the output of your strategy" is a lie the client will correctly ignore.
**seed = stable hash of the answer set.** Same answers, same system, forever. Don't like it? Change
an answer. That single rhetorical move is what the whole product sells. Kills: Regenerate button,
spacebar-to-regenerate, History panel, Saved Palettes panel, random seed in the URL.

**c) Variety comes from a bounded variant index, not randomness.** Designers need alternatives.
Answers determine the constraint region; a variant index 1..5 walks deterministically through
law-compliant options *inside* that region, and the brief labels all five as equally satisfying the
same brief. Honest ("all of these answer your questions; pick one") while making "roll until
pretty" structurally impossible. Cost: variant index feeds the hash. Near zero.

### The intake — seven forced choices, no free text

Every question is a forced binary or a two-pole slider, no midpoint, no "both." Every answer
produces a **lever delta** (into the recipe shape) and a **ruled-out sentence**.

| # | Question (forced) | Engine lever |
|---|---|---|
| 1 | Category / context (the one dropdown that survives) | Reference band from `ARCHETYPES` — used only as the baseline Q2 measures against |
| 2 | **Familiar** (belongs in category) vs **Distinctive** (looks like nothing else in it) | Adherence to, or deliberate offset from, the reference band (Law 7's "Break category" repositioned as an answered choice) |
| 3 | **Trusted** vs **Exciting** | Saturation band + hue temperature |
| 4 | **Premium** vs **Accessible** | Lightness band + `dominant` kind (dark/sand/cream vs cloud/cool-light/sunshine) + type personality |
| 5 | **Calm** vs **Loud** | Saturation ceiling + accent harmony family (analogous vs complementary) + radius/elevation |
| 6 | **Established** vs **New** | Hue family + type personality (craft/mv-editorial vs mv-geometric/mv-technical) + radius scale |
| 7 | **Human** vs **Precise** | Hue temperature + spacing density + type (mv-humanist vs mv-geometric/mono) |
| + | "Is there a color you cannot change?" (optional hex) | Existing `lockedBrand` parameter, unchanged |

The ruled-out sentences are the anti-micromanagement mechanism and matter more than the palette:

> "You chose Distinctive over Familiar. That ruled out the blue-grey family your three closest
> competitors use. Asking for a safer blue later means changing this answer."

Every later "can you just make it more corporate" now has to be phrased as a retraction of
something the client wrote down and signed.

### The output — the Direction Brief

One page, printable to PDF via existing `window.print()` machinery, shareable via a URL that
encodes the answers (no backend needed):

1. Studio name and client/project name (existing white-label fields, promoted from paid perk to
   default)
2. The answers as declarative sentences — "This brand chooses to be recognized over admired."
3. What each answer ruled out
4. The resulting system — palette at true 60-30-10 proportions, type specimen, both light and dark
   deployments
5. The citation table — each decision -> the answer that produced it -> the law that constrained
   it (`renderReading()`/`harmonySentence()` upgraded from three generic sentences into per-
   decision provenance)
6. Collapsed appendix — full token set + CSS/Tailwind export
7. Sign-off block — "Approved by ___ on ___. Changes to the visual direction require changing an
   answer above."

---

## 3. Keep / Cut / Reposition

Baseline: ~9,700 verifiable lines across JS/HTML/CSS/tools. Target after pivot: **~4,500-5,000
lines.** Roughly 5,000 deleted, ~800 added.

### KEEP

| File / unit | Why it survives |
|---|---|
| `js/engine.js` — color math, `ensureContrast*`, `ARCHETYPES`, `ACCENT_HARMONIES`, `generatePalette`, `TYPE_PAIRS`/`TYPE_PAIRS_MOOD`, `getTypePairs`, `shadeScale`, `spacingScale`, `radiusScale`, `elevationScale`, `stateVariants`, `systemTokens`, `exportCss`, `exportTailwind`, `exportTokensJson`, `mulberry32` | The compiler. Untouched except deletions + one new entry point |
| `diagnosePalette` | Powers the brief's "risks / what this direction can't do" copy |
| `main.js`: `renderBand`, `renderSwatches`, `renderChecks`, `renderTypeLab` core, `renderSystem` core, print-sheet mechanism, `copyText`/`toast`, `Theme`, `Wordmark` | Rendering primitives the brief needs |
| `tools/regression.mjs` | Keep the harness, rewrite the sweeps; determinism test becomes the headline test |
| `css/style.css` | Keep Museum Editorial system; delete the ~600-800 lines belonging to cut sections |
| `bible/`, `DESIGN.md` | Source material and locked visual system, not shipped, not in the way |

### CUT

| Cut | ~Lines | Reasoning |
|---|---|---|
| Licensing + payments entirely — `js/license.js`, `worker/`, `tools/license-admin.mjs`, `tools/test-l4.mjs`, `tools/export-worker-secrets.mjs`, `licenses/`, `claim.html`, 18 `Gate.has()` call sites, 15 `studio-tag` badges, commented pricing block, Razorpay CSP entries, payment FAQ items, `legal/refunds.html`, `tools/generate-legal.mjs` | ~1,400 | Gating a zero-user product is dead weight that signals "paid tool" with no reason to trust it yet. Fully recoverable from git. Re-decide monetization against the new product later. |
| Extract door — `js/extract.js`, `figma-plugin/`, `#extract` section, `runExtractor`/`adoptExtracted`/`copyExtractedForFigma`, `exportDtcg`, `tools/test-p6-extract.mjs`, nav link, CSS | ~1,100 | Different job (audit) at a different moment for a different user. Never manually verified against real Figma per `PRODUCT.md` — this cut discards something never proven to work. |
| Studio Assistant / LLM layer — `js/assistant.js`, `#assistant` section, its handlers, Ollama + Gemini CSP entries, API-key field, nav link, CSS | ~450 | Philosophically opposed to the new product — free text is the disease being cured. Also removes the `file://` CORS caveat, the API-key trust liability, and all remaining network egress except Google Fonts. |
| Fixer door — `#fixer` section, strategy radios, stepper, before/after compare, image upload, `runFixer`/`adoptFixed`/`updateStepper`, `fixPalette`, `quantizeColors` | ~500 | A second job at a second moment. The real common need ("client has a locked logo color") is already handled by `lockedBrand`, which becomes intake Q7 at zero new code. |
| AI Import Package — `js/aipack.js`, script tag, button | ~410 | Built for "hand your system to Cursor," not the one problem. `buildBrandBook()` prose logic worth reading as reference before writing the Direction Brief renderer (Phase 8), then delete. |
| Secondary exports — `exportScss`, `exportJson`, `exportSvgCard`, `exportDtcg` | ~90 | Final export set: CSS variables, Tailwind v4, the Direction Brief (print/PDF + link), one `gamut.brief.v1` JSON |
| CMYK / print-gamut — `rgbToCmyk`, `gamutRisk`, print-shift chips, print FAQ | ~70 | `PRODUCT.md` calls it "a naive uncoated approximation" — an honesty liability on a document meant to be signed |
| Randomness + collection UI — Regenerate button, spacebar handler, `pushHistory`/`renderHistory`, `toggleSave`/`renderSaved`/`loadSavedList`/`persistSaved`, shades panel, colorblind simulator, `SiteTheme` | ~330 | Directly contradicts determinism constraint (b) |
| Standalone `#type` and `#system` sections | ~110 | Content survives inside the brief, as evidence, not as separate destinations |
| `GAMUT-V2-PLAN.md`, `LAUNCH-CHECKLIST.md`, `PROGRESS-LAUNCH.md`, `DESIGN-SYSTEM-SPEC.md`, `LAYOUT-BLUEPRINT.md` | - | Archive to the tag. They document the vision being abandoned; leaving them on `main` will confuse future agents. |

### REPOSITION

| Asset | From | To |
|---|---|---|
| `ARCHETYPES` | User-facing category dropdown = the entire "strategy" input | Internal recipe primitives + the reference band Q2 measures deviation against |
| `js/mood.js` `MOOD_LEXICON` | Vocabulary for an LLM to pick from | The compiler's lookup table — answer combinations resolve to hue/sat/light targets and typography personalities through it. Keep the file, delete its only current consumer. Highest-leverage reuse in the repo. |
| `renderReading()` / `harmonySentence()` | Three generic sentences about the current palette | The citation engine: per-decision provenance linking each token to the answer and the law that produced it. Heart of the new product. |
| Law 7 "Break category" toggle | A random checkbox | Intake Q2, an answered strategic choice with a ruled-out consequence |
| Print sheet | Gated "Studio" perk | The primary deliverable |
| Agency white-label fields | Gated "Studio" perk, 3 fields + logo upload | Default and core, simplified to 2 fields (studio name, client/project) |
| URL state `?cat=&seed=&borrow=&lock=` | Sharing a random palette | Encoded answer set = the shareable brief link. Preserves no-backend architecture. |
| `#method` section | 10-law accordion | Trimmed to the six laws actually enforced at runtime — 1 (dark anchor), 2 (saturation relationship), 4 (dark deployment), 5 (loud-color limit), 8 (ramps), 9 (contrast floor). Laws 3, 6, 7, 10 cut from UI: they're copy, not code. |

### Explicitly NOT decided now

**The name.** "Gamut" means a range of colors — fits a palette generator better than a brief tool.
Renaming costs real hours across docs/deploy/wordmark, protects zero brand equity (zero users),
and feels like progress while producing none. Keep "Gamut" until a real user is confused by it.

---

## 4. Phased execution plan

Ordering principle: **delete first, build second.** Deletion is the most mechanical work available
and shrinks the surface every later phase must reason about. Every phase has a grep-or-exit-code
verification. **Commit at the end of each phase** with a message naming the phase
(`git commit -m "Pivot Phase N: <what>"`), and log status to `PROGRESS-PIVOT.md` after each phase
(create it in Phase 0 if it doesn't exist, one line per phase: date, phase, pass/fail, notes).

### Phase 0 — Safety net and baseline (no file modified)
1. `git tag v2-full-archive` and `git branch archive/v2-two-door` at current HEAD. Push both.
2. Run `node tools/regression.mjs`. Record pass/fail and output verbatim into `PROGRESS-PIVOT.md`.
3. Record `wc -l` for every source file as the before-state.

If regression fails at baseline: STOP, report to the owner, do not begin deletions on a red suite.

### Phase 1 — Delete the licensing and payments layer
Delete: `js/license.js`, `worker/`, `tools/license-admin.mjs`, `tools/test-l4.mjs`,
`tools/export-worker-secrets.mjs`, `tools/generate-legal.mjs`, `licenses/`, `claim.html`,
`legal/refunds.html`.
In `index.html`: remove the `license.js` script tag, all 15 `studio-tag` spans, the commented-out
pricing block, the pricing-redemption block, `razorpay`/`checkout.razorpay`/
`gamut-api.*.workers.dev` from the CSP, the payment/licensing FAQ items.
In `js/main.js`: remove all 18 `License.Gate.has()` guards (keep the guarded action, drop the
guard), `lockedToast()`, `updateLicenseUI`, the redeem handler.
In `css/style.css`: remove `.pricing*`, `.price-card*`, `.studio-tag`, redemption styles.
In `tools/regression.mjs`: remove the license test invocation.

Verify: `grep -ri "license\|Gate\.\|razorpay\|studio-tag\|worker" --include=*.js --include=*.html --include=*.css .`
returns nothing outside `.git`; page loads with zero console errors; `node tools/regression.mjs`
exits 0.

### Phase 2 — Delete the Extract door
Delete: `js/extract.js`, `figma-plugin/`, `tools/test-p6-extract.mjs`.
In `index.html`: remove `#extract` section, its nav link, the `extract.js` script tag.
In `js/main.js`: remove `runExtractor`, `adoptExtracted`, `copyExtractedForFigma` and listeners.
In `js/engine.js`: remove `exportDtcg`.
In `css/style.css`: remove `.extract*`, `.drift*`, `.mapping` blocks used only by Extract.
Remove Extract/DTCG paragraphs from `README.md` and `PRODUCT.md`.
In `tools/regression.mjs`: remove the extractor fuzz and DTCG shape checks.

Verify: `grep -ri "extract\|dtcg\|inventory\|figma" .` returns nothing outside `.git` and archived
docs; regression exits 0.

### Phase 3 — Delete the Studio Assistant and the LLM layer
Delete `js/assistant.js`. **Do not delete `js/mood.js`** — it becomes temporarily unreferenced and
is re-consumed in Phase 6.
In `index.html`: remove `#assistant` section, nav link, script tag, and
`https://generativelanguage.googleapis.com` + `http://localhost:11434` from the CSP `connect-src`.
In `js/main.js`: remove `toggleAssistantFields`, `syncAssistantSettings`, `renderAssistantResult`,
`generateFromAssistant` and listeners.
In `css/style.css`: remove `.assistant*` blocks.
Remove the "Studio Assistant" section from `README.md`.

Verify: `grep -ri "assistant\|ollama\|gemini\|llm" .` returns nothing outside `.git`; CSP
`connect-src` now permits only `'self'` and Google Fonts; `js/mood.js` still exists and parses.

### Phase 4a — Delete the Fixer door, AI pack, and collection UI
Delete `js/aipack.js`.
In `index.html`: remove `#fixer`, `#type`, `#system` sections, their nav links, the `aipack.js`
script tag, AI-package/SVG-card/SCSS/JSON export buttons, vision-simulation row, history block,
saved-palettes block, shades panel, hero Regenerate button and "press space" hint.
In `js/main.js`: remove `runFixer`, `adoptFixed`, `updateStepper`, `downloadAiPackage`,
`downloadSvgCard`, `openShades`, `pushHistory`, `renderHistory`, `toggleSave`, `syncSaveButton`,
`renderSaved`, `loadSavedList`, `persistSaved`, `isValidSavedEntry`, `restorePalette`, `miniStrip`,
`SiteTheme`, vision handlers, image-upload handler, spacebar handler.
Simplify the agency panel to two text inputs, always visible, no `<details>`, no logo upload.

Verify: page loads with zero console errors; no `getElementById` in `main.js` returns null on load
(add a temporary boot-time assertion, run it, then remove it).

### Phase 4b — Delete now-dead engine code
In `js/engine.js` remove: `fixPalette`, `quantizeColors`, `rgbToCmyk`, `gamutRisk`, `exportScss`,
`exportJson`, `exportSvgCard`, and the `cmyk`/`print` fields from the `build()` helper inside
`generatePalette`.
Keep `diagnosePalette`, `shadeScale`, `exportCss`, `exportTailwind`, `exportTokensJson`,
`systemTokens`, and all contrast/HSL utilities.
In `tools/regression.mjs`: remove the `fixPalette` fuzz sweep; keep the `generatePalette` contrast
sweep.

Verify: every remaining top-level function in `engine.js` has at least one caller (script-
verifiable); regression exits 0.

### Phase 5 — Collapse the page to one flow
`index.html` reduced to: hero, `#brief` (intake, empty shell for now), `#method` (trimmed to laws
1, 2, 4, 5, 8, 9), `#faq` (trimmed to product questions only), footer. Nav reduced to at most two
links. Delete corresponding orphaned CSS.

Verify: `index.html` <= 320 lines; `css/style.css` reduced by >= 500 lines; zero orphaned `id`
attributes and zero `main.js` references to removed ids.

> Phases 0-5 are pure deletion, individually revertible, and require no design judgment. Expected
> result: ~5,000 lines removed, product still runs, before any new code is written.

### Phase 6 — Build the Tradeoff Compiler (`js/engine.js`, pure, DOM-free)
Add three functions:
- `ANSWER_SCHEMA` — the seven questions as data: id, both pole labels, each pole's
  `{ leverDelta, ruledOutSentence }`.
- `compileBrief(answers, variant = 1)` -> `{ recipe, seed, rationale[], ruledOut[] }`, where
  `recipe` matches the exact shape `generatePalette` already accepts as `customArchetype`.
  Resolves lever deltas against `ARCHETYPES` (reference band) and `MOOD_LEXICON` (hue/sat/light
  targets + typography personality).
- `answersSeed(answers, variant)` — a stable non-cryptographic hash. Must not use `Date.now()`,
  `Math.random()`, or object key order.

Verify (three Node tests added to `tools/regression.mjs` — this phase's whole point):
1. Determinism: the same answer set compiled 1,000 times produces byte-identical
   `JSON.stringify(generatePalette(...))`.
2. Coverage: all 2^6 pole combinations x 10 categories x 5 variants = 3,200 briefs; every one
   produces a palette clearing the existing contrast floors.
3. Sensitivity: flipping any single answer changes the output palette (no question is a no-op
   lever).

### Phase 7 — Build the intake UI
Seven forced-choice controls, no free-text field anywhere except the optional locked hex and the
studio/client names. A 1..5 variant stepper labelled "all five satisfy this brief." Answers encoded
into the URL; the URL is the shareable brief.

Verify: every answer combination reachable by keyboard; URL round-trips (encode -> reload ->
identical rendered brief).

### Phase 8 — Build the Direction Brief renderer
The seven sections from §2. Reuses `renderBand`, `renderSwatches`, `renderChecks`, the type
specimen, `systemTokens`, and the existing `window.print()` + `print-color-adjust: exact`
machinery. `renderReading()` is rewritten into the citation table. Exports: CSS variables,
Tailwind v4, `gamut.brief.v1` JSON, Print/Save-as-PDF.

Before writing the renderer, read the deleted `js/aipack.js` `buildBrandBook()` from the
`v2-full-archive` tag as a prose reference.

Verify: printing produces a single readable page in Chrome and Firefox; every claim in the brief
is computed from the palette on screen, never hardcoded (grep the renderer for literal hex values
— there must be none).

### Phase 9 — Documentation and final sweep
Rewrite `README.md` and `PRODUCT.md` against the new one-sentence definition. Move
`GAMUT-V2-PLAN.md`, `LAUNCH-CHECKLIST.md`, `PROGRESS-LAUNCH.md`, `DESIGN-SYSTEM-SPEC.md`,
`LAYOUT-BLUEPRINT.md` off `main` (they're preserved on the `v2-full-archive` tag). Final grep sweep
for dead references. Record final `wc -l` in `PROGRESS-PIVOT.md`.

Verify: `PRODUCT.md` "Users" section names exactly one segment; "Evidence on Hand" still honestly
says none; final line count within the 4,500-5,000 target.

### Phase 10 — Validation (owner-only, NOT an agent task)
Put the brief in front of five freelance designers. The question worth asking is not "do you like
this" but "has a client ever done this to you, and would you have sent them this?" **This phase
gates all further feature work.** Do not build anything past Phase 9 without the owner's sign-off
on Phase 10 results.

---

## 5. What could not be verified — flagged, not papered over

1. Zero user validation exists for any of the four pain points, including the one this plan
   selects. `PRODUCT.md`: "Evidence on Hand: None yet." This plan is a bet on desk research.
2. The pain-point research is not independently checkable from this repo — unquantified frequency/
   intensity claims, no post counts, no subreddit list, no date range, no methodology.
   `reddit_comments.txt` in the repo root is 0 bytes; the raw evidence is not present.
3. No analytics exist, so the Extract/Fixer/Assistant cuts are made on reasoning, not usage data —
   there is a non-zero chance a real visitor is using one of them today. Mitigated by the archive
   tag: any door restores in under an hour.
4. The Figma plugin was never verified against real Figma (`PRODUCT.md` says so explicitly — only
   Node tests against a stubbed `global.figma`).
5. This plan was not executed against the codebase before being written — Phase 0 exists
   specifically to establish a real baseline before any deletion begins.
6. Willingness to pay is entirely unknown. This plan deletes the payment infrastructure without
   proposing a replacement, on the grounds that pricing a product with no validated problem is
   premature — a deliberate deferral, not an oversight.
7. "The designer fills it in, not the client" is a judgment call, not a research finding — the
   single most consequential design decision in this plan. It should be the first thing tested in
   Phase 10.

### Critical files
- `js/engine.js` — the surviving core; gains `compileBrief`, `ANSWER_SCHEMA`, `answersSeed`; loses
  `fixPalette`, `quantizeColors`, `rgbToCmyk`, `gamutRisk`, four exporters
- `js/main.js` — loses ~1,000 lines across four cut doors; `renderReading` rewritten into the
  citation engine
- `index.html` — collapses from 9 sections to 4; loses all 15 `studio-tag` badges and the CSP
  entries for Razorpay, Gemini, and Ollama
- `js/mood.js` — survives the LLM cut, repositioned as the tradeoff compiler's lookup table
- `tools/regression.mjs` — the verification harness every phase gates on; its determinism sweep
  becomes the product's headline test
- `PRODUCT.md` — must end Phase 9 naming exactly one user segment
