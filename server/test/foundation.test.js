const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, parseCsv } = require('../config/env');
const { redact } = require('../lib/logger');
const { AppError, errorHandler } = require('../middleware/errors');
const { requireObject, validateRequest } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rateLimit');

test('config accepts development defaults and parses origins', () => {
  const config = loadConfig({ NODE_ENV: 'development', PORT: '5000', CORS_ORIGINS: 'https://creatarsh.in, https://www.creatarsh.in' });
  assert.equal(config.port, 5000);
  assert.deepEqual(config.corsOrigins, ['https://creatarsh.in', 'https://www.creatarsh.in']);
  assert.deepEqual(parseCsv(' a, ,b '), ['a', 'b']);
});
test('config rejects invalid ports and malformed origins', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'test', PORT: '70000' }), /PORT/);
  assert.throws(() => loadConfig({ NODE_ENV: 'test', CORS_ORIGINS: 'not-a-url' }), /CORS_ORIGINS/);
});
test('production config requires database, allowed origins and strong auth secrets', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /MANAGER_JWT_SECRET/);
  const valid = loadConfig({ NODE_ENV: 'production', PORT: '5000', MONGODB_URI: 'mongodb://placeholder', MANAGER_JWT_SECRET: 'a'.repeat(32), CUSTOMER_JWT_SECRET: 'b'.repeat(32), CORS_ORIGINS: 'https://creatarsh.in' });
  assert.equal(valid.isProduction, true);
});
test('logger redacts secret-like keys recursively', () => {
  const out = redact({ password: 'not-visible', nested: { access_token: 'not-visible', ok: 'visible' } });
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.nested.access_token, '[REDACTED]');
  assert.equal(out.nested.ok, 'visible');
});
test('request validation helper rejects non-object JSON sections', () => {
  assert.ok(requireObject([]).errors.length);
  assert.deepEqual(requireObject({ name: 'test' }).value, { name: 'test' });
  const req = { body: [] }; let forwarded;
  validateRequest({ body: requireObject })(req, {}, (err) => { forwarded = err; });
  assert.ok(forwarded instanceof AppError);
  assert.equal(forwarded.statusCode, 400);
});
test('rate limiter blocks requests beyond configured maximum', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 1, keyGenerator: () => 'test-client' });
  function invoke() { let result = { status: 200, headers: {}, json: null, next: false }; const res = { setHeader(k,v){result.headers[k]=v;}, status(s){result.status=s;return this;}, json(b){result.json=b;return this;} }; limiter({ip:'127.0.0.1'}, res, () => {result.next=true;}); return result; }
  assert.equal(invoke().next, true);
  assert.equal(invoke().status, 429);
});
test('central error handler returns consistent safe JSON', () => {
  const req = { requestId: 'test-id', method: 'GET', path: '/api/test' };
  const res = { headersSent: false, statusCode: 200, status(s){this.statusCode=s;return this;}, json(b){this.body=b;return this;} };
  errorHandler(new AppError(400, 'Bad input', 'BAD_INPUT'), req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'BAD_INPUT');
  assert.equal(res.body.requestId, 'test-id');
});
