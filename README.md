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
