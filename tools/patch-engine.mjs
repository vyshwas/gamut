import fs from 'node:fs';

let content = fs.readFileSync('js/engine.js', 'utf8');

const oldFixPalette = `function fixPalette(hexes) {
    const issues = diagnosePalette(hexes);
    const items = hexes.map(hex => ({ hex, hsl: hexToHsl(hex), note: null }));

    /* Assign roles: lightest becomes Dominant, darkest becomes Ink,
       most saturated of the rest becomes Brand, next becomes Accent.
       Every input color gets an explicit fate in \`mapping\`; nothing
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
        : \`Softened into the Dominant canvas \${dominant.hex}.\`);
    if (!ink.forged) fate.set(inkSource.hex, "Kept as Ink, the dark anchor.");
    if (!brandSynth) {
        fate.set(brandOrig, brandHex === brandOrig
            ? "Kept as Brand, the lead voice."
            : \`Adjusted to \${brandHex} as Brand.\`);
    }
    if (!accentSynth && accentOrig) {
        fate.set(accentOrig, accentHex === accentOrig
            ? "Kept as Accent."
            : \`Muted to \${accentHex} as Accent (Law 2).\`);
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
        build(dominant.hex, "Dominant", 60, "The silent majority. Canvas and space."),
        build(brandHex, "Brand", 30, "The recognizable voice. Used for large moments."),
        build(accentHex, "Accent", 10, "The primary action. Used exclusively for buttons and focus."),
        build(inkHex, "Ink", 8, "The dark anchor. Body text and heavy elements.")
    ];
    if (swatches[2].name === swatches[1].name) swatches[2].name = "Soft " + swatches[2].name;`;

const newFixPalette = `function fixPalette(hexes, options = { strategy: 'balanced' }) {
    const issues = diagnosePalette(hexes);
    const items = hexes.map(hex => ({ hex, hsl: hexToHsl(hex), note: null }));
    
    const strat = options.strategy;
    const inkThresh = strat === 'preserve' ? 20 : strat === 'maximize' ? 40 : 30;
    const muteThresh = strat === 'preserve' ? 25 : strat === 'maximize' ? 50 : 35;
    const shoutSatThresh = strat === 'preserve' ? 55 : strat === 'maximize' ? 35 : 45;

    /* Assign roles: lightest becomes Dominant, darkest becomes Ink,
       most saturated of the rest becomes Brand, next becomes Accent.
       Every input color gets an explicit fate in \`mapping\`; nothing
       disappears silently. */
    const byLight = [...items].sort((a, b) => b.hsl.l - a.hsl.l);
    let dominant = byLight[0];
    let inkSource = byLight[byLight.length - 1];
    let middle = items.filter(i => i !== dominant && i !== inkSource);

    /* Law 1 fix: forge an anchor if none exists. The failed anchor
       candidate rejoins the pool and competes for Brand/Accent
       instead of being dropped. */
    let ink;
    if (inkSource.hsl.l > inkThresh) {
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
    let retired = middle.slice(2);
    
    if (strat === 'maximize') {
        // More aggressively retire colors if they clash with brand
        if (accent && Math.abs(accent.hsl.h - brand.hsl.h) < 20) {
            retired.push(accent);
            accent = null;
        }
    }

    /* No brand candidate: promote the dominant's hue at full power. */
    let brandSynth = false;
    if (!brand) {
        const h = dominant.hsl.h;
        brand = { hsl: { h, s: 78, l: 42 }, hex: hslToHex({ h, s: 78, l: 42 }) };
        brandSynth = true;
    }

    /* All muted fix: give the brand its voice back. */
    const brandOrig = brand.hex;
    if (brand.hsl.s < muteThresh) {
        brand = { hsl: { ...brand.hsl, s: 80 }, hex: hslToHex({ ...brand.hsl, s: 80 }), src: brand };
    }

    /* Law 2 fix: accent supports at 60-80% of the brand's saturation.
       Floored at 45 so muting never collapses into khaki. */
    let accentSynth = false;
    const accentOrig = accent ? accent.hex : null;
    if (accent) {
        const target = Math.max(45, Math.round(brand.hsl.s * (strat === 'preserve' ? 0.9 : strat === 'maximize' ? 0.5 : 0.7)));
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
    if (dominant.hsl.s > shoutSatThresh && dominant.hsl.l < 88 && dominant.hsl.l > 40) {
        const hsl = { h: dominant.hsl.h, s: 18, l: 94 };
        dominant = { hsl, hex: hslToHex(hsl), src: dominant };
    }

    /* Contrast pass. */
    const inkHex = ensureContrast(ink.hex, dominant.hex, 7);
    const brandHex = ensureContrast(brand.hex, dominant.hex, 3);
    const accentHex = ensureContrastVivid(accent.hex, dominant.hex, 3);

    /* Provenance: one line per input color. */
    const fate = new Map();
    const fateAction = new Map();
    const fateReason = new Map();
    
    fate.set(dominantOrig, dominant.hex === dominantOrig
        ? "Kept as Dominant, the canvas."
        : \`Softened into the Dominant canvas \${dominant.hex}.\`);
    fateAction.set(dominantOrig, dominant.hex === dominantOrig ? "kept" : "adjusted");
    fateReason.set(dominantOrig, dominant.hex === dominantOrig ? "" : "shout canvas");
        
    if (!ink.forged) {
        fate.set(inkSource.hex, "Kept as Ink, the dark anchor.");
        fateAction.set(inkSource.hex, inkHex === inkSource.hex ? "kept" : "adjusted");
        fateReason.set(inkSource.hex, inkHex === inkSource.hex ? "" : "contrast");
    }
    if (!brandSynth) {
        fate.set(brandOrig, brandHex === brandOrig
            ? "Kept as Brand, the lead voice."
            : \`Adjusted to \${brandHex} as Brand.\`);
        fateAction.set(brandOrig, brandHex === brandOrig ? "kept" : "adjusted");
        fateReason.set(brandOrig, brandHex === brandOrig ? "" : "contrast");
    }
    if (!accentSynth && accentOrig) {
        fate.set(accentOrig, accentHex === accentOrig
            ? "Kept as Accent."
            : \`Muted to \${accentHex} as Accent (Law 2).\`);
        fateAction.set(accentOrig, accentHex === accentOrig ? "kept" : "adjusted");
        fateReason.set(accentOrig, accentHex === accentOrig ? "" : "Law 2");
    }
    retired.forEach(r => {
        fate.set(r.hex, "Retired to keep two voices (Law 5).");
        fateAction.set(r.hex, "retired");
        fateReason.set(r.hex, "Law 5");
    });

    const mapping = hexes.map(hex => ({ 
        from: hex, 
        note: fate.get(hex) || "Retired to keep two voices (Law 5).",
        action: fateAction.get(hex) || "retired",
        reason: fateReason.get(hex) || "Law 5"
    }));
    if (ink.forged) mapping.push({ from: inkHex, note: "Forged: the dark anchor your palette was missing (Law 1).", action: "forged", reason: "Law 1" });
    if (accentSynth) mapping.push({ from: accentHex, note: "Synthesized: a supporting accent at 70% of the Brand's power.", action: "forged", reason: "synth" });

    const build = (hex, role, pct, job) => {
        const rgb = hexToRgb(hex);
        return { hex, rgb, hsl: rgbToHsl(rgb), cmyk: rgbToCmyk(rgb), name: nameColor(hex), role, pct, job, print: gamutRisk(hex) };
    };

    const swatches = [
        build(dominant.hex, "Dominant", 60, "The silent majority. Canvas and space."),
        build(brandHex, "Brand", 30, "The recognizable voice. Used for large moments."),
        build(accentHex, "Accent", 10, "The primary action. Used exclusively for buttons and focus."),
        build(inkHex, "Ink", 8, "The dark anchor. Body text and heavy elements.")
    ];
    if (swatches[2].name === swatches[1].name) swatches[2].name = "Soft " + swatches[2].name;
    
    // Wire up mapping to swatches
    mapping.forEach(m => {
        if (m.action !== "retired" && m.action !== "forged") {
            if (m.from === dominantOrig) m.swatch = swatches[0];
            else if (m.from === brandOrig) m.swatch = swatches[1];
            else if (m.from === accentOrig) m.swatch = swatches[2];
            else if (!ink.forged && m.from === inkSource.hex) m.swatch = swatches[3];
        }
    });`;

if (content.includes(oldFixPalette)) {
    content = content.replace(oldFixPalette, newFixPalette);
    fs.writeFileSync('js/engine.js', content);
    console.log("engine.js patched successfully.");
} else {
    console.log("Could not find the target code in engine.js.");
    fs.writeFileSync('tools/debug-engine-missing.txt', "Missing old block");
}
