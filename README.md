# Creatarsh — Existing Project (Consolidated)

Creatarsh's existing website, customer identity, Manager Studio, SaaS catalogue, API and Flutter applications. This update consolidates setup and server lifecycle without replacing approved pages or redesigning the site.

## Local setup (one-time)
1. Install Node.js 20+ and MongoDB Community Server (or use a development MongoDB Atlas URI).
2. Open this project folder in VS Code.
3. Copy `server/.env.example` to `server/.env`.
4. Set `MONGODB_URI` to your local development database. Change the local manager password before using the manager panel.
5. From the project root run `npm install`.
6. Run `npm test` to execute the existing automated tests.
7. Run `npm start` to start the API and website.

Open:
- Website: http://localhost:5000/
- Manager: http://localhost:5000/manager/
- Health: http://localhost:5000/health
- Readiness: http://localhost:5000/ready

Development auto-reload: `npm run dev`.

## Environment and secrets
Only `server/.env.example` belongs in source control. Keep `server/.env` private. Production must use unique random `MANAGER_JWT_SECRET` and `CUSTOMER_JWT_SECRET` values of at least 32 characters, a production MongoDB URI, and exact CORS origins. Never reuse the local example secrets in production.

## Existing modules
- Public website and CMS-backed content
- Customer registration, login, account, verification and recovery pages
- Manager Studio and SaaS catalogue
- API, MongoDB models, authentication and business workflows
- Flutter customer, business and admin applications

## Verification
`npm test` runs the Node built-in test suite. `npm run check:syntax` checks JavaScript syntax. `npm run verify` runs both. Tests that require external services or credentials must be called out separately; do not interpret static tests as full end-to-end production verification.

## Deployment
No deployment or production environment is changed by this project update. Review `DEPLOYMENT_CHECKLIST.md` before any future deployment.

## Project cleanup
See [Project Cleanup](docs/PROJECT_CLEANUP.md) for retained/removed files and compatibility reasoning. CI runs `npm run verify` on pushes and pull requests.
