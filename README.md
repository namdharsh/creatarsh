# Creatarsh Website + Manager

This package upgrades the existing Creatarsh website into a polished agency-style customer site with a database-backed manager CMS.

## Included
- Premium responsive customer website
- Dynamic services
- Dynamic portfolio with media URLs
- Testimonials and FAQ CMS
- Homepage/site content CMS
- Announcement/banner CMS
- Lead/project enquiry pipeline
- Manager authentication with JWT
- Manager dashboard and quick actions
- Password change
- MongoDB-backed API
- Security middleware and login rate limiting
- Architecture prepared for future projects, quotations, invoices, milestones, customer accounts and marketplace modules

## Structure
- `customer/` — public website
- `manager/` — manager control panel
- `server/` — Express + MongoDB API
- `shared/` — architecture notes

## Setup
1. Copy `server/.env.example` to `server/.env`.
2. Add your MongoDB URI and a strong `MANAGER_JWT_SECRET`.
3. Set `MANAGER_INITIAL_USERNAME` and `MANAGER_INITIAL_PASSWORD` for the first manager account.
4. In `server/`, run `npm install` then `npm start`.
5. If your deployed API URL is different, set `window.CREATARSH_API_URL` before the customer/manager scripts load, or update the default URL in the JS files.

## Important
The uploaded production `.env` and Git metadata are intentionally not included in the replacement ZIP. Keep secrets in Render/environment settings rather than committing them.

## Current implementation scope
This version focuses on the highest-value foundation for launching Creatarsh: premium public presence + manager-controlled content + lead/CRM foundation. The next modules can be added to this codebase without replacing it: customer accounts, project workspaces, tasks, milestones, quotations, invoices, payments, files, messaging, support tickets, notifications and analytics.
