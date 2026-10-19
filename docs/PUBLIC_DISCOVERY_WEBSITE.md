# Creatarsh Public Discovery Website

## Scope

The public root (`/`) is now the local business discovery experience. The existing Creatarsh agency site remains available at `/studio`; existing service, portfolio, account and Manager Studio routes are retained.

The discovery UI never seeds or displays fabricated businesses. It reads only published MongoDB `Business` records through the public API. Until actual records are published, users see an explicit empty state.

## Public routes

- `GET /` — discovery home, location selection, search, categories, cards, pagination and state handling.
- `GET /studio` — prior Creatarsh agency home, preserved.
- `GET /business/:slug` — server-rendered title, description, canonical URL and `LocalBusiness` structured data for published listings.
- `GET /api/public/business-categories` — categories derived from published listings.
- `GET /api/public/businesses?q=&category=&city=&pin=&lat=&lng=&radiusKm=&page=&limit=&sort=` — filtered and paginated published listings.
- `GET /api/public/businesses/:slug` — one published listing.

The public API returns `503` while MongoDB is unavailable and `404` for unpublished or nonexistent business pages. It does not return draft/suspended records.

## Business model

A `Business` Mongoose model is added with name, unique slug, description, category, logo/cover, phone, website URL, address, city, six-digit PIN, optional GeoJSON point, tags, publication status, verification flag and creator reference. Indexes cover unique slug, status/category/city, text search and geospatial lookup.

There is intentionally no fake seed data and no public write endpoint. Listings must be added through a future authorized manager/business workflow or a controlled database operation. The model supports `DRAFT`, `PUBLISHED` and `SUSPENDED` states; public queries include only `PUBLISHED`.

## Location privacy

Geolocation is optional and only requested after a user activates “Use my location”. Coordinates are sent to the API for a bounded 25 km default search (maximum 100 km); they are not stored by this UI. Users can instead enter a city or PIN, and can clear the filter.

## Local run

```powershell
# From the extracted project root
Copy-Item server/.env.example server/.env
# Edit server/.env locally; do not commit it.
npm install --prefix server
npm test --prefix server
npm start --prefix server
```

Open `http://localhost:5000/` for discovery and `http://localhost:5000/studio` for the existing agency website. The API must have a valid `MONGODB_URI` and Atlas network access for directory data. Use a secure context (HTTPS or localhost) for browser geolocation.

## Tests

Run `npm test --prefix server`. Tests cover directory filters, published-only query rules, pagination caps, geolocation radius validation, accessible UI elements, SEO placeholders and the no-hardcoded-business rule. These are unit/static tests; live API/Atlas and browser end-to-end tests require a running configured database and should be completed in staging.

## Deployment

Deploy the complete repository ZIP through the existing Render service; keep its root directory and start command unchanged. Ensure the new files are included in the deployment artifact. Verify `/api/health/live`, `/`, `/studio`, `/api/public/business-categories`, `/api/public/businesses`, and a published `/business/:slug` route in staging. Do not configure public listings until the future authorized manager workflow and ownership/moderation process are ready.
