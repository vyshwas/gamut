/* =========================================================
   STUDIO ASSISTANT
   The conversational layer. It interprets a free-text brief
   ("calm coastal wellness brand, trustworthy but modern") and
   maps it onto Gamut's own fixed frameworks - the mood lexicon
   and the ten business archetypes - never onto invented hex
   codes. Whatever LLM answers, the palette itself is still built
   by Engine.generatePalette, so every guarantee (contrast floors,
   the ten laws) holds no matter what the model says.

   Three providers, tried in this order per user setting:
     - ollama  : local model via the Ollama HTTP API (default,
                 no network egress, no API key)
     - claude  : Anthropic API with the user's own key, stored
                 only in localStorage on this device
     - offline : plain keyword search against the lexicon, no
                 network call at all - always available as the
                 final fallback so the feature never hard-fails
   ========================================================= */

"use strict";

const Assistant = (function () {
    const SETTINGS_KEY = "gamut.assistant.v1";

    function loadSettings() {
        const defaults = {
            provider: "ollama",
            ollamaUrl: "http://localhost:11434",
            ollamaModel: "llama3.2",
            claudeKey: ""
        };
        try { return Object.assign(defaults, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
        catch { return defaults; }
    }

    function saveSettings(s) {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
        catch { /* storage unavailable; settings just won't persist */ }
    }

    const LEXICON_WORDS = Object.keys(window.Mood.MOOD_LEXICON);
    const ARCHETYPE_ENTRIES = Object.entries(window.Engine.ARCHETYPES);
    const ARCHETYPE_LIST = ARCHETYPE_ENTRIES.map(([k, v]) => `${k}: ${v.label} - ${v.signal}`).join("\n");

    function systemPrompt() {
        return `You are a color-brief interpreter for Gamut, a brand color palette generator. You NEVER invent hex codes or colors. Your only job is to read the user's free-text idea and map it onto Gamut's own fixed frameworks below, then return STRICT JSON only - no prose, no markdown fences, no commentary.

FRAMEWORK 1 - mood keywords (pick 1 to 4 that best fit, ONLY from this exact list, most relevant first):
${LEXICON_WORDS.join(", ")}

FRAMEWORK 2 - business archetypes (pick the single closest one, or null if the brief is not about a business/brand category):
${ARCHETYPE_LIST}

Return JSON in exactly this shape:
{"keywords": string[], "archetype": string|null, "lockedBrand": string|null, "borrow": boolean, "explanation": string}

Rules:
- "keywords": only words copied verbatim from the list above, lowercase, 1 to 4 items, most-relevant first. Empty array if nothing fits.
- "archetype": one of the archetype keys above (e.g. "wellness"), or null. Prefer an archetype when the brief names a business/product type; prefer keywords alone when it's a pure mood/feeling with no business context.
- "lockedBrand": a hex code ONLY if the user explicitly names one (e.g. "keep my brand blue #1E3A8A"). Never invent one. Otherwise null.
- "borrow": true only if the user explicitly asks to break/borrow from another category's convention.
- "explanation": one short plain-language sentence on why you picked these.
Return ONLY the JSON object, nothing else.`;
    }

    function extractJson(text) {
        if (!text) return null;
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start === -1 || end === -1 || end < start) return null;
        try { return JSON.parse(text.slice(start, end + 1)); }
        catch { return null; }
    }

    /* Never trust the model's output shape or vocabulary directly -
       every field is checked against Gamut's own real data before
       it can touch the engine. */
    function validate(obj) {
        if (!obj || typeof obj !== "object") return null;
        const keywords = Array.isArray(obj.keywords)
            ? [...new Set(obj.keywords.map(k => String(k).toLowerCase().trim()).filter(k => LEXICON_WORDS.includes(k)))].slice(0, 4)
            : [];
        const archetype = typeof obj.archetype === "string" && window.Engine.ARCHETYPES[obj.archetype]
            ? obj.archetype : null;
        let lockedBrand = null;
        if (typeof obj.lockedBrand === "string" && obj.lockedBrand.trim()) {
            const hex = obj.lockedBrand.trim().startsWith("#") ? obj.lockedBrand.trim() : "#" + obj.lockedBrand.trim();
            if (window.Engine.hexToRgb(hex)) lockedBrand = hex;
        }
        const borrow = obj.borrow === true;
        const explanation = typeof obj.explanation === "string" ? obj.explanation.slice(0, 300) : "";
        if (!keywords.length && !archetype) return null;
        return { keywords, archetype, lockedBrand, borrow, explanation };
    }

    /* ---------- Offline fallback: no network, always works ---------- */
    function offlineInterpret(text) {
        const lower = text.toLowerCase();
        const keywords = LEXICON_WORDS.filter(w => lower.includes(w)).slice(0, 4);
        let archetype = null;
        for (const [key, a] of ARCHETYPE_ENTRIES) {
            const label = a.label.split(" / ")[0].toLowerCase();
            if (lower.includes(key) || lower.includes(label)) { archetype = key; break; }
        }
        const hexMatch = text.match(/#[0-9a-fA-F]{6}\b/);
        /* Browsers send Origin: null for file:// pages, and Ollama's
           CORS layer rejects that outright - every request fails
           before it even reaches the model. Say so explicitly
           instead of leaving it looking like Ollama is down. */
        const fileProtocolHint = (typeof location !== "undefined" && location.protocol === "file:")
            ? " This page is open via file:// - browsers block it from reaching Ollama. Serve this folder over http:// instead (e.g. `python -m http.server` in it) and reload."
            : "";
        return {
            keywords, archetype,
            lockedBrand: hexMatch ? hexMatch[0] : null,
            borrow: /\bborrow\b|\bbreak category\b/.test(lower),
            explanation: (keywords.length || archetype)
                ? "Matched by plain keyword search (offline mode - no LLM reachable)." + fileProtocolHint
                : "No keyword matched offline. Try a mood word (calm, bold, luxurious...) or a business type." + fileProtocolHint
        };
    }

    /* ---------- Local: Ollama ---------- */
    async function ollamaInterpret(text, settings) {
        const res = await fetch(settings.ollamaUrl.replace(/\/$/, "") + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: settings.ollamaModel,
                stream: false,
                format: "json",
                messages: [
                    { role: "system", content: systemPrompt() },
                    { role: "user", content: text }
                ]
            })
        });
        if (!res.ok) throw new Error("Ollama HTTP " + res.status);
        const data = await res.json();
        return validate(extractJson(data && data.message && data.message.content));
    }

    /* ---------- Optional cloud: Claude, user's own key ---------- */
    async function claudeInterpret(text, settings) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": settings.claudeKey,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
                model: "claude-sonnet-5",
                max_tokens: 400,
                system: systemPrompt(),
                messages: [{ role: "user", content: text }]
            })
        });
        if (!res.ok) throw new Error("Claude HTTP " + res.status);
        const data = await res.json();
        const raw = data && data.content && data.content[0] && data.content[0].text;
        return validate(extractJson(raw));
    }

    /* Tries the configured provider, falls back to offline on any
       network/parse failure so a brief always resolves to something. */
    async function interpret(text) {
        const settings = loadSettings();
        let result = null;
        let providerUsed = settings.provider;
        try {
            if (settings.provider === "claude" && settings.claudeKey) {
                result = await claudeInterpret(text, settings);
            } else if (settings.provider === "ollama") {
                result = await ollamaInterpret(text, settings);
            }
        } catch {
            result = null;
        }
        if (!result) {
            providerUsed = "offline";
            result = offlineInterpret(text);
        }
        return Object.assign({ providerUsed }, result);
    }

    return { loadSettings, saveSettings, interpret, LEXICON_WORDS };
})();

window.Assistant = Assistant;
