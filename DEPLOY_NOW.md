# Creatarsh — production deployment

## Important
This project is an **Express Node.js Web Service**, not a Render Static Site. The same Express service serves the customer website, manager, and `/api/*` routes.

Render Web Service settings:

- Root Directory: `.`
- Runtime: Node
- Build Command: `npm install --no-audit --no-fund`
- Start Command: `npm start`
- Health Check Path: `/api/health`

The server binds to `0.0.0.0` and uses Render's `PORT` automatically.

## Required environment variables

```text
NODE_ENV=production
NODE_VERSION=20
MONGODB_URI=...
MANAGER_JWT_SECRET=...
CUSTOMER_JWT_SECRET=...
MANAGER_INITIAL_USERNAME=...
MANAGER_INITIAL_PASSWORD=...
CORS_ORIGINS=https://creatarsh.in,https://www.creatarsh.in
```

No Razorpay variables are required for the current booking-only flow.

## Domain

Attach `creatarsh.in` and `www.creatarsh.in` to this **Web Service**, not to a separate Render Static Site.

After deployment, test:

```text
https://creatarsh.in/api/health
```

Expected response:

```json
{
  "ok": true,
  "database": true,
  "service": "creatarsh-api"
}
```

If `/api/health` returns `Not Found` while the homepage works, the domain is still pointing to a static site or another service. The ZIP/code cannot change an existing Render service's domain attachment; the domain must be attached to this Web Service.
