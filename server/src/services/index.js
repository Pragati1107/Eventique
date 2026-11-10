const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { HttpError, makeCode, verifyPaymentSignature } = require('../lib/core');

/* ======================= SMS / OTP delivery ======================= */
const twilioAuth = () => 'Basic ' + Buffer.from(`${config.otp.twilio.sid}:${config.otp.twilio.token}`).toString('base64');
async function twilioError(r) {
  let j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
  console.error('[twilio] send failed:', r.status, 'code', j.code, '-', j.message, j.more_info || '');
  const c = j.code;
  if (c === 21608 || c === 21614 || c === 60205) return new HttpError(502, 'SMS could not be sent to this number. On a Twilio trial account, add it under Verified Caller IDs first.', 'SMS_UNVERIFIED');
  if (c === 21408) return new HttpError(502, 'SMS to India is turned off in Twilio. Enable India under Messaging > Settings > Geo permissions.', 'SMS_GEO');
  if (c === 21610) return new HttpError(502, 'This number has blocked SMS from us (it replied STOP). Reply START to the Twilio number, then try again.', 'SMS_STOPPED');
  if (c === 21606 || c === 21659 || c === 21212 || c === 21660) return new HttpError(502, 'The Twilio sender number (TWILIO_FROM) is wrong or cannot send SMS. Check it in Render.', 'SMS_FROM');
  if (c === 20003 || r.status === 401) return new HttpError(502, 'Twilio login failed. Check TWILIO_SID and TWILIO_TOKEN in Render.', 'SMS_AUTH');
  if (c === 20429 || c === 60203 || r.status === 429) return new HttpError(429, 'Too many OTP requests for this number. Please try again in a few minutes.', 'SMS_RATE');
  if (c === 60200 || c === 21211) return new HttpError(400, 'This mobile number is not valid for SMS.', 'SMS_NUMBER');
  return new HttpError(502, `The OTP SMS could not be sent${c ? ` (Twilio error ${c})` : ''}. Please try again.`, 'SMS_FAILED');
}
/** Twilio Verify: Twilio creates, sends and checks the code. */
async function verifyStart(phone) {
  const { verifySid } = config.otp.twilio;
  const r = await fetch(`https://verify.twilio.com/v2/Services/${verifySid}/Verifications`, { method: 'POST', body: new URLSearchParams({ To: `+91${phone}`, Channel: 'sms' }), headers: { Authorization: twilioAuth() } });
  if (!r.ok) throw await twilioError(r);
  return { sent: true };
}
async function verifyCheck(phone, code) {
  const { verifySid } = config.otp.twilio;
  const r = await fetch(`https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`, { method: 'POST', body: new URLSearchParams({ To: `+91${phone}`, Code: String(code) }), headers: { Authorization: twilioAuth() } });
  if (r.status === 404) return false; // no pending verification (expired or already used)
  if (!r.ok) throw await twilioError(r);
  const j = await r.json();
  return j.status === 'approved';
}

/* ---- OTP by email, through a Google Apps Script web app (Render's free plan blocks SMTP) ---- */
const escHtml = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function otpEmail(code, name) {
  const mins = config.otp.ttlMinutes; const hi = name ? `Hi ${escHtml(name.split(' ')[0])},` : 'Hi,';
  const text = `${hi}\n\nYour Eventique verification code is ${code}. It is valid for ${mins} minutes.\n\nIf you did not request this code, you can ignore this email. Never share this code with anyone.\n\nTeam Eventique`;
  const html = `<div style="background:#f7f2f3;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#241820"><div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ebdfe3">
<div style="background:#8b1e3f;padding:18px 24px;color:#ffffff;font-size:20px;font-family:Georgia,serif">Eventique</div>
<div style="padding:24px"><p style="margin:0 0 12px;font-size:15px">${hi}</p><p style="margin:0 0 18px;font-size:15px">Use this code to continue on Eventique:</p>
<div style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#8b1e3f;background:#f6e5ea;border-radius:12px;padding:14px 0;text-align:center">${code}</div>
<p style="margin:18px 0 0;font-size:13px;color:#6f6068">The code is valid for ${mins} minutes. If you did not ask for it, ignore this email. Never share this code with anyone, including Eventique staff.</p></div>
<div style="padding:14px 24px;border-top:1px solid #ebdfe3;font-size:12px;color:#6f6068">Eventique · Weddings, events and vendors in one app</div></div></div>`;
  return { subject: `${code} is your Eventique verification code`, text, html };
}
async function sendEmailOtp(to, code, name) { return sendEmail(to, otpEmail(code, name), 'The OTP email'); }

/** Send any email through the Apps Script relay. msg = { subject, html, text }. */
async function sendEmail(to, msg, what = 'The email') {
  const { webhookUrl, secret, fromName } = config.otp.email;
  if (!webhookUrl || !secret) throw new HttpError(502, 'Email sending is not set up. Add EMAIL_WEBHOOK_URL and EMAIL_WEBHOOK_SECRET in Render.', 'EMAIL_SETUP');
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
  let j = {};
  try {
    const r = await fetch(webhookUrl, { method: 'POST', redirect: 'follow', signal: ctrl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret, to, fromName, ...msg }) });
    const raw = await r.text(); try { j = JSON.parse(raw); } catch (e) { j = { ok: false, error: `HTTP ${r.status}: ${raw.slice(0, 160)}` }; }
  } catch (e) {
    console.error('[email] request failed:', e.message);
    throw new HttpError(502, `${what} could not be sent. Please try again.`, 'EMAIL_FAILED');
  } finally { clearTimeout(timer); }
  if (!j.ok) {
    console.error('[email] send failed:', j.error);
    if (/secret/i.test(j.error || '')) throw new HttpError(502, 'Email sender secret does not match. Check EMAIL_WEBHOOK_SECRET in Render and SECRET in the Apps Script.', 'EMAIL_SECRET');
    if (/quota|limit/i.test(j.error || '')) throw new HttpError(429, 'Daily email limit reached. Please try again tomorrow.', 'EMAIL_QUOTA');
    throw new HttpError(502, `${what} could not be sent. Please try again.`, 'EMAIL_FAILED');
  }
  return { sent: true };
}

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
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', body, headers: { Authorization: twilioAuth() } });
    if (!r.ok) throw await twilioError(r);
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
function updateEmail(name, title, body) {
  const app = config.storage.publicUrl; const hi = name ? `Hi ${escHtml(String(name).split(' ')[0])},` : 'Hi,';
  const text = `${hi}\n\n${title}\n${body}\n\nOpen Eventique: ${app}\n\nYou get these emails for your bookings. You can turn them off in Profile > Settings.\nTeam Eventique`;
  const html = `<div style="background:#f7f2f3;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#241820"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ebdfe3">
<div style="background:#8b1e3f;padding:18px 24px;color:#ffffff;font-size:20px;font-family:Georgia,serif">Eventique</div>
<div style="padding:24px"><p style="margin:0 0 12px;font-size:15px">${hi}</p><p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#5c1229">${escHtml(title)}</p>
<p style="margin:0 0 20px;font-size:15px;color:#3d2f36">${escHtml(body)}</p>
<a href="${app}" style="display:inline-block;background:#8b1e3f;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Open Eventique</a></div>
<div style="padding:14px 24px;border-top:1px solid #ebdfe3;font-size:12px;color:#6f6068">You get these emails for your bookings. You can turn them off in Profile &gt; Settings. · <a href="${app}/privacy" style="color:#6f6068">Privacy</a></div></div></div>`;
  return { subject: `${title} · Eventique`, text, html };
}

/** In-app notification + live push. With email: true it is also emailed to users who have an email and have not turned emails off. */
async function notify(userIds, { icon = 'bell', title, body = '', link = '', email = false }) {
  const { Notification, User } = require('../models');
  const ids = [].concat(userIds).filter(Boolean).map(String);
  if (!ids.length) return [];
  const docs = await Notification.insertMany(ids.map((user) => ({ user, icon, title, body, link })));
  docs.forEach((d) => emitTo(String(d.user), 'notification', d.toJSON()));
  if (email && config.otp.email.webhookUrl && config.otp.email.secret) {
    User.find({ _id: { $in: ids }, email: { $nin: [null, ''] }, 'prefs.email': { $ne: false } }, 'name email').lean()
      .then((users) => Promise.allSettled(users.map((u) => sendEmail(u.email, updateEmail(u.name, title, body), 'The update email'))))
      .then((rs) => rs && rs.filter((r) => r.status === 'rejected').forEach((r) => console.warn('[email] update not sent:', r.reason && r.reason.message)))
      .catch((e) => console.warn('[email] update lookup failed:', e.message));
  }
  return docs;
}

/* ======================= Platform settings ======================= */
async function settings() {
  const { Setting } = require('../models');
  const s = await Setting.findOne({ key: 'platform' }).lean();
  const d = config.platform;
  return { commission: s?.commission ?? d.commission, gst: s?.gst ?? d.gst, advance: s?.advance ?? d.advance, freeCancelHours: s?.freeCancelHours ?? d.freeCancelHours, maintenance: !!s?.maintenance };
}

module.exports = { sendSms, sendEmailOtp, sendEmail, verifyStart, verifyCheck, createOrder, verifyPayment, mockSign, refund, storeFile, setIO, emitTo, notify, settings, makeCode, UPLOAD_DIR };
