# Creatarsh deployment security

- Never commit `server/.env`. The production project uses Render environment variables.
- Set strong, unique `MANAGER_JWT_SECRET` and `CUSTOMER_JWT_SECRET` values.
- Set `MONGODB_URI` to the production Atlas connection string.
- Set `CORS_ORIGINS` to the exact frontend origins when the frontend is hosted separately.
- If credentials from an old `.env` were ever pushed to GitHub or shared, rotate the MongoDB password and JWT secrets before production deployment.
- Keep manager credentials out of source code and chat messages.
