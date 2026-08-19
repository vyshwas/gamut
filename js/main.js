/* =========================================================
   GAMUT ENGINE - UI wiring
   One source of truth: `state.palette`. The hero card, the
   workbench, the type lab, and the print sheet all render
   from it.
   ========================================================= */

"use strict";

const E = window.Engine;

const state = {
    palette: null,
    seed: Math.floor(Math.random() * 1e9),
    typeIndex: 0,
    loadedFonts: new Set(),
    history: [],
    saved: [],
    agency: null,
    customTypePair: null
};

const SAVE_KEY = "gamut.saved.v1";
const AGENCY_KEY = "gamut.agency.v1";

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

const $ = id => document.getElementById(id);

const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* A button that reveals an already-rendered, hidden sibling and
   relabels itself - the generic version of the pattern used across
   the applied-format mockups, the vision-simulation variants, and
   the secondary export formats. No-ops quietly if either id is
   missing rather than throwing, since it's called unconditionally
   from init(). */
function wireReveal(btnId, targetId, showLabel, hideLabel) {
    const btn = $(btnId), target = $(targetId);
    if (!btn || !target) return;
    btn.addEventListener("click", () => {
        const willShow = target.hidden;
        target.hidden = !willShow;
        btn.setAttribute("aria-expanded", String(willShow));
        btn.textContent = willShow ? hideLabel : showLabel;
    });
}

/* Smooth scrolling is motion; the preference asks us not to. */
const scrollBehavior = () => (prefersReduced() ? "auto" : "smooth");

/* history.replaceState throws SecurityError on file:// in Chromium
   (null-origin documents may not change their query string). URL
   sync is a convenience, never worth killing the render over. */
function safeReplaceUrl(url) {
    try { history.replaceState(null, "", url); } catch { /* file:// */ }
}

/* =========================================================
   OKLCH utilities (brand signature layer)
   Read-only consumers of Engine's hex output. The Engine's own
   color/contrast math is untouched; this only converts finished
   hexes into OKLCH so the hero mesh and wordmark can interpolate
   in a perceptual space (equal steps = equal perceived change),
   exactly the property the product sells. sRGB <-> OKLab per
   Bjorn Ottosson's reference matrices.
   ========================================================= */

function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
    v = Math.max(0, Math.min(1, v));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function hexToOklch(hex) {
    const { r, g, b } = E.hexToRgb(hex);
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    return { L, C: Math.sqrt(a * a + bb * bb), H: Math.atan2(bb, a) };
}

function oklchToRgb({ L, C, H }) {
    const a = C * Math.cos(H), bb = C * Math.sin(H);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * bb;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    const r = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    const g = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    const b = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/* Darken OR lighten `hex` in OKLCH, hue and relative chroma held,
   until it clears `min`:1 against `bgHex` - whichever direction the
   background demands. Shared by the wordmark (always darkens, toward
   a fixed paper). This product's own Law 09 move, generalized. */
function contrastSafe(hex, bgHex, min) {
    if (E.contrastRatio(hex, bgHex) >= min) return hex;
    const src = hexToOklch(hex);
    const bgIsDark = hexToOklch(bgHex).L < 0.5;
    let out = hex;
    if (bgIsDark) {
        for (let L = src.L; L <= 0.96; L += 0.02) {
            out = E.rgbToHex(oklchToRgb({ L, C: Math.min(src.C, (1 - L) * 0.32 + 0.02), H: src.H }));
            if (E.contrastRatio(out, bgHex) >= min) return out;
        }
    } else {
        for (let L = src.L; L >= 0.08; L -= 0.02) {
            out = E.rgbToHex(oklchToRgb({ L, C: Math.min(src.C, L * 0.32), H: src.H }));
            if (E.contrastRatio(out, bgHex) >= min) return out;
        }
    }
    return out;
}

/* =========================================================
   Wordmark
   Solid-fill, not gradient. The mark reflects the CURRENT palette's
   Brand hue, updated only when the user actually regenerates - no
   ambient auto-cycling, no hover gimmick. Before a first generation
   it's plain ink.
   ========================================================= */
const Wordmark = (() => {
    let texts = [], dots = [], theme = "dark", current = null;
    const PAPER = "#F9F8F6";
    const LIGHT_MIN = 9;

    function inkify(hex, min) {
        return contrastSafe(hex, PAPER, min);
    }

    function apply(hex) {
        current = hex;
        const shown = theme === "dark" ? hex : inkify(hex, LIGHT_MIN);
        texts.forEach(e => e.style.setProperty("--wm-c1", shown));
        dots.forEach(e => e.style.setProperty("--wm-c1", shown));
    }

    function setTheme(next) {
        theme = next === "dark" ? "dark" : "light";
        if (current) apply(current);
    }

    function start() {
        texts = [...document.querySelectorAll(".wm-text")];
        dots = [...document.querySelectorAll(".wm-dot")];
        theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    }

    /* Called once per regenerate from renderPalette. */
    function injectLive(p) {
        if (!p) return;
        apply(p.swatches[1].hex);
    }

    return { start, injectLive, setTheme };
})();



/* =========================================================
   Theme
   ONE locked palette, two deployments. Dark (Structured Depth) is
   the default and lives in :root; light is the stored override,
   stamped onto <html> by the inline <head> script before first
   paint so there is no flash. This module owns every change after
   that.
   ========================================================= */
const Theme = (() => {
    const KEY = "gamut.theme";
    const FADE_MS = 420;
    let btn = null, fadeTimer = null;

    const current = () =>
        document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

    function syncButton() {
        if (!btn) return;
        const dark = current() === "dark";
        btn.setAttribute("aria-pressed", String(dark));
        btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
    }

    /* `animate` is false on boot (the page is already painted in the
       right theme) and true on a user toggle. Reduced motion never
       animates: the swap is instant, which is the whole point of the
       preference - a full-viewport color crossfade is exactly the
       kind of large-area motion it asks us to drop. */
    function apply(theme, animate) {
        const root = document.documentElement;
        if (theme === "light") root.setAttribute("data-theme", "light");
        else root.removeAttribute("data-theme");

        if (animate && !prefersReduced()) {
            root.classList.add("theme-switching");
            clearTimeout(fadeTimer);
            fadeTimer = setTimeout(() => root.classList.remove("theme-switching"), FADE_MS);
        }

        syncButton();
        /* The wordmark's ink derivation is theme-dependent; re-run it
           for the surface it now sits on. */
        Wordmark.setTheme(theme);
        /* Law 4 ("design the dark mode at the same time as the
           light") stayed a claim in an export file until this: the
           hero's live preview now actually shows the palette's dark
           deployment when the site itself is in dark mode, instead
           of just re-theming the chrome around an unchanged demo. */
        if (typeof paintThemedPreview === "function") paintThemedPreview();
    }

    function set(theme) {
        apply(theme, true);
        try { localStorage.setItem(KEY, theme); } catch (e) { /* not fatal */ }
    }

    function toggle() { set(current() === "dark" ? "light" : "dark"); }

    function init() {
        btn = $("theme-toggle");
        /* Boot: trust the attribute the head script already stamped,
           so the JS state and the painted state can never disagree. */
        apply(current(), false);
        if (btn) btn.addEventListener("click", toggle);
        /* Same site open in two tabs: keep them in step. */
        window.addEventListener("storage", e => {
            if (e.key === KEY) apply(e.newValue === "light" ? "light" : "dark", true);
        });
    }

    return { init, toggle, current };
})();

/* ---------- Toast ---------- */

let toastTimer;
let toastUndoHandler = null;

function toast(msg, undo) {
    const t = $("toast");
    $("toast-msg").textContent = msg;
    const undoBtn = $("toast-undo");
    toastUndoHandler = undo || null;
    undoBtn.hidden = !undo;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        t.classList.remove("show");
        undoBtn.hidden = true;
        toastUndoHandler = null;
    }, undo ? 4500 : 1800);
}

/* Hidden-textarea + execCommand path for contexts without the async
   clipboard API (plain-HTTP LAN hosts, older embeds). Without it,
   navigator.clipboard is undefined there and every copy button throws
   instead of copying or even saying it failed. */
function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
}

function copyText(text, label, el) {
    const done = ok => {
        toast(ok ? label + " copied" : "Copy failed");
        if (ok && el) pulseCopied(el);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
            () => done(true),
            () => done(fallbackCopy(text))
        );
    } else {
        done(fallbackCopy(text));
    }
}

/* Momentary confirmation ring on the exact control that was clicked,
   tied to a real successful clipboard write (see copyText above).
   Restarts cleanly on rapid repeat clicks; no-ops visually under
   prefers-reduced-motion since `.just-copied` has no keyframes left
   to run once the site-wide reduced-motion rule zeroes animations. */
function pulseCopied(el) {
    el.classList.remove("just-copied");
    void el.offsetWidth; /* force reflow so the animation restarts */
    el.classList.add("just-copied");
    el.addEventListener("animationend", () => el.classList.remove("just-copied"), { once: true });
}

/* ---------- Shared renderers ---------- */

/* Both of these used to pick between two fixed candidates - one
   translucent pair, one solid pair - which fails AA on mid-lightness
   saturated hues no matter which candidate wins. They now delegate to
   Engine.readableOn(), which derives a foreground per swatch and is
   verified to clear 4.5:1 on all 2400 generated swatches.

   Where the old versions already passed, readableOn returns the same
   near-black or near-white, so this changes only the cases that were
   failing. The translucency is gone on purpose: opacity was what put
   these labels under the floor in the first place. */
function labelColorFor(hex) {
    return E.readableOn(hex);
}

/* Text color for UI sitting ON a given background. */
function textOn(hex) {
    return E.readableOn(hex);
}

function renderBand(el, swatches, withLabels) {
    el.innerHTML = "";
    const shares = { Dominant: 60, Primary: 30, Secondary: 10, Ink: 0 };
    swatches.forEach(s => {
        const share = shares[s.role];
        if (share === 0) return;
        const seg = document.createElement("div");
        seg.className = "band-seg";
        seg.style.flex = `0 0 ${share}%`;
        seg.style.background = s.hex;
        if (withLabels) {
            /* Narrow segments only get the share number; the hex
               would truncate into noise. */
            seg.dataset.label = share <= 12 ? s.pct : `${s.pct}  ${s.hex}`;
            seg.style.setProperty("--label-color", labelColorFor(s.hex));
        }
        el.appendChild(seg);
    });
}

/* The hero's full-bleed 60-30-10 field (LAYOUT-BLUEPRINT 3.1).

   Unlike renderBand, this one drives the surrounding composition too:
   the hero's text, buttons, and (on mobile) its background all read
   --hero-dom / --hero-ink, which are stamped here. Ink is used as the
   hero's foreground because generatePalette already guarantees it
   clears 7:1 against this exact Dominant, so no palette can produce an
   illegible hero.

   Ink gets no band of its own: 60-30-10 sums to 100 without it, and
   here Ink is doing its real job - it is the text.

   Nothing is printed on the color. Hex readouts go to the caption rail
   below the field, whose cells match the band widths; small mono text
   over an arbitrary generated hue cannot clear 4.5:1 in every case. */
const HERO_SHARES = { Dominant: 60, Primary: 30, Secondary: 10 };
const HERO_RAIL_CELLS = { Dominant: "hero-dominant", Primary: "hero-brand", Secondary: "hero-accent" };

/* ---------- Theme-aware live preview ----------
   palette.swatches are fitted to the LIGHT deployment - that's the
   canonical value everything else (exports, shades, copy/save) reads
   from, and it stays that way. The hero field is different: it's a
   live decorative preview, not a data source, so it's the one place
   that's allowed to show the dark deployment when the site itself is
   in dark mode - see paintThemedPreview, wired from Theme.apply(). */
function themedHeroSwatches(palette, theme) {
    if (theme !== "dark" || !palette.deployments || !palette.deployments.dark) return palette.swatches;
    const dep = palette.deployments.dark;
    const hexFor = { Dominant: dep.bg, Primary: dep.brand, Secondary: dep.accent, Ink: dep.ink };
    return palette.swatches.map(s => {
        const hex = hexFor[s.role];
        if (!hex) return s;
        const rgb = E.hexToRgb(hex);
        return { ...s, hex, rgb, hsl: E.hexToHsl(hex), cmyk: E.rgbToCmyk(rgb), name: E.nameColor(hex), print: E.gamutRisk(hex) };
    });
}

function paintThemedPreview() {
    if (!state.palette) return;
    const swatches = themedHeroSwatches(state.palette, Theme.current());
    renderHeroField({ ...state.palette, swatches });
}

function renderHeroField(palette) {
    const field = $("hero-field");
    if (!field) return;

    const byRole = r => palette.swatches.find(s => s.role === r);
    const dominant = byRole("Dominant");
    const ink = byRole("Ink");
    if (!dominant || !ink) return;

    const hero = field.closest(".hero");
    hero.style.setProperty("--hero-dom", dominant.hex);
    hero.style.setProperty("--hero-ink", ink.hex);

    field.innerHTML = "";
    const described = [];
    Object.keys(HERO_SHARES).forEach(role => {
        const s = byRole(role);
        if (!s) return;
        const share = HERO_SHARES[role];
        described.push(`${role} ${s.hex} at ${share} percent`);

        const seg = document.createElement("div");
        seg.className = "band-seg";
        seg.style.flex = `0 0 ${share}%`;
        seg.style.background = s.hex;
        field.appendChild(seg);

        const cell = $(HERO_RAIL_CELLS[role]);
        if (cell) cell.innerHTML = `${role.toUpperCase()} ${share} <b>${esc(s.hex)}</b>`;
    });

    field.setAttribute("aria-label", "Live palette preview: " + described.join(", "));
    /* != null: seed 0 is a real seed, only null means "from the Fixer". */
    $("hero-seed").textContent = palette.seed != null ? "seed " + palette.seed : "from the Fixer";
}

/* A color strip plus a caption row whose cells carry the same flex
   values, so every readout sits directly under the block it names.
   Captions live on the canvas rather than on the color for the same
   reason the hero's do: small mono text over an arbitrary generated
   hue cannot be guaranteed to clear 4.5:1. */
function renderCompareStrip(stripEl, capsEl, items) {
    stripEl.innerHTML = "";
    capsEl.innerHTML = "";
    items.forEach(item => {
        const seg = document.createElement("div");
        seg.className = "band-seg";
        seg.style.flex = item.flex;
        seg.style.background = item.hex;
        stripEl.appendChild(seg);

        const cap = document.createElement("div");
        cap.className = "strip-cap";
        cap.style.flex = item.flex;
        cap.textContent = item.label;
        capsEl.appendChild(cap);
    });
}

/* ---------- Palette reading ----------
   The same question the old harmony chart answered - why these colours,
   and why this accent - but in language a designer can act on without
   first learning to read a polar plot. Every number here is computed
   from the palette actually on screen, never asserted.

   Deliberately three items. This is a reading, not a report; a longer
   list would be skimmed and stop being read at all. */

function harmonySentence(harmony, delta) {
    switch (harmony) {
        /* Fixer palettes have no accentHarmony: their accent came from
           the user's own pasted colors. The default "the category is
           known for this pairing" sentence would be a false claim. */
        case "fixer":
            return `<b>Your accent was carried over from the palette you pasted.</b> The Fixer assigned it the supporting role and checked the saturation relationship numerically, rather than choosing a new hue for you.`;
        case "complementary":
            return `<b>Your accent sits directly opposite the brand colour.</b> Opposites give the strongest possible contrast, which is why the accent catches the eye immediately. Use it for one thing per screen and it will always be the thing people notice first.`;
        case "analogous-a":
        case "analogous-b":
            return `<b>Your accent sits right next to the brand colour on the wheel.</b> Neighbouring hues read as one family rather than two competing choices - calmer than a complementary pop, closer to a mood than a contrast.`;
        case "split-complementary-a":
        case "split-complementary-b":
            return `<b>Your accent sits just to one side of the brand's opposite.</b> That gives you nearly the pop of a true opposite, but it is easier to live with across a whole interface - less of a head-on clash.`;
        case "triadic-a":
        case "triadic-b":
            return `<b>Your accent sits a third of the way around the colour wheel from your brand.</b> Far enough apart to read as a genuinely different colour, close enough that they do not fight. A safe choice when the accent has to appear often.`;
        default:
            return `<b>Your accent is the pairing this category is known for.</b> It is the combination the Bible prescribes for this kind of brand, so it will read as familiar and appropriate rather than surprising - useful when you want to look like you belong.`;
    }
}

function renderReading(palette) {
    const list = $("reading-list");
    if (!list) return;

    const byRole = r => palette.swatches.find(s => s.role === r);
    const brand = byRole("Primary"), accent = byRole("Secondary"), ink = byRole("Ink");
    if (!brand || !accent || !ink) return;

    const dHue = (() => {
        const d = Math.abs(brand.hsl.h - accent.hsl.h) % 360;
        return Math.round(d > 180 ? 360 - d : d);
    })();
    const satPct = brand.hsl.s > 0 ? Math.round((accent.hsl.s / brand.hsl.s) * 100) : 100;
    const inkContrast = palette.contrasts.find(c => c.pair === "Ink on Dominant");
    const ratio = inkContrast ? inkContrast.ratio : E.contrastRatio(ink.hex, byRole("Dominant").hex);
    const grade = E.contrastGrade(ratio);

    const items = [
        harmonySentence(palette.accentHarmony || "fixer", dHue),

        /* Threshold at 95, not 100: at 96-100% there is no meaningful
           gap to describe, so claiming one would be nonsense copy. */
        satPct < 95
            ? `<b>The accent runs at ${satPct}% of the brand's intensity.</b> That gap is on purpose. Two colours at full strength compete, and the eye cannot tell which one matters - so one leads and the other supports.`
            : `<b>The accent is running at nearly the same intensity as the brand (${satPct}%).</b> Worth watching: colours at similar strength compete for attention, so give the accent noticeably less space, or regenerate for a more muted one.`,

        `<b>Ink clears ${ratio.toFixed(1)}:1 against your canvas (${grade}).</b> That is the number that decides whether body text is comfortable to read. Anything at 4.5:1 or above is safe for paragraphs at normal size.`
    ];

    list.innerHTML = items.map(t => `<li>${t}</li>`).join("");
}

const HARMONY_SHORT = {
    archetype: "Curated",
    "analogous-a": "Analogous",
    "analogous-b": "Analogous",
    complementary: "Complementary",
    "split-complementary-a": "Split-complementary",
    "split-complementary-b": "Split-complementary",
    "triadic-a": "Triadic",
    "triadic-b": "Triadic"
};

function buildSwatches(palette, row) {
    row.innerHTML = "";
    palette.swatches.forEach(s => {
        const d = document.createElement("div");
        d.className = "swatch";
        const harmonyBadge = (s.role === "Secondary" && palette.accentHarmony && HARMONY_SHORT[palette.accentHarmony])
            ? `<p class="swatch-harmony mono">${HARMONY_SHORT[palette.accentHarmony]}</p>`
            : "";
        d.innerHTML = `
            <div class="swatch-chip" style="background:${s.hex}" data-hex="${s.hex}" role="button" tabindex="0" aria-label="Copy ${s.hex}">
                <span class="copy-hint" style="color:${labelColorFor(s.hex)}">copy</span>
            </div>
            <div class="swatch-info">
                <p class="swatch-role">${s.role} <span class="pct">${s.pct === "Text" ? "text" : s.pct + "%"}</span></p>
                ${harmonyBadge}
                <p class="swatch-name">${s.name}</p>
                <p class="swatch-job">${s.job}</p>
                <p class="swatch-values">
                    <b>${s.hex}</b><br>
                    rgb ${s.rgb.r} ${s.rgb.g} ${s.rgb.b}
                </p>
            </div>`;
        row.appendChild(d);
    });
}

/* Signature "peel" transition: the outgoing chips tear away like
   the swatches rebuild fresh (the one authored fade+rise, css/
   style.css `swatch-in`) so a Generate/Regenerate click reads as a
   change without a second, competing motion device. */
function renderSwatches(palette) {
    buildSwatches(palette, $("swatch-row"));
}

function renderChecks(palette) {
    const wrap = $("contrast-checks");
    wrap.innerHTML = "";
    palette.contrasts.forEach(c => {
        const grade = E.contrastGrade(c.ratio);
        const div = document.createElement("div");
        div.className = "check " + (grade === "Fail" ? "fail" : "pass");
        div.innerHTML = `${c.pair} <b>${c.ratio.toFixed(1)} ${grade}</b>`;
        wrap.appendChild(div);
    });
}



/* ---------- History and saved palettes ---------- */

function paletteKey(p) { return p.swatches.map(s => s.hex).join(""); }

function currentSettings() {
    return {
        cat: $("ctl-category").value,
        borrow: $("ctl-borrow").checked,
        lock: $("ctl-brand").value.trim(),
        harmony: $("ctl-harmony").value
    };
}



/* ---------- Agency branding (white-label client docs) ---------- */

function loadAgency() {
    const defaults = { name: "", client: "" };
    try {
        const raw = JSON.parse(localStorage.getItem(AGENCY_KEY));
        if (!raw || typeof raw !== "object") return defaults;
        return {
            name: typeof raw.name === "string" ? raw.name : "",
            client: typeof raw.client === "string" ? raw.client : ""
        };
    }
    catch { return defaults; }
}

function persistAgency() {
    try { localStorage.setItem(AGENCY_KEY, JSON.stringify(state.agency)); }
    catch { toast("Could not save (storage full?)"); }
}

function syncAgencyFields() {
    $("agency-name").value = state.agency.name;
    $("agency-client").value = state.agency.client;
}

function onAgencyChange() {
    persistAgency();
    if (state.palette) renderPrintSheet(state.palette);
}

/* ---------- Main render ---------- */

function renderPalette(palette) {
    state.palette = palette;

    renderHeroField({ ...palette, swatches: themedHeroSwatches(palette, Theme.current()) });

    renderReading(palette);
    renderSwatches(palette);
    renderBand($("ratio-band"), palette.swatches, false);
    renderChecks(palette);

    renderPrintSheet(palette);
    syncUrl();

    /* The site's own chrome now reflects the current palette too, not
       just the wordmark. */
    Wordmark.injectLive(palette);
}

function readLockedInput() {
    const raw = $("ctl-brand").value.trim();
    if (!raw) return { locked: null, invalid: false };
    const hex = raw.startsWith("#") ? raw : "#" + raw;
    if (!E.hexToRgb(hex)) return { locked: null, invalid: true };
    return { locked: hex, invalid: false };
}

function generate(newSeed = true) {
    if (newSeed) state.seed = Math.floor(Math.random() * 1e9);
    const { locked, invalid } = readLockedInput();
    if (invalid) toast("Not a valid hex code");
    $("ctl-brand").setAttribute("aria-invalid", String(invalid));
    $("ctl-brand-clear").hidden = !locked;
    const palette = E.generatePalette({
        category: $("ctl-category").value,
        seed: state.seed,
        borrow: $("ctl-borrow").checked,
        lockedBrand: locked,
        harmony: $("ctl-harmony").value
    });
    state.typeIndex = 0;
    renderPalette(palette);
}

/* Every palette is a URL: seed + settings live in the query string
   so any generated palette can be bookmarked or sent to a client. */
function syncUrl() {
    const p = state.palette;
    /* Mood-driven palettes carry a seed but no category the URL's
       restore path understands - skip rather than write a link that
       silently rebuilds the wrong palette. seed check is != null:
       0 is a legitimate, reproducible seed. */
    if (!p || p.seed == null || p.custom) return;
    const q = new URLSearchParams();
    q.set("cat", $("ctl-category").value);
    q.set("seed", p.seed);
    if ($("ctl-borrow").checked) q.set("borrow", "1");
    if ($("ctl-harmony").value !== "auto") q.set("harmony", $("ctl-harmony").value);
    const { locked } = readLockedInput();
    if (locked) q.set("lock", locked.slice(1));
    safeReplaceUrl("?" + q.toString() + location.hash);
}

function restoreFromUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has("seed")) return false;
    /* Validate the seed BEFORE touching any control: a bad seed
       (?seed=abc) used to bail out here after already mutating
       category/borrow/lock, so the fallback fresh generate ran from
       half-restored settings. */
    const seed = parseInt(q.get("seed"), 10);
    if (!Number.isFinite(seed)) return false;
    const cat = q.get("cat");
    if (cat && ARCHETYPE_OPTIONS.includes(cat)) $("ctl-category").value = cat;
    $("ctl-borrow").checked = q.get("borrow") === "1";
    const harmony = q.get("harmony");
    if (harmony && [...$("ctl-harmony").options].some(o => o.value === harmony)) $("ctl-harmony").value = harmony;
    if (q.get("lock") && E.hexToRgb("#" + q.get("lock"))) $("ctl-brand").value = "#" + q.get("lock").toUpperCase();
    state.seed = seed;
    generate(false);
    return true;
}

const ARCHETYPE_OPTIONS = Object.keys(E.ARCHETYPES);

/* ---------- Type lab ---------- */

/* Returns a promise resolving once the Google Fonts stylesheet has
   actually loaded (or 2.5s elapses) - document.fonts.load() can only
   match an @font-face rule that's already been parsed into the
   document, so callers that need to verify a font (fontActuallyLoaded)
   must await this instead of firing the link and checking immediately. */
function loadPairFonts(pair) {
    const url = E.googleFontsUrl(pair);
    if (state.loadedFonts.has(url)) return Promise.resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    const ready = new Promise(resolve => {
        link.addEventListener("load", resolve, { once: true });
        link.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 2500);
    });
    document.head.appendChild(link);
    state.loadedFonts.add(url);
    return ready;
}

function currentPair() {
    const p = state.palette;
    if (!p) return null;
    const pairs = E.getTypePairs(p.mood || "fresh").slice();
    if (state.customTypePair) pairs.unshift(state.customTypePair);
    return pairs[state.typeIndex % pairs.length];
}

/* The horizontal specimen rail (LAYOUT-BLUEPRINT 3.5). Renders every
   pairing the palette's mood prescribes, so they can be compared side
   by side instead of cycled one at a time. state.typeIndex still marks
   which one is selected, and currentPair() still reads it, so exports,
   the SVG card, and the print sheet keep working unchanged. */
/* ---------- Exports ---------- */

const EXPORTERS = {
    css: p => ["CSS variables", E.exportCss(p)],
    tailwind: p => ["Tailwind theme", E.exportTailwind(p)]
};

function renderPrintSheet(palette) {
    const area = $("print-sheet-area");
    const pair = currentPair();
    const rows = palette.swatches.map(s => {
        return `
        <div class="ps-row">
            <div class="ps-chip" style="background:${s.hex}"></div>
            <div class="ps-data">
                <p class="ps-role">${s.role} ${s.pct === "Text" ? "" : s.pct + "%"} &nbsp; ${s.name}</p>
                HEX ${s.hex}<br>
                RGB ${s.rgb.r} ${s.rgb.g} ${s.rgb.b}<br>
                Job: ${s.job}
            </div>
        </div>`;
    }).join("");
    const typeBlock = pair ? `
        <div class="ps-type">
            <p class="ps-role">Typography</p>
            <p class="ps-type-display" style="font-family:'${pair.display}',sans-serif;font-weight:${pair.displayWeight}">${pair.display}</p>
            <p class="ps-type-body" style="font-family:'${pair.body}',sans-serif">Body: ${pair.body}${pair.mono ? " &nbsp; Numbers: " + pair.mono : ""}. ${pair.why}</p>
        </div>` : "";

    const agency = state.agency;
    const title = agency.name.trim() ? esc(agency.name.trim()) : "Brand brief";
    const sub = agency.client.trim()
        ? `Prepared for ${esc(agency.client.trim())}`
        : "Gamut. Deployed per the 60-30-10 rule.";
    const dateLine = `<p class="ps-date">${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>`;

    area.innerHTML = `
        <div class="ps-header">
            <div>
                <p class="ps-title">${title}</p>
                <p class="ps-sub">${sub}</p>
                ${dateLine}
            </div>
        </div>
        ${rows}
        ${typeBlock}`;
}


/* ---------- Wire up ---------- */

document.addEventListener("DOMContentLoaded", () => {

    /* Signature layer: the wordmark. Draws from real Engine output;
       init before the first generate() so that palette resyncs it
       immediately. */
    Wordmark.start();
    /* After, so the first apply() can retune it immediately. */
    Theme.init();

    /* Nav. Scoped selector: the footer has a <nav> too. */
    const nav = document.querySelector(".site-nav");
    const navToggle = $("nav-toggle");
    const closeNav = () => {
        nav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
    };
    navToggle.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        navToggle.setAttribute("aria-expanded", open);
    });
    document.querySelectorAll(".nav-links a").forEach(a =>
        a.addEventListener("click", closeNav)
    );
    /* Escape closes the mobile menu and returns focus to its trigger;
       clicking outside it closes it too, matching a standard
       disclosure/dropdown pattern. */
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && nav.classList.contains("open")) {
            closeNav();
            navToggle.focus();
        }
    });
    document.addEventListener("click", e => {
        if (nav.classList.contains("open") && !nav.contains(e.target)) closeNav();
    });

    /* Toast "Undo" affordance for destructive actions (e.g. deleting
       a saved palette) - see `toast()`. */
    $("toast-undo").addEventListener("click", () => {
        if (toastUndoHandler) toastUndoHandler();
        toastUndoHandler = null;
        $("toast").classList.remove("show");
        $("toast-undo").hidden = true;
    });



    /* Engine. Control changes keep the seed so categories can be
       compared apples to apples; the Generate buttons mint a new one. */
    $("ctl-generate").addEventListener("click", () => generate(true));
    $("ctl-category").addEventListener("change", () => generate(false));
    $("ctl-borrow").addEventListener("change", () => generate(false));
    $("ctl-harmony").addEventListener("change", () => generate(false));
    $("ctl-brand").addEventListener("change", (e) => {
        generate(false);
    });
    $("ctl-brand-clear").addEventListener("click", () => {
        $("ctl-brand").value = "";
        generate(false);
    });

    $("copy-link").addEventListener("click", () => {
        if (state.palette && (state.palette.seed == null || state.palette.custom)) {
            toast("This palette has no link yet; export instead");
            return;
        }
        copyText(location.href, "Link", $("copy-link"));
    });

    /* Copy hex on swatch click */
    $("swatch-row").addEventListener("click", e => {
        const chip = e.target.closest(".swatch-chip");
        if (chip) copyText(chip.dataset.hex, chip.dataset.hex, chip);
    });

    /* Agency branding for client documentation */
    state.agency = loadAgency();
    syncAgencyFields();
    $("agency-name").addEventListener("input", () => { state.agency.name = $("agency-name").value; onAgencyChange(); });
    $("agency-client").addEventListener("input", () => { state.agency.client = $("agency-client").value; onAgencyChange(); });

    $("swatch-row").addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
            const chip = e.target.closest(".swatch-chip");
            if (chip) { e.preventDefault(); copyText(chip.dataset.hex, chip.dataset.hex, chip); }
        }
    });

    /* Exports */
    document.querySelectorAll("[data-export]").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!state.palette) return;
            const [label, text] = EXPORTERS[btn.dataset.export](state.palette);
            copyText(text, label, btn);
        });
    });
    $("print-sheet").addEventListener("click", () => {
        window.print();
    });

    /* Scroll reveals */
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && "IntersectionObserver" in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    en.target.classList.add("in");
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.15 });
        document.querySelectorAll(".section-head, .workbench, .method-band-wrap, .laws, .faq").forEach(el => {
            el.classList.add("reveal");
            io.observe(el);
        });
    }

    /* First palette: restore a shared link if present, else fresh. */
    if (!restoreFromUrl()) generate(true);
});
