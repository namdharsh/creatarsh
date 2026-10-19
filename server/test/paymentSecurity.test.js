'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyCheckoutSignature, verifyWebhookSignature, amountToPaise, safeEqualHex } = require('../lib/paymentSecurity');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

test('checkout signature accepts only the exact order|payment HMAC', () => {
  const secret='test_secret'; const order='order_test_123'; const payment='pay_test_456';
  const sig=crypto.createHmac('sha256',secret).update(`${order}|${payment}`).digest('hex');
  assert.equal(verifyCheckoutSignature(order,payment,sig,secret),true);
  assert.equal(verifyCheckoutSignature(order,'pay_other',sig,secret),false);
  assert.equal(verifyCheckoutSignature(order,payment,'not-a-signature',secret),false);
});

test('webhook signature is checked against exact raw request bytes', () => {
  const secret='webhook_test_secret'; const raw=Buffer.from('{"event":"payment.captured"}');
  const sig=crypto.createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(verifyWebhookSignature(raw,sig,secret),true);
  assert.equal(verifyWebhookSignature(Buffer.from('{ "event":"payment.captured"}'),sig,secret),false);
  assert.equal(verifyWebhookSignature(raw,'',secret),false);
});

test('amount conversion is precise and rejects invalid values', () => {
  assert.equal(amountToPaise(499),49900);
  assert.equal(amountToPaise(1499.5),149950);
  assert.throws(()=>amountToPaise(0));
  assert.throws(()=>amountToPaise(-10));
  assert.throws(()=>amountToPaise(1.001));
});

test('payment routes use server-side plans, provider verification, webhook signatures, idempotency and admin reconciliation', () => {
  assert.match(server,/app\.get\('\/api\/public\/plans'/);
  assert.match(server,/req\.get\('Idempotency-Key'\)/);
  assert.match(server,/ServicePackage\.findOne\(\{code,active:true\}\)/);
  assert.match(server,/providerPayment\.order_id!==intent\.razorpayOrderId/);
  assert.match(server,/providerPayment\.status/);
  assert.match(server,/verifyWebhookSignature\(req\.rawBody,signature,RAZORPAY_WEBHOOK_SECRET\)/);
  assert.match(server,/RazorpayWebhookEvent/);
  assert.match(server,/app\.post\('\/api\/manager\/payments\/reconcile\/:id', requireAdmin/);
  assert.doesNotMatch(server,/app\.post\('\/api\/customer\/payments\/razorpay\/order',requireCustomer,async\(req,res\)=>res\.status\(410\)/);
});

test('admin plan mutation is admin-authorized and audited', () => {
  assert.match(server,/app\.post\('\/api\/v1\/admin\/plans',requireAdmin,requireDb/);
  assert.match(server,/writeAdminAudit\(req,'PLAN_CREATED','ServicePackage'/);
});

test('customer package page integrates Razorpay checkout without trusting callback as payment proof', () => {
  const js = fs.readFileSync(path.join(__dirname, '../../customer/js/site.js'), 'utf8');
  assert.match(js,/api\('\/customer\/payments\/razorpay\/order'/);
  assert.match(js,/api\('\/customer\/payments\/razorpay\/verify'/);
  assert.match(js,/Idempotency-Key/);
  assert.match(js,/Payment submitted; waiting for provider capture confirmation/);
  assert.match(js,/third-party charges are separate unless explicitly included/);
});
