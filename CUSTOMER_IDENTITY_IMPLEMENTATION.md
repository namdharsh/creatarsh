# Customer identity implementation notes

This patch extends the current Creatarsh SaaS storefront project without replacing the existing customer portal or manager login. It adds session-backed customer identity to the existing Express/Mongoose stack and preserves the current bearer-token API contract for the customer frontend.

See `CUSTOMER_IDENTITY_SECURITY.md` for security design, environment configuration, verification-provider setup, CSRF rationale and rollout notes.

New customer API routes:

- `POST /api/customer/register`
- `POST /api/customer/login`
- `POST /api/customer/verify-email`
- `POST /api/customer/verification/resend`
- `POST /api/customer/phone/send-code`
- `POST /api/customer/phone/verify`
- `POST /api/customer/password/forgot`
- `POST /api/customer/password/reset`
- `POST /api/customer/password/change`
- `GET /api/customer/sessions`
- `DELETE /api/customer/sessions/:id`
- `POST /api/customer/logout`
- `POST /api/customer/logout-all`
- `GET /api/customer/saas-dashboard`

Existing `/api/customer/me` and customer-protected routes now require a valid, non-revoked database session as well as a signed customer bearer token. Existing stateless customer tokens are intentionally no longer accepted; customers sign in again after rollout.

The account UI now includes SaaS subscriptions, profile verification indicators, password settings, session management and sign-out-all. New public pages: `/forgot-password`, `/reset-password` and `/verify-email`.
