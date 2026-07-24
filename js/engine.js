/* =========================================================
   DESIGNARE ENGINE
   Color math, palette generation, palette fixing, and
   typography pairing. Every rule here is lifted straight
   from The Brand Color Bible v2: 60-30-10 roles plus Ink,
   the ten laws, and the nine psychology profiles.
   No dependencies.
   ========================================================= */

"use strict";

/* ---------- 1. Color conversions ---------- */

function hexToRgb(hex) {
    const h = hex.replace("#", "").trim();
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16)
    };
}

function rgbToHex({ r, g, b }) {
    const c = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
    return ("#" + c(r) + c(g) + c(b)).toUpperCase();
}

function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function hslToHex(hsl) { return rgbToHex(hslToRgb(hsl)); }
function hexToHsl(hex) { return rgbToHsl(hexToRgb(hex)); }

/* Naive uncoated-stock approximation. Real print work needs a
   calibrated profile; these values are a proofing starting point. */
function rgbToCmyk({ r, g, b }) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const k = 1 - Math.max(rr, gg, bb);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
        c: Math.round(((1 - rr - k) / (1 - k)) * 100),
        m: Math.round(((1 - gg - k) / (1 - k)) * 100),
        y: Math.round(((1 - bb - k) / (1 - k)) * 100),
        k: Math.round(k * 100)
    };
}

/* Print gamut risk. CMYK inks cannot reproduce highly saturated
   mid-lightness RGB color; saturated greens, cyans, violets and
   magentas suffer most. This is a designer's rule-of-thumb
   heuristic, NOT an ICC conversion, and the UI labels it as such.
   The safe alternate keeps hue and lightness, pulls saturation
   to roughly what process inks can hold. */
function gamutRisk(hex) {
    const { h, s, l } = hexToHsl(hex);
    if (l < 18 || l > 88 || s < 60) return { risk: "none", safeHex: hex };
    /* Yellow is a process ink primary; saturated true yellows
       (roughly h 38-62) print faithfully and must not be flagged.
       Past 62 the mix needs cyan and the gamut collapses, which
       is exactly why electric lime looks electric on screen. */
    if (h >= 38 && h <= 62) return { risk: "none", safeHex: hex };
    const fragile = (h > 62 && h <= 200) || (h >= 250 && h <= 330);
    const threshold = fragile ? 72 : 88;
    if (s <= threshold) return { risk: "none", safeHex: hex };
    const safeHex = hslToHex({ h, s: threshold, l });
    return { risk: s > threshold + 12 ? "high" : "moderate", safeHex };
}

/* ---------- 2. WCAG contrast ---------- */

function relativeLuminance({ r, g, b }) {
    const f = v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(hexA, hexB) {
    const la = relativeLuminance(hexToRgb(hexA));
    const lb = relativeLuminance(hexToRgb(hexB));
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

function contrastGrade(ratio) {
    if (ratio >= 7) return "AAA";
    if (ratio >= 4.5) return "AA";
    if (ratio >= 3) return "AA Large";
    return "Fail";
}

/* Nudge a color's lightness until it clears a contrast target
   against a fixed background. Direction is picked automatically. */
function ensureContrast(fgHex, bgHex, target) {
    let fg = hexToHsl(fgHex);
    const bgLum = relativeLuminance(hexToRgb(bgHex));
    const darken = bgLum > 0.35;
    for (let i = 0; i < 40; i++) {
        if (contrastRatio(hslToHex(fg), bgHex) >= target) break;
        fg.l += darken ? -2 : 2;
        fg.l = Math.max(2, Math.min(98, fg.l));
    }
    return hslToHex(fg);
}

/* Like ensureContrast, but re-saturates as it darkens. HSL keeps
   s constant while l drops, which reads as grey: a muted amber
   dragged from l55 to l32 lands olive-sludge. Adding saturation
   on the way down keeps it ochre instead. Only the darkening
   direction needs this; lightening toward pastel is fine. */
function ensureContrastVivid(fgHex, bgHex, target) {
    let fg = hexToHsl(fgHex);
    const bgLum = relativeLuminance(hexToRgb(bgHex));
    const darken = bgLum > 0.35;
    for (let i = 0; i < 40; i++) {
        if (contrastRatio(hslToHex(fg), bgHex) >= target) break;
        fg.l += darken ? -2 : 2;
        fg.l = Math.max(2, Math.min(98, fg.l));
        if (darken) fg.s = Math.min(92, fg.s + 2);
    }
    return hslToHex(fg);
}

/* ---------- 3. Seeded randomness ---------- */

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randIn(rng, min, max) { return min + rng() * (max - min); }

/* ---------- 4. Swatch naming ---------- */

const HUE_NAMES = [
    [8, "Tomato"], [20, "Ember"], [32, "Carrot"], [45, "Amber"],
    [58, "Citron"], [72, "Lime"], [95, "Kiwi"], [140, "Green"],
    [165, "Jade"], [196, "Teal"], [210, "Cyan"], [225, "Ocean"],
    [250, "Indigo"], [275, "Violet"], [300, "Orchid"], [330, "Magenta"],
    [348, "Rose"], [360, "Tomato"]
];

function nameColor(hex) {
    const { h, s, l } = hexToHsl(hex);
    if (s < 10) {
        if (l < 12) return "Ink";
        if (l < 30) return "Charcoal";
        if (l < 55) return "Slate";
        if (l < 80) return "Stone";
        return "Chalk";
    }
    if (s < 22 && l > 82) return h >= 25 && h <= 60 ? "Cream" : "Mist";
    let base = "Tomato";
    for (const [limit, name] of HUE_NAMES) { if (h <= limit) { base = name; break; } }
    if (l < 22) return "Deep " + base;
    if (l > 82) return "Pale " + base;
    return base;
}

/* ---------- 4b. Shade scales ---------- */

/* Ten usable steps of one hue, tint to shade. Saturation follows
   a sine bow: full strength at mid lightness, relaxed at the
   extremes so the light tints read as washes and the deep shades
   stay rich instead of going black-brown. */
function shadeScale(hex, steps = 10) {
    const { h, s } = hexToHsl(hex);
    const out = [];
    for (let i = 0; i < steps; i++) {
        const l = 96 - i * (88 / (steps - 1));
        const sAdj = Math.round(s * (0.55 + 0.45 * Math.sin(Math.PI * l / 100)));
        out.push(hslToHex({ h, s: sAdj, l: Math.round(l) }));
    }
    return out;
}

/* ---------- 4c. Image quantization ---------- */

/* Dominant colors from raw RGBA pixel data (a downsampled canvas).
   Coarse 4-bit bucketing, then a greedy pick of the most populous
   cells that are far enough apart in hue/lightness to be distinct.
   Saturated cells get a nudge so a photo of a red door on grey
   brick returns the door, not five bricks. */
function quantizeColors(data, count = 5) {
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const cur = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
        cur.r += r; cur.g += g; cur.b += b; cur.n++;
        buckets.set(key, cur);
    }
    const cells = [...buckets.values()].map(c => {
        const rgb = { r: c.r / c.n, g: c.g / c.n, b: c.b / c.n };
        const hsl = rgbToHsl(rgb);
        return { rgb, hsl, weight: c.n * (0.5 + hsl.s / 200) };
    }).sort((a, b) => b.weight - a.weight);

    const picked = [];
    for (const c of cells) {
        const distinct = picked.every(p => {
            const dh = Math.min(Math.abs(p.hsl.h - c.hsl.h), 360 - Math.abs(p.hsl.h - c.hsl.h));
            return dh > 24 || Math.abs(p.hsl.l - c.hsl.l) > 22 || Math.abs(p.hsl.s - c.hsl.s) > 35;
        });
        if (distinct) picked.push(c);
        if (picked.length >= count) break;
    }
    return picked.map(c => rgbToHex(c.rgb));
}

/* ---------- 5. Archetypes (from the Bible's psychology + combos) ---------- */

const ARCHETYPES = {
    fnb: {
        label: "Food and drink / retail",
        signal: "Urgency, appetite, movement. Red raises the pulse; yellow welcomes.",
        brandHue: [2, 18], brandSat: [78, 92], brandLight: [42, 50],
        accentHue: [40, 48], dominant: "sunshine", mood: "heat"
    },
    wellness: {
        label: "Wellness / premium D2C",
        signal: "Trust, growth, craft. Forest green anchors; cream keeps it human.",
        brandHue: [136, 158], brandSat: [42, 60], brandLight: [22, 30],
        accentHue: [38, 46], dominant: "cream", mood: "mv-humanist"
    },
    saas: {
        label: "SaaS / dev tools",
        signal: "Freshness and modern energy without the default tech blue.",
        brandHue: [68, 92], brandSat: [70, 92], brandLight: [38, 46],
        accentHue: [18, 30], dominant: "cool-light", mood: "fresh"
    },
    creator: {
        label: "Creator / streetwear",
        signal: "Boldness and irreverence. Demands to be noticed, never asks.",
        brandHue: [322, 336], brandSat: [88, 100], brandLight: [48, 55],
        accentHue: [45, 52], dominant: "dark", mood: "bold"
    },
    fintech: {
        label: "Fintech / B2B services",
        signal: "Authority you trust with money, warmth that keeps it human.",
        brandHue: [214, 226], brandSat: [62, 80], brandLight: [15, 22],
        accentHue: [8, 16], dominant: "cool-light", mood: "trust"
    },
    aitech: {
        label: "AI / premium tech",
        signal: "Premium, focused, from the future. One electric accent, used like a weapon.",
        brandHue: [64, 76], brandSat: [90, 100], brandLight: [50, 58],
        accentHue: [64, 76], dominant: "dark", mood: "future"
    },
    beauty: {
        label: "Beauty / luxury",
        signal: "Purple stands out because nobody else dares to use it.",
        brandHue: [266, 286], brandSat: [48, 68], brandLight: [30, 42],
        accentHue: [340, 350], dominant: "warm-light", mood: "mv-editorial"
    },
    hospitality: {
        label: "Hospitality / dining",
        signal: "Established green, candlelight amber. A room, not a website.",
        brandHue: [148, 164], brandSat: [30, 45], brandLight: [14, 20],
        accentHue: [38, 44], dominant: "dark-green", mood: "mv-moody"
    },
    climate: {
        label: "Climate / healthtech",
        signal: "Calm futurism. Deep teal fuses blue's trust with green's growth - the escape route from default tech blue.",
        brandHue: [180, 190], brandSat: [62, 78], brandLight: [19, 26],
        accentHue: [18, 26], dominant: "cloud", mood: "mv-technical"
    },
    heritage: {
        label: "Heritage / quiet luxury",
        signal: "Old money, new brand. Oxblood is red matured past urgency into permanence; warm sand keeps it human.",
        brandHue: [346, 356], brandSat: [50, 64], brandLight: [20, 28],
        accentHue: [32, 40], dominant: "sand", mood: "craft"
    }
};

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

/* ---------- 6. Palette generation ---------- */

/*
  Roles per the 60-30-10 rule:
    dominant (60) - the canvas
    brand    (30) - the color people remember
    accent   (10) - the pop, muted relative to brand (Law 2)
    ink            - the dark anchor for text (Law 1)
  Every palette ships a light and a dark deployment (Law 4).
*/
function generatePalette({ category = "saas", seed = Date.now(), borrow = false, lockedBrand = null, customArchetype = null } = {}) {
    const rng = mulberry32(seed);

    /* A customArchetype (from a mood-driven brief) is already the
       exact shape ARCHETYPES entries take, just not one of the ten
       fixed categories - it skips the lookup/borrow step below but
       flows through identical generation, contrast, and law logic. */
    let recipeKey = category;
    let A;
    if (customArchetype) {
        A = customArchetype;
        recipeKey = "custom";
    } else {
        /* Law 7: borrow the recipe of a category you are NOT in. */
        if (borrow) {
            const others = ARCHETYPE_KEYS.filter(k => k !== category);
            recipeKey = others[Math.floor(rng() * others.length)];
        }
        A = ARCHETYPES[recipeKey];
    }

    /* Brand color: full saturation, it leads (Law 2). */
    let brandHsl;
    if (lockedBrand) {
        brandHsl = hexToHsl(lockedBrand);
    } else {
        brandHsl = {
            h: Math.round(randIn(rng, A.brandHue[0], A.brandHue[1])) % 360,
            s: Math.round(randIn(rng, A.brandSat[0], A.brandSat[1])),
            l: Math.round(randIn(rng, A.brandLight[0], A.brandLight[1]))
        };
    }

    /* Ink: the dark anchor, tinted faintly toward the brand hue (Law 1). */
    const ink = hslToHex({ h: brandHsl.h, s: Math.min(25, Math.round(brandHsl.s * 0.3)), l: Math.round(randIn(rng, 8, 12)) });

    /* Dominant: the canvas. */
    let dominant;
    const dominantKind = A.dominant;
    if (dominantKind === "dark") {
        dominant = hslToHex({ h: brandHsl.h, s: Math.min(14, Math.round(brandHsl.s * 0.15)), l: Math.round(randIn(rng, 8, 12)) });
    } else if (dominantKind === "dark-green") {
        dominant = hslToHex({ h: brandHsl.h, s: Math.round(randIn(rng, 18, 26)), l: Math.round(randIn(rng, 10, 14)) });
    } else if (dominantKind === "cream") {
        dominant = hslToHex({ h: Math.round(randIn(rng, 38, 44)), s: Math.round(randIn(rng, 42, 58)), l: Math.round(randIn(rng, 88, 92)) });
    } else if (dominantKind === "sunshine") {
        /* Combo 01: the warm base IS bold. Yellow ink prints well,
           so a saturated yellow canvas is safe for print too. */
        dominant = hslToHex({ h: Math.round(randIn(rng, 42, 48)), s: Math.round(randIn(rng, 88, 100)), l: Math.round(randIn(rng, 55, 62)) });
    } else if (dominantKind === "cloud") {
        /* Combo 07: warmer than #FFF, calmer than grey. */
        dominant = hslToHex({ h: Math.round(randIn(rng, 45, 55)), s: Math.round(randIn(rng, 12, 22)), l: Math.round(randIn(rng, 92, 95)) });
    } else if (dominantKind === "sand") {
        /* Combo 08: warm sand canvas - never pure white. */
        dominant = hslToHex({ h: Math.round(randIn(rng, 38, 44)), s: Math.round(randIn(rng, 30, 45)), l: Math.round(randIn(rng, 84, 89)) });
    } else if (dominantKind === "warm-light") {
        dominant = hslToHex({ h: Math.round(randIn(rng, 36, 48)), s: Math.round(randIn(rng, 25, 45)), l: Math.round(randIn(rng, 90, 95)) });
    } else {
        dominant = hslToHex({ h: (brandHsl.h + Math.round(randIn(rng, -12, 12)) + 360) % 360, s: Math.round(randIn(rng, 6, 14)), l: Math.round(randIn(rng, 93, 96)) });
    }

    const domIsDark = hexToHsl(dominant).l < 40;

    /* Accent: distinct hue, saturation at 70-85% of the brand's (Law 2).
       Floor at 50: HSL saturation is lightness-blind, and below ~50 the
       amber hues most archetypes use for accents collapse into khaki.
       Lightness is pre-fit to the canvas so the contrast pass barely
       has to move it. */
    const accentSat = Math.round(brandHsl.s * randIn(rng, 0.7, 0.85));
    let accentHsl = {
        h: Math.round(randIn(rng, A.accentHue[0], A.accentHue[1])) % 360,
        s: Math.min(88, Math.max(50, accentSat)),
        l: domIsDark ? Math.round(randIn(rng, 56, 66)) : Math.round(randIn(rng, 42, 52))
    };

    /* Contrast passes: text always readable, UI colors always visible. */
    const inkFixed = domIsDark ? hslToHex({ h: hexToHsl(dominant).h, s: 10, l: 92 }) : ensureContrast(ink, dominant, 7);
    /* A locked brand color is sacred: keep the exact hex, no HSL round-trip. */
    let brandHex = lockedBrand ? rgbToHex(hexToRgb(lockedBrand)) : ensureContrast(hslToHex(brandHsl), dominant, 3);
    let accentHex = ensureContrastVivid(hslToHex(accentHsl), dominant, 3);

    const build = hex => {
        const rgb = hexToRgb(hex);
        return { hex, rgb, hsl: rgbToHsl(rgb), cmyk: rgbToCmyk(rgb), name: nameColor(hex), print: gamutRisk(hex) };
    };

    const swatches = [
        Object.assign(build(dominant), { role: "Dominant", pct: "60", job: "The canvas. Backgrounds, large surfaces, breathing room." }),
        Object.assign(build(brandHex), { role: "Brand", pct: "30", job: "The color people remember. Logo, primary buttons, hero blocks." }),
        Object.assign(build(accentHex), { role: "Accent", pct: "10", job: "The pop. CTAs, highlights, micro-interactions. Sparingly." }),
        Object.assign(build(inkFixed), { role: "Ink", pct: "Text", job: "The anchor. Text and small UI, grounding the noise." })
    ];
    /* Same hue family for Brand and Accent (aitech does this on
       purpose) would read as "Lime / Lime"; qualify the accent. */
    if (swatches[2].name === swatches[1].name) swatches[2].name = "Soft " + swatches[2].name;

    /* Law 4: the dark deployment, built at the same time as the light. */
    const darkDominant = domIsDark ? dominant : hslToHex({ h: brandHsl.h, s: 12, l: 9 });
    const darkInk = hslToHex({ h: hexToHsl(darkDominant).h, s: 8, l: 93 });
    const darkBrand = ensureContrast(brandHex, darkDominant, 3);
    const darkAccent = ensureContrast(accentHex, darkDominant, 3);
    const lightDominant = domIsDark ? hslToHex({ h: brandHsl.h, s: 10, l: 95 }) : dominant;
    const lightInk = domIsDark ? ensureContrast(ink, lightDominant, 7) : inkFixed;
    const lightBrand = ensureContrast(brandHex, lightDominant, 3);
    const lightAccent = ensureContrastVivid(accentHex, lightDominant, 3);

    return {
        seed, category, recipeKey, borrowed: (borrow && !customArchetype) ? ARCHETYPES[recipeKey].label : null,
        custom: !!customArchetype, customLabel: customArchetype ? customArchetype.label : null,
        signal: A.signal, mood: A.mood, swatches,
        deployments: {
            light: { bg: lightDominant, ink: lightInk, brand: lightBrand, accent: lightAccent },
            dark: { bg: darkDominant, ink: darkInk, brand: darkBrand, accent: darkAccent }
        },
        contrasts: [
            { pair: "Ink on Dominant", ratio: contrastRatio(swatches[3].hex, swatches[0].hex) },
            { pair: "Brand on Dominant", ratio: contrastRatio(swatches[1].hex, swatches[0].hex) },
            { pair: "Accent on Dominant", ratio: contrastRatio(swatches[2].hex, swatches[0].hex) }
        ]
    };
}

/* ---------- 7. The Fixer (diagnoses against the ten laws) ---------- */

function parseHexList(input) {
    const matches = input.match(/#?[0-9a-fA-F]{6}|#?[0-9a-fA-F]{3}\b/g) || [];
    const seen = new Set();
    const out = [];
    for (let m of matches) {
        if (!m.startsWith("#")) m = "#" + m;
        const rgb = hexToRgb(m);
        if (!rgb) continue;
        const norm = rgbToHex(rgb);
        if (!seen.has(norm)) { seen.add(norm); out.push(norm); }
    }
    return out;
}

function diagnosePalette(hexes) {
    const items = hexes.map(hex => ({ hex, hsl: hexToHsl(hex) }));
    const issues = [];

    const darkest = items.reduce((a, b) => (a.hsl.l < b.hsl.l ? a : b));
    const lightest = items.reduce((a, b) => (a.hsl.l > b.hsl.l ? a : b));
    const brights = items.filter(i => i.hsl.s > 70 && i.hsl.l > 25 && i.hsl.l < 80);
    const maxSat = Math.max(...items.map(i => i.hsl.s));

    /* Law 1: pick a dark anchor before you pick a bright. */
    if (darkest.hsl.l > 30) {
        issues.push({
            law: 1, title: "No dark anchor",
            detail: "Nothing here is dark enough to ground the palette. Bright plus bright is chaos; bright plus dark is identity.",
            fix: "Added a deep ink derived from your most saturated hue."
        });
    }

    /* Law 2: saturate the brand color, mute the accent. */
    const fighters = brights.filter(i => i.hsl.s > 78);
    if (fighters.length >= 2) {
        const [a, b] = fighters;
        if (Math.abs(a.hsl.l - b.hsl.l) < 18) {
            issues.push({
                law: 2, title: "Two colors fighting at full power",
                detail: `${nameColor(a.hex)} and ${nameColor(b.hex)} are both near full saturation at similar lightness. One must lead, one must support.`,
                fix: "One voice leads at full power; the supporting color drops to roughly 70% saturation. The verdict list below shows which."
            });
        }
    }

    /* Law 5: one bold color is a brand, three is a circus. */
    if (brights.length >= 3) {
        issues.push({
            law: 5, title: `${brights.length} loud colors`,
            detail: "If you need a third loud color, the first two are not doing their job. Add neutrals, not more brights.",
            fix: "Kept the two strongest voices, neutralized the rest into supporting tones."
        });
    }

    /* All muted: the palette looks tired (Law 2's other failure mode). */
    if (maxSat < 35 && items.length > 1) {
        issues.push({
            law: 2, title: "Everything is muted",
            detail: "When every color whispers, the brand looks tired. One color has to lead at full power.",
            fix: "Saturated the most distinctive hue into a proper brand color."
        });
    }

    /* Law 9: contrast is a floor, not a vibe. */
    if (contrastRatio(darkest.hex, lightest.hex) < 4.5) {
        issues.push({
            law: 9, title: "Text will fail on your own background",
            detail: `Your darkest on your lightest is ${contrastRatio(darkest.hex, lightest.hex).toFixed(1)}:1. Body text needs 4.5:1 - contrast is a floor, not a vibe. It looks fine as swatches; it breaks at 5% of the screen.`,
            fix: "Deepened the anchor until body text clears WCAG AA."
        });
    }

    return issues;
}

function fixPalette(hexes) {
    const issues = diagnosePalette(hexes);
    const items = hexes.map(hex => ({ hex, hsl: hexToHsl(hex), note: null }));

    /* Assign roles: lightest becomes Dominant, darkest becomes Ink,
       most saturated of the rest becomes Brand, next becomes Accent.
       Every input color gets an explicit fate in `mapping`; nothing
       disappears silently. */
    const byLight = [...items].sort((a, b) => b.hsl.l - a.hsl.l);
    let dominant = byLight[0];
    let inkSource = byLight[byLight.length - 1];
    let middle = items.filter(i => i !== dominant && i !== inkSource);

    /* Law 1 fix: forge an anchor if none exists. The failed anchor
       candidate rejoins the pool and competes for Brand/Accent
       instead of being dropped. */
    let ink;
    if (inkSource.hsl.l > 30) {
        middle.push(inkSource);
        const seedHue = middle.length
            ? [...middle].sort((a, b) => b.hsl.s - a.hsl.s)[0].hsl.h
            : dominant.hsl.h;
        ink = { hex: hslToHex({ h: seedHue, s: 18, l: 10 }), hsl: { h: seedHue, s: 18, l: 10 }, forged: true };
    } else {
        ink = inkSource;
    }

    middle.sort((a, b) => b.hsl.s - a.hsl.s);
    let brand = middle[0] || null;
    let accent = middle[1] || null;
    const retired = middle.slice(2);

    /* No brand candidate: promote the dominant's hue at full power. */
    let brandSynth = false;
    if (!brand) {
        const h = dominant.hsl.h;
        brand = { hsl: { h, s: 78, l: 42 }, hex: hslToHex({ h, s: 78, l: 42 }) };
        brandSynth = true;
    }

    /* All muted fix: give the brand its voice back. */
    const brandOrig = brand.hex;
    if (brand.hsl.s < 35) {
        brand = { hsl: { ...brand.hsl, s: 80 }, hex: hslToHex({ ...brand.hsl, s: 80 }), src: brand };
    }

    /* Law 2 fix: accent supports at 60-80% of the brand's saturation.
       Floored at 45 so muting never collapses into khaki. */
    let accentSynth = false;
    const accentOrig = accent ? accent.hex : null;
    if (accent) {
        const target = Math.max(45, Math.round(brand.hsl.s * 0.7));
        if (accent.hsl.s > target) {
            accent = { hsl: { ...accent.hsl, s: target }, hex: hslToHex({ ...accent.hsl, s: target }), src: accent };
        }
    } else {
        const h = (brand.hsl.h + 40) % 360;
        const hsl = { h, s: Math.max(45, Math.round(brand.hsl.s * 0.7)), l: 55 };
        accent = { hsl, hex: hslToHex(hsl) };
        accentSynth = true;
    }

    /* Dominant must be a canvas, not a shout. */
    const dominantOrig = dominant.hex;
    if (dominant.hsl.s > 45 && dominant.hsl.l < 88 && dominant.hsl.l > 40) {
        const hsl = { h: dominant.hsl.h, s: 18, l: 94 };
        dominant = { hsl, hex: hslToHex(hsl), src: dominant };
    }

    /* Contrast pass. */
    const inkHex = ensureContrast(ink.hex, dominant.hex, 7);
    const brandHex = ensureContrast(brand.hex, dominant.hex, 3);
    const accentHex = ensureContrastVivid(accent.hex, dominant.hex, 3);

    /* Provenance: one line per input color. */
    const fate = new Map();
    fate.set(dominantOrig, dominant.hex === dominantOrig
        ? "Kept as Dominant, the canvas."
        : `Softened into the Dominant canvas ${dominant.hex}.`);
    if (!ink.forged) fate.set(inkSource.hex, "Kept as Ink, the dark anchor.");
    if (!brandSynth) {
        fate.set(brandOrig, brandHex === brandOrig
            ? "Kept as Brand, the lead voice."
            : `Adjusted to ${brandHex} as Brand.`);
    }
    if (!accentSynth && accentOrig) {
        fate.set(accentOrig, accentHex === accentOrig
            ? "Kept as Accent."
            : `Muted to ${accentHex} as Accent (Law 2).`);
    }
    retired.forEach(r => fate.set(r.hex, "Retired to keep two voices (Law 5)."));

    const mapping = hexes.map(hex => ({ from: hex, note: fate.get(hex) || "Retired to keep two voices (Law 5)." }));
    if (ink.forged) mapping.push({ from: inkHex, note: "Forged: the dark anchor your palette was missing (Law 1)." });
    if (accentSynth) mapping.push({ from: accentHex, note: "Synthesized: a supporting accent at 70% of the Brand's power." });

    const build = (hex, role, pct, job) => {
        const rgb = hexToRgb(hex);
        return { hex, rgb, hsl: rgbToHsl(rgb), cmyk: rgbToCmyk(rgb), name: nameColor(hex), role, pct, job, print: gamutRisk(hex) };
    };

    const swatches = [
        build(dominant.hex, "Dominant", "60", "The canvas. Backgrounds, large surfaces, breathing room."),
        build(brandHex, "Brand", "30", "The color people remember. Logo, primary buttons, hero blocks."),
        build(accentHex, "Accent", "10", "The pop. CTAs, highlights, micro-interactions. Sparingly."),
        build(inkHex, "Ink", "Text", "The anchor. Text and small UI, grounding the noise.")
    ];
    if (swatches[2].name === swatches[1].name) swatches[2].name = "Soft " + swatches[2].name;

    const domIsDark = hexToHsl(dominant.hex).l < 40;
    const darkDominant = domIsDark ? dominant.hex : hslToHex({ h: brand.hsl.h, s: 12, l: 9 });

    return {
        issues,
        original: hexes,
        mapping,
        swatches,
        deployments: {
            light: { bg: swatches[0].hex, ink: swatches[3].hex, brand: swatches[1].hex, accent: swatches[2].hex },
            dark: {
                bg: darkDominant,
                ink: hslToHex({ h: hexToHsl(darkDominant).h, s: 8, l: 93 }),
                brand: ensureContrast(brandHex, darkDominant, 3),
                accent: ensureContrast(accentHex, darkDominant, 3)
            }
        },
        contrasts: [
            { pair: "Ink on Dominant", ratio: contrastRatio(swatches[3].hex, swatches[0].hex) },
            { pair: "Brand on Dominant", ratio: contrastRatio(swatches[1].hex, swatches[0].hex) },
            { pair: "Accent on Dominant", ratio: contrastRatio(swatches[2].hex, swatches[0].hex) }
        ]
    };
}

/* ---------- 8. Typography pairing ---------- */

/* Each mood maps to pairs the Bible's combos prescribe:
   heat = rounded impact, craft = editorial serif, fresh = geometric sans,
   bold = heavy display, trust = clean grotesk, future = mono + grotesk. */
const TYPE_PAIRS = {
    heat: [
        { display: "Anton", body: "Work Sans", displayWeight: 400, bodyWeight: 400, why: "Condensed impact over a friendly workhorse. Heat sells, legibility closes." },
        { display: "Archivo Black", body: "Inter Tight", displayWeight: 400, bodyWeight: 400, why: "Oversized headlines with zero apology, body copy that stays out of the way." }
    ],
    craft: [
        { display: "Playfair Display", body: "Source Sans 3", displayWeight: 600, bodyWeight: 400, why: "An editorial serif that has been around longer than the brand has. Warmth with posture." },
        { display: "Cormorant Garamond", body: "Manrope", displayWeight: 600, bodyWeight: 400, why: "High-contrast serif elegance over a quiet modern body. Generous whitespace required." }
    ],
    fresh: [
        { display: "Space Grotesk", body: "Inter Tight", displayWeight: 700, bodyWeight: 400, why: "Geometric personality in the headline, invisible efficiency in the body." },
        { display: "Sora", body: "Manrope", displayWeight: 700, bodyWeight: 400, why: "Rounded-geometric confidence. Young but not childish, exactly as prescribed." }
    ],
    bold: [
        { display: "Archivo Black", body: "Space Grotesk", displayWeight: 400, bodyWeight: 400, why: "Heavy display that demands attention, a grotesk body that keeps the energy." },
        { display: "Anton", body: "Inter Tight", displayWeight: 400, bodyWeight: 400, why: "Poster-weight headlines for a brand that does not ask to be liked." }
    ],
    trust: [
        { display: "Libre Franklin", body: "Inter Tight", displayWeight: 700, bodyWeight: 400, why: "A clean grotesk with newspaper bones. Professional with a heartbeat." },
        { display: "IBM Plex Sans", body: "Source Sans 3", displayWeight: 600, bodyWeight: 400, why: "Engineered neutrality. Structured, dependable, quietly warm." }
    ],
    future: [
        { display: "Space Grotesk", body: "Inter Tight", mono: "JetBrains Mono", displayWeight: 700, bodyWeight: 400, why: "The mono-plus-grotesk mix. Sharp geometry, terminal accents, priced like the future." },
        { display: "Chivo Mono", body: "Chivo", displayWeight: 700, bodyWeight: 400, why: "One superfamily, two voices. The mono display is the brand moment." }
    ]
};

/* Finer-grained taxonomy for mood-driven (conversational) palettes,
   so a specific keyword gets its own typographic personality instead
   of collapsing into one of the six archetype mood buckets above.
   Grounded in the same pairing logic (contrast of voice, matched
   x-height, one family doing the talking): editorial serif, warm
   humanist serif, clean geometric sans, mono-accented technical,
   rounded/playful, brutalist display, grotesk trust, high-contrast
   "moody" didone. All real, licensed Google Fonts. */
const TYPE_PAIRS_MOOD = {
    "mv-editorial": [
        { display: "Fraunces", body: "Work Sans", displayWeight: 600, bodyWeight: 400, why: "A soft-serif display with real personality against an efficient grotesk body. Reads expensive without shouting." },
        { display: "Cormorant Garamond", body: "Manrope", displayWeight: 600, bodyWeight: 400, why: "High-contrast serif elegance over a quiet modern body. Generous whitespace required." }
    ],
    "mv-humanist": [
        { display: "Lora", body: "Karla", displayWeight: 600, bodyWeight: 400, why: "A warm text serif with just enough personality, paired with a friendly grotesk that keeps things human." },
        { display: "Bitter", body: "Work Sans", displayWeight: 600, bodyWeight: 400, why: "Slab-serif warmth for the headline, a plain workhorse for the body. Nothing here is trying too hard." }
    ],
    "mv-geometric": [
        { display: "Space Grotesk", body: "Inter Tight", displayWeight: 700, bodyWeight: 400, why: "Geometric personality in the headline, invisible efficiency in the body." },
        { display: "Sora", body: "Manrope", displayWeight: 700, bodyWeight: 400, why: "Rounded-geometric confidence, precise and current without feeling cold." }
    ],
    "mv-technical": [
        { display: "Chivo Mono", body: "Chivo", displayWeight: 700, bodyWeight: 400, why: "One superfamily, two voices. The mono display is the brand moment." },
        { display: "Space Grotesk", body: "Inter Tight", mono: "JetBrains Mono", displayWeight: 700, bodyWeight: 400, why: "The mono-plus-grotesk mix. Sharp geometry, terminal accents, priced like the future." }
    ],
    "mv-playful": [
        { display: "Baloo 2", body: "Mulish", displayWeight: 700, bodyWeight: 400, why: "Rounded, friendly display weight over a light, approachable body. Confident without being loud." },
        { display: "Fredoka", body: "Nunito Sans", displayWeight: 600, bodyWeight: 400, why: "Soft geometric roundness top to bottom. Reads energetic and safe at the same time." }
    ],
    "mv-brutalist": [
        { display: "Archivo Black", body: "Space Grotesk", displayWeight: 400, bodyWeight: 400, why: "Heavy display that demands attention, a grotesk body that keeps the energy." },
        { display: "Anton", body: "Inter Tight", displayWeight: 400, bodyWeight: 400, why: "Poster-weight headlines for a brand that does not ask to be liked." }
    ],
    "mv-trust": [
        { display: "Libre Franklin", body: "Inter Tight", displayWeight: 700, bodyWeight: 400, why: "A clean grotesk with newspaper bones. Professional with a heartbeat." },
        { display: "IBM Plex Sans", body: "Source Sans 3", displayWeight: 600, bodyWeight: 400, why: "Engineered neutrality. Structured, dependable, quietly warm." }
    ],
    "mv-moody": [
        { display: "Bodoni Moda", body: "Work Sans", displayWeight: 600, bodyWeight: 400, why: "High-contrast didone strokes read as dramatic and a little withheld. A plain body keeps it legible instead of gothic." },
        { display: "Unna", body: "Manrope", displayWeight: 700, bodyWeight: 400, why: "A quiet, inky text serif for brands that want to feel restrained rather than loud." }
    ]
};

function getTypePairs(mood) {
    return TYPE_PAIRS[mood] || TYPE_PAIRS_MOOD[mood] || TYPE_PAIRS.fresh;
}

function googleFontsUrl(pair) {
    const fams = [
        `family=${pair.display.replace(/ /g, "+")}:wght@${pair.displayWeight}`,
        `family=${pair.body.replace(/ /g, "+")}:wght@${pair.bodyWeight};600`
    ];
    if (pair.mono) fams.push(`family=${pair.mono.replace(/ /g, "+")}:wght@400`);
    return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}

/* ---------- 8b. Design system tokens (spacing, radius, elevation, states) ---------- */

/* Spacing and corner personality per archetype - not arbitrary, tied
   to the same signal each archetype's palette already carries.
   density: how tight the rhythm reads. corner: how the geometry reads
   (sharp = engineered/confident, soft = human/craft, balanced = the
   neutral default a custom/mood-driven palette falls back to). */
const SYSTEM_PROFILE = {
    fnb: { density: "regular", corner: "soft" },
    wellness: { density: "spacious", corner: "soft" },
    saas: { density: "compact", corner: "balanced" },
    creator: { density: "regular", corner: "sharp" },
    fintech: { density: "compact", corner: "sharp" },
    aitech: { density: "compact", corner: "sharp" },
    beauty: { density: "spacious", corner: "soft" },
    hospitality: { density: "spacious", corner: "soft" },
    climate: { density: "regular", corner: "balanced" },
    heritage: { density: "spacious", corner: "balanced" }
};

const DENSITY_UNIT = { compact: 3.5, regular: 4, spacious: 4.5 };

/* 4px-baseline scale (the near-universal default across mature design
   systems) scaled by the archetype's density, so a fintech dashboard
   reads tighter than a wellness site without a different grid logic
   per brand - one system, one dial. */
const SPACING_STEPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];
const SPACING_NAMES = ["0", "3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"];

function spacingScale(recipeKey) {
    const unit = DENSITY_UNIT[(SYSTEM_PROFILE[recipeKey] || {}).density || "regular"];
    return SPACING_STEPS.map((mult, i) => {
        const px = Math.round(mult * unit * 2) / 2;
        return { name: SPACING_NAMES[i], px, rem: +(px / 16).toFixed(4) };
    });
}

const RADIUS_SCALES = {
    sharp: [0, 2, 4, 6, 999],
    balanced: [0, 4, 8, 12, 999],
    soft: [0, 6, 12, 20, 999]
};
const RADIUS_NAMES = ["none", "sm", "md", "lg", "full"];

function radiusScale(recipeKey) {
    const corner = (SYSTEM_PROFILE[recipeKey] || {}).corner || "balanced";
    return RADIUS_SCALES[corner].map((px, i) => ({ name: RADIUS_NAMES[i], px }));
}

/* Elevation shadows tinted with the palette's own Ink hue rather than
   pure black - a shadow under a warm-ink brand should read warm, not
   like a different, generic product bolted on top. Alpha and offset
   climb together; blur grows faster than offset so higher elevations
   feel airier, not just darker. */
function elevationScale(inkHex, domIsDark) {
    const { h } = hexToHsl(inkHex);
    const base = domIsDark ? { s: 20, l: 4 } : { s: 25, l: 8 };
    const steps = [
        { name: "0", y: 0, blur: 0, alpha: 0 },
        { name: "1", y: 1, blur: 3, alpha: 0.08 },
        { name: "2", y: 2, blur: 6, alpha: 0.10 },
        { name: "3", y: 6, blur: 16, alpha: 0.14 },
        { name: "4", y: 12, blur: 32, alpha: 0.18 }
    ];
    return steps.map(s => {
        const rgb = hslToRgb({ h, s: base.s, l: base.l });
        return {
            name: s.name,
            css: s.alpha === 0 ? "none" : `0 ${s.y}px ${s.blur}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${s.alpha})`,
            shadowColor: rgbToHex(rgb),
            y: s.y, blur: s.blur, alpha: s.alpha
        };
    });
}

/* Interactive state variants for a role color. hover/active step
   toward the canvas's own shadow direction (darker on a light canvas,
   lighter on a dark one), so "pressed" always reads as "pushed into
   the surface" regardless of deployment. disabled desaturates and
   pulls toward the dominant so it reads inert without vanishing.
   focusRing keeps the base hue at fixed alpha so focus never
   introduces an off-brand color. */
function stateVariants(hex, dominantHex) {
    const domIsDark = hexToHsl(dominantHex).l < 40;
    const base = hexToHsl(hex);
    const step = domIsDark ? 6 : -6;
    const clampL = l => Math.max(4, Math.min(96, l));
    const hover = hslToHex({ ...base, l: clampL(base.l + step) });
    const active = hslToHex({ ...base, l: clampL(base.l + step * 2) });
    const disabled = hslToHex({
        h: base.h,
        s: Math.round(base.s * 0.25),
        l: Math.round((base.l + hexToHsl(dominantHex).l) / 2)
    });
    return { default: hex, hover, active, disabled, focusRing: `${hex}66` };
}

/* ---------- 9. Exports ---------- */

/* Shared system-token derivation so every exporter (CSS/Tailwind/
   SCSS/JSON) reads the same values - one source, four formats. */
function systemTokens(p) {
    const recipeKey = p.recipeKey || "custom";
    const domIsDark = hexToHsl(p.swatches[0].hex).l < 40;
    return {
        spacing: spacingScale(recipeKey),
        radius: radiusScale(recipeKey),
        elevation: elevationScale(p.swatches[3].hex, domIsDark),
        states: {
            brand: stateVariants(p.swatches[1].hex, p.swatches[0].hex),
            accent: stateVariants(p.swatches[2].hex, p.swatches[0].hex)
        }
    };
}

function exportCss(p) {
    const d = p.deployments;
    const sys = systemTokens(p);
    const spacingVars = sys.spacing.map(s => `  --space-${s.name}: ${s.px}px;`).join("\n");
    const radiusVars = sys.radius.map(r => `  --radius-${r.name}: ${r.px === 999 ? "9999px" : r.px + "px"};`).join("\n");
    const elevationVars = sys.elevation.filter(e => e.name !== "0").map(e => `  --elevation-${e.name}: ${e.css};`).join("\n");
    return `:root {
  /* ${brandLine(p)} */
  --color-dominant: ${p.swatches[0].hex};
  --color-brand: ${p.swatches[1].hex};
  --color-accent: ${p.swatches[2].hex};
  --color-ink: ${p.swatches[3].hex};
  --color-brand-hover: ${sys.states.brand.hover};
  --color-brand-active: ${sys.states.brand.active};
  --color-accent-hover: ${sys.states.accent.hover};
  --color-accent-active: ${sys.states.accent.active};

  /* Spacing (Law 8: build the ramp, not the swatch) */
${spacingVars}

  /* Radius */
${radiusVars}

  /* Elevation */
${elevationVars}
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-dominant: ${d.dark.bg};
    --color-brand: ${d.dark.brand};
    --color-accent: ${d.dark.accent};
    --color-ink: ${d.dark.ink};
  }
}`;
}

function exportTailwind(p) {
    const d = p.deployments;
    const sys = systemTokens(p);
    const spacingVars = sys.spacing.map(s => `  --spacing-${s.name}: ${s.px}px;`).join("\n");
    const radiusVars = sys.radius.map(r => `  --radius-${r.name}: ${r.px === 999 ? "9999px" : r.px + "px"};`).join("\n");
    const shadowVars = sys.elevation.filter(e => e.name !== "0").map(e => `  --shadow-${e.name}: ${e.css};`).join("\n");
    return `@theme {
  /* ${brandLine(p)} */
  --color-dominant: ${p.swatches[0].hex};
  --color-brand: ${p.swatches[1].hex};
  --color-accent: ${p.swatches[2].hex};
  --color-ink: ${p.swatches[3].hex};
  --color-dominant-dark: ${d.dark.bg};
  --color-brand-dark: ${d.dark.brand};
  --color-accent-dark: ${d.dark.accent};
  --color-ink-dark: ${d.dark.ink};

${spacingVars}

${radiusVars}

${shadowVars}
}`;
}

function exportScss(p) {
    const sys = systemTokens(p);
    const spacingVars = sys.spacing.map(s => `$space-${s.name}: ${s.px}px;`).join("\n");
    const radiusVars = sys.radius.map(r => `$radius-${r.name}: ${r.px === 999 ? "9999px" : r.px + "px"};`).join("\n");
    const elevationVars = sys.elevation.filter(e => e.name !== "0").map(e => `$elevation-${e.name}: ${e.css};`).join("\n");
    return `// ${brandLine(p)}
$color-dominant: ${p.swatches[0].hex}; // 60
$color-brand: ${p.swatches[1].hex};    // 30
$color-accent: ${p.swatches[2].hex};   // 10
$color-ink: ${p.swatches[3].hex};      // text

// Spacing
${spacingVars}

// Radius
${radiusVars}

// Elevation
${elevationVars}`;
}

function exportJson(p) {
    return JSON.stringify({
        method: "60-30-10",
        seed: p.seed || null,
        colors: p.swatches.map(s => ({
            role: s.role, share: s.pct, name: s.name, hex: s.hex,
            rgb: s.rgb, cmyk: s.cmyk,
            printGamut: s.print ? { risk: s.print.risk, safeHex: s.print.safeHex } : undefined
        })),
        deployments: p.deployments
    }, null, 2);
}

/* The canonical multi-category token payload - one shape every export
   format derives from, and the shape an external consumer (a
   token-usage graph, a Figma sync) would ingest. Versioned and
   provenanced so a consumer can tell where a value came from. */
function exportTokensJson(p, pair) {
    const sys = systemTokens(p);
    return JSON.stringify({
        schema: "gamut.tokens.v1",
        generatedAt: new Date().toISOString(),
        source: { product: "gamut", seed: p.seed || null, category: p.category || null, recipeKey: p.recipeKey || "custom" },
        color: {
            roles: Object.fromEntries(p.swatches.map(s => [s.role.toLowerCase(), s.hex])),
            deployments: p.deployments,
            states: sys.states
        },
        spacing: Object.fromEntries(sys.spacing.map(s => [s.name, `${s.px}px`])),
        radius: Object.fromEntries(sys.radius.map(r => [r.name, r.px === 999 ? "9999px" : `${r.px}px`])),
        elevation: Object.fromEntries(sys.elevation.map(e => [e.name, e.css])),
        typography: pair ? { display: pair.display, body: pair.body, mono: pair.mono || null } : null
    }, null, 2);
}

function brandLine(p) {
    return p.swatches.map(s => `${s.role} ${s.hex}`).join("  ");
}

/* Designer-facing artifact: a downloadable SVG swatch card with
   roles, values, and the current type pairing. `branding` swaps
   the footer credit from Gamut to an agency's own name when
   white-labeling for a client deliverable. */
function exportSvgCard(p, pair, branding) {
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const trimmedName = branding && branding.name ? branding.name.trim() : "";
    const label = branding && branding.whiteLabel && trimmedName ? trimmedName : "Gamut";
    const W = 840, chipW = W / 4;
    const chips = p.swatches.map((s, i) => {
        const x = i * chipW;
        /* Contrast-picked, not lightness-picked: a mid-lightness
           yellow must still get dark text. */
        const tc = contrastRatio(s.hex, "#161616") >= contrastRatio(s.hex, "#F5F5F0")
            ? "#161616" : "#F5F5F0";
        return `
    <rect x="${x}" y="0" width="${chipW}" height="300" fill="${s.hex}"/>
    <text x="${x + 18}" y="230" fill="${tc}" font-size="15" font-weight="bold" font-family="Arial,sans-serif">${esc(s.role)} ${s.pct === "Text" ? "" : s.pct + "%"}</text>
    <text x="${x + 18}" y="252" fill="${tc}" font-size="12" font-family="monospace">${s.hex}</text>
    <text x="${x + 18}" y="270" fill="${tc}" font-size="11" opacity="0.75" font-family="monospace">cmyk ${s.cmyk.c} ${s.cmyk.m} ${s.cmyk.y} ${s.cmyk.k}</text>`;
    }).join("");
    const typeLine = pair ? `${pair.display} + ${pair.body}${pair.mono ? " + " + pair.mono : ""}` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="392" viewBox="0 0 ${W} 392">
  <rect width="${W}" height="392" fill="#161616"/>${chips}
  <text x="18" y="336" fill="#F5F5F0" font-size="15" font-weight="bold" font-family="Arial,sans-serif">${esc(typeLine)}</text>
  <text x="18" y="362" fill="#8F8E86" font-size="11" font-family="monospace">60-30-10 deployment  |  ${esc(label)}</text>
</svg>`;
}

/* Nearest type mood for an arbitrary brand color, so palettes
   arriving from the Fixer still get a fitting pairing. */
function moodFromColor(hex) {
    const { h, s, l } = hexToHsl(hex);
    if (s < 25) return l < 40 ? "future" : "trust";
    if (h <= 35 || h > 345) return "heat";
    if (h <= 60) return "heat";
    if (h <= 105) return "fresh";
    if (h <= 200) return l < 35 ? "craft" : "fresh";
    if (h <= 250) return "trust";
    if (h <= 305) return "craft";
    return "bold";
}

window.Engine = {
    hexToRgb, rgbToHex, hexToHsl, hslToHex, rgbToCmyk, gamutRisk,
    contrastRatio, contrastGrade, ensureContrast, ensureContrastVivid,
    shadeScale, quantizeColors,
    ARCHETYPES, generatePalette,
    parseHexList, diagnosePalette, fixPalette,
    getTypePairs, googleFontsUrl, moodFromColor,
    spacingScale, radiusScale, elevationScale, stateVariants,
    exportCss, exportTailwind, exportScss, exportJson, exportTokensJson, exportSvgCard,
    nameColor, TYPE_PAIRS_MOOD
};
