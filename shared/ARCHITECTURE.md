# Creatarsh architecture

Customer → Public site → API → MongoDB
Manager → Studio OS → API → MongoDB

Core collections: managers, leads, customers, projects, quotes, invoices, payments, services, portfolio, testimonials, FAQs, banners, site content.

The current release exposes the CMS/lead foundation and data endpoints for customers, projects, quotes, invoices and payments. The UI is structured so detailed project workspace, milestone, messaging, support and payment workflows can be added without replacing the customer website or manager shell.
