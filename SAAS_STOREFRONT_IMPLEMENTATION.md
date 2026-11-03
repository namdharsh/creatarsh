# Creatarsh SaaS storefront implementation

## What changed
- Replaced the public homepage with the minimal neutral SaaS storefront.
- Added `/products` catalogue and `/products/:slug` detail/pricing pages.
- Added a separate MongoDB `SaaSProduct` collection. It does not reuse legacy `ServicePackage` (agency project packages).
- Added public read APIs: `GET /api/public/products` and `GET /api/public/products/:slug`.
- Added administrator-only manager APIs: `GET/POST /api/manager/saas-products`, `PUT /api/manager/saas-products/:id`, `DELETE /api/manager/saas-products/:id` (archive).
- Added `/manager/saas-catalogue` for administrators to manage product copy, status, Basic/Medium/Premium plans, prices, features and FAQs. A link is available in the manager sidebar.
- Existing agency pricing, booking, CRM, payment, customer and manager endpoints remain in place.

## Manager publishing workflow
1. Sign in at `/manager/` using an active `admin` or `superadmin` account.
2. Open **SaaS product catalogue**.
3. Create a product as Draft; configure exactly one Basic, Medium and Premium tier.
4. Add price in rupees, currency, MONTH/YEAR interval, trial days, features and FAQs.
5. Set status to Active and save. The public catalogue reads the MongoDB record.
6. Archive a product to remove it from the public catalogue without deleting its record.

No seeded sample products are created. The public storefront shows an empty state until the manager publishes real products.

## Billing safety note
The storefront discloses the intended trial and recurring billing policy. The current code does **not** create a mandate, start a trial, collect a recurring payment, renew a subscription or cancel a provider subscription. The product CTA leads to account creation only; the registration page explicitly states that account creation is not subscription activation. Do not market the trial as active until the separate recurring billing/mandate implementation and sandbox acceptance are complete.

## API payload example
```json
{
  "code": "EXAMPLE_TOOL",
  "slug": "example-tool",
  "name": "Example Tool",
  "shortDescription": "A concise customer-facing summary.",
  "description": "What the product does and the problem it solves.",
  "status": "DRAFT",
  "currency": "INR",
  "plans": [
    {"code":"BASIC","tier":"BASIC","name":"Basic","amount":199,"currency":"INR","interval":"MONTH","trialDays":3,"features":["Core features"],"active":true},
    {"code":"MEDIUM","tier":"MEDIUM","name":"Medium","amount":499,"currency":"INR","interval":"MONTH","trialDays":3,"features":["Everything in Basic","More capacity"],"active":true},
    {"code":"PREMIUM","tier":"PREMIUM","name":"Premium","amount":999,"currency":"INR","interval":"MONTH","trialDays":3,"features":["Everything in Medium","Advanced features"],"active":true}
  ],
  "faqs": [{"question":"Who is this for?","answer":"Add an accurate product-specific answer."}]
}
```

## Notes
- Amounts in this catalogue are display prices in rupees (not paise). A future billing service must resolve price server-side and convert to the provider's required minor units.
- Active products are rejected unless all three active tiers are present. Drafts can be incomplete.
- Existing `/api/public/pricing` and `/api/manager/catalogue` remain the legacy agency package APIs.
