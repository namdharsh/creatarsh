# Creatarsh Phase 10 — Plans, Razorpay, invoices and reconciliation

## What this phase adds
- Configurable service plans stored in MongoDB (`ServicePackage`), with public read-only plan listing and admin-only create/update APIs.
- Razorpay order creation performed by the API using an active database plan; client-supplied amounts are ignored.
- Required `Idempotency-Key` header scoped to the authenticated customer.
- Checkout signature verification followed by a server-to-server Razorpay payment lookup. A valid browser callback alone never marks an order paid.
- Raw-body webhook HMAC verification, event-id deduplication and retry of previously failed event processing.
- `PaymentIntent` records, `Payment` ledger entries, paid invoices, customer notifications, refund state propagation and admin reconciliation endpoint.
- Unit tests for checkout/webhook HMACs, amount conversion and route guardrails.

## Provider and sandbox
Provider: Razorpay Standard Checkout + Orders API. Start with Razorpay **Test Mode** credentials.

Configure only in the server environment (Render environment variables or local `server/.env`):
- `RAZORPAY_KEY_ID` — test key ID
- `RAZORPAY_KEY_SECRET` — test key secret
- `RAZORPAY_WEBHOOK_SECRET` — webhook secret created for the configured webhook endpoint
- `RAZORPAY_MODE=test`
- `DEFAULT_GST_RATE=18` (confirm the applicable tax treatment with your accountant before live billing)

Never place these values in Flutter, HTML, GitHub, client-visible config, logs, or a distributable ZIP. The API returns only the public Key ID needed by Checkout.

## API routes
- `GET /api/public/plans` — active plans and third-party-charge disclosure.
- `POST /api/customer/payments/razorpay/order` — authenticated customer; body `{ "planCode": "..." }`; requires `Idempotency-Key` header.
- `POST /api/customer/payments/razorpay/verify` — authenticated owner of the intent; body includes `intentId`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
- `POST /api/webhooks/razorpay` — provider webhook; requires `X-Razorpay-Signature` and `X-Razorpay-Event-Id` headers.
- `GET /api/v1/admin/plans` and `POST/PATCH /api/v1/admin/plans` — admin-only plan management; mutations are audited.
- `GET /api/manager/payment-intents` — administrator-only payment intent ledger.
- `POST /api/manager/payments/reconcile/:id` — administrator-only provider reconciliation for a specific intent.

The legacy `/api/manager/plans` routes also require the administrator role; prefer the `/api/v1/admin/plans` routes for admin integrations.

## Webhook setup
In Razorpay Dashboard Test Mode, configure the webhook URL to `https://YOUR-API-HOST/api/webhooks/razorpay`, generate a webhook secret, and subscribe at minimum to `payment.captured`, `payment.failed`, `order.paid`, and `refund.processed`. Copy the webhook secret into server environment settings. Ensure the reverse proxy preserves the raw JSON body; Express captures the original bytes before JSON parsing.

## Sandbox acceptance checklist
1. Create a test plan as an administrator and confirm it appears in `GET /api/public/plans`.
2. Login as a test customer and create an order with a fresh idempotency key. Verify the returned amount is derived from the DB plan and in paise.
3. Repeat the same request with the same key: same intent/order should be returned. Reuse that key with a different plan: expect `409`.
4. Use Razorpay test checkout credentials/payment methods. Verify a valid checkout signature then confirm the server fetches the payment and checks order ID, amount, currency and status.
5. Send an invalid signature: expect `400`, no paid invoice, and no successful payment ledger entry.
6. Deliver the same captured webhook twice with the same event ID: second delivery should be idempotent.
7. Deliver a webhook with modified body or invalid signature: expect `400`.
8. Simulate payment failure and confirm the intent remains unpaid. Simulate refund event and verify invoice/payment/intent refund status.
9. Reconcile an intent from the admin endpoint and compare provider order/payment state to MongoDB records.
10. Verify the customer can access only their own intents/invoices; non-admin users receive `403` on plan management and reconciliation routes.
11. Confirm third-party domain, hosting, app-store and other fees are clearly disclosed separately when applicable.

## Reconciliation procedure
- Daily, export Razorpay payments/refunds and compare provider payment IDs, order IDs, amounts and currency to `PaymentIntent`, `Payment` and `Invoice` records.
- For uncertain records, use the admin reconciliation endpoint. It queries Razorpay directly; never mark an intent paid manually just because the browser reports success.
- If provider order creation fails after a local intent is created, the intent is flagged `RECONCILIATION_REQUIRED`; inspect Razorpay Dashboard before taking manual action. Do not create a new order blindly.
- Keep the provider event ID and intent ID in your internal investigation notes, but never log secrets or full payment credentials.
- Refunds should be initiated and confirmed through the provider's authorized process; reconcile provider refund IDs and ledger state before accounting close.

## Run tests
From `server/`:
```bash
npm install --no-audit --no-fund
npm test
npm run check
```

For a local API run, configure `server/.env` with a test MongoDB URI, strong development JWT secrets and Razorpay Test Mode credentials, then run `npm start`. Do not use live credentials until sandbox acceptance, webhook delivery, tax/invoice review, refund flow and production secret configuration have been approved.

## Known limitations / release gates
- No real Razorpay credentials or live webhook were available in this build environment, so provider sandbox checkout and webhook delivery have not been executed here.
- Automated subscription renewals are not implemented; `MONTHLY` and `YEARLY` currently label billing cadence only. Use Razorpay Subscriptions in a separately tested phase before promising automatic recurring charges.
- GST settings and invoice fields require review for the applicable registration and supply treatment before issuing live tax invoices.
- Do not deploy to production until test mode reconciliation and backup/rollback review are complete.


## Creatarsh website checkout refresh (2026-10)
- The customer package flow now supports Razorpay Checkout when `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are configured.
- The server creates orders from the active package's configured `bookingAmount`, verifies the checkout signature, then checks the payment status and amount directly with Razorpay before marking the order paid/partially paid.
- A signed `payment.captured` webhook can reconcile the local order and payment record.
- When credentials are absent, the website clearly falls back to a project enquiry and does not claim that payment was taken.
- Before production use, test with Razorpay test keys and configure `RAZORPAY_WEBHOOK_SECRET`; never put secret keys in frontend code.
