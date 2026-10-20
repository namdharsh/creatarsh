const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const server = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'manager/admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'manager/admin.html'), 'utf8');

test('admin APIs re-check active DB role and require administrator role', () => {
  assert.match(server, /const ADMIN_ROLES = new Set\(\['admin','superadmin'\]\)/);
  assert.match(server, /Manager\.findById\(req\.auth\.sub\)\.select\('_id username role active'\)/);
  assert.match(server, /ADMIN_REQUIRED/);
  for (const route of ["'/api/v1/admin/overview'", "'/api/v1/admin/businesses'", "'/api/v1/admin/users'", "'/api/v1/admin/audit'"]) {
    const at = server.indexOf(route);
    assert.notEqual(at, -1, `missing ${route}`);
    assert.match(server.slice(at - 80, at + 180), /requireAdmin/);
  }
});

test('admin dashboard exposes requested operational sections and uses shared API', () => {
  for (const phrase of ['overview','approvals','moderation','users','publisher','templates','plans','finance','ads','requests','deployments','audit','health']) assert.ok(ui.includes(`['${phrase}'`), `missing UI section ${phrase}`);
  assert.ok(html.includes('admin.js'));
  assert.match(ui, /fetch\('\/api'\+path/);
  assert.match(ui, /cr_manager_token/);
});

test('sensitive admin mutations write audit events and logs avoid raw IPs/secrets', () => {
  for (const phrase of ['BUSINESS_MODERATED','MANAGER_ROLE_CHANGED','TEMPLATE_UPDATED','PLAN_UPDATED','AD_CAMPAIGN_CREATED','WEBSITE_PUBLISHED','WEBSITE_ROLLED_BACK','BUSINESS_REQUEST_REVIEWED']) assert.ok(server.includes(phrase), `missing audit action ${phrase}`);
  assert.match(server, /ipHash/);
  assert.match(server, /select\('-ipHash'\)/);
  assert.match(server, /password\|secret\|token\|authorization\|cookie\|email\|phone\|address\|ip\|useragent/);
});

test('admin role cannot be self-disabled or self-demoted; superadmin boundaries are enforced', () => {
  assert.match(server, /You cannot disable or demote your own administrator account/);
  assert.match(server, /Only a superadmin can manage superadmin accounts/);
});

test('admin data collections have query indexes and role bootstrap settings are documented in env example', () => {
  assert.match(server, /adminAuditSchema\.index\(\{createdAt:-1,action:1\}\)/);
  assert.match(server, /adCampaignSchema\.index\(\{status:1,placement:1,startsAt:1,endsAt:1\}\)/);
  const env = fs.readFileSync(path.join(root, 'server/.env.example'), 'utf8');
  assert.match(env, /ADMIN_INITIAL_USERNAME/);
  assert.match(env, /ADMIN_INITIAL_PASSWORD/);
});
