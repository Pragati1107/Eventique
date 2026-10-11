/* Pure helpers with no npm dependencies, so they can be unit-tested anywhere. */
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || undefined; }
}
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- validation ---------- */
const isPhone = (p) => typeof p === 'string' && /^[6-9]\d{9}$/.test(p);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
const isEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).trim().slice(0, max));
const int = (v, { min = -Infinity, max = Infinity, def = 0 } = {}) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- money ---------- */
const round = (n) => Math.round(n);
/**
 * Price a booking. Per-plate vendors multiply by guests; everyone else charges the package price.
 * Returns whole rupees.
 */
function priceBooking({ unit, packagePrice, guests, gstPercent, advancePercent }) {
  if (!(packagePrice >= 0)) throw new HttpError(400, 'Invalid package price');
  const g = Math.max(1, int(guests, { min: 1, def: 1 }));
  const base = /plate/i.test(unit || '') ? packagePrice * g : packagePrice;
  const gst = round((base * gstPercent) / 100);
  const amount = round(base + gst);
  const advance = round((amount * advancePercent) / 100);
  return { base: round(base), gst, amount, advance };
}
const payoutFor = (amount, commissionPercent) => round(amount * (1 - commissionPercent / 100));

/* ---------- codes ---------- */
const makeCode = (prefix) => `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}${crypto.randomInt(100, 999)}`;

/* ---------- OTP ---------- */
const generateOtp = () => String(crypto.randomInt(100000, 1000000));
const hashOtp = (phone, code, secret) => crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/* ---------- Razorpay signatures ---------- */
const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const verifyPaymentSignature = (orderId, paymentId, signature, secret) =>
  !!(orderId && paymentId && signature && secret) && safeEqual(hmacHex(secret, `${orderId}|${paymentId}`), signature);
const verifyWebhookSignature = (rawBody, signature, secret) =>
  !!(rawBody && signature && secret) && safeEqual(hmacHex(secret, rawBody), signature);

/* ---------- bookings ---------- */
const TRANSITIONS = {
  customer: { AwaitingPayment: ['Cancelled'], Pending: ['Cancelled'] },
  vendor: { Pending: ['Confirmed', 'Declined'], Confirmed: ['Completed'] },
  admin: { AwaitingPayment: ['Cancelled'], Pending: ['Cancelled', 'Confirmed', 'Declined'], Confirmed: ['Cancelled', 'Completed'] },
};
const canTransition = (role, from, to) => !!(TRANSITIONS[role] && TRANSITIONS[role][from] && TRANSITIONS[role][from].includes(to));

/** Refund rule: full advance within the free-cancellation window or if the vendor never confirmed; otherwise none. */
function refundFor(booking, now, freeCancelHours, byRole) {
  if (!booking.paid) return 0;
  if (byRole === 'admin' || booking.status === 'Pending' || booking.status === 'AwaitingPayment') return booking.paid;
  const created = new Date(booking.createdAt || now).getTime();
  return now - created <= freeCancelHours * 3600e3 ? booking.paid : 0;
}

module.exports = {
  HttpError, asyncH, isPhone, isDate, isEmail, str, int, pick, escapeRegex,
  priceBooking, payoutFor, makeCode, generateOtp, hashOtp, safeEqual,
  verifyPaymentSignature, verifyWebhookSignature, hmacHex, canTransition, refundFor, TRANSITIONS,
};
