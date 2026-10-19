# Backend foundation (incremental)

This change preserves the existing Creatarsh customer pages, Manager Studio, routes, schemas, and Render service. It adds reusable foundation modules around the existing Express application; it does not scaffold a replacement application.

## Added modules

- `server/config/env.js`: environment parsing and production configuration checks.
- `server/config/database.js`: shared Mongoose connection helper with bounded server selection timeout.
- `server/lib/logger.js`: structured JSON logs, request IDs, and recursive secret-key redaction.
- `server/middleware/errors.js`: consistent API errors and safe 500 responses.
- `server/middleware/validate.js`: reusable request-section validation adapter. Use with a function returning `{ value }` or `{ errors }`, or a Zod-like `safeParse` schema.
- `server/middleware/security.js`: Helmet and explicit CORS origin policy.
- `server/middleware/rateLimit.js`: process-local API and authentication rate limiting.
- `server/middleware/health.js`: liveness and readiness endpoints.
- `server/test/foundation.test.js`: built-in Node test suite.

## Local setup (Windows PowerShell)

```powershell
cd server
Copy-Item .env.example .env
# Edit .env locally. Do not paste secrets into chat or commit this file.
npm install
npm test
npm run check
npm start
```

Use a MongoDB Atlas connection string in `MONGODB_URI`, and ensure the machine's current IP is allowed by the Atlas network access policy. The server starts without a database in development for legacy static pages, but database-backed endpoints will not work. Production startup validation requires a database URI, two independent JWT secrets of at least 32 characters, and explicit CORS origins.

## Health checks

- `GET /api/health/live`: process liveness; no database dependency.
- `GET /api/health/ready`: returns `200` only when MongoDB is connected, otherwise `503`.
- `GET /api/health`: legacy compatibility endpoint retained for existing integrations.

Render currently uses `/api/health/live` as its health-check path. Configure environment variables in the Render dashboard or secret store; do not put secret values in `render.yaml`. The `.env.example` file contains names and placeholders only.

## Security and deployment notes

- `TRUSTED_PROXY_COUNT` must match the actual trusted reverse-proxy hop count. The default is one for the current Render-style setup; verify it before production.
- The in-memory rate limiter is suitable only for a single Node process. Use a shared Redis-compatible store before running multiple API instances, and tune thresholds from observed traffic.
- The legacy frontend uses inline scripts/styles, so CSP remains disabled in this incremental foundation to avoid breaking it. Perform a CSP audit before enabling a restrictive policy.
- CORS allows only listed origins in production. Set `CORS_ORIGINS` to comma-separated exact origins, without paths.
- Request logs omit query strings and redact sensitive-key values. Never log request bodies, credentials, authorization headers, or raw connection strings.
- This local test suite does not connect to MongoDB or exercise live Render/Cloudflare configuration. Run integration smoke tests against a staging deployment before production rollout.
