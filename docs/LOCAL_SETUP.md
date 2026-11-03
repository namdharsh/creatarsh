# Local Setup

## Requirements
- Node.js 20+ (Node.js 22 recommended)
- MongoDB Community Server running locally, or a development MongoDB Atlas URI
- VS Code (recommended)

## First-time setup
1. Open the project root in VS Code.
2. Copy `server/.env.example` to `server/.env`.
3. Set `MONGODB_URI` to your local database. Keep local development secrets for local use only.
4. From the project root run `npm install`.
5. Run `npm test`.
6. Run `npm start`.

Open the website at `http://localhost:5000/` and Manager Studio at `http://localhost:5000/manager/`.

## Development
- `npm run dev`: start with Node watch mode.
- `npm run check:syntax`: parse all project JavaScript source files.
- `npm run verify`: syntax check and automated tests.

## Health checks
- `GET /health`: process liveness.
- `GET /ready`: MongoDB readiness (503 until connected).
- `GET /api/health/live` and `/api/health/ready`: backwards-compatible health endpoints.

## Important
The server intentionally fails startup when `MONGODB_URI` is missing or MongoDB cannot be reached. Do not use production credentials in local development. The ZIP includes `server/.env.example` only; create your private `server/.env` locally.
