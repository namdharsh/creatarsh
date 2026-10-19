'use strict';
const crypto = require('node:crypto');
function safeEqualHex(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const a = Buffer.from(actual, 'hex'); const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function verifyCheckoutSignature(orderId, paymentId, signature, secret) {
  if (![orderId, paymentId, signature, secret].every(v => typeof v === 'string' && v.length > 0)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(signature, expected);
}
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || typeof secret !== 'string' || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(signature, expected);
}
function amountToPaise(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100) throw new Error('Invalid amount');
  return Math.round(n * 100);
}
module.exports = { verifyCheckoutSignature, verifyWebhookSignature, amountToPaise, safeEqualHex };
