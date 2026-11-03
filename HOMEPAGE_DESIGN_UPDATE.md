# Creatarsh homepage design update

The public customer homepage (`customer/index.html`) now uses a clean, Apple-inspired light visual style.
The visual overrides are appended to `customer/css/style.css` and scoped to `body[data-page="home"]`,
so inner customer pages, manager pages, and application dashboards retain their existing styling.

The homepage CMS banner carousel remains in place and was moved below the main hero. Its existing
DOM IDs (`bannerSlider`, `bannerTrack`, `bannerDots`) are unchanged. Existing dynamic service,
portfolio, testimonial, authentication, contact, and API integrations are retained.

The hero laptop illustration is CSS-only; no external image asset is required.

For safety, the local `server/.env` file was excluded from the delivery. Configure environment
variables locally from `server/.env.example`; do not commit secrets.
