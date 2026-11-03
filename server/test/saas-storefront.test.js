const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const server = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'customer/index.html'), 'utf8');
const products = fs.readFileSync(path.join(root, 'customer/products.html'), 'utf8');
const detail = fs.readFileSync(path.join(root, 'customer/product.html'), 'utf8');
const storefront = fs.readFileSync(path.join(root, 'customer/js/saas-storefront.js'), 'utf8');

test('SaaS storefront routes are served by the existing Express application', () => {
  assert.ok(server.includes("app.get('/', (req, res) => res.sendFile"));
  assert.ok(server.includes("app.get('/products', (req,res)=>res.sendFile"));
  assert.ok(server.includes("app.get('/products/:slug', (req,res)=>res.sendFile"));
});

test('public catalogue APIs use active MongoDB products and handle database unavailability', () => {
  assert.ok(server.includes("app.get('/api/public/products'"));
  assert.ok(server.includes("SaaSProduct.find({ status: 'ACTIVE' })"));
  assert.ok(server.includes('Product catalogue is temporarily unavailable because the database is not connected'));
  assert.ok(server.includes("app.get('/api/public/products/:slug'"));
  assert.ok(server.includes("status: 'ACTIVE'"));
});

test('public product APIs filter inactive plans on the server', () => {
  assert.ok((server.match(/filter\(plan => plan\.active !== false\)/g) || []).length >= 2);
});

test('storefront pages load product data from the existing public API', () => {
  assert.ok(storefront.includes("get('/public/products')"));
  assert.ok(storefront.includes("get('/public/products/'+encodeURIComponent(slug))"));
  assert.ok(home.includes('id="productGrid"'));
  assert.ok(products.includes('id="productGrid"'));
  assert.ok(detail.includes('id="productDetail"'));
});

test('storefront escapes product and FAQ content before inserting HTML', () => {
  assert.ok(storefront.includes('esc=v=>'));
  assert.ok(storefront.includes('esc(p.name)'));
  assert.ok(storefront.includes('esc(x.question)'));
});

test('catalogue and product detail pages provide navigation and legal links', () => {
  for (const html of [home, products, detail]) {
    assert.ok(html.includes('href="/login"'));
    assert.ok(html.includes('href="/register"'));
    assert.ok(html.includes('href="/legal/terms"'));
    assert.ok(html.includes('href="/legal/privacy"'));
  }
});
