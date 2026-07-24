# Design System Generator — Spec & Build Log

**Date:** 2026-07-19
**Status:** Built and verified. Extends Gamut from "palette + type pairing" into a fuller design-system generator, per [Design OS's change-impact-engine-sequencing.md](../DesignOS/change-impact-engine-sequencing.md), which names Gamut's structured token export as the seed data for that engine's usage graph.

## Why

Gamut already generated structured, law-checked color tokens (CSS vars / Tailwind / SCSS / JSON). It didn't generate the rest of a design system — spacing, radius, elevation, component states — so a designer using it still had to invent those by hand, disconnected from the palette's own archetype signal. This closes that gap using the same programmatic, contrast-safe math the Engine already has (`ensureContrastVivid`, `shadeScale`), rather than a second, unrelated system bolted on.

It also gives Design OS's planned Change Impact Engine a real seed: a ratified Gamut export now carries color + spacing + radius + elevation + component states in one versioned JSON payload, so token node identities exist before any codebase scan runs. This is a data handoff only — Gamut and Design OS stay separate products, separate codebases, no merge (consistent with every prior decision in that project to keep independently-useful tools independent).

## What was added

### 1. Spacing scale (`spacingScale(recipeKey)`)
A 14-step, 4px-baseline scale (`0` through `7xl`) — the near-universal default across mature design systems — scaled by a per-archetype **density** multiplier (compact 3.5 / regular 4 / spacious 4.5). Density isn't arbitrary: it's assigned per archetype the same way typography buckets already are (`SYSTEM_PROFILE` in `js/engine.js`), so a fintech dashboard reads tighter than a wellness site without inventing a second grid logic per brand.

### 2. Radius scale (`radiusScale(recipeKey)`)
5 steps (`none/sm/md/lg/full`) in one of three personality curves — **sharp** (0/2/4/6), **balanced** (0/4/8/12), **soft** (0/6/12/20) — chosen per archetype's `corner` field. Sharp reads engineered/confident (fintech, aitech, creator); soft reads human/craft (wellness, beauty, hospitality); balanced is the default for SaaS/climate and any custom mood-driven palette without a fixed archetype.

### 3. Elevation scale (`elevationScale(inkHex, domIsDark)`)
4 shadow steps, tinted with the palette's own **Ink** hue rather than pure black — a shadow under a warm-ink brand reads warm, not like a generic product bolted on top. Alpha and vertical offset climb together; blur grows faster than offset so higher elevations read airier, not just darker.

### 4. Component state variants (`stateVariants(hex, dominantHex)`)
For Brand and Accent: `hover`/`active` step toward the canvas's own shadow direction (darker on a light canvas, lighter on a dark one, so "pressed" always means "pushed into the surface" regardless of deployment); `disabled` desaturates and pulls toward the Dominant so it reads inert without vanishing; `focusRing` holds the base hue at fixed alpha so focus never introduces an off-brand color.

### 5. Structured multi-category export (`exportTokensJson`)
One canonical payload (`schema: "gamut.tokens.v1"`) combining color roles + deployments + states + spacing + radius + elevation + the active type pairing, with provenance (`seed`, `category`, `recipeKey`, `generatedAt`). This is the shape an external consumer — Design OS's token-usage graph, a future Figma sync — would ingest. The existing CSS/Tailwind/SCSS exporters were extended in place to emit the same spacing/radius/elevation values as custom properties alongside color, so a designer gets the full system in the format they already use, not a second export to remember.

## Where it lives

- `js/engine.js` — `SYSTEM_PROFILE`, `spacingScale`, `radiusScale`, `elevationScale`, `stateVariants`, `systemTokens` (shared derivation used by all exporters), `exportTokensJson`. Extended `exportCss`/`exportTailwind`/`exportScss`.
- `index.html` — new `#system` section ("The Design System") between Type and Method, with a nav link.
- `js/main.js` — `renderSystem(palette)`, called from `renderPalette` alongside the existing render calls; `EXPORTERS.tokens`.
- `css/style.css` — `.system-lab` and children.

## What was NOT built (explicit scope cuts)

- **No new archetypes or laws.** Spacing/radius/elevation ride on the ten existing archetypes' existing fields; no new business-category concept was introduced.
- **No component library.** Tokens only (spacing/radius/elevation/states) — not actual button/card/input component markup or CSS. That's a much larger, separate scope decision, not implied by "design system generator."
- **No Figma sync.** The structured export is a static JSON download; pushing it into Figma variables is a real future integration but wasn't part of this pass.

## Verification

- Node: 10 archetypes × 20 seeds — correct shape (14 spacing steps, 5 radius steps, 5 elevation steps incl. `0`), deterministic output for a fixed seed, valid `exportTokensJson` JSON for every combination.
- Node: 10 archetypes × 15 seeds, **1,500 chip/label pairs** checked for ≥3:1 text contrast against every rendered background (radius chips, elevation cards, all 8 brand/accent state chips) — 0 failures. Caught and fixed one real issue before this: state-chip and radius-chip labels were hardcoded to `var(--muted)` grey regardless of background, which read illegibly on darker fills (e.g. `brand / hover` on a navy fintech palette) — fixed by computing label color per-chip via the same `textOn()` contrast helper the rest of the UI already uses.
- Headless Chrome (real browser, not just Node): loaded the live page, confirmed correct DOM shape, confirmed the panel re-renders reactively on category change (fintech → sharp/compact profile applied live), confirmed `exportTokensJson` output matches the on-screen palette, zero console/page errors, visual screenshot review.
