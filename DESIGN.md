---
name: Gamut
description: A precision brand palette, fixer, and type-pairing tool for designers.
colors:
  ink: "#EDEDEF"
  canvas: "#0B0B0D"
  surface: "#141417"
  surface-2: "#1B1B1F"
  muted: "#8B8B93"
  line: "rgba(237, 237, 239, 0.16)"
  primary: "#D4FF00"
  primary-ink: "#101014"
  secondary: "#FF3D6E"
  danger: "#FF5C5C"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.05em"
    lineHeight: 1.0
  body:
    fontFamily: "Inter, sans-serif"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "JetBrains Mono, monospace"
rounded:
  pill: "999px"
  sm: "8px"
  md: "14px"
  lg: "24px"
spacing:
  section: "6.5rem"
  pad: "clamp(1.5rem, 5vw, 5rem)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.pill}"
    padding: "1rem 2rem"
    border: "1px solid {colors.primary-ink}"
    boxShadow: "0 8px 28px -10px rgba(212,255,0,0.08)"
  button-ghost:
    backgroundColor: "rgba(20,20,23,0.6)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "1rem 2rem"
    border: "1px solid {colors.line}"
    backdropFilter: "blur(20px)"
---

# Design System: Gamut

## Overview

**Creative North Star: "Structured Depth"**

Gamut's chrome is dark-first, spatial, and precise - glass panels, a soft tinted glow instead of a hard offset shadow, a real radius scale instead of one flat value. As of 2026-08-16 this replaces "Tactile Brutalism" (warm paper, hard ink shadows, hand-drawn marginalia), which itself replaced the original flat neo-brutalism. Both prior passes answered "this looks mechanical" by making the chrome look hand-made; this pass answers the same complaint by making it look considered instead - the 2026 "structured depth / liquid glass" movement that defines premium developer tools (Linear, Raycast, Arc): dark mode as the default rather than an afterthought, real translucency and layered depth instead of flat minimalism, precision instead of ornament. This was a deliberate, explicit direction choice, not a default - the tactile-paper direction was built, reviewed, and set aside in favor of this one.

**Key Characteristics:**
- Dark-first: near-black cool canvas (#0B0B0D) is the default deployment; light is a frosted-white override, not the other way around.
- Real depth: glass panels (translucent surface + backdrop blur + a 1px inner highlight) and a soft blurred glow replace the flat drop shadow entirely - depth comes from light and blur, never from an offset silhouette.
- A real radius scale, not one flat value: pill for buttons/chips/tags, a small step for nested blocks inside a card (form fields, swatch chips), a medium step for cards, a large step reserved for hero/closing containers.
- Two loud colors: Primary (locked Signal Lime) and Secondary (electric pink-red) can both run fully saturated - unchanged across every pass this product has had (Law 2).
- No gradients (especially no purple gradients) as a decorative background - the only "gradient-like" elements are radial glow washes derived from the product's own locked accents, never a generic hero mesh.
- No hand-drawn marginalia - this system's personality is expressed as precision (a glow, a status dot, a clean glass pill), not imperfection. See Personality Layer.

## Colors

### Accent Roles
- **Primary**: The main brand color (Signal Lime, #D4FF00). Used for primary buttons and major highlights.
- **Secondary**: The supporting loud color (electric pink-red, #FF3D6E). Used for secondary CTAs, glow accents, and counter-balance highlights.

### Neutral
- **Ink** (#EDEDEF): Cool off-white for primary text - not a true #FFFFFF.
- **Canvas** (#0B0B0D): The page background - cool near-black, the default deployment.
- **Surface** (#141417): Raised panels and cards (solid fallback under glass).
- **Surface 2** (#1B1B1F): Inputs, inset panels.
- **Line** (`rgba(237,237,239,0.10-0.16)`): Thin translucent edges - never a solid hairline. Glass reads as glass because its border is part of the same light, not a separate ink stroke.

### Light deployment
Same laws, same radius/glass system, inverted material (Law 4: designed
alongside dark, not an afterthought). Primary and Secondary stay
locked/theme-independent; the glass tint flips from a dark tint to a
frosted-white one, not just the neutrals:
- **Canvas** #F4F4F6, **Surface** #FFFFFF, **Surface 2** #E7E7EC.
- **Ink** #101014, **Muted** #6B6B76 (4.8:1 on canvas).
- **Line** `rgba(16,16,20,0.08-0.14)` (edges flip to dark-tinted
  translucency so they still read as an edge against a light page).
- **Danger** #C42D17 (5.1:1 on canvas; dark deployment uses #FF5C5C,
  6.5:1 on stock).
- **Lime-ink** #4D6200 (6.2:1 on canvas): the locked lime darkened in
  OKLCH (same hue 121.2deg, L 0.94 -> 0.46) so it can still carry a
  stroke or a word on a light surface - lime-on-near-black needs no
  such treatment (16.9:1 as-is).

The site's own theme toggle drives this: the hero's live preview
repaints from the palette's own light/dark deployment when the site
itself changes theme (js/main.js, `paintThemedPreview`).

## Typography

**Display Font:** Space Grotesk (sans-serif fallback)
**Body Font:** Inter (sans-serif fallback)
**Label/Mono Font:** JetBrains Mono

**Character:** A highly geometric, slightly chaotic display grotesk at massive scale, paired with an ultra-utilitarian body face. No hand-drawn or script face in this system - precision is the character, not a hand-marked accent.

## Layout & Elevation

- Depth comes from glass, not a shadow silhouette: a translucent surface (`--glass-bg`) plus `backdrop-filter: blur(20px)`, a 1px translucent border, and a soft ambient `--shadow-soft` (`0 20px 60px -20px rgba(0,0,0,0.6)` on dark; a lighter-weight equivalent on the light deployment).
- Radius follows the scale, never an arbitrary value: `--r-pill` for buttons/chips/tags, `--r-sm` for nested blocks inside a card (form fields, swatch chips), `--r-md` for cards (price cards, method bands, diagnosis items), `--r-lg` reserved for hero/closing containers. Full-bleed elements that touch the viewport edge (the hero color field, the sticky nav, the footer) stay unrounded - rounding a corner nothing can see is noise, not craft.
- `.swatch-chip` is the one deliberate exception to the glass treatment: it exists to show one exact generated color, so it stays flat and opaque (small radius only, no blur, no translucency) - blurring the product's actual output would misrepresent the thing it exists to display.
- Hover states lift and glow (`translateY(-1px)` plus a soft tinted glow shadow) rather than translating into a hard shadow - the affordance is "this surface is closer to you," not "this is a printed block being pressed down."

## Personality Layer

Prior passes answered "this looks mechanical" by making the chrome
look hand-made (paper grain, a highlighter marker, tape, rotated
stickers). This system's material is glass and light, so its
personality is expressed as precision instead: a status glow, a
clean ring instead of a stamp, a glass pill instead of a sticker.
Nothing here changes layout or removes a state the chrome layer set
up - it only marks real facts on top of it.

- **Grain** (`.grain`): a fixed, low-opacity SVG noise field over the
  whole page - a film-grain layer over glass, not a paper texture.
  Screen-blended on the dark default, multiply-blended on the light
  override. Static, so `prefers-reduced-motion` has nothing to gate.
- **Hero kicker** (`.hero-kicker`): a small "Live palette engine"
  status line above the headline, in the palette's own guaranteed-
  safe ink color (never the site's lime, which can't guarantee
  contrast against an arbitrary generated Dominant) with a plain
  status dot - a real fact (the engine is live), stated precisely
  instead of hand-annotated.
- **Studio badge** (`.studio-tag`): the feature-gate label as a small
  glass/glow pill instead of a rotated sticker - un-rotated, the glow
  deepens on hover instead of the badge lifting off the page.
- **Clean-palette ring** (`.diag-item.clean .diag-law`): the Fixer's
  "no law broken" verdict gets a soft glow ring in Secondary instead
  of an ink stamp - the one moment of ceremony in the product,
  expressed as precision instead of a hand mark.
- **Harmony badge** (`.swatch-harmony`): the Secondary swatch's
  color-wheel relationship (Complementary / Analogous / Triadic /
  Split-complementary), shown as a clean glass pill in the same
  Secondary as the clean-ring - one visual language for every
  marginalia moment.
- **Featured-tier glow edge** (`.price-card-featured`): the
  recommended pricing card gets a soft lime glow along its top edge
  instead of a tape strip or a "Most popular" pill badge - the
  composition already carries the recommendation (bigger card, first
  in the DOM); this only adds the same precision-glow language the
  rest of the page uses to mark a real fact.

## Do's and Don'ts

### Do:
- **Do** build depth from glass (translucency + blur + a 1px inner highlight) and a soft tinted glow - never a flat offset drop shadow.
- **Do** allow the Primary and Secondary colors to both be loud and saturated.
- **Do** use the radius scale (`--r-pill`/`--r-sm`/`--r-md`/`--r-lg`) for every rounded corner - never an arbitrary value, never a flat 0.
- **Do** keep `.swatch-chip` and any other literal-color demonstration (the method-band's 60-30-10 bands) flat and opaque - no blur or translucency on anything whose job is showing an exact generated color.
- **Do** let the Personality Layer mark real facts (a real shortcut, a real verdict, a real color relationship, a real recommendation) - never invented copy or fake data.
- **Do** derive any glow/wash color from the product's own locked accents (lime, secondary) - never a generic purple/blue "AI gradient."

### Don't:
- **Don't** use a flat, unblurred, hard-offset drop shadow - that was the prior system's signature and this one replaces it.
- **Don't** use gradients as decorative backgrounds (no purple gradients, no generic hero mesh) - the only gradients allowed are the hero's ambient glow washes, derived from the locked accents.
- **Don't** round a corner that touches the viewport edge (the hero color field, the sticky nav, the footer) - full-bleed elements stay square; rounding there is noise, not craft.
- **Don't** use hand-drawn marks, a script/marker font, or rotation as a personality device - that vocabulary belonged to the prior "Tactile Brutalism" pass and reads as inconsistent bolted onto a glass system.
- **Don't** blur or translucent-tint a literal color output (`.swatch-chip`, the method-band demonstration bands) - see Layout & Elevation.
