/**
 * Gamut Backend API - Cloudflare Worker
 * Zero npm dependencies. Fails closed on money, open on convenience.
 */

// Helper to construct responses with correct headers (Rule 10 & 5)
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            // Rule 5: Strict CORS allowlist
            "Access-Control-Allow-Origin": "https://vyshwas.github.io",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

// Preflight CORS handler
function handleOptions(request) {
    if (request.headers.get("Origin") !== "https://vyshwas.github.io") {
        return new Response(null, { status: 403 });
    }
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "https://vyshwas.github.io",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400"
        }
    });
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return handleOptions(request);
        }

        const url = new URL(request.url);

        try {
            // Router (Rule 7: Exactly four routes, no admin UI)
            if (request.method === "POST" && url.pathname === "/webhook/razorpay") {
                return await handleRazorpayWebhook(request, env);
            }
            if (request.method === "POST" && url.pathname === "/verify") {
                return await handleVerify(request, env);
            }
            if (request.method === "POST" && url.pathname === "/claim") {
                return await handleClaim(request, env);
            }
            if (request.method === "GET" && url.pathname === "/health") {
                return jsonResponse({ ok: true, version: "1.0.0" });
            }
            
            // Everything else
            return new Response("Not Found", { status: 404 });
            
        } catch (err) {
            // Rule 12: Logging discipline - generic errors in response, detail in worker log
            console.error("Unhandled error:", err.message);
            return jsonResponse({ error: "Internal Server Error" }, 500);
        }
    }
};

async function handleRazorpayWebhook(request, env) {
    if (request.method !== 'POST') return jsonResponse({ error: "Method not allowed" }, 405);
    
    const signature = request.headers.get('x-razorpay-signature');
    if (!signature) return jsonResponse({ error: "Missing signature" }, 401);
    
    let bodyText;
    try {
        bodyText = await request.text();
    } catch {
        return jsonResponse({ error: "Invalid body" }, 400);
    }
    
    if (bodyText.length > 8192) {
        return jsonResponse({ error: "Payload too large" }, 400);
    }
    
    // Constant-time signature verification (Rule 4)
    if (!env.RZP_WEBHOOK_SECRET) return jsonResponse({ error: "Webhook secret missing" }, 500);
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', 
        encoder.encode(env.RZP_WEBHOOK_SECRET), 
        { name: 'HMAC', hash: 'SHA-256' }, 
        false, 
        ['sign']
    );
    
    const hmacBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyText));
    const hmacHex = Array.from(new Uint8Array(hmacBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Constant time comparison (length check first, then value)
    if (hmacHex.length !== signature.length) return jsonResponse({ error: "Invalid signature" }, 401);
    let match = true;
    for (let i = 0; i < hmacHex.length; i++) {
        if (hmacHex[i] !== signature[i]) match = false;
    }
    if (!match) return jsonResponse({ error: "Invalid signature" }, 401);
    
    let event;
    try {
        event = JSON.parse(bodyText);
    } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    
    // Idempotent webhook handling (Rule 15)
    // For now we just return 200 OK to acknowledge Receipt. B4/B5 expand this logic.
    const type = event.event;
    console.log("Received webhook:", type);
    
    if (type === 'subscription.activated' || type === 'subscription.charged') {
        const sub = event.payload.subscription.entity;
        const subId = sub.id;
        
        // We will issue a license later in B3/B4. Just mock success for now so webhook works.
        // Actually the plan says "issue a license for the mapped tier ... store keyed by subscription id"
        
        const existingStr = await env.LICENSES.get(`sub:${subId}`);
        if (!existingStr) {
            // We issue a new license!
            const tierMap = {
                // To be filled with real Razorpay Plan IDs
                'plan_studio': 'studio',
                'plan_comm': 'commercial'
            };
            const tier = tierMap[sub.plan_id] || 'studio'; // fallback
            
            // Generate ECDSA Code
            const privKey = await getPrivateKey(env); 
            const id = crypto.randomUUID().replace(/-/g, '').substring(0,8);
            const payload = { id, tier, exp: null };
            const payloadStr = JSON.stringify(payload);
            const payloadB64 = btoa(payloadStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            
            const signatureBuf = await crypto.subtle.sign(
                { name: 'ECDSA', hash: 'SHA-256' },
                privKey,
                encoder.encode(payloadStr)
            );
            
            const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)))
                            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                            
            const code = `GAMUT-${payloadB64}.${sigB64}`;
            
            const record = {
                id,
                tier,
                status: "active",
                exp: null,
                source: "razorpay",
                rzp_ref: subId,
                issuedAt: Date.now(),
                code
            };
            
            // Hash subId with pepper for claim lookup
            const pepperKey = await crypto.subtle.importKey('raw', encoder.encode(env.CLAIM_PEPPER || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            const hashBuf = await crypto.subtle.sign('HMAC', pepperKey, encoder.encode(subId));
            const hashedSubId = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
            
            await env.LICENSES.put(`license:${id}`, JSON.stringify(record));
            await env.LICENSES.put(`claim:${hashedSubId}`, JSON.stringify(record));
            // Keep plain sub record for lifecycle updates (e.g. cancellation)
            await env.LICENSES.put(`sub:${subId}`, JSON.stringify({ licenseId: id }));
            
            console.log(`Issued license ${id} for subscription ${subId}`);
        }
    } else if (type === 'subscription.cancelled' || type === 'subscription.halted' || type === 'payment.failed') {
        let subId;
        if (type === 'payment.failed') {
            subId = event.payload.payment.entity.subscription_id;
        } else {
            subId = event.payload.subscription.entity.id;
        }
        
        if (subId) {
            const subStr = await env.LICENSES.get(`sub:${subId}`);
            if (subStr) {
                const subRec = JSON.parse(subStr);
                if (subRec.licenseId) {
                    const licStr = await env.LICENSES.get(`license:${subRec.licenseId}`);
                    if (licStr) {
                        const lic = JSON.parse(licStr);
                        lic.status = 'revoked';
                        await env.LICENSES.put(`license:${subRec.licenseId}`, JSON.stringify(lic));
                        console.log(`Revoked license ${subRec.licenseId} due to ${type}`);
                    }
                }
            }
        }
    }
    
    return jsonResponse({ ok: true });
}

async function getPrivateKey(env) {
    if (!env.SIGNING_KEY_JWK) throw new Error("Missing SIGNING_KEY_JWK");
    const jwk = JSON.parse(env.SIGNING_KEY_JWK);
    return crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
}

function b64url2buf(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        buf[i] = bin.charCodeAt(i);
    }
    return buf.buffer;
}

async function getPublicKey(env) {
    if (!env.SIGNING_KEY_JWK) throw new Error("Missing SIGNING_KEY_JWK");
    const jwk = JSON.parse(env.SIGNING_KEY_JWK);
    return crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
    );
}

async function handleVerify(request, env) {
    // Basic rate limit (Rule 9)
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const limitKey = `rate:verify:${ip}`;
    const attemptsStr = await env.RATELIMIT.get(limitKey) || '0';
    let attempts = parseInt(attemptsStr, 10);
    if (attempts > 30) {
        return jsonResponse({ error: "Too Many Requests" }, 429);
    }
    await env.RATELIMIT.put(limitKey, (attempts + 1).toString(), { expirationTtl: 60 });

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!body || !body.code || typeof body.code !== 'string') {
        return jsonResponse({ error: "Missing or invalid 'code' parameter" }, 400);
    }

    const match = body.code.match(/^GAMUT-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!match) return jsonResponse({ error: "Invalid code format" }, 400);
    
    const [_, payloadB64, sigB64] = match;
    let payloadStr, payloadObj;
    try {
        payloadStr = new TextDecoder().decode(b64url2buf(payloadB64));
        payloadObj = JSON.parse(payloadStr);
    } catch {
        return jsonResponse({ error: "Malformed payload" }, 400);
    }
    
    // Check expiry inside payload
    if (payloadObj.exp && payloadObj.exp < Date.now()) {
        return jsonResponse({ error: "License expired" }, 401);
    }

    // Check signature (Rule 4)
    try {
        const pubKey = await getPublicKey(env);
        const isValid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            pubKey,
            b64url2buf(sigB64),
            new TextEncoder().encode(payloadStr)
        );
        if (!isValid) return jsonResponse({ error: "Invalid signature" }, 401);
    } catch (e) {
        return jsonResponse({ error: "Signature verification failed" }, 401);
    }

    // Check KV status
    const kvDataStr = await env.LICENSES.get(`license:${payloadObj.id}`);
    if (kvDataStr) {
        let kvData;
        try { kvData = JSON.parse(kvDataStr); } catch { /* ignore */ }
        if (kvData) {
            if (kvData.status === 'revoked') {
                return jsonResponse({ error: "License revoked" }, 401);
            }
            if (kvData.exp && kvData.exp < Date.now()) {
                return jsonResponse({ error: "License expired" }, 401);
            }
        }
    }

    // Passed all checks (or wasn't in KV yet but signature is valid)
    return jsonResponse({ ok: true, tier: payloadObj.tier });
}

async function handleClaim(request, env) {
    // Hard rate limit for claiming (Rule 9)
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const limitKey = `rate:claim:${ip}`;
    const attemptsStr = await env.RATELIMIT.get(limitKey) || '0';
    let attempts = parseInt(attemptsStr, 10);
    if (attempts > 10) {
        return jsonResponse({ error: "Too Many Requests" }, 429);
    }
    await env.RATELIMIT.put(limitKey, (attempts + 1).toString(), { expirationTtl: 60 });

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!body || !body.ref || typeof body.ref !== 'string') {
        return jsonResponse({ error: "Missing ref parameter" }, 400);
    }

    if (body.ref.length > 100) return jsonResponse({ error: "Invalid ref" }, 400);

    const subId = body.ref;
    
    const encoder = new TextEncoder();
    const pepperKey = await crypto.subtle.importKey('raw', encoder.encode(env.CLAIM_PEPPER || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const hashBuf = await crypto.subtle.sign('HMAC', pepperKey, encoder.encode(subId));
    const hashedSubId = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const kvDataStr = await env.LICENSES.get(`claim:${hashedSubId}`);
    
    if (!kvDataStr) {
        // We delay slightly to prevent timing attacks, then return 404
        await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
        return jsonResponse({ error: "License not found or payment pending. Try again in 60 seconds." }, 404);
    }

    let kvData;
    try {
        kvData = JSON.parse(kvDataStr);
    } catch {
        return jsonResponse({ error: "Data error" }, 500);
    }

    // We do NOT require the pepper hash check from the client because the payment ID IS the secret. 
    // Wait, the plan says: "hashed-compared using CLAIM_PEPPER". 
    // "returns the license code only for that exact id ... hashed-compared using CLAIM_PEPPER."
    // Does the frontend send a hash, or does the backend just use the pepper to hash something?
    // "the worker looks up the subscription/payment id, and returns the license code only for that exact id (something only the payer possesses)"
    // The payment id `ref` itself acts as a secret. Maybe we hash the ID in KV to prevent leaking?
    // I will simply return the license code. The CLAIM_PEPPER could be used to hash the `ref` in KV so that someone with KV access can't steal licenses? 
    // Actually, "returns the license code only for that exact id ... hashed-compared using CLAIM_PEPPER".
    // I'll hash the `ref` provided by the client with CLAIM_PEPPER, and compare it against a hashed ref stored in KV, 
    // OR we just use the raw subId to lookup `sub:${subId}` but we also verify it.
    // Let's just return the code. The ref is already the secret.
    return jsonResponse({ ok: true, code: kvData.code, tier: kvData.tier });
}
