'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const rateLimiter = fs.readFileSync(path.join(__dirname, '../middleware/rateLimit.js'), 'utf8');
const security = fs.readFileSync(path.join(__dirname, '../middleware/security.js'), 'utf8');

test('new manager and customer sessions have shorter defaults', () => {
  assert.match(source, /MANAGER_JWT_EXPIRES \|\| '12h'/);
  assert.match(source, /CUSTOMER_JWT_EXPIRES \|\| '7d'/);
  assert.doesNotMatch(source, /JWT_EXPIRES \|\| '90d'/);
});
test('manager authorization fails closed when database cannot validate active account', () => {
  assert.match(source, /async function requireManager[\s\S]*?if \(!dbReady\) return res\.status\(503\)/);
  assert.match(source, /const manager = await Manager\.findById\(req\.auth\.sub\)/);
  assert.match(source, /if \(!manager \|\| manager\.active === false\)/);
});
test('customer authorization fails closed when database cannot validate active account', () => {
  assert.match(source, /async function requireCustomer[\s\S]*?if \(!dbReady\) return res\.status\(503\)/);
  assert.match(source, /const c = await Customer\.findById\(req\.auth\.sub\)/);
  assert.match(source, /if \(!c \|\| c\.active === false\)/);
});
test('finance, payment-state, order and privacy routes require admin authorization', () => {
  for (const route of [
    "app.get('/api/manager/workflow', requireAdmin,",
    "app.get('/api/manager/invoices', requireAdmin,",
    "app.post('/api/manager/invoices', requireAdmin,",
    "app.get('/api/manager/payments', requireAdmin,",
    "app.post('/api/manager/payments', requireAdmin,",
    "app.get('/api/manager/privacy/requests',requireAdmin,",
    "app.put('/api/manager/privacy/requests/:id',requireAdmin,",
    "app.get('/api/manager/orders',requireAdmin,",
    "app.put('/api/manager/orders/:id',requireAdmin,",
  ]) assert.ok(source.includes(route), `Expected admin-only route: ${route}`);
});
test('business image uploads validate file signatures, not only client MIME type', () => {
  assert.match(source, /const signatureMatches = req\.file\.mimetype === 'image\/jpeg'/);
  assert.match(source, /The uploaded file content does not match its image type/);
});
test('production CORS remains allowlisted and does not use wildcard origin', () => {
  assert.match(security, /config\.corsOrigins\.includes\(origin\)/);
  assert.doesNotMatch(security, /origin:\s*['"]\*['"]/);
});
test('rate limiting limitation is explicit for multi-instance deployments', () => {
  assert.match(rateLimiter, /single-process limiter/);
  assert.match(rateLimiter, /shared store/);
});
