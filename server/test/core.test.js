const test = require('node:test');
const assert = require('node:assert');
const c = require('../src/lib/core');

test('priceBooking: per-plate vendors multiply by guests and add GST + advance', () => {
  const r = c.priceBooking({ unit: '/ plate', packagePrice: 850, guests: 300, gstPercent: 18, advancePercent: 20 });
  assert.deepStrictEqual(r, { base: 255000, gst: 45900, amount: 300900, advance: 60180 });
});

test('priceBooking: flat packages ignore guest count', () => {
  const r = c.priceBooking({ unit: '/ day', packagePrice: 90000, guests: 450, gstPercent: 18, advancePercent: 20 });
  assert.deepStrictEqual(r, { base: 90000, gst: 16200, amount: 106200, advance: 21240 });
});

test('priceBooking: rejects a missing price', () => {
  assert.throws(() => c.priceBooking({ unit: '/ day', packagePrice: undefined, guests: 1, gstPercent: 18, advancePercent: 20 }));
});

test('payoutFor deducts platform commission', () => {
  assert.strictEqual(c.payoutFor(106200, 8), 97704);
});

test('OTP hashes verify only with the same phone, code and secret', () => {
  const h = c.hashOtp('9876543210', '482913', 's3cret');
  assert.ok(c.safeEqual(h, c.hashOtp('9876543210', '482913', 's3cret')));
  assert.ok(!c.safeEqual(h, c.hashOtp('9876543210', '482914', 's3cret')));
  assert.ok(!c.safeEqual(h, c.hashOtp('9123456780', '482913', 's3cret')));
  assert.ok(!c.safeEqual(h, c.hashOtp('9876543210', '482913', 'other')));
});

test('generateOtp is always 6 digits', () => {
  for (let i = 0; i < 500; i++) assert.match(c.generateOtp(), /^\d{6}$/);
});

test('Razorpay payment signature: matches the documented HMAC of order_id|payment_id', () => {
  const secret = 'test_secret';
  const sig = require('crypto').createHmac('sha256', secret).update('order_ABC|pay_XYZ').digest('hex');
  assert.ok(c.verifyPaymentSignature('order_ABC', 'pay_XYZ', sig, secret));
  assert.ok(!c.verifyPaymentSignature('order_ABC', 'pay_XYZ', sig, 'wrong'));
  assert.ok(!c.verifyPaymentSignature('order_ABC', 'pay_OTHER', sig, secret));
  assert.ok(!c.verifyPaymentSignature('', 'pay_XYZ', sig, secret));
});

test('Razorpay webhook signature uses the raw body', () => {
  const body = JSON.stringify({ event: 'payment.captured' });
  const sig = c.hmacHex('whsec', body);
  assert.ok(c.verifyWebhookSignature(body, sig, 'whsec'));
  assert.ok(!c.verifyWebhookSignature(body + ' ', sig, 'whsec'));
});

test('booking transitions respect roles', () => {
  assert.ok(c.canTransition('vendor', 'Pending', 'Confirmed'));
  assert.ok(!c.canTransition('vendor', 'Pending', 'Cancelled'));
  assert.ok(c.canTransition('customer', 'Pending', 'Cancelled'));
  assert.ok(!c.canTransition('customer', 'Confirmed', 'Completed'));
  assert.ok(c.canTransition('admin', 'Confirmed', 'Cancelled'));
  assert.ok(!c.canTransition('customer', 'Completed', 'Cancelled'));
});

test('refund rules', () => {
  const now = Date.parse('2026-10-11T10:00:00Z');
  const fresh = { paid: 5000, status: 'Confirmed', createdAt: '2026-10-10T10:00:00Z' };
  const old = { paid: 5000, status: 'Confirmed', createdAt: '2026-10-01T10:00:00Z' };
  assert.strictEqual(c.refundFor(fresh, now, 72, 'customer'), 5000);
  assert.strictEqual(c.refundFor(old, now, 72, 'customer'), 0);
  assert.strictEqual(c.refundFor(old, now, 72, 'admin'), 5000);
  assert.strictEqual(c.refundFor({ ...old, status: 'Pending' }, now, 72, 'customer'), 5000);
  assert.strictEqual(c.refundFor({ paid: 0, status: 'Pending' }, now, 72, 'customer'), 0);
});

test('validators', () => {
  assert.ok(c.isPhone('9876543210'));
  assert.ok(!c.isPhone('5876543210'));
  assert.ok(!c.isPhone('98765'));
  assert.ok(c.isDate('2026-11-28'));
  assert.ok(!c.isDate('28-11-2026'));
  assert.ok(c.isEmail('priya@gmail.com'));
  assert.ok(!c.isEmail('priya@'));
  assert.strictEqual(c.int('12.6', { min: 1, max: 10 }), 10);
  assert.strictEqual(c.int('abc', { def: 3 }), 3);
  assert.strictEqual(c.escapeRegex('a.b*c'), 'a\\.b\\*c');
});
