# Creatarsh UI update — banners, logo and manager navigation

## What's changed
- Added a large responsive carousel at the top of the homepage.
- The carousel rotates every 3 seconds, loops continuously, supports previous/next arrows, dots and touch swipes, and pauses on hover/focus.
- Three polished built-in banner slides appear when no active banners exist in the CMS or when the public content API is unavailable.
- Active banners created in Manager take control of the carousel. Banner fields (eyebrow, title, text, CTA label, CTA URL, image URL, active status and order) remain managed from the existing Banners section.
- Converted the shared Creatarsh mark to a dark C with the red play triangle, and switched site/manager references to the same PNG asset. JPEG compatibility copies have a white background for contrast.
- Simplified the manager's primary navigation and moved infrequently used workflow, contract, support, approval, document and privacy/activity screens into a collapsible **MORE TOOLS** group. The screens are still available.
- Renamed the main website controls to clearer labels: Homepage Banners, Services, Portfolio & Demos, Website Content, FAQ, Testimonials, and Packages & Pricing.

## Managing homepage banners
1. Open `/manager/` and sign in.
2. Choose **WEBSITE → Homepage Banners**.
3. Add at least three active banners if you want a full rotating campaign set.
4. For each banner, set a short title, supporting text, CTA text and a same-site CTA URL such as `/buy` or `/contact`.
5. Optionally set an image URL. Use an image hosted on a stable HTTPS URL and sized for a wide hero banner (recommended 2000 × 1000 or larger).
6. Set `Order` to 1, 2, 3, etc. Save each banner and verify the public homepage.

If no active CMS banners exist, the three built-in campaign slides are shown. Once one or more active CMS banners exist, those manager-controlled slides replace the defaults.

## Validation
- `node --check customer/js/site.js` passed.
- `node --check manager/js/manager.js` passed.
- `node --check manager/admin.js` passed.
- The existing repository test suite was attempted; it reports failures in pre-existing backend/admin/business-directory expectations unrelated to these UI changes. Dependencies were not installed in this workspace, and no live database/payment credentials were available for end-to-end testing.
