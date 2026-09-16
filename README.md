# Creatarsh

Creatarsh is a premium digital development agency website with a manager Studio OS and customer portal.

## Included
- Multi-page customer website: Home, Services, Work, About, Contact, My Account
- Persistent manager authentication across refresh/page reloads
- Customer registration/login with persistent sessions
- Customer profile and account dashboard
- Customer projects, quotations, invoices and payment activity
- Manager customer directory with customer details and last-login information
- Lead capture linked to a logged-in customer when available
- Manager CMS for services, portfolio, testimonials, FAQ, banners and website content
- MongoDB-backed API

## Environment
Create `server/.env` from `.env.example` and configure:
- `MONGODB_URI`
- `MANAGER_JWT_SECRET`
- `CUSTOMER_JWT_SECRET` (optional; falls back to manager secret)
- `MANAGER_INITIAL_USERNAME`
- `MANAGER_INITIAL_PASSWORD`

Never commit `.env` or secrets.

## Run
```bash
cd server
npm install
npm start
```
Then open `http://localhost:5000/` and `http://localhost:5000/manager/`.

For separate hosting, set `window.CREATARSH_API_URL` before the customer/manager scripts load.
