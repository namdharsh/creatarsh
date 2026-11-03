# Creatarsh customer identity and SaaS account security

## Implemented
- Customer registration and login with bcryptjs (12 rounds) password hashing.
- Server-side sessions: random session identifiers, only SHA-256 hashes stored in MongoDB, short-lived signed bearer token, expiry, last-seen metadata, per-device revocation and revoke-all.
- Password reset links use cryptographically random one-time tokens; only token hashes are stored. Reset links expire after one hour and invalidate all existing sessions.
- Optional email verification. When enabled, login is blocked until verification. Verification tokens are one-time and expire after 24 hours.
- Account profile updates use an explicit field allow-list. Role and subscription status are never accepted from the browser.
- Rate limiting for login/register/verification/reset/password change, bounded JSON body size, server-side validation, active-account checks and ownership-scoped account queries.
- SaaS dashboard reads subscriptions from MongoDB using the authenticated customer ID. It does not accept a customer ID, role or subscription status from the client.

## Configuration
Set these server-side environment variables in the hosting provider (never commit them):

```env
CUSTOMER_JWT_SECRET=<long-random-secret-distinct-from-manager-secret>
CUSTOMER_JWT_EXPIRES=30d
CUSTOMER_SESSION_DAYS=30
CUSTOMER_EMAIL_VERIFICATION_REQUIRED=false
PUBLIC_APP_URL=https://creatarsh.in
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

To require email verification, set `CUSTOMER_EMAIL_VERIFICATION_REQUIRED=true` and configure working SMTP credentials first. If SMTP is not configured, the system will not silently authenticate a user when verification is required; support-assisted verification is needed until delivery is configured. Add `nodemailer` through `npm install` during deployment/build.

Optional phone verification is implemented through a server-side SMS webhook adapter. Set `CUSTOMER_PHONE_VERIFICATION_REQUIRED=true`, `SMS_WEBHOOK_URL` and `SMS_WEBHOOK_TOKEN` only after connecting a trusted SMS provider that accepts `{ to, message }`. The customer can request a 6-digit OTP from Account → Profile; codes are hashed, expire after 10 minutes and are rate-limited. Changing the phone number clears its verified flag. Do not enable both email and phone verification simultaneously in this initial rollout: email-first users need an additional pre-authentication phone verification hand-off, which is not part of this patch.

## CSRF and browser token handling
Customer API authentication uses an explicit `Authorization: Bearer` header. It does not authenticate with ambient browser cookies, so classic cookie-based CSRF does not apply to these API routes. Do not change this to cookie authentication without adding `SameSite` cookies, CSRF tokens and origin checks. The existing customer site keeps its bearer token in localStorage for compatibility; protect against XSS with a strict CSP, safe DOM rendering and no untrusted HTML. A future migration to HttpOnly secure cookies is recommended if the app is consolidated to one origin.

## Important operational notes
- This patch intentionally invalidates old stateless customer JWTs; customers must sign in again after deployment.
- No email/SMS credentials, signing secrets or production configuration are included in the ZIP.
- SaaS subscriptions shown in the dashboard are sourced from the `SaaSSubscription` collection. This identity patch does not create subscriptions, activate trials, process recurring payments or change entitlement logic. Those actions must be written only by verified billing webhooks/server workflows.
- The included express-rate-limit configuration uses its in-process memory store; use a shared store (for example Redis) before running multiple API instances. Configure MongoDB TTL indexes and SMTP/SMS, then run end-to-end tests against a non-production database before enabling verification or launching publicly.
