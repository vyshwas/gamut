# Layout Blueprint - Museum Editorial

Status: **all built** (3.1 to 3.10), 2026-07-25. Decisions confirmed with the user before the build: hero headline over the color field, Engine at true viewport bleed, Type as a horizontal rail, footer as an inverted ink block.

Three changes from the spec below, all forced by measurement or by a rule this document could not see:

1. **No hex readouts printed on color, anywhere.** The hero and the Fixer strips both originally labelled bands in place. Measured across 600 generated palettes, 171 of 1200 band/label pairs landed between 4.07 and 4.5 contrast, failing AA at that text size. Every readout now sits in a caption row beneath its bands, with cells carrying the same flex values so each label still belongs to its block. This is also the truer reading of the North Star: a gallery label sits under the work, not across it.

2. **Only color bleeds; text never does.** In the Engine, the output column runs to the right viewport edge as specified, but every text-bearing block inside it keeps a right inset. Copy against the screen edge is a layout bug, not a bold choice.

3. **Full-bleed modules pad from the viewport, contained sections from the container.** The hero rail, Fixer captions, and Method band all inset by `var(--pad)` from the screen edge rather than aligning to the 1400px text column. Two tiers, applied consistently, rather than a compromise that reads as neither.

Also worth recording: the Type rail shows **2 cards**, not the 6 implied by the mockup. Each mood prescribes exactly two pairings in `TYPE_PAIRS`, and inventing more would mean showing type that does not match the palette. Two is a comparison, which still beats the old Next-button toggle.

Companion to DESIGN.md (which owns color, type, and material). This file owns **composition only**: what sits where, at what width, at what density.

Reference: instrument.com, for compositional grammar only, not content.

---

## 0. Dials

| Dial | Value | Why |
|---|---|---|
| DESIGN_VARIANCE | 8 | Asymmetric grids, full-bleed breakouts, deliberate empty zones. Your reference is asymmetric; the current build is not. |
| MOTION_INTENSITY | 3 | Hover/active states plus the one hero entrance already built. Your guardrail is composition over decoration, so motion stays a floor, not a feature. |
| VISUAL_DENSITY | 3 | Gallery-airy overall, with two deliberately dense sections for contrast. |

Change any of these and the section specs below shift with them.

---

## 1. What is wrong with the current layout

Not opinion, mechanical facts about the built page:

1. **One layout family, nine times.** Every section is `section-head` (46rem, left-aligned h2 + paragraph) followed by content. Nine sections, one rhythm. A page this long needs at least four distinct families.
2. **Nothing ever breaks the container.** Everything is trapped inside `max-width: 1400px`. There is no full-bleed moment anywhere, so there is no scale contrast. instrument.com's entire pacing device is bleed-vs-contained alternation.
3. **Uniform vertical rhythm.** Every section is `padding: 6.5rem var(--pad)`. Identical spacing means no passage feels dense and none feels quiet, so nothing feels deliberate.
4. **The `section-tint` background swap is the only variation device**, and a background swap is not a composition.
5. **Pricing is three equal cards**, the single most templated block on the web.
6. **The product's output is rendered small.** The generated palette, the actual thing worth looking at, is a card in the corner of the hero and a row of chips mid-page. The tool's art is never shown at scale.

Point 6 is the important one and it drives everything below.

---

## 2. The core idea

> instrument.com's full-bleed **photography** moments become Gamut's full-bleed **color** moments.

An agency site earns its scale contrast with big imagery. Gamut has no photography and should not fake any. What it has is a generator that produces genuinely beautiful, genuinely unique color every time it runs. That is the imagery. Show it edge to edge.

This is also the only way the page can be "colorful" without violating DESIGN.md: the chrome stays a blank museum wall, and the product's own output is hung on it at full scale.

---

## 3. Section specs

Notation: `[bleed]` = 100vw edge to edge. `[wide]` = 1400px container. `[narrow]` = 46rem measure. `D:n` = density value.

### 3.1 Hero - full-bleed color field `[bleed]` `D:2`

The whole first viewport is a live generated palette laid out in its own 60-30-10 proportions. The headline sits inside the Dominant band, so the first thing a visitor sees is the rule the product teaches, demonstrated at full size rather than described.

```
+--------------------------------------------------------------+
| GAMUT.            Assistant  Engine  Fixer  Type  ...   [ o ] |
+--------------------------------------------------------------+
|                                       |            |     |    |
|                                       |            |     |    |
|  Pick palettes                        |            |     |    |
|  like a strategist.                   |   BRAND    | ACC |INK |
|                                       |    30      | 10  |    |
|  Generate, fix, and pair brand        |            |     |    |
|  color systems on the 60-30-10 rule.  |            |     |    |
|                                       |            |     |    |
|  [ Generate a palette ]  [ Fix one ]  |            |     |    |
|                                       |            |     |    |
|  DOMINANT 60 . #F1F3F4    seed 4471   |  #0B3F60   |#C52B|#151|
+--------------------------------------------------------------+
 \____________ 60% ____________________/\____30%___/\_10_/\_ink/
```

- Text color is computed from the palette's own Ink via the existing `textOn()` helper, so contrast holds on every regenerate. This is real, not aspirational: the contrast math already ships.
- Band widths animate on regenerate (`flex-basis` transition already exists on `.band-seg`).
- Regenerate control sits bottom-right of the Dominant band.
- Mobile: bands rotate to horizontal stacked strips under the headline; headline gets its own solid Dominant block.

**Open question for you:** headline over the color, or headline in a quiet strip above a shorter full-bleed band? Over the color is bolder and proves more; a strip is safer on wild palettes.

---

### 3.2 Studio Assistant - narrow prompt column `[narrow]` `D:3`

Deliberately the quietest thing on the page, arriving right after the loudest. One narrow column, a large editorial textarea, provider settings folded behind a disclosure so the default state is a single input and one button.

```
+--------------------------------------------------------------+
|                                                              |
|   Studio Assistant                                           |
|   Describe a mood or a brief in plain language.              |
|                                                              |
|   +------------------------------------------+               |
|   |  a calm, trustworthy wellness brand      |               |
|   |  with a modern edge                      |               |
|   +------------------------------------------+               |
|   [ Interpret ]        Interpreter settings v                |
|                                                              |
+--------------------------------------------------------------+
```

Change from today: the three provider fields currently sit exposed in a row and make this section look like a settings panel. Folding them is the whole point of the section reading as a prompt.

---

### 3.3 The Engine - asymmetric rail, output bleeds right `[wide -> bleed]` `D:6`

The densest section on the page. Controls compress into a narrow sticky rail; the output column runs past the container to the right viewport edge, so the workbench feels wider than the page.

```
+--------------------------------------------------------------+
|                                                              |
|  The Engine                                                  |
|  Four colors, four jobs.                                     |
|                                                              |
|  +--------+ +---------------------------------------------->>|
|  |Category| |  DOMINANT    BRAND      ACCENT      INK        |
|  |[SaaS v]| |  #F1F3F4     #0B3F60    #C52B26     #151E23    |
|  |        | |  [ chip ]    [ chip ]   [ chip ]    [ chip ]   |
|  |Lock    | |                                                |
|  |[#___ ] | |  60-30-10 proportion band                      |
|  |        | |  [=====================][========][==]         |
|  |Break   | |                                                |
|  |[ o=  ] | |  Light deployment      Dark deployment         |
|  |        | |  +--------------+      +--------------+        |
|  |[Gener- | |  |  mock        |      |  mock        |        |
|  | ate  ] | |  +--------------+      +--------------+        |
|  |        | |                                                |
|  |signal  | |  Ink/Dom 8.4:1   Brand/Dom 4.9:1   ...         |
|  +--------+ +---------------------------------------------->>|
|   240px            bleeds to viewport edge                   |
+--------------------------------------------------------------+
```

- Rail narrows 300px to 240px and stays sticky (already sticky today).
- Swatch chips get materially larger; they are the product.
- Exports, agency panel, history collapse into a single tighter sub-grid at the bottom rather than four stacked full-width strips.
- Mobile: rail unsticks and stacks above output, as today.

---

### 3.4 The Fixer - full-bleed before/after `[bleed]` `D:4`

The repair is the drama, so show it at full width. Two 100vw bands stacked vertically, before directly above after, so the eye compares by dropping down one row rather than scanning sideways.

```
+--------------------------------------------------------------+
|  BEFORE                                                      |
| [####][####][####][####]  <- pasted palette, edge to edge     |
+--------------------------------------------------------------+
|  AFTER, with jobs assigned                                    |
| [==================][=========][===][##]  <- rebuilt, 60-30-10|
+--------------------------------------------------------------+
|                                                              |
|   Law 02   Two colors fighting at full power       [narrow]   |
|   Law 05   Three loud colors                                  |
|            ...                                                |
|   [ Load into the Engine ]                                    |
+--------------------------------------------------------------+
```

The width change between the two bands is itself the argument: before is four equal blocks, after is proportioned. Currently both are small side-by-side strips and the proportion story is invisible.

---

### 3.5 Type - horizontal specimen rail `[bleed]` `D:2`

Replaces the static specimen-plus-sidebar with a horizontal scroll-snap rail. Each pairing is a full specimen card at roughly 80vw, set in the live palette. This is the only horizontal-motion section on the page.

```
+--------------------------------------------------------------+
|  Type that matches the palette                               |
|                                                              |
| +--------------------------------+ +-------------------------|
| |                                | |                         |
| |  Every color needs             | |  Every color needs      |
| |  a job.                        | |  a job.                 |
| |                                | |                         |
| |  The brands that pop do not    | |  The brands that pop    |
| |  use better colors...          | |  use better colors...   |
| |                                | |                         |
| |  Anton + Work Sans             | |  Playfair + Source Sans |
| +--------------------------------+ +-------------------------|
|   <- drag or scroll ->                                        |
+--------------------------------------------------------------+
```

Scroll-snap, user-driven. Not an auto-playing marquee.

---

### 3.6 The Design System - two-column spec index `[wide]` `D:7`

The densest block on the page and the only one that should feel like a spec sheet, because it is one. Token category on the left, live rendered values on the right, hairline rows, mono throughout.

```
+--------------------------------------------------------------+
|  The Design System                                           |
|                                                              |
|  Spacing      | ▁▂▃▄▅▆▇█  0 3xs 2xs xs sm md lg xl 2xl ...  |
|  ------------ | ------------------------------------------- |
|  Radius       | [ ] [ ] [ ]  [ ]  ( )   none sm md lg full   |
|  ------------ | ------------------------------------------- |
|  Elevation    | [1] [2] [3] [4]                              |
|  ------------ | ------------------------------------------- |
|  Brand states | default  hover  active  disabled  focus      |
|  ------------ | ------------------------------------------- |
|  Accent states| default  hover  active  disabled  focus      |
|                                                              |
|  [ Export design system tokens (JSON) ]                      |
+--------------------------------------------------------------+
```

---

### 3.7 The Method - full-bleed band opener, then numbered index `[bleed -> narrow]` `D:5`

The 60-30-10 demonstration band goes full-bleed as a section opener; the ten laws become a real index with a number column.

Section numbering is normally a tell, but here the laws are numbered in the source methodology itself, so the sequence carries actual information. This is the one legitimate use of numbers on the page.

```
+--------------------------------------------------------------+
| [========== 60 ==========][===== 30 =====][= 10 =]           |
+--------------------------------------------------------------+
|                                                              |
|  The method under the hood                        [narrow]    |
|                                                              |
|  01  Pick a dark anchor before you pick a bright        v     |
|  02  Saturate the brand color, mute the accent          v     |
|  03  Test at 5% of the screen, not 50%                  v     |
|  ...                                                          |
|  10  Check the culture map before crossing borders      v     |
+--------------------------------------------------------------+
```

---

### 3.8 Pricing - asymmetric tiers, no equal cards `[wide]` `D:4`

Three equal cards is the most templated block in existence. Instead: the recommended tier is materially larger and the other two compress beside it, so the composition itself makes the recommendation rather than a "Most popular" badge.

```
+--------------------------------------------------------------+
|  Pricing                                                     |
|                                                              |
|  +--------------------------+  +----------+  +----------+    |
|  |  STUDIO                  |  | Free     |  |Commercial|    |
|  |  $12 /month              |  | $0       |  | $49 /mo  |    |
|  |                          |  |          |  |          |    |
|  |  Everything in Free      |  | Unlimited|  | Everythg |    |
|  |  Unlimited Fixer         |  | generate |  | in Studio|    |
|  |  Image extraction        |  | 3 fixes  |  | Resale   |    |
|  |  Color-blind preview     |  | CSS vars |  | licence  |    |
|  |  Saved library           |  |          |  | Team     |    |
|  |  All exports             |  |          |  |          |    |
|  |  Print sheets            |  |          |  |          |    |
|  |  White-label             |  |          |  |          |    |
|  |  [ Start Studio ]        |  |[ Start ] |  |[ Talk ]  |    |
|  +--------------------------+  +----------+  +----------+    |
|         ~1.6fr                     0.7fr        0.7fr        |
+--------------------------------------------------------------+
```

No card fills, hairline borders only, radius 0, per DESIGN.md.

---

### 3.9 FAQ - narrow editorial column `[narrow]` `D:3`

Structurally fine today. Only change: tighten the measure and let it breathe more, since it is the last quiet beat before the close.

---

### 3.10 Footer - full-bleed close `[bleed]` `D:2`

Currently the page just stops. It needs a real anchor.

**Open decision:** full-bleed **ink** block (inverted) is the strongest close, but strict theme-lock says a page keeps one theme throughout. A dark footer on a light page is a widely accepted exception. Your call:
- **(a)** inverted ink footer, strongest close, mild theme-lock violation
- **(b)** same-theme footer with a heavy top rule and large wordmark, fully compliant, less punch

---

## 4. Layout-family ledger

Proving no family repeats:

| # | Family | Used by |
|---|---|---|
| 1 | Full-bleed color field | Hero |
| 2 | Narrow prompt column | Assistant |
| 3 | Asymmetric sticky rail + right bleed | Engine |
| 4 | Full-bleed stacked comparison | Fixer |
| 5 | Horizontal scroll-snap rail | Type |
| 6 | Two-column spec index | System |
| 7 | Numbered index rows | Method |
| 8 | Asymmetric weighted tiers | Pricing |
| 9 | Narrow accordion column | FAQ |

Nine sections, nine families. No zigzag repetition, no three-equal-card block.

---

## 5. Pacing

Width: `bleed → narrow → wide/bleed → bleed → bleed → wide → bleed/narrow → wide → narrow → bleed`

Density: `2 → 3 → 6 → 4 → 2 → 7 → 5 → 4 → 3 → 2`

No two adjacent sections share a width treatment or a density value. Every dense passage is paid for by a quiet one.

---

## 6. Not changing

- Every route, anchor id, nav label, form field name and id. Layout only.
- All engine behavior, exports, print sheet, vision simulation, keyboard shortcuts.
- All copy, except the Assistant settings disclosure label.
- DESIGN.md's color, type, radius, motion, and material rules. This blueprint changes composition inside that system, nothing about the system itself.

---

## 7. Decisions I need from you

1. **Hero:** headline over the live color field, or in a quiet strip above it?
2. **Footer:** inverted ink block (a) or same-theme heavy close (b)?
3. **Engine right-bleed:** genuinely to the viewport edge, or stop at the container and just widen the output column?
4. **Type rail:** horizontal scroll-snap, or keep the current static specimen and just enlarge it?
5. **Scope:** build all nine, or start with hero plus one more and judge before committing?

---

## 8. Suggested build order

1. Hero, full-bleed color field. Highest impact, and it settles whether the whole "product output as imagery" thesis works.
2. Pricing and Type. Removes the two most templated blocks.
3. Engine and Fixer. Most structural work.
4. System, Method, Assistant, FAQ, Footer. Rhythm cleanup.

Stop after any step and reassess.
