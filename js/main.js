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

/* Shortest-path interpolation in OKLCH between two hexes. t in [0,1]. */
function lerpOklch(a, b, t) {
    let dH = b.H - a.H;
    if (dH > Math.PI) dH -= 2 * Math.PI;
    if (dH < -Math.PI) dH += 2 * Math.PI;
    return {
        L: a.L + (b.L - a.L) * t,
        C: a.C + (b.C - a.C) * t,
        H: a.H + dH * t
    };
}

/* =========================================================
   Hero generative mesh
   A low-res canvas of soft OKLCH-interpolated blobs drawn from the
   CURRENT palette, blurred in CSS into a slow-drifting gradient
   mesh. Colors ease toward each new palette so the marketing hero
   and the product's own generator are visibly one live system.
   ========================================================= */
const HeroMesh = (() => {
    let canvas, ctx, blobs = [], raf = null, last = 0, w = 0, h = 0;
    let theme = "light", lastPalette = null;
    const DPR_SCALE = 0.34;           /* render small, CSS-blur upscales */
    const FRAME_MS = 1000 / 30;       /* cap at ~30fps */

    /* The mesh is drawn twice over, one deployment each way:

       DARK  - additive ("lighter"). Blobs are LIGHT emitters over
               charcoal; overlaps blow out toward white, which is
               exactly the ambient glow the dark hero wants.

       LIGHT - subtractive. Additive drawing on paper is what makes
               generative meshes read as dirty smudges: the blobs go
               pale, overlaps grey out, and CSS `multiply` then bites
               the wrong parts (white multiplies to nothing, so only
               the dim EDGES survive - an inverted, muddy mesh).
               On paper the blobs are INK instead: normal alpha
               compositing, lightness clamped into a mid band so no
               blob is paler than the paper or as dark as body text,
               then multiplied in at low opacity. Reads as four
               process inks bled into the sheet. */
    const LIGHT_L = { min: 0.44, max: 0.70 };

    function forTheme(c) {
        if (theme === "dark") return c;
        return {
            L: Math.max(LIGHT_L.min, Math.min(LIGHT_L.max, c.L)),
            C: c.C * 0.92,
            H: c.H
        };
    }

    /* Palette -> five OKLCH glow colors: brand, accent, brand-accent
       midpoint, a lifted brand, and a deep ink tint for contrast. */
    function paletteColors(p) {
        const brand = hexToOklch(p.swatches[1].hex);
        const accent = hexToOklch(p.swatches[2].hex);
        const ink = hexToOklch(p.swatches[3].hex);
        const mid = lerpOklch(brand, accent, 0.5);
        const lifted = { L: Math.min(0.9, brand.L + 0.12), C: brand.C, H: brand.H };
        return [brand, accent, mid, lifted, { L: ink.L + 0.1, C: ink.C, H: ink.H }]
            .map(forTheme);
    }

    function size() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        w = Math.max(1, Math.round(rect.width * DPR_SCALE));
        h = Math.max(1, Math.round(rect.height * DPR_SCALE));
        canvas.width = w;
        canvas.height = h;
    }

    function draw(time) {
        const t = time / 1000;
        const dark = theme === "dark";
        /* Ink density on paper is much lower: the wash only has to
           tint the sheet, and CSS multiply compounds whatever lands. */
        const alpha = dark ? 0.55 : 0.30;
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
        blobs.forEach(b => {
            /* ease current color toward target for a smooth resync */
            b.cur = lerpOklch(b.cur, b.target, 0.04);
            const { r, g, bl } = (() => {
                const c = oklchToRgb(b.cur); return { r: c.r, g: c.g, bl: c.b };
            })();
            const cx = (b.bx + Math.sin(t * b.sp + b.ph) * b.amp) * w;
            const cy = (b.by + Math.cos(t * b.sp * 0.8 + b.ph) * b.amp) * h;
            const rad = b.rad * Math.min(w, h);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
            grad.addColorStop(0, `rgba(${r},${g},${bl},${alpha})`);
            grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalCompositeOperation = "source-over";
    }

    function loop(time) {
        if (time - last >= FRAME_MS) { draw(time); last = time; }
        raf = requestAnimationFrame(loop);
    }

    function init() {
        canvas = $("hero-mesh");
        if (!canvas) return;
        theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        ctx = canvas.getContext("2d");
        const layout = [
            { bx: 0.72, by: 0.30, rad: 0.55, amp: 0.05, sp: 0.10, ph: 0.0 },
            { bx: 0.88, by: 0.68, rad: 0.42, amp: 0.06, sp: 0.13, ph: 1.7 },
            { bx: 0.55, by: 0.80, rad: 0.40, amp: 0.05, sp: 0.09, ph: 3.1 },
            { bx: 0.95, by: 0.15, rad: 0.32, amp: 0.04, sp: 0.15, ph: 4.4 },
            { bx: 0.62, by: 0.48, rad: 0.30, amp: 0.05, sp: 0.11, ph: 5.6 }
        ];
        blobs = layout.map(l => Object.assign({}, l, { cur: { L: 0.5, C: 0.1, H: 0 }, target: { L: 0.5, C: 0.1, H: 0 } }));
        size();
        window.addEventListener("resize", () => { size(); if (prefersReduced()) draw(performance.now()); });
    }

    function retarget(snap) {
        const colors = paletteColors(lastPalette);
        blobs.forEach((b, i) => { b.target = colors[i % colors.length]; });
        if (snap || prefersReduced()) {
            blobs.forEach(b => { b.cur = b.target; });
            draw(performance.now());
            return;
        }
        if (raf === null) { last = 0; raf = requestAnimationFrame(loop); }
    }

    function setPalette(p) {
        if (!canvas || !p) return;
        lastPalette = p;
        retarget(false);
    }

    /* A theme flip changes BOTH the color clamp and the compositing
       mode, so the standing frame is drawn with the wrong maths until
       the next tick. Snap the colors and repaint immediately - the
       CSS crossfade covers the surfaces underneath, so an instant
       mesh repaint lands inside that fade rather than trailing it. */
    function setTheme(next) {
        theme = next === "dark" ? "dark" : "light";
        if (!canvas || !lastPalette) return;
        retarget(true);
    }

    return { init, setPalette, setTheme };
})();

/* =========================================================
   Living wordmark
   The "Gamut." mark is filled by a gradient between two live color
   slots that step through REAL engine output (a ramp sampled from
   generatePalette across every archetype, plus whatever the user
   just generated). The logo is, literally, a running swatch of the
   product. CSS @property makes the color transition interpolate.
   ========================================================= */
const Wordmark = (() => {
    let texts = [], dots = [], ramp = [], idx = 0, timer = null;
    let theme = "light", pair = null;

    /* The paper canvas the light-mode mark has to survive. */
    const PAPER = "#F9F8F6";
    /* Two stops so the gradient still reads as a gradient: the first
       is near-Ink (a charcoal that carries the sampled hue), the
       second is a deep-but-visible version of it. Both far above the
       3:1 floor for the mark. */
    const LIGHT_MIN = { c1: 9, c2: 4.5 };

    /* Engine output is tuned for a charcoal canvas - a lime, a cyan,
       a warm yellow all vanish on paper (1.0-1.3:1). Rather than
       swapping in some other color (which would put a hue in the
       logo that the brand does not own), darken the sampled hue in
       OKLCH until it clears `min`:1 on paper. Lightness moves; the
       hue and its relative chroma survive. This is the product's own
       Law 09 move - darken in OKLCH, not HSL, or it turns to mud. */
    function inkify(hex, min) {
        const src = hexToOklch(hex);
        let out = hex;
        for (let L = src.L; L >= 0.10; L -= 0.02) {
            out = E.rgbToHex(oklchToRgb({ L, C: Math.min(src.C, L * 0.32), H: src.H }));
            if (E.contrastRatio(out, PAPER) >= min) return out;
        }
        return out;
    }

    function buildRamp() {
        const out = ["#D4FF00"]; /* the locked brand lime leads */
        Object.keys(E.ARCHETYPES).forEach((cat, i) => {
            const p = E.generatePalette({ category: cat, seed: 3001 + i * 911 });
            out.push(p.swatches[1].hex, p.swatches[2].hex);
        });
        return out;
    }

    function apply(c1, c2) {
        pair = [c1, c2];
        if (theme !== "dark") {
            c1 = inkify(c1, LIGHT_MIN.c1);
            c2 = inkify(c2, LIGHT_MIN.c2);
        }
        texts.forEach(e => { e.style.setProperty("--wm-c1", c1); e.style.setProperty("--wm-c2", c2); });
        dots.forEach(e => { e.style.setProperty("--wm-c2", c2); });
    }

    function step() {
        apply(ramp[idx % ramp.length], ramp[(idx + 1) % ramp.length]);
        idx++;
    }

    /* Re-run the current pair through the new theme's rules; the
       @property transitions carry it across as a color animation. */
    function setTheme(next) {
        theme = next === "dark" ? "dark" : "light";
        if (pair) apply(pair[0], pair[1]);
    }

    function start() {
        texts = [...document.querySelectorAll(".wm-text")];
        dots = [...document.querySelectorAll(".wm-dot")];
        theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        ramp = buildRamp();
        if (prefersReduced()) { apply(ramp[0], ramp[1]); return; }
        step();
        timer = setInterval(step, 2200);
        document.querySelectorAll(".wordmark").forEach(wm =>
            wm.addEventListener("mouseenter", step)
        );
    }

    /* Fold the palette the user just generated into the ramp so the
       mark reflects live work, not only the seeded sample set. */
    function injectLive(p) {
        if (!p || !ramp.length) return;
        ramp.splice(1, 0, p.swatches[1].hex, p.swatches[2].hex);
        if (ramp.length > 40) ramp.length = 40;
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
        /* The two live-color visuals were tuned for charcoal; both
           re-derive their colors for the surface they now sit on. */
        HeroMesh.setTheme(theme);
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

function copyText(text, label, el) {
    navigator.clipboard.writeText(text).then(
        () => {
            toast(label + " copied");
            if (el) pulseCopied(el);
        },
        () => toast("Copy failed")
    );
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

function labelColorFor(hex) {
    return E.contrastRatio(hex, "#111111") >= E.contrastRatio(hex, "#F5F5F0")
        ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.75)";
}

/* Solid text color for UI sitting ON a given background. */
function textOn(hex) {
    return E.contrastRatio(hex, "#161616") >= E.contrastRatio(hex, "#F5F5F0")
        ? "#161616" : "#F5F5F0";
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

/* Guards against overlapping peel timers when Generate is spammed:
   only the newest scheduled rebuild is allowed to run. */
let swatchToken = 0;

function buildSwatches(palette, row) {
    row.innerHTML = "";
    palette.swatches.forEach(s => {
        const d = document.createElement("div");
        d.className = "swatch";
        const c = s.cmyk;
        const tab = s.pct === "Text" ? "TX" : s.pct;
        const shift = s.print && s.print.risk !== "none"
            ? `<p class="swatch-print" title="Outside typical CMYK range. Heuristic estimate, not an ICC conversion.">print shift ${s.print.risk} &middot; safe <button class="safe-hex mono" data-hex="${s.print.safeHex}" type="button" aria-label="Copy press-safer alternate ${s.print.safeHex}">${s.print.safeHex}</button></p>`
            : "";
        d.innerHTML = `
            <div class="swatch-chip" style="background:${s.hex};--tab-color:${labelColorFor(s.hex)}" data-hex="${s.hex}" data-tab="${tab}" role="button" tabindex="0" aria-label="Copy ${s.hex}">
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
   paper color chips off a fan deck (torn top edge + lift/rotate off
   a bottom hinge), then the new palette settles in. Falls back to an
   instant swap under reduced motion or on first paint. */
function renderSwatches(palette) {
    const row = $("swatch-row");
    const token = ++swatchToken;
    const existing = [...row.children];

    if (prefersReduced() || existing.length === 0) {
        buildSwatches(palette, row);
        return;
    }

    existing.forEach((el, i) => {
        el.classList.add("peeling");
        /* inline animation beats the stylesheet's settle rule */
        el.style.animation = "chip-peel-out 0.34s var(--snap) forwards";
        el.style.animationDelay = (i * 0.04) + "s";
    });

    setTimeout(() => {
        if (token !== swatchToken) return; /* a newer generate superseded us */
        buildSwatches(palette, row);
    }, 360);
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
    if (entry.palette.seed) state.seed = entry.palette.seed;
    else history.replaceState(null, "", location.pathname + location.hash);
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

function loadSavedList() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; }
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
    try { return Object.assign(defaults, JSON.parse(localStorage.getItem(AGENCY_KEY)) || {}); }
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

    renderBand($("hero-band"), palette.swatches, true);
    $("hero-card-name").textContent =
        palette.swatches.map(s => s.name).join(" / ");

    $("seed-label").textContent = palette.seed ? "seed " + palette.seed : "from the Fixer";

    renderSwatches(palette);
    renderBand($("ratio-band"), palette.swatches, false);
    renderDeployment(document.querySelector('#deploy-light .deploy-mock'), palette.deployments.light);
    renderDeployment(document.querySelector('#deploy-dark .deploy-mock'), palette.deployments.dark);
    renderChecks(palette);

    const signal = $("engine-signal");
    signal.textContent = palette.borrowed
        ? `Borrowed recipe: ${palette.borrowed} (Law 7). ${palette.signal}`
        : palette.signal || "";

    renderTypeLab();
    renderPrintSheet(palette);
    renderSystem(palette);
    syncUrl();

    /* Resync the brand-signature layer so the marketing chrome and the
       live product share one color system: the hero mesh drifts toward
       this palette, and the wordmark folds it into its ramp. */
    HeroMesh.setPalette(palette);
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

    const elevation = E.elevationScale(palette.swatches[3].hex, domIsDark);
    const elevationEl = $("elevation-row");
    elevationEl.innerHTML = "";
    elevation.filter(e => e.name !== "0").forEach(e => {
        const card = document.createElement("div");
        card.className = "elevation-card";
        card.style.boxShadow = e.css;
        card.style.background = palette.swatches[0].hex;
        card.title = `elevation-${e.name}`;
        const label = document.createElement("span");
        label.textContent = e.name;
        label.style.color = textOn(palette.swatches[0].hex);
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
       silently rebuilds the wrong palette. */
    if (!p || !p.seed || p.custom) return;
    const q = new URLSearchParams();
    q.set("cat", $("ctl-category").value);
    q.set("seed", p.seed);
    if ($("ctl-borrow").checked) q.set("borrow", "1");
    const { locked } = readLockedInput();
    if (locked) q.set("lock", locked.slice(1));
    history.replaceState(null, "", "?" + q.toString() + location.hash);
}

function restoreFromUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has("seed")) return false;
    const cat = q.get("cat");
    if (cat && ARCHETYPE_OPTIONS.includes(cat)) $("ctl-category").value = cat;
    $("ctl-borrow").checked = q.get("borrow") === "1";
    if (q.get("lock") && E.hexToRgb("#" + q.get("lock"))) $("ctl-brand").value = "#" + q.get("lock").toUpperCase();
    const seed = parseInt(q.get("seed"), 10);
    if (!Number.isFinite(seed)) return false;
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

function renderTypeLab() {
    const p = state.palette;
    if (!p) return;
    const pair = currentPair();
    loadPairFonts(pair);

    const spec = $("specimen");
    const dep = p.deployments.light;
    spec.style.background = dep.bg;

    const disp = $("specimen-display");
    disp.style.fontFamily = `'${pair.display}', sans-serif`;
    disp.style.fontWeight = pair.displayWeight;
    disp.style.color = dep.ink;

    const body = $("specimen-body");
    body.style.fontFamily = `'${pair.body}', sans-serif`;
    body.style.color = dep.ink;
    body.style.opacity = "0.75";

    $("type-display-name").textContent = pair.display;
    $("type-body-name").textContent = "+ " + pair.body + (pair.mono ? " + " + pair.mono : "");
    $("type-why").textContent = pair.why;
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
    if (hexes.length > 6) hexes.length = 6;

    const result = E.fixPalette(hexes);
    $("fixer-results").hidden = false;

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

    const before = $("strip-before");
    before.innerHTML = "";
    result.original.forEach(hex => {
        const seg = document.createElement("div");
        seg.className = "band-seg";
        seg.style.flex = "1";
        seg.style.background = hex;
        seg.dataset.label = hex;
        seg.style.setProperty("--label-color", labelColorFor(hex));
        before.appendChild(seg);
    });

    const after = $("strip-after");
    after.innerHTML = "";
    const shares = { Dominant: 60, Brand: 30, Accent: 10, Ink: 8 };
    result.swatches.forEach(s => {
        const seg = document.createElement("div");
        seg.className = "band-seg";
        seg.style.flex = `0 0 ${shares[s.role] / 1.08}%`;
        seg.style.background = s.hex;
        seg.dataset.label = shares[s.role] <= 12 ? s.role : `${s.role} ${s.hex}`;
        seg.style.setProperty("--label-color", labelColorFor(s.hex));
        after.appendChild(seg);
    });

    /* Provenance: every input color's fate, spelled out. */
    const map = $("mapping");
    map.innerHTML = "";
    result.mapping.forEach(m => {
        const row = document.createElement("div");
        row.className = "map-row";
        row.innerHTML = `<span class="map-chip" style="background:${m.from}"></span><span class="map-hex mono">${m.from}</span><span class="map-note">${m.note}</span>`;
        map.appendChild(row);
    });

    state.fixed = result;
    $("fixer-results").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function adoptFixed() {
    if (!state.fixed) return;
    const f = state.fixed;
    const palette = {
        seed: null,
        category: $("ctl-category").value,
        mood: E.moodFromColor(f.swatches[1].hex),
        signal: "Rebuilt by the Fixer. Every color now has a job.",
        borrowed: null,
        swatches: f.swatches,
        deployments: f.deployments,
        contrasts: f.contrasts
    };
    /* The old ?seed= no longer describes what's on screen. */
    history.replaceState(null, "", location.pathname + location.hash);
    renderPalette(palette);
    $("engine").scrollIntoView({ behavior: "smooth" });
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
    const logo = branded && agency.logo ? `<img class="ps-logo" src="${agency.logo}" alt="">` : "";

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
        c.textContent = r.lockedBrand;
        chips.appendChild(c);
    }
    $("assistant-generate").disabled = !r.keywords.length && !r.archetype;
}

async function runAssistant() {
    const text = $("assistant-input").value.trim();
    if (!text) { toast("Type a brief first"); return; }
    const btn = $("assistant-run");
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
    state.seed = Math.floor(Math.random() * 1e9);
    let palette;
    if (r.archetype) {
        palette = E.generatePalette({ category: r.archetype, seed: state.seed, borrow: r.borrow, lockedBrand: r.lockedBrand });
    } else {
        const customArchetype = window.Mood.resolveMood(r.keywords);
        if (!customArchetype) { toast("Could not resolve a palette from this brief"); return; }
        palette = E.generatePalette({ category: "custom", seed: state.seed, lockedBrand: r.lockedBrand, customArchetype });
    }
    state.typeIndex = 0;
    renderPalette(palette);
    $("engine").scrollIntoView({ behavior: "smooth" });
    toast("Palette generated from your brief");
}

/* ---------- Wire up ---------- */

document.addEventListener("DOMContentLoaded", () => {

    /* Brand-signature layer: the generative hero mesh and the living
       wordmark. Both draw from real Engine output; init before the
       first generate() so that palette resyncs them immediately. */
    HeroMesh.init();
    Wordmark.start();
    /* After both, so the first apply() can retune them immediately. */
    Theme.init();

    /* Nav */
    const nav = document.querySelector("nav");
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
        if (state.palette && (!state.palette.seed || state.palette.custom)) {
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
    const visionTargets = () => [$("swatch-row"), $("ratio-band"), document.querySelector(".deployments")];
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
            const c = document.createElement("canvas");
            const scale = Math.min(1, 96 / Math.max(img.width, img.height));
            c.width = Math.max(1, Math.round(img.width * scale));
            c.height = Math.max(1, Math.round(img.height * scale));
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, c.width, c.height);
            const data = ctx.getImageData(0, 0, c.width, c.height).data;
            URL.revokeObjectURL(img.src);
            const hexes = E.quantizeColors(data, 5);
            if (hexes.length < 2) { toast("Could not read enough distinct colors"); return; }
            $("fix-input").value = hexes.join(" ");
            runFixer();
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

    /* Fixer */
    $("fix-run").addEventListener("click", runFixer);
    $("fix-input").addEventListener("keydown", e => {
        if (e.key === "Enter") runFixer();
    });
    $("fix-adopt").addEventListener("click", adoptFixed);

    /* Type lab */
    $("type-next").addEventListener("click", () => {
        state.typeIndex++;
        renderTypeLab();
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

    /* First palette: restore a shared link if present, else fresh. */
    if (!restoreFromUrl()) generate(true);
});
