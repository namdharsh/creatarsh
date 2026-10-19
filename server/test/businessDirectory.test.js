'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBusinessFilters, parseDirectoryPagination } = require('../lib/businessDirectory');
const root = path.resolve(__dirname, '../..');

test('directory pagination applies safe defaults', () => {
  assert.deepEqual(parseDirectoryPagination({}), { page: 1, limit: 12, skip: 0 });
});
test('directory pagination clamps page and page size', () => {
  assert.deepEqual(parseDirectoryPagination({ page: '-2', limit: '999' }), { page: 1, limit: 24, skip: 0 });
  assert.deepEqual(parseDirectoryPagination({ page: '3', limit: '10' }), { page: 3, limit: 10, skip: 20 });
});
test('directory only queries published listings', () => {
  assert.deepEqual(buildBusinessFilters({}), { status: 'PUBLISHED' });
});
test('directory filters category, city and valid PIN', () => {
  const filters = buildBusinessFilters({ category: 'Salon', city: 'Gwalior', pin: '474001' });
  assert.equal(filters.status, 'PUBLISHED'); assert.equal(filters.category, 'Salon'); assert.equal(filters.pinCode, '474001');
  assert.equal(filters.city.test('gwalior'), true); assert.equal(filters.city.test('Guna'), false);
});
test('directory search and geolocation are bounded', () => {
  const filters = buildBusinessFilters({ q: 'tailor', lat: '26.2183', lng: '78.1828', radiusKm: '500' });
  assert.deepEqual(filters.$text, { $search: 'tailor' });
  assert.equal(filters.location.$geoWithin.$centerSphere[1], 100 / 6378.1);
  assert.equal(buildBusinessFilters({ lat: '100', lng: '500' }).location, undefined);
});
test('discovery UI includes accessible location, search and results states', () => {
  const html = fs.readFileSync(path.join(root, 'customer/discovery/index.html'), 'utf8');
  for (const value of ['role="search"', 'aria-live="polite"', 'Use my location', 'Enter city / PIN', 'businessGrid', 'pagination']) assert.ok(html.includes(value), `missing ${value}`);
});
test('business page template supports per-business SEO metadata', () => {
  const html = fs.readFileSync(path.join(root, 'customer/discovery/business.html'), 'utf8');
  for (const value of ['__SEO_TITLE__', '__SEO_DESCRIPTION__', '__CANONICAL_URL__', '__BUSINESS_SCHEMA__', '__BUSINESS_SLUG__']) assert.ok(html.includes(value), `missing ${value}`);
});
test('discovery page has no hardcoded business records', () => {
  const js = fs.readFileSync(path.join(root, 'customer/discovery/js/app.js'), 'utf8');
  assert.ok(js.includes('/api/public/businesses?'));
  assert.ok(js.includes('/api/public/business-categories'));
  assert.ok(!js.includes('const businesses = [{'));
});
