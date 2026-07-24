/* =========================================================
   DESIGNARE ENGINE - UI wiring
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

/* ---------- Toast ---------- */

let toastTimer;
function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

function copyText(text, label) {
    navigator.clipboard.writeText(text).then(
        () => toast(label + " copied"),
        () => toast("Copy failed")
    );
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

function renderSwatches(palette) {
    const row = $("swatch-row");
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
        seg.addEventListener("click", () => copyText(step, step));
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
    strip.title = palette.swatches.map(s => s.name).join(" / ");
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
        del.setAttribute("aria-label", "Delete saved palette");
        del.addEventListener("click", () => {
            state.saved = state.saved.filter(s => s.key !== entry.key);
            persistSaved();
            renderSaved();
            syncSaveButton();
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
        return;
    }
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

    /* Nav */
    const nav = document.querySelector("nav");
    const navToggle = $("nav-toggle");
    navToggle.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        navToggle.setAttribute("aria-expanded", open);
    });
    document.querySelectorAll(".nav-links a").forEach(a =>
        a.addEventListener("click", () => nav.classList.remove("open"))
    );

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
        copyText(location.href, "Link");
    });

    /* Copy hex on swatch click (also the print-safe alternates) */
    $("swatch-row").addEventListener("click", e => {
        const shades = e.target.closest(".shades-btn");
        if (shades) { openShades(shades.dataset.hex, shades.dataset.role); return; }
        const safe = e.target.closest(".safe-hex");
        if (safe) { copyText(safe.dataset.hex, safe.dataset.hex); return; }
        const chip = e.target.closest(".swatch-chip");
        if (chip) copyText(chip.dataset.hex, chip.dataset.hex);
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
            document.querySelectorAll(".vision-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
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
            if (chip) { e.preventDefault(); copyText(chip.dataset.hex, chip.dataset.hex); }
        }
    });

    /* Exports */
    document.querySelectorAll("[data-export]").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!state.palette) return;
            const [label, text] = EXPORTERS[btn.dataset.export](state.palette);
            copyText(text, label);
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
