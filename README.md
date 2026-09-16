# Creatarsh — Agency System

Premium dark Creatarsh customer website + manager Studio OS, backed by a MongoDB API.

## Customer
- Multi-page website: Home, Services, Work, About, Contact
- Customer registration/login
- Persistent JWT login across refresh and page changes
- My Account portal with projects, quotations, invoices and payments
- Logged-in project enquiries linked to the customer

## Manager
- Persistent manager login
- Dashboard metrics
- Leads & CRM
- Customers directory with registration/last-login details
- Projects and progress
- Quotations
- Invoices
- Payments
- Website CMS
- Services, Portfolio, Testimonials, FAQ and Banners CRUD
- Settings

## Run
```bash
cd server
npm install
npm start
```
Open `http://localhost:5000/` and `http://localhost:5000/manager/`.

Create `server/.env` from `.env.example`. Never commit `.env`.

Customer and manager assets use relative paths so the same files work both on separate Render static services and when served by the Express server. If the customer and manager static files are hosted separately from the API, define `window.CREATARSH_API_URL` before `site.js` / `manager.js` loads.

## Manager repair
The manager UI uses its own stylesheet and script with a defined query-selector helper; this build preserves the manager UI while fixing the runtime boot error that prevented navigation from initializing.
