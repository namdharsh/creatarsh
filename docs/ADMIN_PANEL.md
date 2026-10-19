# Creatarsh Admin Panel

The administrator workspace is served at `/admin` and uses the existing `/api/manager/login` session and shared MongoDB collections. It is separate from the existing Manager Studio at `/manager/`.

## Included sections

- Overview metrics and API process/database health
- Business approval queue (ownership claims, correction/removal requests)
- Business directory moderation: publish, draft, suspend and verification
- Customer listing and manager/admin/superadmin role management
- Static website ZIP upload, release publishing, rollback and deployment logs
- Contract templates and service plans
- Read-only invoice and payment records
- Advertising campaigns and sponsored placement states
- Correction/removal request review
- Deployment history, audit history and system health

## Local setup

1. Copy `server/.env.example` to `server/.env`.
2. Set `MONGODB_URI`, `MANAGER_JWT_SECRET` and `CUSTOMER_JWT_SECRET` to local development values. Do not commit `.env`.
3. Set `ADMIN_INITIAL_USERNAME` and `ADMIN_INITIAL_PASSWORD` to create a separate admin account on startup. Use a unique username and a strong password. The bootstrap creates the account only when that username does not exist; it never silently promotes an existing manager.
4. Set `AUDIT_IP_SALT` to a long random value. The audit stores a one-way hash of the request IP, not the raw address.
5. From the repository root run:

   ```bash
   npm install --prefix server
   npm run check --prefix server
   npm start --prefix server
   ```

6. Open `/admin` and sign in with the configured admin credentials.

The database must be reachable to authenticate administrators. Existing manager accounts continue to use `/manager`; manager-only accounts receive HTTP 403 from `/api/v1/admin/*`.

## Security behavior

- Every `/api/v1/admin/*` API re-reads the manager record from MongoDB and checks `active` plus role (`admin` or `superadmin`). JWT role claims alone are not trusted. Website preview URLs remain separately short-lived signed URLs; preview file routes are intentionally accessible only with a valid preview token.
- Only a `superadmin` can assign or edit a `superadmin` account. An admin cannot disable or demote their own account.
- Mutations to business moderation, role assignments, templates, plans, campaigns, website releases, ownership claims and correction/removal requests write audit events.
- Audit records omit raw IPs, tokens, passwords, contact details and user-provided free-text notes. A salted IP digest and broad user-agent family are retained for security investigations. Restrict database access and define an appropriate retention period before production.
- Admin audit history hides the stored IP digest from the UI/API. Never add secrets, customer PII or payment credentials to audit details.
- Invoices and payment records are currently read-only in this panel. Do not edit payment state manually as a substitute for verified payment gateway webhooks.
- Ad campaigns store admin-defined campaign state and placement. Public sponsored-serving/ranking and billing are not enabled by this panel alone.

## Indexes

Mongoose indexes are defined for audit time/action, campaign status/placement/time window, invoice status/date, payment status/date and customer/date, and privacy-request status/date. Existing business, deployment and request indexes remain in place. In a production migration, inspect index builds against a backup and expected collection size before enabling automatic index builds.

## Deployment checklist (when you are ready)

- Set the same `MONGODB_URI` used by the shared API and deploy the full project, including `manager/admin.html`, `manager/admin.css`, `manager/admin.js`, and the updated `server/server.js`.
- Configure a strong unique `ADMIN_INITIAL_PASSWORD` only for bootstrap; after confirming the admin account exists, remove the bootstrap username/password environment variables. Rotate credentials if they were ever shared or committed.
- Set distinct high-entropy JWT secrets and `AUDIT_IP_SALT`; do not use `.env.example` values.
- Confirm the reverse proxy supplies correct `X-Forwarded-For` behavior only from trusted proxies; Express trust-proxy configuration must match the actual hosting setup before relying on audit source hashes.
- Confirm private object storage settings before using website uploads. Upload/publish actions need working S3-compatible storage.
- Run `npm run check --prefix server`, then test admin/manager/customer roles separately, cross-role denial, upload validation, publish/rollback, correction/removal decisions, and audit visibility against a staging database.
- Enable HTTPS, restrict database network access, back up MongoDB, define audit retention and incident-response access, and review all admin users periodically.

Production hosting, DNS, credentials and external services are intentionally not configured by this build step.
