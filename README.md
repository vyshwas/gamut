# Gamut

A deterministic strategy tradeoff compiler that resolves design constraints into a production-ready System Direction Brief. Built with vanilla HTML, CSS, and JavaScript. No build step, no framework, no backend required.

## What it does

- **The Tradeoff Compiler.** Instead of random generation, Gamut compiles design direction from seven forced-choice strategy tradeoffs (Category, Market Position, Brand Temperament, Audience Stance, Visual Volume, Organizational Age, and Strategic Core).
- **The Direction Brief.** Renders a unified, client-presentation-ready brief including:
  1. *Title block:* Custom white-labeling (studio and client names), creation date, and stable variant ID.
  2. *Strategy summary:* Positive strategic rationales mapped directly to the inputs.
  3. *Negative constraints:* Explanations of what design paths were ruled out by the strategic choices.
  4. *Interactive type specimen:* Selected from an eight-way typography pairings taxonomy, loaded from Google Fonts, with editable display/body text fields.
  5. *Accessibility grid:* Swatches (Dominant, Primary, Secondary, Ink) and WCAG AAA/AA contrast ratio verification.
  6. *Technical specifications:* Code exports for CSS custom properties, Tailwind v4 `@theme` directives, and canonical JSON token payloads.
- **Shareable state.** State is entirely encoded in URL query parameters (`?cat=&q2=&q3=&q4=&q5=&q6=&q7=&v=&lock=&studio=&client=`). Bookmarking or sharing the URL reloads the exact same compiled state deterministically.
- **Museum Editorial styling.** Styled with flat, minimal, typography-centric aesthetics using Combo 06 (Lime/Charcoal/Bone). Prints/Save-as-PDFs beautifully onto a standard A4 portrait layout.

## File structure

```
Designare/
  index.html        Structural body and markup
  css/style.css     Tokens, custom input styling, and media print layout
  js/engine.js      Tradeoff compiler, answers seed, and contrast/token math (no DOM)
  js/mood.js        Mood-keyword lexicon mapping
  js/main.js        UI state management, listeners, and URL encoding/decoding
  tools/            regression.mjs (fuzzing, determinism, and contrast checks)
```

## Quick start

Open `index.html` in any web browser, or serve the directory statically using any local server.

## Verifying changes

Run `node tools/regression.mjs` to execute the full verification suite:
1. *Determinism check:* Asserts the same answer set compiled 1,000 times produces byte-identical palettes.
2. *Contrast coverage sweep:* Verifies all 3,200 potential brief/variant combinations clear WCAG contrast floors.
3. *Sensitivity check:* Verifies flipping any strategy tradeoff changes the generated output.
4. *Anti-pattern greps:* Enforces token schema naming contracts and styling invariants.
