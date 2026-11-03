# Creatarsh Phase 1 — SaaS storefront

## Goal

Turn the existing public Creatarsh website into the discovery and product-selection storefront for Creatarsh-owned software, while continuing to use the existing Express application, MongoDB catalogue records, customer registration routes and manager catalogue.

## Implemented in this milestone

- Public homepage at `/` with a SaaS-focused value proposition and product catalogue section.
- Product listing at `/products`.
- Product detail route at `/products/:slug`.
- Product and plan content loaded from the existing MongoDB-backed public API:
  - `GET /api/public/products`
  - `GET /api/public/products/:slug`
- Existing public content/FAQ endpoint remains available.
- Public catalogue endpoint returns only active products and active plans.
- Product detail endpoint returns only active products and active plans.
- Public content endpoint now fails fast with a clear 503 response if MongoDB is unavailable.
- Product pages link into the existing account registration flow with product/plan query parameters.
- Product pages explain that account creation or plan selection does not itself authorize or charge a recurring payment.
- Existing customer login, registration, legal pages, manager pages and service routes remain in the project.

## Data source and authority

The public storefront reads product, plan, feature and price information from MongoDB through the existing API. The browser is display-only. The storefront does not create subscriptions, calculate entitlements, mark payments successful, or grant access.

The existing manager SaaS catalogue remains the intended source for product/plan administration. Existing subscription and payment APIs are not silently replaced by this storefront milestone.

## Local verification

Run from the project root:

```bash
npm run check:syntax
node --test server/test/saas-storefront.test.js
npm test
```

The focused storefront tests verify route presence, public API source, active product/plan filtering, frontend API integration, HTML escaping and basic navigation/legal links.

## Known limitations / not included

- The `/api/v1/businesses/*` and `/api/v1/admin/*` endpoints referenced by some existing clients were not present in the reviewed `server/server.js` route declarations. They need a separate compatibility investigation against the currently deployed backend before they can safely be recreated or removed.
- The full existing test suite still has failures in pre-existing admin, business, payment, advertising and publisher areas. This milestone does not claim those areas are fixed.
- No live MongoDB connection or production website/API request was made.
- No recurring mandate or AutoPay flow is implemented by this public storefront.
- Registration currently preserves the selected product/plan as a notice; actual subscription creation and checkout remain a separate, gated milestone.
- No deployment, DNS, hosting or production database changes were made.

## Acceptance criteria

- Public pages are served by existing Express routes.
- Product listing and detail pages consume the existing public catalogue API.
- Draft/archived products are not returned by the public product endpoints.
- Inactive plans are not returned by the public product endpoints.
- Unavailable database produces a clear 503 response.
- Frontend output escapes database-provided text before HTML insertion.
- Existing customer and manager code is retained.
