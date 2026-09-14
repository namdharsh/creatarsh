# Creatarsh
Independent development-company platform starter.

## Architecture
- customer/: public website
- manager/: CMS/admin panel
- server/: Node.js/Express API
- shared/: shared configuration
- uploads/: local development media placeholder

Production infrastructure is intentionally separate from RHN Tools:
MongoDB, Cloudinary, Render services/accounts, secrets and repositories must be created independently.

## Planned dynamic modules
Banners, Portfolio, Services, Testimonials, Website Content, Social Links, Leads and Manager Authentication.

## Run
1. `cd server`
2. `npm install`
3. Copy `.env.example` to `.env`
4. `npm run dev`
5. Open `customer/index.html` and `manager/index.html`

This starter is a clean foundation, not a production deployment. Security hardening and database/cloud configuration should be completed before launch.
