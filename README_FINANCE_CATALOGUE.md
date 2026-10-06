# Creatarsh Finance & Service Catalogue

## Invoice system
Manager invoices now support:
- Unique invoice ID and invoice date
- Business/operator legal details
- Customer billing details
- Service description, quantity and rate
- Discount and GST/tax fields
- Subtotal and total
- Payment status
- Payment method and transaction reference
- Due date and payment terms/notes

Invoice records are stored in MongoDB through the manager API.

## Service catalogue
The public pricing/buy page reads from the MongoDB `ServicePackage` collection through `GET /api/public/pricing`.

The manager can maintain the catalogue at **Service Catalogue** in the manager panel. The seeded catalogue includes:
- ₹499 Online Presence Starter
- ₹1,499 Business Website
- ₹2,999 Professional Website
- ₹7,999 Business Digital Setup
- ₹14,999 Business Growth
- ₹49,999+ Custom Business Software
- ₹75,000+ School ERP
- ₹499 / ₹999 / ₹1,999 Monthly Care Plans

Prices and package details are not hard-coded in the customer HTML.
