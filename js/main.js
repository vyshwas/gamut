/* =========================================================
   GAMUT ENGINE - UI wiring (Strategic Brief Intake)
   One source of truth: `state.answers`, `state.variant`,
   `state.lockedBrand`, `state.agency`.
   ========================================================= */

"use strict";

const E = window.Engine;

const state = {
    answers: {
        category: "saas",
        q2: "A",
        q3: "A",
        q4: "A",
        q5: "A",
        q6: "A",
        q7: "A"
    },
    variant: 1,
    lockedBrand: null,
    agency: {
        name: "",
        client: ""
    },
    palette: null
};

const AGENCY_KEY = "gamut.agency.v1";

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

const $ = id => document.getElementById(id);

const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

const HINT_QUESTIONS = ["q2", "q3", "q4", "q5", "q6", "q7"];

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

/* ---------- State / UI Sync and Generation ---------- */

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
    catch { /* not fatal */ }
}

function readLockedInput() {
    const raw = $("ctl-brand").value.trim();
    if (!raw) return { locked: null, invalid: false };
    const hex = raw.startsWith("#") ? raw : "#" + raw;
    if (!E.hexToRgb(hex)) return { locked: null, invalid: true };
    return { locked: hex, invalid: false };
}

function readInputs() {
    state.answers.category = $("ctl-category").value;
    const questions = ["q2", "q3", "q4", "q5", "q6", "q7"];
    questions.forEach(q => {
        const checked = document.querySelector(`input[name="ctl-${q}"]:checked`);
        state.answers[q] = checked ? checked.value : "A";
    });

    const { locked, invalid } = readLockedInput();
    state.lockedBrand = locked;
    $("ctl-brand").setAttribute("aria-invalid", String(invalid));
    $("ctl-brand-clear").hidden = !locked;

    state.variant = parseInt($("ctl-var-val").textContent, 10) || 1;
}

function writeInputs() {
    $("ctl-category").value = state.answers.category;
    const questions = ["q2", "q3", "q4", "q5", "q6", "q7"];
    questions.forEach(q => {
        const val = state.answers[q];
        const rad = document.querySelector(`input[name="ctl-${q}"][value="${val}"]`);
        if (rad) rad.checked = true;
    });

    $("ctl-brand").value = state.lockedBrand || "";
    $("ctl-brand-clear").hidden = !state.lockedBrand;
    $("ctl-var-val").textContent = state.variant;
}

function generate() {
    readInputs();
    persistAgency();

    const compiled = E.compileBrief(state.answers, state.variant);
    HINT_QUESTIONS.forEach((q, i) => {
        const el = $(`hint-${q}`);
        if (el) el.textContent = compiled.ruledOut[i] || "";
    });
    const palette = E.generatePalette({
        seed: compiled.seed,
        lockedBrand: state.lockedBrand,
        customArchetype: compiled.recipe,
        harmony: compiled.recipe.harmony || "auto"
    });

    state.palette = palette;
    renderHeroField({ ...palette, swatches: themedHeroSwatches(palette, Theme.current()) });
    Wordmark.injectLive(palette);
    renderBrief(compiled, palette);
    syncUrl();
}

window.switchTechTab = function(tabName) {
    document.querySelectorAll(".tech-tab-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    
    document.getElementById("tab-" + tabName).classList.add("active");
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add("active");
    } else if (window.event && window.event.target) {
        window.event.target.classList.add("active");
    }
};

window.copyText = function(elementId, successMsg) {
    const code = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(code).then(() => {
        toast(successMsg);
    }).catch(err => {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            toast(successMsg);
        } catch (e) {
            toast("Failed to copy text");
        }
        document.body.removeChild(textarea);
    });
};

function renderBrief(compiled, palette) {
    const output = $("brief-output");
    if (!output) return;

    const fontPair = E.getTypePairs(compiled.recipe.mood)[compiled.seed % E.getTypePairs(compiled.recipe.mood).length];

    // Load fonts dynamically
    let fontLink = $("dynamic-fonts");
    if (!fontLink) {
        fontLink = document.createElement("link");
        fontLink.id = "dynamic-fonts";
        fontLink.rel = "stylesheet";
        document.head.appendChild(fontLink);
    }
    fontLink.href = E.googleFontsUrl(fontPair);

    // Apply specimen styles
    output.style.setProperty("--font-display", `"${fontPair.display}", serif`);
    output.style.setProperty("--font-body", `"${fontPair.body}", sans-serif`);
    output.style.setProperty("--font-display-w", fontPair.displayWeight);
    output.style.setProperty("--font-body-w", fontPair.bodyWeight);

    const clientStr = state.agency.client || "Brand System Direction";
    const studioStr = state.agency.name || "Designare Studio";
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let swatchesHtml = palette.swatches.map(s => `
        <div class="swatch-item" style="--swatch-color: ${s.hex}">
            <div class="swatch-color-box"></div>
            <div class="swatch-details">
                <span class="swatch-role">${s.role}</span>
                <span class="swatch-hex mono">${s.hex}</span>
                <span class="swatch-name">${s.name}</span>
            </div>
        </div>
    `).join("");

    const contrasts = [
        { name: "Brand (Primary) on Canvas (Dominant)", ratio: E.contrastRatio(palette.swatches[1].hex, palette.swatches[0].hex), req: 3.0, desc: "Primary brand focus visibility" },
        { name: "Accent (Secondary) on Canvas (Dominant)", ratio: E.contrastRatio(palette.swatches[2].hex, palette.swatches[0].hex), req: 3.0, desc: "Secondary action readability" },
        { name: "Ink on Canvas (Dominant)", ratio: E.contrastRatio(palette.swatches[3].hex, palette.swatches[0].hex), req: 4.5, desc: "Body text contrast" },
        { name: "Text-on-Primary vs Brand", ratio: E.contrastRatio(palette.onBrand, palette.swatches[1].hex), req: 4.5, desc: "Dedicated text color for content inside primary panels/buttons" },
        { name: "Text-on-Secondary vs Accent", ratio: E.contrastRatio(palette.onAccent, palette.swatches[2].hex), req: 4.5, desc: "Dedicated text color for content inside secondary controls" }
    ];

    let contrastRows = contrasts.map(c => {
        const pass = c.ratio >= c.req;
        const warn = pass && (c.ratio < c.req + 0.5);
        const statusClass = !pass ? "status-fail" : (warn ? "status-warn" : "status-pass");
        const statusText = !pass ? "FAIL" : (warn ? "WARN" : "PASS");
        return `
            <tr>
                <td>
                    <div><b>${c.name}</b></div>
                    <div class="table-sub">${c.desc}</div>
                </td>
                <td class="text-right mono">${c.ratio.toFixed(2)}:1</td>
                <td class="text-center mono">${c.req.toFixed(1)}:1</td>
                <td class="text-center"><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join("");

    output.innerHTML = `
        <div class="brief-document">
            <!-- Header Block -->
            <div class="brief-header">
                <div class="brief-title-row">
                    <div>
                        <h1 class="brief-title">System Direction Brief</h1>
                        <p class="brief-subtitle" contenteditable="true" spellcheck="false" data-agency-field="client">${esc(clientStr)}</p>
                    </div>
                    <div class="brief-meta">
                        <p class="mono-label">Prepared by</p>
                        <p class="meta-val" contenteditable="true" spellcheck="false" data-agency-field="name">${esc(studioStr)}</p>
                        <p class="mono-label mt-2">Date</p>
                        <p class="meta-val">${dateStr}</p>
                    </div>
                </div>
                <div class="brief-system-bar">
                    <span>Seed: <b class="mono">${compiled.seed}</b></span>
                    <span>Variant: <b class="mono">${state.variant} / 5</b></span>
                    <span>Category: <b class="mono">${E.ARCHETYPES[state.answers.category].label}</b></span>
                </div>
            </div>

            <!-- Strategy & Rules Column Grid -->
            <div class="brief-grid-2">
                <div class="brief-card">
                    <h3>Strategic Alignment</h3>
                    <p class="category-description">${E.ARCHETYPES[state.answers.category].signal}</p>
                    <ul class="brief-list">
                        ${compiled.rationale.map(r => `<li>${esc(r)}</li>`).join("")}
                    </ul>
                </div>
                
                <div class="brief-card">
                    <h3>Negative Constraints</h3>
                    <p class="category-description">Decisions are defined by what they rule out. These design paths are locked out by your choices:</p>
                    <ul class="brief-list ruled-out-list">
                        ${compiled.ruledOut.map(ro => `<li>${esc(ro)}</li>`).join("")}
                    </ul>
                </div>
            </div>

            <!-- Interactive Type Specimen -->
            <div class="brief-card type-specimen-card">
                <h3>Typographic Personality</h3>
                <p class="mono-label mb-4">Pairing: ${fontPair.display} / ${fontPair.body} (${compiled.recipe.mood})</p>
                <div class="specimen-preview">
                    <h1 class="specimen-display-text" contenteditable="true" spellcheck="false">Bold Display Heading</h1>
                    <p class="specimen-body-text" contenteditable="true" spellcheck="false">This is a live, editable preview of the body typeface pairing. Click here to type custom brand messaging. It is selected to project the exact strategic stance compiled by the Tradeoff system.</p>
                    <div class="specimen-meta-row">
                        <span class="mono">Display: ${fontPair.display} (${fontPair.displayWeight})</span>
                        <span class="mono">Body: ${fontPair.body} (${fontPair.bodyWeight})</span>
                        ${fontPair.mono ? `<span class="mono">Mono: ${fontPair.mono}</span>` : ""}
                    </div>
                </div>
            </div>

            <!-- Swatches & Accessibility Grid -->
            <div class="brief-card">
                <h3>Palette & Contrast Verification</h3>
                <div class="swatches-grid">
                    ${swatchesHtml}
                </div>

                <table class="contrast-table">
                    <thead>
                        <tr>
                            <th>Verification Pair</th>
                            <th class="text-right">Contrast Ratio</th>
                            <th class="text-center">Required</th>
                            <th class="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${contrastRows}
                    </tbody>
                </table>
            </div>

            <!-- Technical Spec Exports -->
            <div class="brief-card">
                <div class="tech-tabs-header">
                    <h3>Technical Token Specifications</h3>
                    <div class="tech-tabs">
                        <button class="tab-btn active" onclick="switchTechTab('css')">CSS</button>
                        <button class="tab-btn" onclick="switchTechTab('tailwind')">Tailwind</button>
                        <button class="tab-btn" onclick="switchTechTab('json')">JSON</button>
                    </div>
                </div>
                <div class="tech-tab-content active" id="tab-css">
                    <div class="code-wrapper">
                        <button class="copy-btn" onclick="copyText('code-css', 'CSS copied!')">Copy</button>
                        <pre><code id="code-css">${esc(E.exportCss(palette))}</code></pre>
                    </div>
                </div>
                <div class="tech-tab-content" id="tab-tailwind">
                    <div class="code-wrapper">
                        <button class="copy-btn" onclick="copyText('code-tailwind', 'Tailwind CSS copied!')">Copy</button>
                        <pre><code id="code-tailwind">${esc(E.exportTailwind(palette))}</code></pre>
                    </div>
                </div>
                <div class="tech-tab-content" id="tab-json">
                    <div class="code-wrapper">
                        <button class="copy-btn" onclick="copyText('code-json', 'JSON tokens copied!')">Copy</button>
                        <pre><code id="code-json">${esc(E.exportTokensJson(palette, fontPair))}</code></pre>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function syncUrl() {
    const q = new URLSearchParams();
    q.set("cat", state.answers.category);
    q.set("q2", state.answers.q2);
    q.set("q3", state.answers.q3);
    q.set("q4", state.answers.q4);
    q.set("q5", state.answers.q5);
    q.set("q6", state.answers.q6);
    q.set("q7", state.answers.q7);
    q.set("v", state.variant);
    if (state.lockedBrand) q.set("lock", state.lockedBrand.slice(1));
    if (state.agency.name) q.set("studio", state.agency.name);
    if (state.agency.client) q.set("client", state.agency.client);
    safeReplaceUrl("?" + q.toString() + location.hash);
}

function restoreFromUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has("cat") && !q.has("v")) return false;

    if (q.has("cat")) state.answers.category = q.get("cat");
    const questions = ["q2", "q3", "q4", "q5", "q6", "q7"];
    questions.forEach(qKey => {
        if (q.has(qKey)) state.answers[qKey] = q.get(qKey);
    });

    if (q.has("v")) state.variant = parseInt(q.get("v"), 10) || 1;
    if (q.has("lock") && E.hexToRgb("#" + q.get("lock"))) {
        state.lockedBrand = "#" + q.get("lock").toUpperCase();
    } else {
        state.lockedBrand = null;
    }

    if (q.has("studio")) state.agency.name = q.get("studio");
    if (q.has("client")) state.agency.client = q.get("client");

    writeInputs();
    generate();
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

    // Load initial agency state from localStorage
    const savedAgency = loadAgency();
    state.agency.name = savedAgency.name;
    state.agency.client = savedAgency.client;

    writeInputs();

    // Event listeners for intake UI
    $("ctl-category").addEventListener("change", () => generate());
    
    const questions = ["q2", "q3", "q4", "q5", "q6", "q7"];
    questions.forEach(q => {
        document.querySelectorAll(`input[name="ctl-${q}"]`).forEach(rad => {
            rad.addEventListener("change", () => generate());
        });
    });

    $("ctl-brand").addEventListener("input", () => generate());
    $("ctl-brand-clear").addEventListener("click", () => {
        $("ctl-brand").value = "";
        generate();
    });

    $("ctl-var-prev").addEventListener("click", () => {
        if (state.variant > 1) {
            state.variant--;
            $("ctl-var-val").textContent = state.variant;
            generate();
        }
    });

    $("ctl-var-next").addEventListener("click", () => {
        if (state.variant < 5) {
            state.variant++;
            $("ctl-var-val").textContent = state.variant;
            generate();
        }
    });

    /* Agency name/client now live inside the rendered brief itself
       (moved from intake-time sidebar to export-time document, per
       roadmap item 8) — editable in place, delegated since renderBrief
       rebuilds #brief-output on every generate(). */
    const briefOutput = $("brief-output");
    if (briefOutput) {
        briefOutput.addEventListener("input", e => {
            const field = e.target.closest("[data-agency-field]");
            if (!field) return;
            state.agency[field.dataset.agencyField] = field.textContent.trim();
            persistAgency();
            syncUrl();
        });
    }

    const exportPdfBtn = $("ctl-export-pdf");
    if (exportPdfBtn) exportPdfBtn.addEventListener("click", () => window.print());

    if (!restoreFromUrl()) generate();
});
