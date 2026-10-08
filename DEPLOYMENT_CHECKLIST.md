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

## Booking-only flow
1. Open `/api/health` and confirm `ok: true` and `database: true`.
2. Open `/` and `/buy`.
3. Open `/login` and `/register`.
4. Open `/manager/` and sign in.
5. In Manager → Service Catalogue, confirm package prices and active/hidden status.
6. Create a test customer account.
7. Select a package and submit the booking enquiry.
8. Confirm an `ENQ...` lead appears in Manager → Leads / Workflow.
9. Confirm the booking appears in the customer's Orders/account area.
10. Confirm Creatarsh can contact the customer and then prepare quotation, contract, project and other documents manually.

## Online payment
Online payment is intentionally **disabled** in this build. No payment is collected when a customer books a package. Payment terms can be discussed and recorded later as part of the quotation/contract/project process.
