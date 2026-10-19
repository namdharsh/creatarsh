# Creatarsh Business Onboarding and Ownership API

This phase extends the existing Express API and MongoDB/Mongoose deployment. It does not replace the existing customer or manager system.

## Setup

1. Copy `server/.env.example` to `server/.env` and populate the existing local configuration privately.
2. Install server dependencies with `npm install --prefix server` (includes `multer` for bounded multipart uploads).
3. Run `npm test --prefix server` and `npm run check --prefix server`.
4. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in local environment/Render settings to enable image uploads. Without these variables the upload endpoint returns 503.
5. Deploy to staging first. The current customer JWT (`type: customer`) is used for business-owner APIs; manager JWT is used for admin review APIs.

## Endpoints

- `GET /api/v1/business/categories` — controlled category list.
- `POST /api/v1/businesses` — authenticated customer creates a free draft profile and becomes its initial owner. Drafts are not public.
- `GET /api/v1/businesses/mine` — authenticated user's active business memberships.
- `POST /api/v1/businesses/:businessId/claims` — submit a claim for a published listing.
- `GET /api/v1/businesses/:businessId/claims` — current owner views pending claims.
- `POST /api/v1/businesses/:businessId/claims/:claimId/review` — current owner approves/rejects a claim.
- `GET /api/v1/admin/business-claims` — manager lists pending claims for unclaimed/administrative review.
- `POST /api/v1/admin/businesses/:businessId/claims/:claimId/review` — manager approves/rejects claim; approval transfers active ownership.
- `GET /api/v1/businesses/:businessId/profile` — member reads private management profile.
- `PATCH /api/v1/businesses/:businessId/profile` — owner/editor updates allowed fields; editors cannot change contact/address fields.
- `POST /api/v1/businesses/:businessId/media` — multipart field `file`; accepts JPG/PNG/WebP up to 5 MB, stores image in Cloudinary, optional `alt`, `useAsLogo=true`, `useAsCover=true` fields.
- `POST /api/v1/businesses/:businessId/requests` — authenticated user submits `CORRECTION` or `REMOVAL` request; `details` must be 10–2000 characters. Optional `proposedChanges` for correction.
- `GET /api/v1/businesses/:businessId/requests` — requester's own requests; membership required.
- `GET /api/v1/admin/business-requests` — manager lists pending/in-review correction/removal requests.
- `PATCH /api/v1/admin/business-requests/:requestId` — manager sets `IN_REVIEW`, `COMPLETED`, or `REJECTED`; completing a removal request suspends the listing.
- `GET /api/v1/businesses/:businessId/permissions` — active owner reads audit/permission history.

Protected endpoints use `Authorization: Bearer <customer-access-token>` or manager token for `/api/v1/admin/*`. Never put tokens in source control or logs.

## Profile request example

```json
{
  "name": "Example Business",
  "category": "Retail",
  "city": "Gwalior",
  "pinCode": "474001",
  "description": "Business description",
  "phone": "+91 9876543210",
  "contactOptions": ["PHONE", "WHATSAPP", "WEBSITE"],
  "websiteUrl": "https://example.com",
  "hours": { "monday": { "open": "10:00", "close": "20:00", "closed": false } }
}
```

The example is a request template only; no sample business is inserted into the database. Categories are controlled by `GET /api/v1/business/categories`.

## Privacy and authorization notes

- Public discovery endpoints query only `status: PUBLISHED` records and omit internal ownership fields.
- Email, WhatsApp and phone are returned publicly only when the corresponding `contactOptions` opt-in is present.
- Claim proof references and review notes are not exposed by public endpoints.
- Business profile reads/edits, media uploads and owner permission history check active `BusinessMember` records on the server.
- Correction/removal submissions can be made by an authenticated customer; only manager review can complete a removal, which suspends the listing. A formal deletion/retention policy should be approved before hard deletion is added.
- Ownership claims are administrative decisions; production should require evidence review and audit monitoring. Manager approval is powerful and must be restricted to trusted manager accounts with strong credentials/MFA.
- Cloudinary assets are delivered by URL after upload. Configure Cloudinary account policies and retention appropriately; if private media is needed, add authenticated delivery rather than using public URLs.

## Data/index migration

Mongoose models add `BusinessMember`, `BusinessClaim`, `BusinessPermission`, and `BusinessRequest`, and extend `Business` with ownership, hours, contact preference and media fields. Indexes are declared in schemas. Verify Atlas index creation and test on a staging copy before production rollout. Existing businesses are not automatically assigned owners; claims can be reviewed by a manager.
