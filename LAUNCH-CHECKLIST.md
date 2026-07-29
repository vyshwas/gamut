# Gamut Launch Checklist

## Pre-Launch Security Checklist (Owner Manual Action Required)

1. **GitHub account**: 2FA on; no personal access tokens with broad scope lying around; repo stays the single deploy path.
2. **Razorpay account**: 2FA on, dedicated strong password, login alerts on, correct bank account verified. Complete KYC (PAN, bank proof, website URL — KYC review needs the legal pages from Phase L3 to be live first).
3. **Email**: the address on Razorpay + the license-fulfilment address secured with 2FA. This inbox becomes a money-handling surface — phishing target.
4. **Payout expectations**: charges start on launch day; settlement to bank is ~T+2 business days. Do not promise refunds outside the policy page.

## What is Customer-Facing vs Owner-Only

### Customers see
- The entire site as today, with tier locks per pricing cards
- The license-code redemption box
- Legal pages
- Razorpay hosted checkout

### Owner-only (never deployed, never committed)
- `tools/keys/` (signing keypair)
- `tools/issued.json` (who got which code)
- The `license-admin` CLI
- The Razorpay dashboard
- The GitHub repo write access
- The fulfilment inbox
