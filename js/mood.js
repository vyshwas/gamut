/* =========================================================
   MOOD LEXICON
   A second, independent framework from the Brand Color Bible's
   business archetypes: a keyword -> color-target mapping grounded
   in established color-emotion research (Kobayashi's Color Image
   Scale warm/cool x soft/hard axes; Itten's contrast of hue and
   saturation; the psychology-of-color consensus that hue carries
   temperature/energy, saturation carries intensity, lightness
   carries weight). It lets a mood ("melancholy", "electric") steer
   a palette even when no business category fits.

   Each entry also carries a specific typography taxonomy tag
   (Engine.TYPE_PAIRS_MOOD keys) so near-synonyms still land on
   different, deliberately-chosen typographic personalities instead
   of a handful of generic buckets.
   ========================================================= */

"use strict";

const MOOD_LEXICON = {
    calm:        { h: 200, s: 35, l: 45, type: "mv-trust" },
    serene:      { h: 195, s: 30, l: 55, type: "mv-trust" },
    peaceful:    { h: 150, s: 28, l: 52, type: "mv-humanist" },
    trustworthy: { h: 215, s: 55, l: 30, type: "mv-trust" },
    corporate:   { h: 220, s: 45, l: 25, type: "mv-trust" },
    clinical:    { h: 195, s: 20, l: 55, type: "mv-geometric" },

    energetic:   { h: 20,  s: 88, l: 50, type: "mv-playful" },
    urgent:      { h: 8,   s: 90, l: 45, type: "mv-brutalist" },
    playful:     { h: 40,  s: 85, l: 55, type: "mv-playful" },
    tropical:    { h: 150, s: 70, l: 45, type: "mv-playful" },
    vibrant:     { h: 330, s: 85, l: 52, type: "mv-brutalist" },
    electric:    { h: 72,  s: 95, l: 55, type: "mv-technical" },

    luxurious:   { h: 275, s: 45, l: 28, type: "mv-editorial" },
    opulent:     { h: 350, s: 55, l: 25, type: "mv-editorial" },
    elegant:     { h: 280, s: 35, l: 30, type: "mv-editorial" },
    romantic:    { h: 340, s: 55, l: 55, type: "mv-editorial" },
    nostalgic:   { h: 30,  s: 40, l: 50, type: "mv-humanist" },
    cozy:        { h: 25,  s: 45, l: 40, type: "mv-humanist" },
    earthy:      { h: 35,  s: 40, l: 32, type: "mv-humanist" },
    organic:     { h: 100, s: 30, l: 35, type: "mv-humanist" },
    rustic:      { h: 22,  s: 42, l: 30, type: "mv-humanist" },

    futuristic:  { h: 190, s: 80, l: 45, type: "mv-technical" },
    mysterious:  { h: 265, s: 45, l: 20, type: "mv-moody" },
    edgy:        { h: 300, s: 70, l: 35, type: "mv-brutalist" },
    rebellious:  { h: 350, s: 85, l: 45, type: "mv-brutalist" },
    industrial:  { h: 210, s: 12, l: 35, type: "mv-brutalist" },
    raw:         { h: 20,  s: 25, l: 30, type: "mv-brutalist" },

    minimal:     { h: 210, s: 8,  l: 20, type: "mv-geometric" },
    modern:      { h: 200, s: 30, l: 25, type: "mv-geometric" },
    fresh:       { h: 90,  s: 55, l: 42, type: "mv-geometric" },
    clean:       { h: 195, s: 25, l: 30, type: "mv-geometric" },

    dreamy:      { h: 260, s: 40, l: 62, type: "mv-editorial" },
    ethereal:    { h: 250, s: 30, l: 70, type: "mv-editorial" },
    whimsical:   { h: 300, s: 50, l: 60, type: "mv-playful" },
    pastel:      { h: 320, s: 35, l: 75, type: "mv-playful" },

    moody:       { h: 250, s: 30, l: 22, type: "mv-moody" },
    somber:      { h: 220, s: 15, l: 18, type: "mv-moody" },
    melancholy:  { h: 230, s: 25, l: 30, type: "mv-moody" },
    dark:        { h: 240, s: 20, l: 12, type: "mv-moody" },
    light:       { h: 45,  s: 20, l: 90, type: "mv-geometric" },

    bold:        { h: 350, s: 90, l: 48, type: "mv-brutalist" },
    muted:       { h: 200, s: 20, l: 45, type: "mv-trust" },
    warm:        { h: 25,  s: 55, l: 48, type: "mv-humanist" },
    cool:        { h: 205, s: 45, l: 45, type: "mv-trust" }
};

/* Circular mean: hue is an angle, not a number line. Averaging 350
   and 10 naively gives 180 (teal) instead of the correct 0 (red). */
function hueVectorAverage(hues) {
    let x = 0, y = 0;
    hues.forEach(h => {
        const r = h * Math.PI / 180;
        x += Math.cos(r); y += Math.sin(r);
    });
    const deg = Math.atan2(y / hues.length, x / hues.length) * 180 / Math.PI;
    return (deg + 360) % 360;
}

/* Keep a hue +/-spread window from ever going negative or past 360:
   clamp at the boundary rather than wrapping, so it can be handed
   straight to Engine's existing (unwrapped) brandHue/accentHue math
   without touching that tested code path. */
function hueRangeSafe(h, spread) {
    const lo = h - spread, hi = h + spread;
    if (lo < 0) return [0, Math.min(359, h + spread)];
    if (hi > 360) return [Math.max(0, h - spread), 359];
    return [Math.round(lo), Math.round(hi)];
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* Turns 1-4 matched lexicon keywords into a synthetic archetype -
   the exact shape Engine.ARCHETYPES entries take - so it flows
   through generatePalette's existing hue/contrast/law logic
   unchanged. The first keyword (ranked most-relevant by the
   assistant) decides the typographic personality, so "luxurious"
   and "nostalgic" - both were one generic "craft" bucket before -
   now genuinely diverge. */
function resolveMood(keywords) {
    const matched = (keywords || [])
        .map(k => MOOD_LEXICON[String(k).toLowerCase().trim()])
        .filter(Boolean);
    if (!matched.length) return null;

    const h = hueVectorAverage(matched.map(m => m.h));
    const s = Math.round(matched.reduce((a, m) => a + m.s, 0) / matched.length);
    const l = Math.round(matched.reduce((a, m) => a + m.l, 0) / matched.length);
    const typeTag = matched[0].type;

    /* Warm amber is the Bible's habitual accent pop against a
       cool/neutral brand (six of its ten archetypes use it); flip
       to a cool complementary pop when the brand itself already
       lives in that amber band. */
    const inAmberBand = h >= 25 && h <= 55;
    const accentHue = inAmberBand
        ? [Math.round((h + 165) % 360), Math.round((h + 195) % 360)]
        : [30, 50];

    let dominant = "default";
    if (l < 25) dominant = "dark";
    else if (h >= 30 && h <= 50 && s >= 25 && s <= 60 && l >= 82) dominant = "cream";

    return {
        label: "Custom mood",
        signal: `Mood-driven brief: ${keywords.join(", ")}.`,
        brandHue: hueRangeSafe(h, 10),
        brandSat: [clamp(s - 8, 8, 100), clamp(s + 8, 8, 100)],
        brandLight: [clamp(l - 6, 6, 94), clamp(l + 6, 6, 94)],
        accentHue,
        dominant,
        mood: typeTag
    };
}

window.Mood = { MOOD_LEXICON, resolveMood, hueVectorAverage };
