# Creatarsh Phase 12 — Security, Reliability & Launch Audit

**Audit date:** 2026-10-19  
**Scope:** Source-level review of the Phase 11 ZIP. This is not a penetration test, a production-host verification, or a certification of production readiness.

## High-priority fixes applied in this phase

1. **Shorter default sessions:** newly issued manager JWTs default to 12 hours and customer JWTs to 7 days. Operators can explicitly override `MANAGER_JWT_EXPIRES` / `CUSTOMER_JWT_EXPIRES`; use conservative values and rotate JWT secrets if exposure is suspected. Existing issued tokens retain their original expiry until they expire or signing secrets are rotated.
2. **Fail-closed account authorization:** customer and manager protected routes now return `503` when MongoDB is unavailable rather than accepting a signed token without checking whether its account is still active. Manager requests also check the active manager record in MongoDB.
3. **Role boundaries:** legacy manager endpoints that read or mutate payment state, invoices, workflow-wide customer records, orders and privacy requests now require the explicit administrator role. Payment creation that can mark invoices/orders as paid is admin-only.
4. **Business media upload validation:** business image uploads now check the file's byte signature against the declared JPEG, PNG or WebP MIME type, in addition to the existing file-size and MIME allowlist.
5. **Regression tests:** added `server/test/phase12SecurityAudit.test.js` for session defaults, fail-closed account checks, admin-only sensitive routes, image signatures, CORS allowlisting, and the rate-limit scaling limitation.
6. **Operational documentation:** added this report and an explicit deployment/rollback checklist. Updated payment documentation to remove the obsolete statement that payments are disabled.

## Source-level review summary

| Area | Finding / status | Required follow-up |
|---|---|---|
| Authentication | **Fixed in source:** shorter default JWT expiry; protected routes check active account status against MongoDB and fail closed if DB is unavailable. | Test login, expiry, disabled account and logout/session clearing against deployed API. Rotate any previously exposed secrets. |
| Role boundaries | **Improved in source:** finance, order/workflow and privacy routes are admin-only; `requireAdmin` verifies the live role. | Review remaining manager endpoints against a documented staff-role matrix; least-privilege business roles need a production integration test. |
| Business data isolation | Business profile, analytics, enquiry and store routes use business IDs and membership checks in source. | Run two-business cross-tenant negative tests using real test accounts and verify all business endpoints, including claims and media, reject a non-member. |
| ZIP upload security | Archive inspection rejects traversal, links, unsupported files, oversize archives and suspicious active content; static releases are served from private object storage. | Fuzz malformed archives, test object-store IAM and test isolated custom subdomains in staging. A static HTML/JS publisher is still an untrusted-content boundary. |
| Domain routing | Subdomain labels and published release state are checked in source. | Verify wildcard DNS, TLS certificates, root-domain exclusions, custom domains and cache invalidation on the real provider. |
| HTTPS | Helmet security headers are installed; `trust proxy` is configurable. | Confirm HTTPS redirect and HSTS at Render/Cloudflare edge, including direct-origin access. This cannot be certified from the source ZIP alone. |
| Rate limits | API and authentication rate limits exist. | Current limiter is in-memory and per-process. Use a shared Redis/store before horizontal scaling; test proxy/IP trust and 429 behaviour in production. |
| Razorpay webhooks | HMAC verification uses raw request bytes; webhook event IDs are deduplicated; provider order/payment details are checked in the payment flow. | Complete sandbox delivery tests for captured, failed, duplicate, out-of-order, partial refund and full refund events. Never test with live credentials during acceptance. |
| Privacy | Audit logging filters sensitive keys and analytics stores aggregates/digests. | Complete a privacy/data-retention review, validate consent handling, and inspect all logs and third-party processors. |
| Accessibility | Not fully certified. | Run axe/Lighthouse and keyboard/screen-reader tests on the public website, manager, business dashboard and all Flutter apps. |
| SEO | Sitemap, robots file and business-page metadata/schema exist in source. | Verify canonical URLs, noindex private pages, sitemap reachability, structured data and Search Console after deployment. |
| Mobile performance | Responsive web layouts and Flutter source exist. | Run Lighthouse mobile, real-device profiling, image/network tests and Flutter release builds. Flutter SDK/device tests were not available in this audit environment. |
| Database indexes | Numerous query-specific and unique indexes are declared in Mongoose schemas. | Confirm index creation in staging and production; compare slow-query logs and use `explain()` on high-volume queries. Do not create/drop production indexes blindly. |
| Backup restoration | No restore test can be established from source code. | Configure scheduled encrypted backups and run a restore drill to a separate database; record RPO/RTO and verify invoice/payment consistency. |
| Monitoring | Health endpoints and structured request/error logging exist. | Configure uptime alerts, database/object-storage alerts, payment reconciliation alerts, log retention and an incident contact. Avoid logging PII/secrets. |
| Error handling | Central error middleware normalizes common failures and avoids returning stack traces. | Exercise malformed JSON, storage outage, database outage, provider timeout and unknown routes in staging; verify alerts and correlation IDs. |
| Reproducible builds | **Outstanding:** the supplied project has no `package-lock.json`; `npm ci` fails without one. Network installation timed out in this environment, so a lockfile could not be generated and the full dependency-backed suite could not be run here. | Generate and commit a reviewed lockfile in a network-enabled environment, then require `npm ci` in CI and deploy. |

## Tests run for this audit

- `node --check server/server.js` — passed.
- `node --test server/test/phase12SecurityAudit.test.js` — **7 passed, 0 failed**.
- `npm ci` — not run successfully because no lockfile exists.
- `npm install --ignore-scripts --no-audit --no-fund` — timed out in this environment; dependencies were not available for the full backend suite.
- Flutter analysis/tests/release builds — not run; SDK/device unavailable in this environment.
- Live HTTPS, CORS, login, MongoDB, object storage, payment sandbox, backup restore and production performance — **not run**.

The tests above include source-contract checks. They are not substitutes for end-to-end integration tests.

## Known limitations / do not claim as complete

- Do not claim production readiness based on this report.
- No live credentials were used, and no production deployment or production database was changed.
- A distributed rate-limit store is not configured in this source package.
- No lockfile exists yet; dependency versions are not fully reproducible.
- No successful backup restore drill, formal accessibility audit, penetration test, live payment sandbox, or real-device performance run is evidenced.
- The remaining manager/business role matrix and cross-tenant isolation require staging integration tests before release.

## Deployment checklist

### Before staging

- [ ] Review the diff and back up the current source/repository.
- [ ] Generate and commit `server/package-lock.json` in a network-enabled environment; verify `npm ci`.
- [ ] Set unique random `MANAGER_JWT_SECRET` and `CUSTOMER_JWT_SECRET` (32+ chars); never put secrets in ZIPs or Git.
- [ ] Set `NODE_ENV=production`, `MONGODB_URI`, exact `CORS_ORIGINS`, `TRUSTED_PROXY_COUNT`, and object-storage settings.
- [ ] Rotate secrets if any earlier project archive or log may have exposed them.
- [ ] Verify only the intended administrator account has `admin`/`superadmin`; disable unused accounts.
- [ ] Configure HTTPS redirect/HSTS at the edge and verify all subdomains have valid TLS.
- [ ] Configure encrypted automated MongoDB backups and confirm a separate restore target.
- [ ] Configure shared rate-limit storage before running more than one application instance.

### Staging acceptance

- [ ] `npm ci --prefix server` and `npm --prefix server run check` pass in CI.
- [ ] Test manager/admin/customer login, expired JWT, disabled accounts and database-down behaviour.
- [ ] Test role matrix: manager denied admin finance/privacy/order endpoints; admin allowed; unauthenticated denied.
- [ ] Test two businesses and prove business A cannot read/update business B profile, analytics, enquiries, products, media or deployments.
- [ ] Upload benign static ZIPs and malicious traversal, symlink, oversized, duplicate-path, unsupported-file and ZIP-bomb fixtures; verify rejection.
- [ ] Verify published site routes, unknown hosts, suspended businesses, unpublished sites and rollback to prior release.
- [ ] Test Razorpay sandbox order, captured/failed payment, invalid signature, duplicate/out-of-order webhooks, refunds, reconciliation and invoice totals.
- [ ] Test CORS from allowed and disallowed origins, 429 rate limits, body-size limits and error responses.
- [ ] Run Lighthouse mobile, accessibility checks, SEO structured-data checks and Flutter release builds.
- [ ] Restore a backup to a separate database and validate counts plus representative invoice/payment records.
- [ ] Verify alerts for uptime, database, storage and payment reconciliation.

### Production release

- [ ] Obtain approval after staging acceptance; deploy during a monitored window.
- [ ] Verify `/api/health/live`, `/api/health`, login, public pages, business subdomains and admin authorization.
- [ ] Verify payment webhook delivery and reconciliation in the provider dashboard.
- [ ] Monitor error rate, latency, database connections, storage failures and payment discrepancies.

## Rollback plan

1. **Stop the rollout:** pause new deployments and, if payment state is uncertain, temporarily disable new checkout orders while leaving verified existing records intact.
2. **Application rollback:** redeploy the last known-good Render deployment or Git commit; do not overwrite the only copy of the current release.
3. **Data protection:** take a fresh encrypted backup before any corrective database operation. Do not restore a database snapshot over production unless the incident lead approves the data-loss window.
4. **Payment reconciliation:** compare Razorpay orders/payments/refunds with Creatarsh `PaymentIntent`, `Payment` and `Invoice` records; preserve provider IDs and idempotency records. Never manually mark a payment paid solely from a browser callback.
5. **Secret incident:** rotate affected API/JWT/webhook secrets and invalidate sessions as appropriate; redeploy with new environment values.
6. **Verify recovery:** health endpoints, login/role tests, business isolation smoke tests, website publishing, and payment status reconciliation must pass before reopening traffic.
7. **Record the incident:** note release commit, time, symptoms, rollback action, data reconciliation, customer impact and follow-up owner.

## Payment documentation correction

Phase 10 introduced a Razorpay integration, but the code package still requires actual sandbox acceptance before live use. “Integration exists” must not be read as “live payments are ready.” Third-party fees must remain explicit in plan and checkout copy.
