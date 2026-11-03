# Creatarsh Phase 1 — Migration notes

## Deployment impact

This milestone changes only the source package. It has not been deployed.

## Database

- No MongoDB schema migration is required.
- No collection is dropped, renamed or recreated.
- Existing `SaaSProduct` records remain the catalogue source.
- Existing plan records remain nested in their current product documents.
- Public API responses now filter inactive plans server-side.

## API compatibility

- Existing `GET /api/public/products` and `GET /api/public/products/:slug` paths are retained.
- Existing `/api/public/content` path is retained; it now returns 503 immediately if the database is not ready.
- No customer auth, manager auth, payment, booking or subscription write endpoint is changed in this milestone.

## Rollback

To roll back Phase 1 source changes, restore the previous source ZIP/deployment artifact. No database rollback is necessary because this milestone performs no database writes or schema migrations.

## Required checks before deployment

1. Compare the source with the currently deployed release.
2. Verify the production API serves `/api/public/products` and `/api/public/products/:slug`.
3. Verify existing login, registration, manager login and manager SaaS catalogue.
4. Verify that public catalogue data is correct in the production database.
5. Verify the `/api/v1/businesses/*` and `/api/v1/admin/*` routes with the deployed backend.
6. Run the complete test suite and review remaining failures.
7. Obtain explicit approval before deployment.
