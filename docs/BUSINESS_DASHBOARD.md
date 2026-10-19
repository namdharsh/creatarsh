# Creatarsh Business Dashboard (build-phase)

## What is included
- Authenticated business workspace at `/business-dashboard`; uses the existing customer login token (`cr_customer_token`).
- Business list comes from the active memberships of the signed-in customer. Every dashboard API checks membership on the server; a business ID supplied by the browser does not grant access.
- Profile editing uses the existing business profile API. Website status and latest active release are read from `WebsiteDeployment` and published site status.
- Date-filtered analytics: estimated daily pseudonymous visitors, page views, traffic source host, top pages, contact/WhatsApp/directions clicks, and submitted enquiries.
- Public business listing enquiry form. Enquiries can be reviewed and status-updated by authorized business members.
- Product and order navigation is shown only when `Business.storeEnabled === true`. Product APIs are business-scoped and return 404 while the store module is disabled. Store orders are intentionally not connected to unrelated Creatarsh agency `Order` records; an actual storefront order model/workflow is a separate implementation step.
- MongoDB compound indexes cover business/time analytics, event/time analytics, enquiry recency/status, and business-scoped products.

## Privacy model
- The collector never persists request IP addresses or user-agent strings.
- A random, tab-session token is stored in `sessionStorage`; the server stores only a daily SHA-256 digest of that token, never the raw token. Analytics responses return aggregates only and never visitor digests.
- Referrer data is reduced to the referring hostname. Page paths have query strings/fragments removed and are length-limited.
- Visitor counts are estimates of distinct pseudonymous sessions per selected range, not verified people. Clearing session storage or using another tab/device may change counts. Do not use this metric for identity or sensitive profiling.
- Enquiry submissions are different from analytics: a business member can see contact information intentionally submitted through the enquiry form. Never add personal identity fields to analytics events.
- This initial implementation has no cookie banner or consent manager integration for analytics; review consent/legal requirements before enabling analytics on a public production site.

## Local setup
1. From the project root, copy `server/.env.example` to `server/.env` and set local development values. Keep `.env` untracked and never put credentials in the ZIP or Git.
2. Install dependencies with `npm install --prefix server`.
3. Run tests and syntax checks with `npm test --prefix server` and `npm run check --prefix server`.
4. Start locally with `npm start --prefix server` after MongoDB is configured and reachable. The dashboard page is `/business-dashboard`; sign in through `/login` first.
5. For a local smoke test, create a business through the existing onboarding flow or approve/claim an existing business, then open the dashboard. The selected business must have an active `BusinessMember` record for the signed-in customer.

## Existing database compatibility
- No existing collection is dropped or renamed. New collections are `businessanalyticsevents`, `businessenquiries`, and `businessstoreproducts` (Mongoose pluralization applies).
- `storeEnabled` is a new Boolean field with a default of `false`; existing businesses therefore do not expose store screens until enabled intentionally.
- MongoDB creates indexes automatically according to Mongoose schema settings when index creation is enabled. For large production datasets, schedule index creation during a maintenance window; deployment/production setup is deliberately deferred in this build phase.

## API overview
- `POST /api/public/business-events` — allowlisted anonymous event ingestion for published business slugs.
- `POST /api/public/business-enquiries` — public enquiry submission; requires name, message and email or phone.
- `GET /api/v1/businesses/:businessId/dashboard`
- `GET /api/v1/businesses/:businessId/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` (maximum 367 days)
- `GET /api/v1/businesses/:businessId/enquiries?from=&to=&status=&page=&limit=`
- `PATCH /api/v1/businesses/:businessId/enquiries/:enquiryId` with `{ "status": "NEW|CONTACTED|CLOSED" }`
- `GET/POST /api/v1/businesses/:businessId/store/products`
- `GET /api/v1/businesses/:businessId/store/orders` (intentionally returns no agency orders; order integration is pending)

## Test limitations
The automated tests validate route protection, privacy-safe schema shape, indexes, UI wiring, event allowlists and store feature gates. They do not replace live MongoDB integration tests or browser end-to-end tests; those require local services and credentials configured by the developer.
