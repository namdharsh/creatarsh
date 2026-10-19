const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const server = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'customer/business-dashboard.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'customer/business-dashboard.js'), 'utf8');

test('business dashboard API routes require customer auth, database, and business membership', () => {
  for (const route of [
    "app.get('/api/v1/businesses/:businessId/dashboard', requireCustomer, requireDb, requireBusinessMember",
    "app.get('/api/v1/businesses/:businessId/analytics', requireCustomer, requireDb, requireBusinessMember",
    "app.get('/api/v1/businesses/:businessId/enquiries', requireCustomer, requireDb, requireBusinessMember",
    "app.patch('/api/v1/businesses/:businessId/enquiries/:enquiryId', requireCustomer, requireDb, requireBusinessMember",
    "app.get('/api/v1/businesses/:businessId/store/products', requireCustomer, requireDb, requireBusinessMember",
    "app.get('/api/v1/businesses/:businessId/store/orders', requireCustomer, requireDb, requireBusinessMember"
  ]) assert.ok(server.includes(route), `missing protected route ${route}`);
  assert.match(server, /BusinessMember\.findOne\(\{ businessId: req\.params\.businessId \|\| req\.params\.id, userId: req\.auth\.sub, status: 'ACTIVE' \}\)/);
});

test('analytics schema indexes business and time; stores no IP or user-agent fields', () => {
  assert.match(server, /analyticsEventSchema\.index\(\{ businessId: 1, occurredAt: -1 \}\)/);
  assert.match(server, /analyticsEventSchema\.index\(\{ businessId: 1, event: 1, occurredAt: -1 \}\)/);
  const schema = server.slice(server.indexOf('const analyticsEventSchema'), server.indexOf('const businessEnquirySchema'));
  assert.doesNotMatch(schema, /\bipAddress\b|\buserAgent\b|visitorName|visitorEmail|visitorPhone/);
  assert.match(server, /visitorRecordsExposed:false/);
});

test('public event collector accepts only defined aggregate event types and published businesses', () => {
  assert.match(server, /const allowed = \['PAGE_VIEW','CONTACT_CLICK','WHATSAPP_CLICK','DIRECTIONS_CLICK'\]/);
  assert.match(server, /Business\.findOne\(\{ slug, status: 'PUBLISHED' \}\)/);
  assert.match(server, /crypto\.createHash\('sha256'\)\.update\(`\$\{day\}:\$\{session\}`\)/);
  assert.match(server, /app\.post\('\/api\/public\/business-enquiries'/);
});

test('store endpoints refuse access when module is disabled and orders are business-scoped', () => {
  assert.match(server, /if\(!business\.storeEnabled\)return res\.status\(404\)\.json\(\{message:'Store module is not enabled for this business\.'/);
  assert.match(server, /BusinessStoreProduct\.find\(\{businessId:business\._id\}\)/);
});

test('dashboard UI supports date filters, analytics, enquiries and conditional store screens', () => {
  for (const phrase of ['Analytics','Enquiries','Profile & website','Products','Orders']) assert.ok(html.includes(phrase));
  for (const phrase of ['from','to','contactClicks','whatsappClicks','directionsClicks','storeEnabled']) assert.ok(js.includes(phrase));
  assert.match(server, /visitorRecordsExposed:false/);
  assert.match(server, /app\.get\('\/business-dashboard'/);
});
