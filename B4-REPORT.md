# B4 Report: UX Refinement Pass Implementation

This report details the intended changes for the Part B UX Refinement pass (B1–B3) as required by the launch plan.

## B1 — Clear next step (workflow stepper + CTA hierarchy)
**Goal:** Add a compact progress indicator to the Fixer flow and promote the "Adopt" action.
- **`index.html`**:
  - *New UI Element*: Add a workflow stepper (`Import → Review → Build Design System → Export`) above the `#fixer-results` div.
  - *Component Modified*: Change the "Load into the Engine" button (`#fix-adopt`) to `.btn-primary` and rename to **"Build the design system →"**.
  - *New UI Element*: Add a "Export" affordance to the `#system` section when the palette is sourced from the Fixer.
- **`js/main.js`**:
  - *Logic Modified*: Update the stepper state during `runFixer` ("Review"), `adoptFixed` ("Build Design System"), and scroll events tracking `#system` ("Export").
  - *Logic Modified*: `adoptFixed` will now trigger a smooth scroll to `#system`.

## B2 — Hero positioning (design-system platform)
**Goal:** Position the hero to reflect the current truthful inputs (brief, category, pasted hexes, image).
- **`index.html`**:
  - *Copy Change*: H1 changed to **"Generate production-ready design systems."**
  - *Copy Change*: Subheadline changed to describe truthful inputs: "From a written brief, category, pasted hexes, or an image → complete system out: color, typography, spacing, radius, elevation, states, tokens — exported for CSS/Tailwind/SCSS, Figma-ready via the AI import package."
  - *Component Modified*: Hero CTAs changed to primary "Generate a system" (anchored to `#engine`) and ghost "Fix an existing palette" (anchored to `#fixer`).
  - *Copy Change*: `<title>` and `<meta name="description">` updated to match.

## B3 — Fixer trust (transparency about optimization)
**Goal:** Provide transparency into how the Fixer modifies the user's palette.
- **`index.html`**:
  - *Copy Change*: Results heading changed to **"Your palette, optimized — brand preserved where possible."**
  - *New UI Element*: Add a `div` above the after-strip for dynamic ✓ summary chips.
  - *New UI Element*: Add a `div` for the change-magnitude notice (mean hue/sat/lightness delta threshold warning).
  - *New UI Element*: Add a strategy selector (three radio options: Preserve brand personality / Balanced / Maximize system quality) above the Fixer input.
  - *Component Modified*: Reorder the results layout to: 1) Summary + Chips + After-strip, 2) Primary CTA ("Build the design system →"), 3) Mappings and Law explanations.
- **`js/main.js`**:
  - *Logic Modified*: `runFixer` updated to compute the ✓ summary chips (contrast raised, roles reduced, sat adjustments), compute the magnitude delta via `Engine.hexToHsl`, and read the strategy selector.
- **`js/engine.js`**:
  - *Logic Modified*: Update `fixPalette` to accept a strategy options object that scales existing adjustment thresholds (minimal movement for "Preserve", full normalization for "Maximize"). No new laws are added, and contrast floors remain strict.
