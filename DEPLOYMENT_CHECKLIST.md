# Creatarsh production deployment

## Render environment variables
Set these on the Render service:

- `NODE_ENV=production`
- `MONGODB_URI=<MongoDB Atlas connection string>`
- `MANAGER_JWT_SECRET=<long random secret>`
- `CUSTOMER_JWT_SECRET=<different long random secret>`
- `MANAGER_INITIAL_USERNAME=<manager username>`
- `MANAGER_INITIAL_PASSWORD=<strong manager password>`
- `CORS_ORIGINS=https://creatarsh.in,https://www.creatarsh.in`
- `RAZORPAY_KEY_ID=<live Razorpay key id>`
- `RAZORPAY_KEY_SECRET=<live Razorpay key secret>`
- `RAZORPAY_WEBHOOK_SECRET=<Razorpay webhook secret>`

The service starts with `npm start --prefix server` and the customer website is served by the same Express service.

## Verify after deployment

1. Open `/api/health` and confirm `ok: true`.
2. Confirm `database: true`.
3. Open `/services` and `/buy`.
4. Register a test customer.
5. Select a package and confirm the booking amount shown.
6. Test Razorpay in test mode before switching to live keys.
7. Confirm the paid order, invoice and enquiry appear in Manager.
8. Send a test contract from Manager and accept it from Customer.
9. Test project, quote, invoice, document and support flows.
