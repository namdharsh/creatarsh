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

If the customer and manager static files are hosted separately from the API, define `window.CREATARSH_API_URL` before `site.js` / `manager.js` loads. When served by this Express server, relative `/api` is used automatically.
