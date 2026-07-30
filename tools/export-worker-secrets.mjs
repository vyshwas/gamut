import fs from 'fs';
import crypto from 'crypto';

try {
    const keyData = fs.readFileSync('tools/keys/private.json', 'utf8');
    console.log("=== SIGNING_KEY_JWK ===");
    console.log(keyData.trim());
    console.log("=======================\n");

    const pepper = crypto.randomBytes(32).toString('base64');
    console.log("=== CLAIM_PEPPER ===");
    console.log(pepper);
    console.log("===================\n");
    
    console.log("For RZP_WEBHOOK_SECRET, you will generate this in the Razorpay Dashboard during Phase B3.");
    console.log("For now, you can just type 'placeholder' or set it properly if you already have it.");

} catch (e) {
    console.error("Could not read tools/keys/private.json. Did you complete the Launch track?");
}
