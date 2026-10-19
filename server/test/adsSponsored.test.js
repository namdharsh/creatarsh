const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const server = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'manager/admin.js'), 'utf8');
const directory = fs.readFileSync(path.join(root, 'customer/discovery/js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'customer/discovery/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'customer/discovery/css/style.css'), 'utf8');

test('ad campaigns require creative approval before activation and public delivery', () => {
  assert.match(server, /creativeStatus:\{type:String,enum:\['PENDING','APPROVED','REJECTED'\],default:'PENDING'/);
  assert.match(server, /if\(status==='ACTIVE'&&c\.creativeStatus!=='APPROVED'\)/);
  assert.match(server, /status:'ACTIVE',creativeStatus:'APPROVED'/);
  assert.match(server, /AD_CREATIVE_REVIEWED/);
});

test('campaign scheduling and placement are validated server-side', () => {
  for (const placement of ['DIRECTORY_FEATURED','CATEGORY_SPONSORED','SEARCH_SPONSORED','BUSINESS_PAGE']) assert.ok(server.includes(placement));
  assert.match(server, /endsAt<=startsAt/);
  assert.match(server, /startsAt:\{\$lte:now\}/);
  assert.match(server, /endsAt:\{\$gt:now\}/);
});

test('ad reports use aggregate daily metrics and do not persist visitor identifiers', () => {
  assert.match(server, /adDailyMetricSchema\.index\(\{campaignId:1,day:1,event:1\},\{unique:true\}\)/);
  assert.match(server, /AdDailyMetric\.updateOne\(\{campaignId:campaign\._id,day,event\},\{\$inc:\{count:1\}\}, \{upsert:true\}\)/);
  const eventRoute = server.slice(server.indexOf("app.post('/api/public/ads/:id/event'"), server.indexOf("app.post('/api/public/leads'"));
  assert.ok(!/req\.ip|userAgent|customerId|userId|latitude|longitude/.test(eventRoute));
  assert.match(server, /api\/v1\/admin\/ads\/:id\/report/);
});

test('admin UI supports creative review, campaign status, schedule and reports', () => {
  for (const value of ['creativeTitle','creativeText','destinationUrl','startsAt','endsAt','data-ad-review','APPROVED','REJECTED','data-ad-report','/report']) assert.ok(admin.includes(value), `missing ${value}`);
  assert.match(admin, /Sponsored placements are explicitly labelled/);
});

test('public directory separates sponsored cards from organic listings and labels them clearly', () => {
  assert.match(html, /id="sponsoredSection"/);
  assert.match(directory, /sponsored-label/);
  assert.match(directory, /Paid placements and are separate from organic results|Sponsored/);
  assert.match(directory, /event:'IMPRESSION'/);
  assert.match(directory, /event:'CLICK'/);
  assert.match(css, /\.sponsored-section/);
});
