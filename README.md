# Creatarsh — Software Products & Subscription Storefront

Creatarsh is presented as a software products and technology company. The customer website is a product catalogue and plan storefront; the Manager is the control centre for products, plans, banners and public website copy.

## Included
- Customer storefront with product discovery, plan comparison, account registration/login and support pages.
- Manager CMS for Products & Tools, Plans & Pricing, Homepage Banners and Storefront Content.
- Existing customer account, orders, invoices, payments, support and document modules retained.
- MongoDB-backed content and product pricing APIs.
- Existing security middleware, manager/customer authentication, Razorpay integration hooks and Render configuration.

## Run locally
```bash
cd server
npm install
npm start
```
Open `http://localhost:5000/` and `http://localhost:5000/manager/`. Create `server/.env` from `server/.env.example`; never commit secrets.

## Manage the storefront
1. Sign in to `/manager/`.
2. Open **Products & Tools** to add/edit product names, categories, descriptions, capabilities, features, icons, and visibility.
3. Open **Plans & Pricing** to set prices, monthly/one-time billing labels, plan features, order and visibility.
4. Open **Banners & Hero** to manage banner images, copy, CTA, order, opacity and overlay.
5. Open **Storefront Content** to edit hero text, product/pricing section headings, support details and footer text.

The public website reads product content from the `services` CMS collection and plans from the existing `/api/public/pricing` API.

## Payment and subscription readiness — important
The existing payment implementation supports a Razorpay booking/payment flow and records product/package orders. It does **not** yet implement a complete recurring subscription lifecycle (Razorpay subscriptions, automatic renewals, dunning, plan upgrades/downgrades, cancellation and entitlement enforcement). Monthly plan labels are catalogue metadata only until that billing lifecycle is implemented and tested. Do not advertise automatic recurring billing or accept live subscription payments until that work is complete.

Before production:
- Configure MongoDB, manager/customer JWT secrets and initial manager credentials.
- Configure Razorpay keys and webhook secrets only after completing end-to-end test-mode verification.
- Test registration, login, order creation, payment verification, manager order visibility and access controls.
- Review legal pages and publish accurate plan limits, taxes, renewals and cancellation terms.
- Never include `.env` or real credentials in the project archive.

## Validation
JavaScript syntax checks pass for the customer website, manager interface and Node server. Run the server test suite in your own environment before deployment.

## Skeleton loading
Server-backed customer storefront content (hero copy, products, plans and managed banner images) and Manager screens use animated skeleton placeholders while requests are in flight. Account dashboard and FAQ areas also retain their skeleton placeholders. Reduced-motion preferences disable the shimmer animation.


## Digital Tools catalogue and Resume Studio
- Public catalogue: `/tools` (the **Digital Tools** identity page).
- Resume Studio: `/tools/resume/`; its separate template gallery is `/tools/resume/templates.html`.
- Tool cards are read from MongoDB through `GET /api/public/tools`; only active records marked `isDigitalTool` are returned.
- Manager: sign in at `/manager/` and open **Digital Tools** to create, edit and show/hide tool cards. Hiding a tool is reversible and does not delete its catalogue record. The same CMS collection powers the existing Products & Services section.
- Tool launch URLs are restricted server-side to safe internal `/tools/...` paths. The Resume Studio card is inserted on first successful MongoDB connection and is not overwritten on later restarts, so manager edits persist.
- If MongoDB is not configured or unavailable, the catalogue shows a retry/error state instead of silently showing stale hard-coded cards.

## Repository hygiene
- Never commit `.env`, API credentials, database connection strings, JWT secrets or payment secrets. Configure these through your deployment environment and use `server/.env.example` only as a template.

Run `node tests/digital-tools-smoke.js` from the repository root to check the Digital Tools integration and ensure no real server `.env` is present.
