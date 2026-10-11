const express = require('express');
const router = express.Router();
const config = require('../config');
const { Payment, Booking, User } = require('../models');
const { HttpError, asyncH, verifyWebhookSignature } = require('../lib/core');
const { verifyPayment, mockSign, notify, emitTo } = require('../services');
const { auth } = require('../middleware/auth');

/** Mark a payment received and move the booking forward. Idempotent. */
async function settle(payment, paymentId) {
  if (payment.status === 'Received') return payment;
  payment.status = 'Received'; payment.paymentId = paymentId; await payment.save();
  const b = await Booking.findById(payment.booking).populate('vendor', 'name owner').populate('customer', 'name');
  if (!b) return payment;
  b.paid += payment.amount;
  if (payment.type === 'Advance' && b.status === 'AwaitingPayment') { b.status = 'Pending'; b.history.push({ status: 'Pending' }); }
  await b.save();
  const amt = `₹${payment.amount.toLocaleString('en-IN')}`;
  if (payment.type === 'Advance') {
    await notify(b.vendor.owner, { icon: 'inbox', title: `New booking request: ${b.customer.name}`, body: `${b.eventType} · ${b.date} · ${b.packageName}`, link: `booking:${b._id}` });
    await notify(b.customer._id, { icon: 'check', title: 'Advance paid. Request sent!', body: `${b.vendor.name} usually replies within 24 hours.`, link: `booking:${b._id}` });
  } else {
    await notify(b.vendor.owner, { icon: 'card', title: `${b.customer.name} paid ${amt}`, body: b.code });
  }
  (await User.find({ role: 'admin' }, '_id')).forEach((a) => emitTo(String(a._id), 'activity', { icon: 'card', text: `${payment.type} of ${amt} received · ${b.code}` }));
  return payment;
}

/* Client confirms a Razorpay checkout. */
router.post('/verify', auth, asyncH(async (req, res) => {
  const { orderId, paymentId, signature } = req.body;
  const payment = await Payment.findOne({ orderId, user: req.user._id });
  if (!payment) throw new HttpError(404, 'Payment not found.');
  if (!verifyPayment({ orderId, paymentId, signature })) {
    payment.status = 'Failed'; await payment.save();
    throw new HttpError(400, 'Payment could not be verified. If money was deducted, it will be refunded automatically.');
  }
  await settle(payment, paymentId);
  res.json({ payment, booking: await Booking.findById(payment.booking) });
}));

/* Test-mode only: simulate a successful checkout when no Razorpay keys are configured. */
router.post('/mock-complete', auth, asyncH(async (req, res) => {
  if (!config.paymentsMock) throw new HttpError(404, 'Not found');
  const payment = await Payment.findOne({ orderId: req.body.orderId, user: req.user._id });
  if (!payment) throw new HttpError(404, 'Payment not found.');
  res.json(mockSign(payment.orderId));
}));

/* Razorpay webhook (configure URL: <PUBLIC_URL>/api/payments/webhook, event: payment.captured). Needs the raw body. */
async function webhook(req, res) {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  if (!verifyWebhookSignature(raw, req.headers['x-razorpay-signature'], config.razorpay.webhookSecret)) return res.status(400).json({ error: 'Bad signature' });
  const evt = JSON.parse(raw);
  if (evt.event === 'payment.captured') {
    const p = evt.payload?.payment?.entity;
    const payment = p && await Payment.findOne({ orderId: p.order_id });
    if (payment) await settle(payment, p.id);
  }
  res.json({ ok: true });
}

/* Payment history for vendor / admin / customer. */
router.get('/', auth, asyncH(async (req, res) => {
  const r = req.user.role; const filter = { status: { $ne: 'Created' } };
  if (r === 'customer') filter.user = req.user._id;
  if (r === 'vendor') filter.vendor = req.vendor?._id;
  if (req.query.type && req.query.type !== 'All') filter.type = req.query.type;
  const payments = await Payment.find(filter).sort({ createdAt: -1 }).limit(200)
    .populate('user', 'name').populate('vendor', 'name').populate('booking', 'code date eventType');
  res.json({ payments });
}));

module.exports = { router, webhook, settle };
