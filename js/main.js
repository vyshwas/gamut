/* =========================================================
   GAMUT ENGINE - UI wiring (Collapsed for Brief Intake)
   One source of truth: `state.palette`. The hero card renders
   from it.
   ========================================================= */

"use strict";

const E = window.Engine;

const state = {
    palette: null,
    seed: Math.floor(Math.random() * 1e9)
};

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

const $ = id => document.getElementById(id);

const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Smooth scrolling is motion; the preference asks us not to. */
const scrollBehavior = () => (prefersReduced() ? "auto" : "smooth");

/* history.replaceState throws SecurityError on file:// in Chromium. */
function safeReplaceUrl(url) {
    try { history.replaceState(null, "", url); } catch { /* file:// */ }
}

/* =========================================================
   OKLCH utilities (brand signature layer)
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

    function injectLive(p) {
        if (!p) return;
        apply(p.swatches[1].hex);
    }

    return { start, injectLive, setTheme };
})();

/* =========================================================
   Theme
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
        Wordmark.setTheme(theme);
        if (typeof paintThemedPreview === "function") paintThemedPreview();
    }

    function set(theme) {
        apply(theme, true);
        try { localStorage.setItem(KEY, theme); } catch (e) { /* not fatal */ }
    }

    function toggle() { set(current() === "dark" ? "light" : "dark"); }

    function init() {
        btn = $("theme-toggle");
        apply(current(), false);
        if (btn) btn.addEventListener("click", toggle);
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
    if (!t) return;
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

/* ---------- Theme-aware live preview ---------- */

function themedHeroSwatches(palette, theme) {
    if (theme !== "dark" || !palette.deployments || !palette.deployments.dark) return palette.swatches;
    const dep = palette.deployments.dark;
    const hexFor = { Dominant: dep.bg, Primary: dep.brand, Secondary: dep.accent, Ink: dep.ink };
    return palette.swatches.map(s => {
        const hex = hexFor[s.role];
        if (!hex) return s;
        const rgb = E.hexToRgb(hex);
        return { ...s, hex, rgb, hsl: E.hexToHsl(hex), name: E.nameColor(hex) };
    });
}

function paintThemedPreview() {
    if (!state.palette) return;
    const swatches = themedHeroSwatches(state.palette, Theme.current());
    renderHeroField({ ...state.palette, swatches });
}

const HERO_SHARES = { Dominant: 60, Primary: 30, Secondary: 10 };
const HERO_RAIL_CELLS = { Dominant: "hero-dominant", Primary: "hero-brand", Secondary: "hero-accent" };

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
}

/* ---------- Main generate / sync ---------- */

function generate(newSeed = true) {
    if (newSeed) state.seed = Math.floor(Math.random() * 1e9);
    const palette = E.generatePalette({
        category: "saas",
        seed: state.seed
    });
    state.palette = palette;
    renderHeroField({ ...palette, swatches: themedHeroSwatches(palette, Theme.current()) });
    Wordmark.injectLive(palette);
    syncUrl();
}

function syncUrl() {
    const p = state.palette;
    if (!p || p.seed == null) return;
    const q = new URLSearchParams();
    q.set("seed", p.seed);
    safeReplaceUrl("?" + q.toString() + location.hash);
}

function restoreFromUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has("seed")) return false;
    const seed = parseInt(q.get("seed"), 10);
    if (!Number.isFinite(seed)) return false;
    state.seed = seed;
    generate(false);
    return true;
}

/* ---------- Wire up ---------- */

document.addEventListener("DOMContentLoaded", () => {
    Wordmark.start();
    Theme.init();

    /* Nav menu toggle */
    const nav = document.querySelector(".site-nav");
    const navToggle = $("nav-toggle");
    const closeNav = () => {
        if (nav && navToggle) {
            nav.classList.remove("open");
            navToggle.setAttribute("aria-expanded", "false");
        }
    };
    if (navToggle) {
        navToggle.addEventListener("click", () => {
            const open = nav.classList.toggle("open");
            navToggle.setAttribute("aria-expanded", open);
        });
    }
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && nav && nav.classList.contains("open")) {
            closeNav();
            if (navToggle) navToggle.focus();
        }
    });
    document.addEventListener("click", e => {
        if (nav && nav.classList.contains("open") && !nav.contains(e.target)) closeNav();
    });

    /* Toast Undo click */
    const toastUndoBtn = $("toast-undo");
    if (toastUndoBtn) {
        toastUndoBtn.addEventListener("click", () => {
            if (toastUndoHandler) toastUndoHandler();
            toastUndoHandler = null;
            const t = $("toast");
            if (t) t.classList.remove("show");
            toastUndoBtn.hidden = true;
        });
    }

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
        document.querySelectorAll(".section-head, .workbench, .laws, .faq").forEach(el => {
            el.classList.add("reveal");
            io.observe(el);
        });
    }

    if (!restoreFromUrl()) generate(true);
});
