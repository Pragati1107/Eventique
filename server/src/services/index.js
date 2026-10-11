const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { HttpError, makeCode, verifyPaymentSignature } = require('../lib/core');

/* ======================= SMS / OTP delivery ======================= */
async function sendSms(phone, code) {
  const p = config.otp.provider;
  if (p === 'dev') { console.log(`[otp] ${phone} -> ${code} (dev mode, no SMS sent)`); return { dev: true }; }
  if (p === 'msg91') {
    const { authKey, templateId } = config.otp.msg91;
    if (!authKey || !templateId) throw new HttpError(500, 'MSG91 is not configured');
    const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=91${phone}&otp=${code}`;
    const r = await fetch(url, { method: 'POST', headers: { authkey: authKey, 'content-type': 'application/json' } });
    if (!r.ok) throw new HttpError(502, 'Could not send the OTP SMS. Please try again.');
    return { sent: true };
  }
  if (p === 'twilio') {
    const { sid, token, from } = config.otp.twilio;
    if (!sid || !token || !from) throw new HttpError(500, 'Twilio is not configured');
    const body = new URLSearchParams({ To: `+91${phone}`, From: from, Body: `${code} is your Eventique OTP. It is valid for ${config.otp.ttlMinutes} minutes. Do not share it.` });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', body, headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
    });
    if (!r.ok) throw new HttpError(502, 'Could not send the OTP SMS. Please try again.');
    return { sent: true };
  }
  throw new HttpError(500, `Unknown OTP_PROVIDER "${p}"`);
}

/* ======================= Payments (Razorpay or mock) ======================= */
let razorpay = null;
function rzp() {
  if (config.paymentsMock) return null;
  if (!razorpay) { const Razorpay = require('razorpay'); razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret }); }
  return razorpay;
}
const MOCK_SECRET = 'eventique-mock-gateway';
/** Create an order for `amount` rupees. Razorpay works in paise. */
async function createOrder(amount, receipt, notes = {}) {
  const client = rzp();
  if (!client) return { id: 'order_mock_' + crypto.randomBytes(6).toString('hex'), amount: amount * 100, currency: 'INR', mock: true };
  return client.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt, notes });
}
function verifyPayment({ orderId, paymentId, signature }) {
  const secret = config.paymentsMock ? MOCK_SECRET : config.razorpay.keySecret;
  return verifyPaymentSignature(orderId, paymentId, signature, secret);
}
/** Only used by the mock gateway so clients can complete a payment without Razorpay keys. */
function mockSign(orderId) {
  const paymentId = 'pay_mock_' + crypto.randomBytes(6).toString('hex');
  const signature = crypto.createHmac('sha256', MOCK_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return { orderId, paymentId, signature };
}
async function refund(paymentId, amount) {
  const client = rzp();
  if (!client || !paymentId || paymentId.startsWith('pay_mock_')) return { id: 'rfnd_mock_' + crypto.randomBytes(5).toString('hex'), mock: true };
  return client.payments.refund(paymentId, { amount: Math.round(amount * 100) });
}

/* ======================= File storage ======================= */
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
async function storeFile(buffer, mimetype, folder = 'misc') {
  if (!EXT[mimetype]) throw new HttpError(400, 'Only JPG, PNG, WEBP or PDF files are allowed');
  if (config.storage.driver === 'cloudinary') {
    const m = /^cloudinary:\/\/(\w+):([^@]+)@(.+)$/.exec(config.storage.cloudinaryUrl);
    if (!m) throw new HttpError(500, 'CLOUDINARY_URL is not configured');
    const [, apiKey, apiSecret, cloud] = m;
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `folder=eventique/${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimetype }));
    form.append('api_key', apiKey); form.append('timestamp', String(timestamp));
    form.append('folder', `eventique/${folder}`); form.append('signature', signature);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) throw new HttpError(502, 'Image upload failed');
    return j.secure_url;
  }
  const name = `${folder}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${EXT[mimetype]}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `${config.storage.publicUrl}/uploads/${name}`;
}

/* ======================= Realtime + notifications ======================= */
let io = null;
const setIO = (server) => { io = server; };
const emitTo = (userId, event, payload) => { if (io && userId) io.to(`user:${userId}`).emit(event, payload); };
async function notify(userIds, { icon = 'bell', title, body = '', link = '' }) {
  const { Notification } = require('../models');
  const ids = [].concat(userIds).filter(Boolean).map(String);
  if (!ids.length) return [];
  const docs = await Notification.insertMany(ids.map((user) => ({ user, icon, title, body, link })));
  docs.forEach((d) => emitTo(String(d.user), 'notification', d.toJSON()));
  return docs;
}

/* ======================= Platform settings ======================= */
async function settings() {
  const { Setting } = require('../models');
  const s = await Setting.findOne({ key: 'platform' }).lean();
  const d = config.platform;
  return { commission: s?.commission ?? d.commission, gst: s?.gst ?? d.gst, advance: s?.advance ?? d.advance, freeCancelHours: s?.freeCancelHours ?? d.freeCancelHours, maintenance: !!s?.maintenance };
}

module.exports = { sendSms, createOrder, verifyPayment, mockSign, refund, storeFile, setIO, emitTo, notify, settings, makeCode, UPLOAD_DIR };
