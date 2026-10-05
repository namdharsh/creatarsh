# Creatarsh Customer System — Sell-Ready Upgrade

This version extends the existing Creatarsh customer website and Express/MongoDB API.

## Customer capabilities
- Service catalogue and package pricing
- Customer registration/login
- Customer dashboard
- Orders
- Projects and progress
- Quote acceptance/decline
- Project approval / change requests
- Invoices and payment history
- Support tickets
- Customer documents
- Privacy Center
- Privacy/data request workflow
- Consent records
- Account-data export
- Profile management
- ₹499 and other service-package order flow
- Legal pages: Terms, Privacy, Refunds, Cookies, AI Usage

## Manager/API capabilities added
- Orders
- Tickets and ticket replies
- Approval requests
- Customer documents
- Privacy requests
- Consent records

## Important deployment notes
- Configure MongoDB and JWT secrets before production.
- The package-order endpoint creates an order; it does not claim a live payment gateway integration. Connect your chosen gateway and verify payments server-side before marking orders paid.
- Legal pages are business-ready templates, not a substitute for review by an Indian lawyer/qualified privacy professional for your exact entity, business model and data processing.
- Review the Privacy Policy and applicable DPDP/e-commerce obligations before production launch.

## CMS source of truth
The public customer website is database-driven. Services, banners, portfolio projects, testimonials, FAQs, and website CMS copy are loaded from MongoDB through `/api/public/content` and managed from the Manager CMS. Static service/portfolio HTML demo pages are not used for public routes.

MongoDB is configured only through the server environment variable `MONGODB_URI`. Do not put the MongoDB connection string in frontend JavaScript or HTML. If `MONGODB_URI` is missing, the website intentionally shows a temporary content-unavailable state instead of silently displaying stale hardcoded service content.
