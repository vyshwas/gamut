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
    assistantResult: null
};

const SAVE_KEY = "gamut.saved.v1";
const AGENCY_KEY = "gamut.agency.v1";

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

const $ = id => document.getElementById(id);

const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/* =========================================================
   Wordmark
   Solid-fill, not gradient (DESIGN.md: The Product Is the Color
   Rule — the site's chrome carries at most one color event, and
   that's the hero's live swatch strip, not the nav logo). The mark
   still reflects the CURRENT palette's Brand hue, updated only when
   the user actually regenerates - no ambient auto-cycling, no
   hover gimmick. Before a first generation it's plain ink.
   ========================================================= */
const Wordmark = (() => {
    let texts = [], dots = [], theme = "light", current = null;
    const PAPER = "#F9F8F6";
    const LIGHT_MIN = 9;

    /* Engine output is tuned for a charcoal canvas - a lime, a cyan,
       a warm yellow all vanish on paper (1.0-1.3:1). Darken the
       sampled hue in OKLCH until it clears `min`:1 on paper; hue and
       relative chroma survive. This product's own Law 09 move. */
    function inkify(hex, min) {
        const src = hexToOklch(hex);
        let out = hex;
        for (let L = src.L; L >= 0.10; L -= 0.02) {
            out = E.rgbToHex(oklchToRgb({ L, C: Math.min(src.C, L * 0.32), H: src.H }));
            if (E.contrastRatio(out, PAPER) >= min) return out;
        }
        return out;
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
        theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
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
   ONE locked palette, two deployments. Light (warm paper) is the
   default and lives in :root; dark is the stored override, stamped
   onto <html> by the inline <head> script before first paint so
   there is no flash. This module owns every change after that.
   ========================================================= */
const Theme = (() => {
    const KEY = "gamut.theme";
    const FADE_MS = 420;
    let btn = null, fadeTimer = null;

    const current = () =>
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

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
        if (theme === "dark") root.setAttribute("data-theme", "dark");
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
            if (e.key === KEY) apply(e.newValue === "dark" ? "dark" : "light", true);
        });
    }

    return { init, toggle, current };
})();

/* ---------- Toast ---------- */

let toastTimer;
let toastUndoHandler = null;
/* `undo`, when passed, is a zero-arg callback that reverses the
   action just taken; the toast grows an "Undo" affordance and stays
   up longer so a destructive click (e.g. deleting a saved palette)
   is always recoverable without a blocking confirm() dialog. */
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
    const shares = { Dominant: 60, Brand: 30, Accent: 10, Ink: 0 };
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
const HERO_SHARES = { Dominant: 60, Brand: 30, Accent: 10 };
const HERO_RAIL_CELLS = { Dominant: "hero-dominant", Brand: "hero-brand", Accent: "hero-accent" };

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
    const brand = byRole("Brand"), accent = byRole("Accent"), ink = byRole("Ink");
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

function buildSwatches(palette, row) {
    row.innerHTML = "";
    palette.swatches.forEach(s => {
        const d = document.createElement("div");
        d.className = "swatch";
        const c = s.cmyk;
        const shift = s.print && s.print.risk !== "none"
            ? `<p class="swatch-print" title="Outside typical CMYK range. Heuristic estimate, not an ICC conversion.">print shift ${s.print.risk} &middot; safe <button class="safe-hex mono" data-hex="${s.print.safeHex}" type="button" aria-label="Copy press-safer alternate ${s.print.safeHex}">${s.print.safeHex}</button></p>`
            : "";
        d.innerHTML = `
            <div class="swatch-chip" style="background:${s.hex}" data-hex="${s.hex}" role="button" tabindex="0" aria-label="Copy ${s.hex}">
                <span class="copy-hint" style="color:${labelColorFor(s.hex)}">copy</span>
            </div>
            <div class="swatch-info">
                <p class="swatch-role">${s.role} <span class="pct">${s.pct === "Text" ? "text" : s.pct + "%"}</span></p>
                <p class="swatch-name">${s.name}</p>
                <p class="swatch-job">${s.job}</p>
                <p class="swatch-values">
                    <b>${s.hex}</b><br>
                    rgb ${s.rgb.r} ${s.rgb.g} ${s.rgb.b}<br>
                    cmyk ${c.c} ${c.m} ${c.y} ${c.k}
                </p>
                <button class="shades-btn mono" data-hex="${s.hex}" data-role="${s.role}" type="button">shades</button>
                ${shift}
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

/* Social formats, coloured from the same deployment the web mocks use.
   Every foreground is derived from the surface it sits on, so no
   generated palette can produce an unreadable mock. The accent appears
   exactly once per frame - it is the 10%, and showing it any larger
   here would contradict the band directly above. */
function renderSocial(frameEl, dep, pair) {
    if (!frameEl) return;
    frameEl.style.background = dep.bg;

    const head = frameEl.querySelector(".app-head");
    head.style.color = dep.ink;
    if (pair) head.style.fontFamily = `'${pair.display}', sans-serif`;

    const kicker = frameEl.querySelector(".app-kicker");
    if (kicker) kicker.style.color = dep.accent;

    frameEl.querySelectorAll(".app-mark").forEach(el => {
        el.style.color = dep.brand;
        if (pair) el.style.fontFamily = `'${pair.display}', sans-serif`;
    });

    const tag = frameEl.querySelector(".app-tag");
    if (tag) tag.style.color = dep.ink;

    const cta = frameEl.querySelector(".app-cta");
    if (cta) {
        cta.style.background = dep.brand;
        cta.style.color = textOn(dep.brand);
        if (pair) cta.style.fontFamily = `'${pair.display}', sans-serif`;
    }

    const rule = frameEl.querySelector(".app-rule");
    if (rule) rule.style.background = dep.ink + "33";
}

function renderDeployment(mockEl, dep) {
    mockEl.style.background = dep.bg;
    mockEl.querySelector(".mock-nav").style.borderBottomColor = dep.ink + "22";
    const brandEl = mockEl.querySelector(".mock-brand");
    brandEl.style.color = dep.brand;
    const menu = mockEl.querySelector(".mock-menu");
    menu.style.color = dep.ink;
    mockEl.querySelector(".mock-h").style.color = dep.ink;
    mockEl.querySelector(".mock-p").style.color = dep.ink;
    const btn = mockEl.querySelector(".mock-btn");
    btn.style.background = dep.brand;
    btn.style.color = textOn(dep.brand);
    const link = mockEl.querySelector(".mock-link");
    link.style.color = dep.accent;
    link.style.textDecorationColor = dep.accent;
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

/* ---------- Shades panel ---------- */

function openShades(hex, role) {
    const panel = $("shades-panel");
    const strip = $("shades-strip");
    $("shades-title").textContent = `${role} ${hex} scale`;
    strip.innerHTML = "";
    E.shadeScale(hex).forEach(step => {
        const seg = document.createElement("button");
        seg.className = "shade-seg";
        seg.type = "button";
        seg.style.background = step;
        seg.dataset.label = step;
        seg.style.setProperty("--label-color", labelColorFor(step));
        seg.setAttribute("aria-label", "Copy " + step);
        seg.addEventListener("click", () => copyText(step, step, seg));
        strip.appendChild(seg);
    });
    panel.hidden = false;
}

/* ---------- History and saved palettes ---------- */

function paletteKey(p) { return p.swatches.map(s => s.hex).join(""); }

function currentSettings() {
    return {
        cat: $("ctl-category").value,
        borrow: $("ctl-borrow").checked,
        lock: $("ctl-brand").value.trim()
    };
}

function miniStrip(palette, onClick) {
    const strip = document.createElement("button");
    strip.className = "mini-strip";
    strip.type = "button";
    const names = palette.swatches.map(s => s.name).join(" / ");
    strip.title = names;
    strip.setAttribute("aria-label", "Load palette: " + names);
    const shares = [60, 30, 10, 8];
    palette.swatches.forEach((s, i) => {
        const seg = document.createElement("span");
        seg.style.flex = `0 0 ${shares[i] / 1.08}%`;
        seg.style.background = s.hex;
        strip.appendChild(seg);
    });
    strip.addEventListener("click", onClick);
    return strip;
}

/* Restoring bypasses the generator: the stored palette renders
   exactly as it was, whether it came from a seed or the Fixer. */
function restorePalette(entry) {
    $("ctl-category").value = entry.settings.cat;
    $("ctl-borrow").checked = entry.settings.borrow;
    $("ctl-brand").value = entry.settings.lock;
    $("ctl-brand-clear").hidden = !entry.settings.lock;
    /* != null, not truthiness: 0 is a real seed. */
    if (entry.palette.seed != null) state.seed = entry.palette.seed;
    else safeReplaceUrl(location.pathname + location.hash);
    state.typeIndex = 0;
    renderPalette(entry.palette);
}

function pushHistory(palette) {
    const key = paletteKey(palette);
    if (state.history[0] && state.history[0].key === key) return;
    state.history = state.history.filter(h => h.key !== key);
    state.history.unshift({ key, palette, settings: currentSettings() });
    if (state.history.length > 12) state.history.length = 12;
    renderHistory();
}

function renderHistory() {
    const row = $("history-row");
    row.innerHTML = "";
    /* Skip the first entry: it is what's on screen. */
    state.history.slice(1).forEach(entry => {
        row.appendChild(miniStrip(entry.palette, () => restorePalette(entry)));
    });
    $("history-block").hidden = state.history.length < 2;
}

/* A saved entry has to be renderable end-to-end (mini strip AND a
   later full restore), or one corrupt/legacy row in localStorage
   throws inside DOMContentLoaded and takes the whole boot down with
   it - dead buttons, no palette. Shape-check each entry, not just
   the JSON parse. */
function isValidSavedEntry(e) {
    return !!(e && e.palette
        && Array.isArray(e.palette.swatches)
        && e.palette.swatches.length === 4
        && e.palette.swatches.every(s => s && typeof s.hex === "string" && E.hexToRgb(s.hex))
        && e.palette.deployments && e.palette.deployments.light && e.palette.deployments.dark
        && Array.isArray(e.palette.contrasts)
        && e.settings && typeof e.settings.cat === "string");
}

function loadSavedList() {
    try {
        const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
        return Array.isArray(raw) ? raw.filter(isValidSavedEntry) : [];
    }
    catch { return []; }
}

function persistSaved() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.saved)); }
    catch { toast("Could not save (storage full?)"); }
}

function toggleSave() {
    if (!state.palette) return;
    const key = paletteKey(state.palette);
    const at = state.saved.findIndex(s => s.key === key);
    if (at >= 0) {
        state.saved.splice(at, 1);
        toast("Removed from saved");
    } else {
        state.saved.unshift({ key, palette: state.palette, settings: currentSettings() });
        if (state.saved.length > 30) state.saved.length = 30;
        toast("Palette saved on this device");
        pulseCopied($("save-palette"));
    }
    persistSaved();
    renderSaved();
    syncSaveButton();
}

function syncSaveButton() {
    if (!state.palette) return;
    const saved = state.saved.some(s => s.key === paletteKey(state.palette));
    $("save-palette").textContent = saved ? "Saved ✓" : "Save palette";
}

function renderSaved() {
    const list = $("saved-list");
    list.innerHTML = "";
    state.saved.forEach(entry => {
        const row = document.createElement("div");
        row.className = "saved-row";
        row.appendChild(miniStrip(entry.palette, () => restorePalette(entry)));
        const del = document.createElement("button");
        del.className = "saved-del mono";
        del.type = "button";
        del.textContent = "×";
        del.setAttribute("aria-label", "Delete saved palette: " + entry.palette.swatches.map(s => s.name).join(" / "));
        del.addEventListener("click", () => {
            const at = state.saved.findIndex(s => s.key === entry.key);
            if (at < 0) return;
            state.saved.splice(at, 1);
            persistSaved();
            renderSaved();
            syncSaveButton();
            toast("Palette removed", () => {
                state.saved.splice(at, 0, entry);
                persistSaved();
                renderSaved();
                syncSaveButton();
            });
        });
        row.appendChild(del);
        list.appendChild(row);
    });
    $("saved-block").hidden = state.saved.length === 0;
}

/* ---------- Agency branding (white-label client docs) ---------- */

function loadAgency() {
    const defaults = { name: "", client: "", whiteLabel: false, logo: null };
    /* Field-level validation, not just parse: these values land in
       input .value, in printed output, and (the logo) in an <img src>.
       A tampered or legacy shape must degrade to defaults, and only a
       data:image/ URL is ever allowed back into src. */
    try {
        const raw = JSON.parse(localStorage.getItem(AGENCY_KEY));
        if (!raw || typeof raw !== "object") return defaults;
        return {
            name: typeof raw.name === "string" ? raw.name : "",
            client: typeof raw.client === "string" ? raw.client : "",
            whiteLabel: raw.whiteLabel === true,
            logo: typeof raw.logo === "string" && raw.logo.startsWith("data:image/") ? raw.logo : null
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
    $("agency-whitelabel").checked = state.agency.whiteLabel;
    $("agency-logo-clear").hidden = !state.agency.logo;
}

function onAgencyChange() {
    persistAgency();
    if (state.palette) renderPrintSheet(state.palette);
}

/* ---------- Main render ---------- */

function renderPalette(palette) {
    state.palette = palette;

    renderHeroField(palette);

    $("seed-label").textContent = palette.seed != null ? "seed " + palette.seed : "from the Fixer";

    renderReading(palette);
    renderSwatches(palette);
    renderBand($("ratio-band"), palette.swatches, false);
    /* The ids sit on the frames themselves now, not on wrappers. */
    const appliedPair = currentPair();
    renderSocial($("app-post"), palette.deployments.light, appliedPair);
    renderSocial($("app-story"), palette.deployments.dark, appliedPair);
    renderDeployment($("deploy-light"), palette.deployments.light);
    renderDeployment($("deploy-dark"), palette.deployments.dark);
    renderChecks(palette);

    /* The accent's harmony used to be appended here as jargon. It now
       has a plain-language sentence in the reading panel instead, so
       this line goes back to carrying only the category signal. */
    $("engine-signal").textContent = palette.borrowed
        ? `Borrowed recipe: ${palette.borrowed} (Law 7). ${palette.signal}`
        : palette.signal || "";

    renderTypeLab();
    renderPrintSheet(palette);
    renderSystem(palette);
    syncUrl();

    /* The wordmark is the one piece of chrome that reflects the
       current palette (DESIGN.md: The Product Is the Color Rule
       reserves everywhere else for the actual generated output). */
    Wordmark.injectLive(palette);

    $("shades-panel").hidden = true;
    pushHistory(palette);
    syncSaveButton();
}

/* ---------- Design system panel ---------- */

function renderSystem(palette) {
    const recipeKey = palette.recipeKey || "custom";
    const domIsDark = E.hexToHsl(palette.swatches[0].hex).l < 40;

    const spacing = E.spacingScale(recipeKey);
    const spacingEl = $("spacing-strip");
    spacingEl.innerHTML = "";
    spacing.forEach(s => {
        const bar = document.createElement("div");
        bar.className = "spacing-bar";
        bar.style.width = Math.max(2, s.px) + "px";
        /* Brand, not the site accent: this is generated output. */
        bar.style.background = palette.swatches[1].hex;
        bar.title = `${s.name}: ${s.px}px`;
        const label = document.createElement("span");
        label.textContent = s.name;
        bar.appendChild(label);
        spacingEl.appendChild(bar);
    });

    const radius = E.radiusScale(recipeKey);
    const radiusEl = $("radius-row");
    radiusEl.innerHTML = "";
    radius.forEach(r => {
        const chip = document.createElement("div");
        chip.className = "radius-chip";
        chip.style.borderRadius = (r.px === 999 ? 24 : r.px) + "px";
        chip.style.background = palette.swatches[1].hex;
        chip.title = `${r.name}: ${r.px === 999 ? "full" : r.px + "px"}`;
        const label = document.createElement("span");
        label.textContent = r.name;
        label.style.color = textOn(palette.swatches[1].hex);
        chip.appendChild(label);
        radiusEl.appendChild(chip);
    });

    /* Each card sits on its own step's surface. On a dark Dominant that
       progressive lift is the only thing that makes elevation visible at
       all - a near-black shadow on a near-black ground reads as nothing,
       which is exactly what the panel used to show. */
    const elevation = E.elevationScale(palette.swatches[3].hex, domIsDark, palette.swatches[0].hex);
    const elevationEl = $("elevation-row");
    elevationEl.innerHTML = "";
    elevation.filter(e => e.name !== "0").forEach(e => {
        const surface = e.surface || palette.swatches[0].hex;
        const card = document.createElement("div");
        card.className = "elevation-card";
        card.style.boxShadow = e.css;
        card.style.background = surface;
        card.title = `elevation-${e.name}`;
        const label = document.createElement("span");
        label.textContent = e.name;
        label.style.color = textOn(surface);
        card.appendChild(label);
        elevationEl.appendChild(card);
    });

    const statesEl = $("states-row");
    statesEl.innerHTML = "";
    ["brand", "accent"].forEach(role => {
        const source = role === "brand" ? palette.swatches[1].hex : palette.swatches[2].hex;
        const s = E.stateVariants(source, palette.swatches[0].hex);
        ["default", "hover", "active", "disabled"].forEach(key => {
            const chip = document.createElement("div");
            chip.className = "state-chip";
            chip.style.background = s[key];
            const label = document.createElement("span");
            label.textContent = `${role} / ${key}`;
            label.style.color = textOn(s[key]);
            chip.appendChild(label);
            statesEl.appendChild(chip);
        });
    });
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
        lockedBrand: locked
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
    if (q.get("lock") && E.hexToRgb("#" + q.get("lock"))) $("ctl-brand").value = "#" + q.get("lock").toUpperCase();
    state.seed = seed;
    generate(false);
    return true;
}

const ARCHETYPE_OPTIONS = Object.keys(E.ARCHETYPES);

/* ---------- Type lab ---------- */

function loadPairFonts(pair) {
    const url = E.googleFontsUrl(pair);
    if (state.loadedFonts.has(url)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
    state.loadedFonts.add(url);
}

function currentPair() {
    const p = state.palette;
    if (!p) return null;
    const pairs = E.getTypePairs(p.mood || "fresh");
    return pairs[state.typeIndex % pairs.length];
}

/* The horizontal specimen rail (LAYOUT-BLUEPRINT 3.5). Renders every
   pairing the palette's mood prescribes, so they can be compared side
   by side instead of cycled one at a time. state.typeIndex still marks
   which one is selected, and currentPair() still reads it, so exports,
   the SVG card, and the print sheet keep working unchanged. */
const SPECIMEN_DISPLAY = "Every color needs a job.";
const SPECIMEN_BODY = "The brands that pop do not use better colors. They use the same colors with clearer intent: one anchors, one leads, one accents, and every surface gets the right one.";

function renderTypeLab() {
    const p = state.palette;
    if (!p) return;

    const pairs = E.getTypePairs(p.mood || "fresh");
    const dep = p.deployments.light;
    const selectedIndex = state.typeIndex % pairs.length;
    const stack = $("type-rail");
    stack.innerHTML = "";

    pairs.forEach((pair, i) => {
        loadPairFonts(pair);
        const selected = i === selectedIndex;

        const card = document.createElement("article");
        card.className = "specimen-card" + (selected ? " is-selected" : "");
        card.innerHTML = `
            <div class="specimen">
                <p class="specimen-display">${esc(SPECIMEN_DISPLAY)}</p>
                <p class="specimen-body">${esc(SPECIMEN_BODY)}</p>
            </div>
            <div class="specimen-meta">
                <span class="type-name">${esc(pair.display)}</span>
                <span class="type-name type-name-body">+ ${esc(pair.body)}${pair.mono ? " + " + esc(pair.mono) : ""}</span>
                <p class="specimen-note">${esc(pair.why)}</p>
                <button class="btn-mini specimen-select" type="button" data-pair="${i}" aria-pressed="${selected}">${selected ? "In use" : "Use this pairing"}</button>
            </div>`;

        const spec = card.querySelector(".specimen");
        spec.style.background = dep.bg;
        spec.style.color = dep.ink;

        const disp = card.querySelector(".specimen-display");
        disp.style.fontFamily = `'${pair.display}', sans-serif`;
        disp.style.fontWeight = pair.displayWeight;

        const body = card.querySelector(".specimen-body");
        body.style.fontFamily = `'${pair.body}', sans-serif`;

        stack.appendChild(card);
    });

    $("type-rail-hint").textContent = pairs.length > 1
        ? `${pairs.length} pairings prescribed for this palette's mood. The one in use drives the exports, the SVG card, and the print sheet.`
        : "One pairing prescribed for this palette's mood.";
}

/* ---------- Fixer ---------- */

function runFixer() {
    const hexes = E.parseHexList($("fix-input").value);
    if (hexes.length < 2) {
        toast("Paste at least 2 hex codes");
        $("fix-input").setAttribute("aria-invalid", "true");
        return;
    }
    $("fix-input").setAttribute("aria-invalid", "false");
    /* Say so instead of truncating silently - the mapping below would
       otherwise list fewer colors than were pasted with no explanation. */
    if (hexes.length > 6) {
        hexes.length = 6;
        toast("Using the first 6 distinct colors");
    }

    const result = E.fixPalette(hexes);
    $("fixer-results").hidden = false;
    $("fixer-compare").hidden = false;

    const diag = $("diagnosis");
    diag.innerHTML = "";
    if (result.issues.length === 0) {
        const div = document.createElement("div");
        div.className = "diag-item clean";
        div.innerHTML = `
            <span class="diag-law">CLEAN</span>
            <div>
                <p class="diag-title">No law broken</p>
                <p class="diag-text">This palette holds up. The Fixer still assigned each color its 60-30-10 job below.</p>
            </div>`;
        diag.appendChild(div);
    } else {
        result.issues.forEach(issue => {
            const div = document.createElement("div");
            div.className = "diag-item";
            div.innerHTML = `
                <span class="diag-law">LAW ${String(issue.law).padStart(2, "0")}</span>
                <div>
                    <p class="diag-title">${issue.title}</p>
                    <p class="diag-text">${issue.detail}</p>
                    <p class="diag-fix">Fix: ${issue.fix}</p>
                </div>`;
            diag.appendChild(div);
        });
    }

    /* Before: N equal blocks, the palette as pasted. After: the same
       colors reproportioned to 60-30-10 plus Ink. Read together, the
       change in block widths is the argument the section is making. */
    renderCompareStrip(
        $("strip-before"), $("strip-before-caps"),
        result.original.map(hex => ({ flex: "1", hex, label: hex }))
    );

    const shares = { Dominant: 60, Brand: 30, Accent: 10, Ink: 8 };
    renderCompareStrip(
        $("strip-after"), $("strip-after-caps"),
        result.swatches.map(s => ({
            /* 60+30+10+8 = 108, normalised back to 100. */
            flex: `0 0 ${shares[s.role] / 1.08}%`,
            hex: s.hex,
            label: `${s.role} ${s.hex}`
        }))
    );

    /* Provenance: every input color's fate, spelled out. */
    const map = $("mapping");
    map.innerHTML = "";
    result.mapping.forEach(m => {
        const row = document.createElement("div");
        row.className = "map-row";
        row.innerHTML = `<span class="map-chip" style="background:${esc(m.from)}"></span><span class="map-hex mono">${esc(m.from)}</span><span class="map-note">${esc(m.note)}</span>`;
        map.appendChild(row);
    });

    state.fixed = result;
    $("fixer-results").scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
}

function adoptFixed() {
    if (!state.fixed) return;
    const f = state.fixed;
    const palette = {
        seed: null,
        /* null, not the control panel's current value: this palette
           came from pasted colors, and stamping an unrelated category
           into it put a false provenance line in the token export. */
        category: null,
        mood: E.moodFromColor(f.swatches[1].hex),
        signal: "Rebuilt by the Fixer. Every color now has a job.",
        borrowed: null,
        swatches: f.swatches,
        deployments: f.deployments,
        contrasts: f.contrasts
    };
    /* The old ?seed= no longer describes what's on screen. */
    safeReplaceUrl(location.pathname + location.hash);
    renderPalette(palette);
    $("engine").scrollIntoView({ behavior: scrollBehavior() });
    toast("Fixed palette loaded");
}

/* ---------- Exports ---------- */

const EXPORTERS = {
    css: p => ["CSS variables", E.exportCss(p)],
    tailwind: p => ["Tailwind theme", E.exportTailwind(p)],
    scss: p => ["SCSS variables", E.exportScss(p)],
    json: p => ["JSON", E.exportJson(p)],
    tokens: p => ["Design system tokens", E.exportTokensJson(p, currentPair())]
};

function renderPrintSheet(palette) {
    const area = $("print-sheet-area");
    const pair = currentPair();
    const rows = palette.swatches.map(s => {
        const shift = s.print && s.print.risk !== "none"
            ? `<br>Print gamut: ${s.print.risk} shift expected; press-safer alternate ${s.print.safeHex}`
            : "";
        return `
        <div class="ps-row">
            <div class="ps-chip" style="background:${s.hex}"></div>
            <div class="ps-data">
                <p class="ps-role">${s.role} ${s.pct === "Text" ? "" : s.pct + "%"} &nbsp; ${s.name}</p>
                HEX ${s.hex}<br>
                RGB ${s.rgb.r} ${s.rgb.g} ${s.rgb.b}<br>
                CMYK ${s.cmyk.c} ${s.cmyk.m} ${s.cmyk.y} ${s.cmyk.k}<br>
                Job: ${s.job}${shift}
            </div>
        </div>`;
    }).join("");
    const typeBlock = pair ? `
        <div class="ps-type">
            <p class="ps-role">Typography</p>
            <p class="ps-type-display" style="font-family:'${pair.display}',sans-serif;font-weight:${pair.displayWeight}">${pair.display}</p>
            <p class="ps-type-body" style="font-family:'${pair.body}',sans-serif">Body: ${pair.body}${pair.mono ? " &nbsp; Numbers: " + pair.mono : ""}. ${pair.why}</p>
        </div>` : "";

    /* White-label: swap the Gamut credit for the agency's own name
       and stamp who the sheet was prepared for, so what a client
       receives reads as the studio's work, not a tool's output. */
    const agency = state.agency;
    const branded = agency.whiteLabel && agency.name.trim();
    const title = branded ? esc(agency.name.trim()) : "Brand sheet";
    const sub = agency.client.trim()
        ? `Prepared for ${esc(agency.client.trim())}`
        : "Gamut. Deployed per the 60-30-10 rule.";
    const dateLine = `<p class="ps-date">${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>`;
    const logo = branded && agency.logo ? `<img class="ps-logo" src="${esc(agency.logo)}" alt="">` : "";

    area.innerHTML = `
        <div class="ps-header">
            ${logo}
            <div>
                <p class="ps-title">${title}</p>
                <p class="ps-sub">${sub}</p>
                ${dateLine}
            </div>
        </div>
        ${rows}
        ${typeBlock}
        <p class="ps-note">CMYK values are an uncoated-stock approximation and gamut flags are heuristic. Confirm against a calibrated profile before press.</p>`;
}

function downloadSvgCard() {
    if (!state.palette) return;
    const svg = E.exportSvgCard(state.palette, currentPair(), state.agency);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "brand-swatch-card.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("SVG card downloaded");
}

/* Same tokens the exports above already carry, packaged for an AI
   agent instead of a human: tokens.json, brand docs, and a prompt
   generated from that exact data, zipped with no server round trip. */
function downloadAiPackage() {
    if (!state.palette) return;
    const zip = AiPack.buildZip(state.palette, currentPair());
    const blob = new Blob([zip], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    /* != null, not truthiness: seed 0 is a real seed. */
    a.download = `gamut-ai-package-${state.palette.seed != null ? state.palette.seed : "fixer"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("AI Import Package ready.");
}

/* ---------- Studio Assistant ---------- */

function toggleAssistantFields(provider) {
    $("assistant-ollama-fields").hidden = provider !== "ollama";
    $("assistant-claude-fields").hidden = provider !== "claude";
}

function syncAssistantSettings() {
    const s = Assistant.loadSettings();
    $("assistant-provider").value = s.provider;
    $("assistant-ollama-model").value = s.ollamaModel;
    $("assistant-claude-key").value = s.claudeKey;
    toggleAssistantFields(s.provider);
}

const ASSISTANT_PROVIDER_LABEL = {
    ollama: "Local (Ollama)", claude: "Claude API", offline: "Offline keyword match"
};

function renderAssistantResult(r) {
    $("assistant-result").hidden = false;
    $("assistant-provider-used").textContent = "via " + (ASSISTANT_PROVIDER_LABEL[r.providerUsed] || r.providerUsed);
    $("assistant-explanation").textContent = r.explanation || "";

    const chips = $("assistant-chips");
    chips.innerHTML = "";
    r.keywords.forEach(k => {
        const c = document.createElement("span");
        c.className = "assistant-chip";
        c.textContent = k;
        chips.appendChild(c);
    });
    if (r.archetype) {
        const c = document.createElement("span");
        c.className = "assistant-chip assistant-chip-archetype";
        c.textContent = E.ARCHETYPES[r.archetype].label;
        chips.appendChild(c);
    }
    if (r.lockedBrand) {
        const c = document.createElement("span");
        c.className = "assistant-chip assistant-chip-hex mono";
        c.style.setProperty("--chip-color", r.lockedBrand);
        /* The chip's fill is a user-supplied hex, so its label has to be
           derived from that hex rather than assumed dark. */
        c.style.color = E.readableOn(r.lockedBrand);
        c.textContent = r.lockedBrand;
        chips.appendChild(c);
    }
    $("assistant-generate").disabled = !r.keywords.length && !r.archetype;
}

async function runAssistant() {
    const btn = $("assistant-run");
    /* Enter in the textarea bypasses the disabled button; without
       this, rapid submits race and the slowest response wins. */
    if (btn.disabled) return;
    const text = $("assistant-input").value.trim();
    if (!text) { toast("Type a brief first"); return; }
    btn.disabled = true;
    btn.textContent = "Thinking…";
    try {
        const result = await Assistant.interpret(text);
        state.assistantResult = result;
        renderAssistantResult(result);
    } catch {
        toast("Assistant failed unexpectedly");
    } finally {
        btn.disabled = false;
        btn.textContent = "Interpret";
    }
}

/* Business archetype takes priority when the brief named one -
   the Bible's archetypes carry more nuance (dominant kind, exact
   accent recipe) than a mood blend can. The mood lexicon handles
   briefs with no business context, or as a fallback. */
function generateFromAssistant() {
    const r = state.assistantResult;
    if (!r) return;
    if (r.archetype) {
        /* Reflect the interpreted settings into the real controls,
           then run the normal generate path. Without this, syncUrl()
           and the history entry read the PREVIOUS control state - a
           shared link rebuilt a different palette than the one on
           screen, and a later control tweak regenerated from the
           wrong category. */
        $("ctl-category").value = r.archetype;
        $("ctl-borrow").checked = r.borrow === true;
        $("ctl-brand").value = r.lockedBrand || "";
        generate(true);
    } else {
        const customArchetype = window.Mood.resolveMood(r.keywords);
        if (!customArchetype) { toast("Could not resolve a palette from this brief"); return; }
        /* Mood palettes bypass the category control, but the lock is
           still a control-owned setting - keep it in step for the
           same reason. */
        $("ctl-brand").value = r.lockedBrand || "";
        $("ctl-brand-clear").hidden = !r.lockedBrand;
        state.seed = Math.floor(Math.random() * 1e9);
        const palette = E.generatePalette({ category: "custom", seed: state.seed, lockedBrand: r.lockedBrand, customArchetype });
        state.typeIndex = 0;
        renderPalette(palette);
    }
    $("engine").scrollIntoView({ behavior: scrollBehavior() });
    toast("Palette generated from your brief");
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

    /* Studio Assistant */
    syncAssistantSettings();
    $("assistant-run").addEventListener("click", runAssistant);
    $("assistant-input").addEventListener("keydown", e => {
        /* Enter during IME composition is confirming characters,
           not submitting. */
        if (e.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAssistant(); }
    });
    $("assistant-provider").addEventListener("change", () => toggleAssistantFields($("assistant-provider").value));
    $("assistant-settings-save").addEventListener("click", () => {
        Assistant.saveSettings({
            provider: $("assistant-provider").value,
            ollamaUrl: Assistant.loadSettings().ollamaUrl,
            ollamaModel: $("assistant-ollama-model").value.trim() || "llama3.2",
            claudeKey: $("assistant-claude-key").value.trim()
        });
        toast("Assistant settings saved");
    });
    $("assistant-generate").addEventListener("click", generateFromAssistant);

    /* Engine. Control changes keep the seed so categories can be
       compared apples to apples; the Generate buttons mint a new one. */
    $("ctl-generate").addEventListener("click", () => generate(true));
    $("hero-regen").addEventListener("click", () => generate(true));
    $("ctl-category").addEventListener("change", () => generate(false));
    $("ctl-borrow").addEventListener("change", () => generate(false));
    $("ctl-brand").addEventListener("change", () => generate(false));
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

    /* Copy hex on swatch click (also the print-safe alternates) */
    $("swatch-row").addEventListener("click", e => {
        const shades = e.target.closest(".shades-btn");
        if (shades) { openShades(shades.dataset.hex, shades.dataset.role); return; }
        const safe = e.target.closest(".safe-hex");
        if (safe) { copyText(safe.dataset.hex, safe.dataset.hex, safe); return; }
        const chip = e.target.closest(".swatch-chip");
        if (chip) copyText(chip.dataset.hex, chip.dataset.hex, chip);
    });
    $("shades-close").addEventListener("click", () => { $("shades-panel").hidden = true; });

    /* Spacebar generates, Coolors-style, unless the user is typing
       or a button has focus (space already activates buttons). */
    document.addEventListener("keydown", e => {
        if (e.code !== "Space" || e.repeat) return;
        const t = e.target;
        if (t.closest && t.closest("input, textarea, select, button, [contenteditable]")) return;
        e.preventDefault();
        generate(true);
    });

    /* Color-vision simulation: an feColorMatrix filter over the
       palette visuals, never over the site chrome. */
    const visionTargets = () =>
        [$("swatch-row"), $("ratio-band"), $("applied")].filter(Boolean);
    document.querySelectorAll(".vision-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".vision-btn").forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-pressed", "false");
            });
            btn.classList.add("active");
            btn.setAttribute("aria-pressed", "true");
            const v = btn.dataset.vision;
            visionTargets().forEach(el => { el.style.filter = v === "none" ? "" : `url(#cv-${v})`; });
        });
    });

    /* Save / load palettes (localStorage, this device only) */
    state.saved = loadSavedList();
    renderSaved();
    $("save-palette").addEventListener("click", toggleSave);

    /* Agency branding for white-label client documentation */
    state.agency = loadAgency();
    syncAgencyFields();
    $("agency-name").addEventListener("input", () => { state.agency.name = $("agency-name").value; onAgencyChange(); });
    $("agency-client").addEventListener("input", () => { state.agency.client = $("agency-client").value; onAgencyChange(); });
    $("agency-whitelabel").addEventListener("change", () => { state.agency.whiteLabel = $("agency-whitelabel").checked; onAgencyChange(); });
    $("agency-logo").addEventListener("change", e => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > 500 * 1024) { toast("Logo too large, keep it under 500KB"); return; }
        const reader = new FileReader();
        reader.onload = () => {
            state.agency.logo = reader.result;
            $("agency-logo-clear").hidden = false;
            onAgencyChange();
            toast("Logo saved");
        };
        reader.onerror = () => toast("Could not read that file");
        reader.readAsDataURL(file);
    });
    $("agency-logo-clear").addEventListener("click", () => {
        state.agency.logo = null;
        $("agency-logo-clear").hidden = true;
        onAgencyChange();
    });

    /* Image extraction: downsample onto a canvas, quantize, hand
       the result to the Fixer. Everything stays client-side. */
    $("fix-image").addEventListener("change", e => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            /* try/catch because onload does not mean drawable: an SVG
               with no intrinsic size reports width 0 and drawImage /
               getImageData can throw. An uncaught throw here left no
               toast and leaked the object URL. */
            try {
                const c = document.createElement("canvas");
                const scale = Math.min(1, 96 / Math.max(1, img.width, img.height));
                c.width = Math.max(1, Math.round(img.width * scale));
                c.height = Math.max(1, Math.round(img.height * scale));
                const ctx = c.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, c.width, c.height);
                const data = ctx.getImageData(0, 0, c.width, c.height).data;
                const hexes = E.quantizeColors(data, 5);
                if (hexes.length < 2) { toast("Could not read enough distinct colors"); return; }
                $("fix-input").value = hexes.join(" ");
                runFixer();
            } catch {
                toast("Could not read that image");
            } finally {
                URL.revokeObjectURL(img.src);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(img.src); toast("Could not read that image"); };
        img.src = URL.createObjectURL(file);
    });
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
    $("print-sheet").addEventListener("click", () => window.print());
    $("svg-card").addEventListener("click", downloadSvgCard);
    $("ai-package").addEventListener("click", downloadAiPackage);

    /* Fixer */
    $("fix-run").addEventListener("click", runFixer);
    $("fix-input").addEventListener("keydown", e => {
        if (e.isComposing) return;
        if (e.key === "Enter") runFixer();
    });
    $("fix-adopt").addEventListener("click", adoptFixed);

    /* Type rail: delegated, because the cards are rebuilt on every
       palette change. Selecting a pairing re-renders the rail and the
       print sheet, which both read state.typeIndex. */
    $("type-rail").addEventListener("click", e => {
        const btn = e.target.closest(".specimen-select");
        if (!btn) return;
        state.typeIndex = Number(btn.dataset.pair);
        renderTypeLab();
        if (state.palette) {
            renderPrintSheet(state.palette);
            /* The social frames set type in the chosen display face, so
               they have to follow the selection too. */
            const pair = currentPair();
            renderSocial($("app-post"), state.palette.deployments.light, pair);
            renderSocial($("app-story"), state.palette.deployments.dark, pair);
        }
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
        document.querySelectorAll(".section-head, .assistant, .workbench, .fixer, .type-lab, .system-lab, .method-band-wrap, .laws, .pricing, .faq").forEach(el => {
            el.classList.add("reveal");
            io.observe(el);
        });
    }

    /* License UI */
    window.updateLicenseUI = function() {
        if (!window.License) return;
        const tier = License.tier();
        const details = License.getDetails();
        
        const statusEl = $("license-status");
        if (statusEl) {
            if (tier === "free") {
                statusEl.textContent = "Current plan: Free";
                statusEl.style.color = "var(--muted)";
            } else {
                let text = `Current plan: ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
                if (details && details.exp) {
                    const d = new Date(details.exp);
                    text += ` (expires ${d.toISOString().split('T')[0]})`;
                } else if (details) {
                    text += ` (lifetime)`;
                }
                statusEl.textContent = text;
                statusEl.style.color = "var(--ink)";
            }
        }
    };

    const redeemBtn = $("license-redeem");
    if (redeemBtn) {
        redeemBtn.addEventListener("click", async () => {
            const code = $("license-code").value.trim();
            if (!code) return;
            redeemBtn.disabled = true;
            redeemBtn.textContent = "Verifying...";
            
            const result = await License.redeem(code);
            redeemBtn.disabled = false;
            redeemBtn.textContent = "Activate";
            
            if (result.ok) {
                $("license-code").value = "";
                toast(`License activated: ${result.tier} plan`);
                updateLicenseUI();
            } else {
                toast(`Activation failed: ${result.reason}`);
            }
        });
    }
    
    if (window.License) updateLicenseUI();

    /* First palette: restore a shared link if present, else fresh. */
    if (!restoreFromUrl()) generate(true);
});
