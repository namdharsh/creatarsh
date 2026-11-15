# Creatarsh — Corporate Website & Existing Platform Foundation

The public root website (`/`) is now a focused corporate overview for the current Creatarsh plan. It explains the parent brand, its six divisions, selected products and company direction. It is intentionally not a services storefront, customer portal or product dashboard.

## Public website
- Single-page corporate overview at `/`.
- Sections: company introduction, six divisions, selected products, principles and corporate enquiry form.
- Division links point to the planned subdomains: `tools`, `platforms`, `softwares`, `ai`, `commerce` and `studio`.
- Product statuses are labelled conservatively (existing product, in development, planned).
- Legacy public page URLs redirect to the current homepage.

## Retained infrastructure
- Existing Node.js/Express API and MongoDB integration are retained.
- Existing private Manager interface remains at `/manager/`.
- Existing API routes, security middleware, health endpoint, payment integration code and Render configuration are retained for later phases.
- The corporate enquiry form uses the existing `POST /api/public/leads` endpoint. It requires a working MongoDB connection.
- The corporate homepage does not require customer login, checkout, pricing catalogue, portfolio CMS or product-storefront features.

## Run locally
```bash
cd server
npm install
cp .env.example .env
# Configure MONGODB_URI and strong manager/customer JWT secrets in server/.env
npm start
```
Open `http://localhost:5000/`. Manager: `http://localhost:5000/manager/`. Health: `http://localhost:5000/api/health`.

## Deployment
The existing `render.yaml` is retained. Configure secrets in the hosting provider's environment settings. Do not commit `server/.env`, API credentials, database connection strings, JWT secrets or payment secrets.

## Important scope notes
- Legacy customer-facing HTML pages remain in the repository for reference and for any future migration, but are no longer served as public pages from their old routes.
- The existing Manager and API have not been redesigned or removed.
- Razorpay and other existing payment code is retained, but the corporate website does not expose checkout or subscriptions.
- The six division subdomains are links/placeholders until each division website is separately deployed and DNS is configured.
