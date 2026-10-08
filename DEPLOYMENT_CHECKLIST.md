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
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `CORS_ORIGINS=https://creatarsh.in,https://www.creatarsh.in`

## First checks after deployment
1. Open `/api/health` and confirm `ok: true` and `database: true`.
2. Open `/` and `/buy`.
3. Open `/login` and `/register`.
4. Open `/manager/` and sign in.
5. In Manager → Service Catalogue, confirm package prices and minimum booking charges.
6. Use Razorpay test credentials first.
7. Create a test customer account.
8. Select a package, submit requirements and verify that only the configured minimum booking charge is sent to Razorpay.
9. Complete the test payment.
10. Confirm an `ENQ...` lead appears in Manager → Leads / Workflow.
11. Confirm the booking payment and invoice appear in the customer account.
12. Configure the Razorpay webhook URL as `https://YOUR-DOMAIN/api/webhooks/razorpay` with the same webhook secret.
13. Only after test-mode verification, switch Razorpay to live keys.
