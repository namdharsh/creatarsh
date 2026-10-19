# Creatarsh Production Deployment Checklist

## Render
Deploy the **contents of this ZIP as the repository root**.

Build command:
`npm install --no-audit --no-fund`

Start command:
`npm start`

Health check:
`/api/health`

## Required environment variables
- `NODE_ENV=production`
- `MONGODB_URI`
- `MANAGER_JWT_SECRET`
- `CUSTOMER_JWT_SECRET`
- `MANAGER_INITIAL_USERNAME`
- `MANAGER_INITIAL_PASSWORD`
- `CORS_ORIGINS=https://creatarsh.in,https://www.creatarsh.in`

## Staging acceptance first
Follow `PHASE_12_AUDIT_REPORT.md` and complete every staging acceptance item before enabling live traffic or payments.

## Package booking and Razorpay sandbox
1. Open `/api/health` and confirm `ok: true` and `database: true`.
2. Open `/`, `/buy`, `/login` and `/register`.
3. Sign in with a test customer and create a sandbox payment order.
4. Verify that the server calculates the amount from an active database plan.
5. Test captured, failed, duplicate and invalid-signature webhook cases in Razorpay Test Mode.
6. Confirm invoices and payment intents match provider state after reconciliation.
7. Verify that third-party domain, hosting and platform fees are disclosed separately where applicable.
8. Do not enable live payment credentials until sandbox acceptance and the Phase 12 staging checklist pass.
