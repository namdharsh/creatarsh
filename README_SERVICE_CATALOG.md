# Creatarsh Service Catalog Upgrade

The website now treats each service as a service landing page and sales funnel.

## Customer flow
Home → click a service → service detail page → related work → what we provide → design types → packages/pricing → offers → Book this service → enquiry goes into the existing manager Leads & CRM.

## URL
`/service/<slug>`

Examples:
- `/service/web-development`
- `/service/app-development`
- `/service/custom-business-software`
- `/service/ai-solutions`

The detail page also works with the existing service records even if a slug has not yet been added, because it falls back to a slug generated from the title.

## Manager
Services now support:
- Slug
- What we provide / deliverables
- Design types
- Offers
- Packages JSON

Portfolio items should use the service name/slug in the **Category** field so they appear under the relevant service page.

Package JSON example:
```json
[
  {
    "name":"Business",
    "price":"₹10,000+",
    "description":"Conversion-focused business website.",
    "features":["Up to 10 pages","SEO setup","Analytics"],
    "popular":true
  }
]
```

## Booking
The booking form uses the existing `/api/public/leads` endpoint, so bookings become Leads & CRM records without introducing another database or booking system.
