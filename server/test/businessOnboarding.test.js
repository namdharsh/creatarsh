'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('business onboarding routes require customer authentication and database readiness', () => {
  assert.match(source, /app\.post\('\/api\/v1\/businesses', requireCustomer, requireDb/);
  assert.match(source, /app\.post\('\/api\/v1\/businesses\/:businessId\/claims', requireCustomer, requireDb/);
  assert.match(source, /app\.patch\('\/api\/v1\/businesses\/:businessId\/profile', requireCustomer, requireDb, requireBusinessMember/);
});
test('business-scoped profile access checks membership server-side', () => {
  assert.match(source, /BusinessMember\.findOne\(\{ businessId: req\.params\.businessId \|\| req\.params\.id, userId: req\.auth\.sub, status: 'ACTIVE' \}\)/);
  assert.match(source, /You do not have permission to manage this business/);
  assert.match(source, /req\.businessMember\.role !== 'OWNER'/);
});
test('unapproved drafts are not returned by public directory or detail endpoints', () => {
  assert.match(source, /buildBusinessFilters\(req\.query\)/);
  assert.match(source, /status: 'PUBLISHED'/);
  assert.match(source, /Business\.findOne\(\{ slug: String\(req\.params\.slug \|\| ''\)\.toLowerCase\(\), status: 'PUBLISHED' \}\)/);
});
test('public profile response strips internal ownership and opt-out contact details', () => {
  assert.match(source, /if \(!opts\.includes\('EMAIL'\)\) delete b\.email/);
  assert.match(source, /if \(!opts\.includes\('WHATSAPP'\)\) delete b\.whatsapp/);
  assert.match(source, /delete b\.createdByCustomer/);
  assert.match(source, /delete b\.ownershipStatus/);
});
test('claim approval, corrections, removal and permission audit records exist', () => {
  for (const route of [
    "app.post('/api/v1/businesses/:businessId/claims/:claimId/review'",
    "app.post('/api/v1/admin/businesses/:businessId/claims/:claimId/review'",
    "app.post('/api/v1/businesses/:businessId/requests'",
    "app.get('/api/v1/businesses/:businessId/permissions'",
    "app.patch('/api/v1/admin/business-requests/:requestId'"
  ]) assert.ok(source.includes(route), `missing ${route}`);
  assert.match(source, /businessPermissionSchema/);
  assert.match(source, /CORRECTION_REQUESTED/);
  assert.match(source, /REMOVAL_REQUESTED/);
});
test('media uploads are authenticated, business-scoped and constrained to image formats', () => {
  assert.match(source, /businessMediaUpload\.single\('file'\)/);
  assert.match(source, /fileSize: 5 \* 1024 \* 1024/);
  assert.match(source, /image\/jpeg','image\/png','image\/webp/);
  assert.match(source, /CLOUDINARY_API_SECRET/);
});
test('category values are controlled and input fields are validated', () => {
  assert.match(source, /BUSINESS_CATEGORIES/);
  assert.match(source, /PIN code must contain six digits/);
  assert.match(source, /Website URL must use HTTP or HTTPS/);
});
