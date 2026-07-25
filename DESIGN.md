---
name: Gamut
description: A brand palette, fixer, and type-pairing tool for designers and agencies.
colors:
  ink: "#1A1A1A"
  canvas: "#F9F8F6"
  surface: "#FDFDFB"
  surface-2: "#EFEEE9"
  muted: "#605E58"
  line: "#E3E1DA"
  accent: "#D4FF00"
  accent-ink: "#4D6200"
  danger: "#BE3A1C"
typography:
  display:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.03em"
    lineHeight: 1.05
  body:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono, monospace"
rounded:
  all: "0px"
spacing:
  section: "6.5rem"
  pad: "clamp(1.25rem, 5vw, 5rem)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.all}"
    padding: "0.85rem 1.6rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.all}"
    padding: "0.85rem 1.6rem"
---

# Design System: Gamut

## Overview

**Creative North Star: "Museum Editorial"**

Gamut's chrome is a gallery wall: near-white or near-black, flat, silent, built almost entirely from type scale and a single hairline rule. The one thing allowed to be loud is the product's own output — the generated swatches, deployment mocks, and system tokens are the art on the wall, and the wall itself does not compete with it. Composition (scale, alignment, whitespace) carries the premium feeling; ornament does not.

This replaces the site's earlier "print-lab" identity (paper grain, halftone dots, registration crop marks, a blurred generative color-mesh glow, gradient wordmark text, paper-peel chip animation, an overshoot "registration-snap" easing). That system was coherent but read as decorative rather than composed — it leaned on texture, blur, and bounce for interest instead of scale and restraint. It is now anti-reference, not deleted history: the print vocabulary stays in Method-section copy and the CMYK/print-sheet features (those are real product content), but it no longer drives the site's motion or atmosphere.

Reference for feel (not content): instrument.com — bold, confident, restrained-color editorial composition. Intent: a visitor should read this as work from people who could plausibly have built Stripe or Linear.

**Key Characteristics:**
- One accent color (the locked brand lime) used for exactly one meaning: primary action. Everywhere else is ink-on-canvas or canvas-on-ink.
- No gradients, no shadows, no blur, no texture anywhere in the site's own chrome. Color only appears where it is the product's actual output.
- Type carries hierarchy. Scale and weight do the work an eyebrow, icon, or card would otherwise do.
- Flat, sharp-cornered, hairline-divided. One authored motion grammar (a quiet fade + rise), used once per element class, never scattered.

## Colors

Two neutrals (near-black ink, near-white canvas) plus exactly one accent. This is the Restrained strategy: color is rare enough that it means something every time it appears.

### Primary
- **Signal Lime** (`#D4FF00`, darkened to `#4D6200` for text/strokes on light canvas): the one accent. Used only for primary-action fills, focus rings, and the skip link — never for section ornament, dividers, or incidental highlights.

### Neutral
- **Ink** (`#1A1A1A`): primary text on canvas; dark-mode background.
- **Canvas** (`#F9F8F6` light / `#141414` dark): the page background, gallery-wall neutral.
- **Surface** (`#FDFDFB` light / `#1B1B1A` dark): raised panels.
- **Surface 2** (`#EFEEE9` light / `#212120` dark): inputs, inset panels.
- **Muted** (`#605E58` light / `#8F8E86` dark): secondary text.
- **Line** (`#E3E1DA` light / `#2C2C2A` dark): the only divider device on the site — 1px hairlines, nothing heavier.
- **Danger** (`#BE3A1C` light / `#FF6B4A` dark): errors only.

### Named Rules
**The One Accent Rule.** Lime appears only on the control that performs the page's primary action, its focus ring, and the skip link. If a second element on screen also wants lime, it doesn't get it — restraint is the point, not a limitation to work around.

**The Product Is the Color Rule.** Every other color on the page — the generated swatches, deployment mocks, print-sheet chips, system-token cards — comes from the Engine's live output, not from the site's own design. The chrome never competes with it.

## Typography

**Display Font:** Bricolage Grotesque (sans-serif fallback)
**Body Font:** Hanken Grotesk (sans-serif fallback)
**Label/Mono Font:** JetBrains Mono

**Character:** A confident, slightly idiosyncratic display grotesk (Bricolage) at editorial scale against a plain, fast-reading body face. The pairing does the "bold typography, intelligent" work alone — no italics, no serif, no decorative treatment.

### Hierarchy
- **Display** (800, `clamp(3.4rem, 7.5vw, 6rem)`, line-height 1.02): the hero thesis line only. One per page.
- **Headline** (800, `clamp(1.9rem, 3.4vw, 2.8rem)`, line-height 1.05): section titles.
- **Title** (800, ~1.15rem): card and pricing titles.
- **Body** (400, 1rem, line-height 1.6, measure ~65–75ch): all copy.
- **Label** (mono, 0.68–0.85rem): data, hex/rgb/cmyk readouts, hints, exports.

### Named Rules
**The Scale-Not-Ornament Rule.** Hierarchy comes from size and weight jumps, never from an eyebrow, icon, eyebrow-plus-rule combo, or color change. A heading is a heading because it's huge, not because it's decorated.

## Layout

1400px max-width content container, `clamp(1.25rem, 5vw, 5rem)` side padding, one hairline (`1px solid var(--line)`) as the only divider device.

**Width alternates.** Sections are either contained to the measure or full-bleed, and never the same as the section before them. Bleed is implemented with a three-track grid (`1fr min(1400px, 100%) 1fr`) so a child can escape the measure without `100vw` and without negative margins — it never fights the scrollbar, and the text left edge stays aligned across every section. `.bleed-full` takes all three tracks; `.bleed-right` takes the container plus the right gutter.

**Density alternates too.** Block padding encodes a density value per section, running 3-6-4-2-7-5-4-3 down the page (hero and footer bookend at 2), so no two adjacent sections share a rhythm and every dense passage is paid for by an airy one. On viewports under 767px the whole page collapses to one rhythm: density pacing is a wide-screen device and reads as inconsistency in a single column.

**No layout family repeats.** Nine sections, nine structures: full-bleed color field, narrow prompt column, asymmetric rail plus right bleed, full-bleed stacked comparison, horizontal scroll-snap rail, two-column spec index, numbered index rows, asymmetric weighted tiers, narrow accordion column. If a tenth section is added it needs a tenth structure, not a reuse.

See LAYOUT-BLUEPRINT.md for the per-section specification and the reasoning behind each choice.

## Elevation & Depth

Flat by default, everywhere the site's own chrome is concerned — no box-shadow, no blur, no glass, on any card, button, nav, or panel. The System section's Elevation cards are the one exception, and they are not decoration: they render the actual shadow tokens the Engine just generated for the current palette, exactly as CSS/Tailwind/SCSS export would. That is real product content, not site atmosphere.

**Generated elevation behaves differently per deployment.** On a light Dominant, the ink-tinted shadow does the work. On a dark Dominant a near-black shadow conveys nothing — there is no lighter ground for it to fall on — so each step also carries a `surface`: the Dominant progressively lifted toward the light. That is how mature systems express dark-mode elevation, and it is why the System panel now shows five distinguishable steps in a dark palette instead of five identical tiles. The lift is exported as `--elevation-N-surface` (CSS) and `elevationSurface` (JSON), added *alongside* the existing keys so consumers of `gamut.tokens.v1` don't break.

Depth is carried instead by **1px hairlines and by width**. Sections alternate between the 1400px measure and full-bleed, and that alternation is the page's only spatial device (see Layout).

### Named Rules
**The Flat-By-Default Rule.** If a shadow appears anywhere outside the System panel's elevation demo, it's a bug, not a design choice.

**The Color-Bleeds-Text-Doesn't Rule.** Where a section breaks the 1400px measure, only color is allowed to reach the viewport edge. Every text-bearing block keeps its inset. Copy against the screen edge is a bug wearing boldness.

**The Two-Gutter Rule.** Contained sections align their copy to the 1400px container. Full-bleed modules (hero rail, Fixer captions, Method band) inset by `--pad` from the viewport edge instead. Both are systematic; do not split the difference.

## Shapes

Radius 0 everywhere — every button, input, card, chip, and panel has square corners. This is deliberate and total: it reads as engineered and confident, and it removes "soft rounded card" as an available decoration, forcing hierarchy back onto type and spacing. The one exception is the toggle track/thumb and a few small UI affordances (theme toggle icon, kbd hint) that need a pill or slight round to read as a switch — everything content-bearing stays square.

## Components

### Buttons
- **Shape:** square (0px radius).
- **Primary:** Signal Lime fill, Ink text, 800-weight display face, `0.85rem 1.6rem` padding. The only filled-color control on the page.
- **Hover / Focus:** primary hover lightens the lime slightly; focus-visible everywhere is a 2px lime (light) / lime (dark) outline, 2px offset.
- **Ghost:** transparent fill, 1px `line-strong` border (meets 3:1 non-text contrast since the border IS the boundary), ink text.
- **Mini:** surface-2 fill, mono label, used for secondary/utility actions (export, save, copy) — never lime.

### Cards / Containers
- **Corner Style:** 0px, no exceptions.
- **Background:** surface or surface-2, never a tint of the accent.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px `line`, the only depth cue on the site.

### Inputs / Fields
- **Style:** surface-2 fill, 1px line border, 0 radius.
- **Focus:** border color shifts to accent-ink/accent; no glow, no shadow.
- **Error:** border shifts to danger, paired with `aria-invalid`.

### Navigation
- Sticky, 1px bottom hairline, blurred backdrop for legibility over scrolled content (functional, not decorative — the page needs it readable while scrolling, it isn't standing in for visual interest). Logo wordmark is now a solid ink/canvas fill (see Do's and Don'ts) — no gradient.

### Hero Color Field (signature component)
The hero is a full-bleed live palette at its own 60-30-10 proportions, with the headline set inside the Dominant 60 band. It is the whole "colorful" argument for the site: every other surface is quiet specifically so this reads loud, and the rule the product teaches is demonstrated at full size rather than described.

Two documented exceptions live here, and nowhere else:

**The Field Exception (to The One Accent Rule).** Controls inside the color field take their fill and stroke from the palette's own Ink, not from the site's lime. Inside the product's output the site accent would compete with the work, and lime cannot guarantee contrast against an arbitrary generated Dominant. Ink can: `generatePalette` contrast-checks Ink against that exact Dominant, measured floor 8.26:1 across 600 generated palettes. Outside the hero, lime remains the single accent.

**No text on the color.** Hex readouts never print on a band. Small mono text over an arbitrary generated hue cannot clear 4.5:1 in every case (measured: 171 of 1200 band/label pairs landed between 4.07 and 4.5). Readouts live in a caption rail beneath the field, with cells matching the band widths, so each label belongs to its band. A gallery label sits under the work, not across it.

## Do's and Don'ts

### Do:
- **Do** keep the accent to exactly one meaning (primary action) — see The One Accent Rule.
- **Do** let the Engine's live output (swatches, deployments, system tokens, print sheet) be the only place saturated color and, where the product itself generates them, shadows appear.
- **Do** use the single quiet fade+rise motion grammar for all entrance/reveal moments; use `ease-out-quart`-style easing (`cubic-bezier(0.25, 1, 0.5, 1)`), never overshoot/bounce.
- **Do** keep every corner square (0px radius) except the toggle switch and comparable small affordances.

### Don't:
- **Don't** add a gradient anywhere in the site's own chrome (text, background, border, or button) — this includes gradient text on headings/wordmarks/metrics.
- **Don't** add a box-shadow to any element outside the System panel's Elevation demo.
- **Don't** reintroduce texture/grain overlays, halftone dot fields, or registration/crop-mark ornaments — the museum wall stays blank.
- **Don't** use bounce, elastic, or overshoot easing anywhere.
- **Don't** add a second accent color to chrome, even a muted one, even for "just this one card."
- **Don't** print a hex, role, or percentage on a generated color using a *fixed* text color, or one picked from two fixed candidates. That cannot be guaranteed to clear 4.5:1 (measured: 171 of 1200 pairs landed between 4.07 and 4.5). Either put the label in a caption row beneath with matching cell widths, or color it with `Engine.readableOn(hex)`, which derives a foreground per swatch and is verified to clear 4.5:1 on all 2400 generated swatches. The visualizer uses the second route; the hero rail and Fixer captions use the first.
- **Don't** give a new section a layout family an existing section already uses (see Layout).
- **Don't** hardcode a light hairline or a lime focus ring inside the footer. That surface inverts per theme, so both must be `currentColor`-derived.

### The one theme exception

The footer inverts (`--bone` ground, `--canvas` text) and is the **only** permitted departure from one-theme-per-page. User-confirmed 2026-07-25 as the page's close. Because `--bone` and `--canvas` already swap per deployment, it is dark on the light site and light on the dark site from a single rule. Verified: every text layer clears AA in both inversions, tightest being the handle at 4.58:1 on the dark site. Do not extend this exception to any other section.
