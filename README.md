# Creatarsh — Agency System

Production-ready Creatarsh customer website + Manager Studio OS backed by MongoDB.

## Included
- Customer website: Home, Services, Work, About, Contact, FAQ
- Customer registration/login and account portal
- Projects, quotations, invoices, payments and notifications
- Manager dashboard, CRM/leads, customers and project management
- Website CMS: services, portfolio, testimonials, FAQ, banners and site content
- Security headers, API rate limiting, JWT authentication and CORS controls
- SEO metadata, canonical URLs, robots.txt, sitemap.xml and Organization schema
- Render deployment configuration in `render.yaml`

## Run locally
```bash
cd server
npm install
npm start
```

Open `http://localhost:5000/` and `http://localhost:5000/manager/`.

Create `server/.env` from `server/.env.example`. Never commit `.env`.

## Production / Render
Use the repository root as the Render service root. `render.yaml` contains the build/start commands and health check.

Required environment variables:
- `MONGODB_URI`
- `MANAGER_JWT_SECRET`
- `CUSTOMER_JWT_SECRET`
- `MANAGER_INITIAL_USERNAME`
- `MANAGER_INITIAL_PASSWORD`
- `CORS_ORIGINS` when the frontend is hosted separately

After the first manager login, use a strong password and rotate any credentials that may previously have been exposed.

## Important
If the old project ZIP or Git history ever contained a real `.env`, rotate the MongoDB password and JWT secrets before production deployment.

## Important: MongoDB-driven public website

The public Creatarsh site does not use hardcoded service/portfolio/banner content. MongoDB is the source of truth for:
- Services
- Portfolio projects
- Homepage banners
- Testimonials
- FAQs
- Website CMS content

Manage these from `/manager/` after connecting the API to MongoDB with `MONGODB_URI`.

The public site intentionally does not fall back to hardcoded service/portfolio data when MongoDB is unavailable. This prevents stale content from appearing and makes the Manager CMS the single source of truth.

For production, configure `MONGODB_URI`, `MANAGER_JWT_SECRET`, `CUSTOMER_JWT_SECRET`, and the initial manager credentials in the hosting provider's environment settings. Never commit `.env` or MongoDB credentials to GitHub.

## Sell-ready deployment checklist
Before accepting real customer payments:
1. Set `MONGODB_URI`, `MANAGER_JWT_SECRET`, `CUSTOMER_JWT_SECRET`, manager credentials and `CORS_ORIGINS` in Render.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` when payments are enabled.
3. Configure the Razorpay webhook URL as `https://creatarsh.in/api/webhooks/razorpay` (or your actual API origin) and subscribe to payment capture/order paid events.
4. Test: Create Account → Login → My Account → Start Project/Buy → Terms acceptance → Privacy acknowledgement → Order → Razorpay Test Mode → server verification → invoice → dashboard.
5. Test support tickets, contracts, privacy requests, manager workflow and mobile layout.
6. Never upload `server/.env` or commit credentials. Rotate any credential that was ever exposed.

## Authentication fix
The Account page initializes the client authentication modal from `customer/js/site.js` after its dynamic login link is rendered. This avoids the previous event-order bug where the modal script ran before the Client Login link existed.
