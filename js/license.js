"use strict";

const PUBLIC_JWK = {
  "kty": "EC",
  "x": "r5mGHhs1EFUNeRTjcCmLkjZjM8QxS9OJwBZNYuAfzxg",
  "y": "w_VCcANoTfNU1HW5kZ2zzDFZ6DJeD10cLCRl-7igi38",
  "crv": "P-256",
  "key_ops": [
    "verify"
  ],
  "ext": true
};

const License = (function() {
    const STORAGE_KEY = "gamut.license";
    let currentLicense = null;

    function b64url2buf(str) {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
        const bin = atob(padded);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
    }

    async function verifySignature(payloadB64, sigB64) {
        try {
            const key = await crypto.subtle.importKey(
                'jwk',
                PUBLIC_JWK,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['verify']
            );
            
            const payloadBuf = new TextEncoder().encode(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
            const sigBuf = b64url2buf(sigB64);
            
            return await crypto.subtle.verify(
                { name: 'ECDSA', hash: 'SHA-256' },
                key,
                sigBuf,
                payloadBuf
            );
        } catch (e) {
            return false;
        }
    }

    async function checkRevoked(id) {
        try {
            const res = await fetch('licenses/revoked.json', { cache: 'no-store' });
            if (!res.ok) return false;
            const data = await res.json();
            return data.revoked && data.revoked.includes(id);
        } catch (e) {
            return false; // offline grace
        }
    }

    async function parseAndVerify(codeStr) {
        if (!codeStr || !codeStr.startsWith('GAMUT-')) {
            return { ok: false, reason: "Malformed license code." };
        }
        
        const parts = codeStr.substring(6).split('.');
        if (parts.length !== 2) {
            return { ok: false, reason: "Malformed license code." };
        }
        
        const [payloadB64, sigB64] = parts;
        
        let payload;
        try {
            const jsonStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
            payload = JSON.parse(jsonStr);
        } catch (e) {
            return { ok: false, reason: "Malformed license code." };
        }
        
        const isValid = await verifySignature(payloadB64, sigB64);
        if (!isValid) {
            return { ok: false, reason: "Invalid signature." };
        }
        
        if (payload.exp && Date.now() > payload.exp) {
            return { ok: false, reason: "License expired." };
        }
        
        return { ok: true, payload };
    }

    async function verifyServerSide(codeStr) {
        try {
            const res = await fetch('https://gamut-api.vyommehta197.workers.dev/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: codeStr })
            });
            if (res.status === 429) return null; // Too many requests, fallback to local
            
            const data = await res.json();
            if (res.ok) {
                return { ok: true };
            } else {
                return { ok: false, reason: data.error };
            }
        } catch (e) {
            return null; // Network error, fallback to local
        }
    }

    async function verifyOrFallback(codeStr) {
        const serverResult = await verifyServerSide(codeStr);
        
        if (serverResult) {
            return serverResult; // True API response (valid or invalid)
        }
        
        // Fallback to local crypto check
        const localResult = await parseAndVerify(codeStr);
        if (!localResult.ok) return localResult;
        
        const isRevoked = await checkRevoked(localResult.payload.id);
        if (isRevoked) {
            return { ok: false, reason: "License has been revoked." };
        }
        
        return { ok: true };
    }

    async function redeem(codeString) {
        const result = await verifyOrFallback(codeString);
        if (!result.ok) return result;
        
        // Extract tier locally for UI
        const parts = codeString.substring(6).split('.');
        const payloadB64 = parts[0];
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
        
        const { id, tier } = payload;
        currentLicense = { code: codeString, tier, id };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentLicense));
        
        return { ok: true, tier };
    }

    async function init() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const result = await verifyOrFallback(parsed.code);
                
                if (!result.ok) {
                    localStorage.removeItem(STORAGE_KEY);
                    currentLicense = null;
                    if (window.toast) toast("Your license was deactivated.");
                    if (window.updateLicenseUI) window.updateLicenseUI();
                    return;
                }
                
                currentLicense = parsed;
            } catch (e) {
                localStorage.removeItem(STORAGE_KEY);
            }
        }
    }

    function tier() {
        // Temporarily free for beta testing
        return "studio";
    }

    function getDetails() {
        if (!currentLicense) return null;
        try {
            const payloadB64 = currentLicense.code.substring(6).split('.')[0];
            return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
        } catch (e) {
            return null;
        }
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY);
        currentLicense = null;
        if (window.updateLicenseUI) window.updateLicenseUI();
    }

    const Gate = {
        has: function(feature) {
            const t = tier();
            if (t === "commercial" || t === "studio") return true;
            
            const studioFeatures = [
                "fix-image", "vision", "save-palette",
                "export-tailwind", "export-scss", "export-json", "export-tokens", "export-svg", "export-dtcg",
                "print-sheet", "ai-package", "agency", "lock-brand", "custom-type",
                // "-unlimited" entries gate the *uncapped* version of a
                // free-tier feature - Gate.has() must return false for
                // free so the caller's daily-cap branch actually runs.
                // (Bug found 2026-07-31: "fixer-unlimited" was missing
                // here, so the pricing page's "3 diagnoses a day" free
                // cap was never enforced for anyone.)
                "fixer-unlimited", "extract-unlimited"
            ];
            
            return !studioFeatures.includes(feature);
        }
    };

    // Run init non-blocking
    init();

    return { redeem, tier, getDetails, logout, init, Gate };
})();

window.License = License;
