const test = require('node:test');
const assert = require('node:assert/strict');
const { healthRoutes } = require('../middleware/health');

test('health routes expose liveness and database-dependent readiness', () => {
  const routes = {};
  const app = { get: (path, handler) => { routes[path] = handler; } };
  let databaseReady = false;
  healthRoutes(app, { isDatabaseReady: () => databaseReady });

  const invoke = (handler) => {
    const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    handler({}, response);
    return response;
  };

  assert.equal(invoke(routes['/health']).statusCode, 200);
  assert.equal(invoke(routes['/ready']).statusCode, 503);
  databaseReady = true;
  assert.equal(invoke(routes['/ready']).statusCode, 200);
  assert.equal(invoke(routes['/api/health/live']).body.status, 'live');
});
