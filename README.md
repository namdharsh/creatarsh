# Creatarsh — Agency Studio OS

This build is the upgraded Creatarsh foundation for a premium digital development agency.

## Structure
- `customer/` — premium public website
- `manager/` — manager/studio control center
- `server/` — Express + MongoDB API and optional single-service static hosting
- `shared/` — architecture notes

## Local setup
1. Copy `server/.env.example` to `server/.env`.
2. Set `MONGODB_URI`, `MANAGER_JWT_SECRET`, `MANAGER_INITIAL_USERNAME`, and `MANAGER_INITIAL_PASSWORD`.
3. From `server/`: `npm install` then `npm start`.
4. Public website: `http://localhost:5000/`
5. Manager: `http://localhost:5000/manager/`

## Separate static hosting
If customer and manager are hosted as separate static services, set `window.CREATARSH_API_URL` before `site.js` / `manager.js` loads. The default is `https://creatarsh.onrender.com/api` for the existing deployment.

## Manager login troubleshooting
If the login screen itself is blank, open browser DevTools → Console. This build keeps the login UI independent from API availability, so an API outage should show a connection error after submit rather than prevent the login page from rendering.

If login says `Cannot connect to Creatarsh server`, verify the API URL and that the Render API service is running. If the API returns `Invalid username or password`, verify the manager credentials and MongoDB connection.

## Security
Do not commit `.env`, database credentials, JWT secrets, Razorpay secrets, or other private credentials.
