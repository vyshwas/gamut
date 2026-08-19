# Gamut

A brand color palette generator, palette fixer, and typography pairing tool built on The Brand Color Bible v2 methodology: the 60-30-10 rule, the ten laws of color, and nine psychology profiles. Plain HTML, CSS and JavaScript. No build step, no framework, no backend required to demo.

## What it does

- **The Engine.** Generates 4-role palettes (Dominant 60 / Brand 30 / Accent 10 / Ink anchor) seeded by industry category. Every output obeys the laws: dark anchor forged in (Law 1), accent saturation held at 60-80% of the brand's (Law 2), rendered into live landing-page mocks at realistic proportions (Law 3), and shipped with a dark deployment built at the same time as the light (Law 4). The "Break category" toggle deliberately borrows another category's recipe (Law 7).
- **The Fixer.** Paste 2-6 hex codes. It diagnoses violations against the laws by name, rebuilds the palette with roles assigned using selectable strategies (Preserve, Balanced, Maximize), shows before/after with transparent summary chips, and can load the result into the Engine.
- **Type pairings.** Each palette mood maps to display+body pairs the Bible prescribes (rounded impact, editorial serif, geometric sans, heavy display, clean grotesk, mono+grotesk), loaded live from Google Fonts and rendered in the current palette.
- **Print + digital values.** Every swatch carries HEX, RGB, and CMYK (uncoated approximation) plus a print-gamut check: colors outside typical CMYK range get flagged with a press-safer alternate (heuristic, honestly labeled; not ICC). Exports: CSS variables (with dark-mode block), Tailwind v4 `@theme`, SCSS, JSON, a downloadable SVG swatch card, and a printable brand sheet including the type pairing (`window.print()` with `print-color-adjust: exact`).
- **The Design System.** Every palette also generates a matched spacing scale, corner-radius personality, a tinted elevation/shadow family, and hover/active/disabled/focus states for Brand and Accent — driven by the same archetype signal as the colors, not a generic set bolted on after. CSS/Tailwind/SCSS exports include these automatically; a separate structured JSON export (`gamut.tokens.v1`) carries the full system in one versioned, provenanced payload. See `DESIGN-SYSTEM-SPEC.md`.
- **Shareable palettes.** Seed and settings live in the URL (`?cat=&seed=&borrow=&lock=`), so any generated palette can be bookmarked or sent to a client. The Fixer reports the fate of every input color (kept / adjusted / retired, with the law that caused it).
- **Studio Assistant.** A conversation bar: describe a brief or a mood in plain language ("a calm, trustworthy wellness brand with a modern edge") and it's interpreted onto Gamut's own frameworks - never onto invented hex codes. See "The Studio Assistant" below.
- **AI Import Package.** A one-click ZIP (`js/aipack.js`) built for handing a palette to an AI coding or design agent instead of a human: the full `gamut.tokens.v1` payload, a `brand-system.json` provenance file, a generated `brand-book.md`, and a `figma-import.md` prompt written straight off that data. Attach the ZIP to Claude Code, Codex, Cursor, Gemini CLI, Windsurf, or anything that can build a Figma file, and it has everything needed - no AI involved in generating it, and byte-for-byte identical on every re-export of the same palette.

## File structure

```
Designare/          (folder name predates the rename; the product is Gamut)
  index.html        structure + all copy
  css/style.css     tokens + styling + print sheet styles
  js/engine.js      color math, generation, fixing, type/system tokens (no DOM)
  js/mood.js        mood-keyword lexicon, independent of the business archetypes
  js/assistant.js   LLM interpreter: Ollama / Gemini API / offline keyword match
  js/aipack.js      deterministic AI Import Package ZIP builder
  js/main.js        UI wiring
  tools/            regression.mjs (Phase 9 suite), other node test scripts
```

## Quick start

Open `index.html` in a browser, or serve it with any static server.





## Verifying changes

`node tools/regression.mjs` runs the full Phase 9 suite in one command: every existing test script, a `generatePalette` contrast sweep (all archetypes x 30 seeds x both deployments), a `fixPalette` fuzz sweep (5,000 random inputs x 3 strategies), and a few anti-pattern greps. Node-level only.

## Customization

- All site tokens live at the top of `css/style.css`. The site itself runs the Bible v2's own identity: Combo 06 (charcoal + bone + electric lime) deployed per its own 60-30-10 rule, plus v2's blue `#2242E5` as the pop on light surfaces (method-band numbers, print-sheet role names), where lime can't carry text.
- Palette archetypes (hue ranges per category) live in `ARCHETYPES` in `js/engine.js`. Each archetype's `mood` field selects its typography bucket - keep these unique across archetypes so two categories never look identical.
- Typography pairs live in `TYPE_PAIRS` (the six original archetype moods) and `TYPE_PAIRS_MOOD` (the eight-way mv-* taxonomy the mood lexicon uses) in `js/engine.js`. All pairs must exist on Google Fonts.
- The mood lexicon (keyword -> hue/sat/light target + typography tag) lives in `MOOD_LEXICON` in `js/mood.js`. Used for resolving custom typography personalities based on the mood lexicon.
- CMYK conversion is a naive uncoated approximation, flagged as such in the UI and print sheet. For press-critical accuracy you would integrate a proper ICC pipeline server-side.

## Browser support

Modern evergreen browsers. `backdrop-filter` on the nav degrades gracefully.
