# Creatarsh Website CMS

## Manager
- Open `/manager/` and sign in using the existing Manager credentials.
- Navigate to Website → Website Control Centre.
- Edit Brand & copy, Website collections, Visual identity, and SEO & visibility.
- Division, product, capability, principle and navigation collections are JSON arrays. Preserve valid JSON syntax.
- Publish website changes. The public page fetches the latest CMS configuration from `/api/public/content`.

## API
- `GET /api/manager/site` — authenticated CMS document.
- `PUT /api/manager/site` — authenticated update; only allow-listed CMS fields are persisted.
- `GET /api/public/content` — public read endpoint consumed by the homepage.

## Content fields
- Brand: heroTitle, heroText, heroEyebrow, hero CTA, aboutText, logoUrl.
- Section copy: ecosystemTitle/Text, capabilitiesTitle/Text, roadmapTitle/Text, principlesTitle, productsTitle/Text, contactTitle/Text, footerText.
- Collections: divisions, products, capabilities, principles, navigation.
- Design: theme accent, secondary, surface, background, text, glassBlur.
- Publishing: sectionVisibility, seo title and description.
- Contact: email, WhatsApp, phone and social URLs.

## Operational notes
- MongoDB must be connected for live CMS persistence.
- Logo URLs must be HTTPS or site-relative paths.
- Keep environment secrets in deployment environment variables, never in the CMS.
- Existing manager authentication and bearer-token checks are retained.
