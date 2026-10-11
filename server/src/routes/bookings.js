const router = require('express').Router();
const config = require('../config');
const { Booking, Vendor, Payment, Review, User } = require('../models');
const { HttpError, asyncH, str, int, isDate, priceBooking, payoutFor, makeCode, canTransition, refundFor, escapeRegex } = require('../lib/core');
const { createOrder, notify, settings, emitTo } = require('../services');
const { auth, role } = require('../middleware/auth');

router.use(auth);
const populate = (q) => q.populate('customer', 'name phone city photo').populate('vendor', 'name category city cover owner unit');

async function loadFor(req, id) {
  const b = await populate(Booking.findById(id));
  if (!b) throw new HttpError(404, 'Booking not found.');
  const r = req.user.role;
  const ok = r === 'admin' || (r === 'customer' && String(b.customer._id) === String(req.user._id)) || (r === 'vendor' && req.vendor && String(b.vendor._id) === String(req.vendor._id));
  if (!ok) throw new HttpError(404, 'Booking not found.');
  return b;
}
const orderPayload = (order, payment) => ({ id: order.id, amount: order.amount, currency: 'INR', keyId: config.razorpay.keyId || null, mock: config.paymentsMock, paymentCode: payment.code });
const adminsOf = async () => (await User.find({ role: 'admin' }, '_id')).map((a) => a._id);
const activity = async (icon, text) => (await adminsOf()).forEach((a) => emitTo(String(a), 'activity', { icon, text }));

/* Create a booking + advance payment order (customer). */
router.post('/', role('customer'), asyncH(async (req, res) => {
  const { vendorId, packageId, date, slot, guests, address, note, eventType } = req.body;
  if (!isDate(date)) throw new HttpError(400, 'Choose an event date.');
  if (date < new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'The event date must be in the future.');
  const vendor = await Vendor.findOne({ _id: vendorId, status: 'Approved' });
  if (!vendor) throw new HttpError(404, 'Vendor not found.');
  if (vendor.blockedDates.includes(date)) throw new HttpError(409, `${vendor.name} is not available on this date.`);
  const pkg = vendor.packages.id(packageId) || vendor.packages[0];
  if (!pkg) throw new HttpError(400, 'This vendor has no packages yet.');
  const s = await settings();
  const price = priceBooking({ unit: vendor.unit, packagePrice: pkg.price, guests, gstPercent: s.gst, advancePercent: s.advance });
  const booking = await Booking.create({
    code: makeCode('EVQ'), customer: req.user._id, vendor: vendor._id, eventType: str(eventType, 40) || 'Wedding', date,
    slot: str(slot, 20) || 'Evening', guests: int(guests, { min: 1, max: 100000, def: 100 }), address: str(address, 200), note: str(note, 500),
    packageName: pkg.name, ...price, status: 'AwaitingPayment', history: [{ status: 'AwaitingPayment', by: req.user._id }],
  });
  const payment = await Payment.create({ code: makeCode('PAY'), type: 'Advance', booking: booking._id, user: req.user._id, vendor: vendor._id, amount: price.advance, status: 'Created' });
  const order = await createOrder(price.advance, payment.code, { booking: booking.code });
  payment.orderId = order.id; await payment.save();
  res.status(201).json({ booking: await loadFor(req, booking._id), order: orderPayload(order, payment) });
}));

/* List bookings for the current role. */
router.get('/', asyncH(async (req, res) => {
  const r = req.user.role; const filter = {};
  if (r === 'customer') filter.customer = req.user._id;
  if (r === 'vendor') { if (!req.vendor) return res.json({ bookings: [] }); filter.vendor = req.vendor._id; }
  if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;
  else if (r !== 'customer') filter.status = { $ne: 'AwaitingPayment' };
  let bookings = await populate(Booking.find(filter).sort({ createdAt: -1 }).limit(200));
  if (req.query.q && r === 'admin') { const rx = new RegExp(escapeRegex(str(req.query.q, 60)), 'i'); bookings = bookings.filter((b) => rx.test(b.code) || rx.test(b.customer?.name) || rx.test(b.vendor?.name)); }
  res.json({ bookings });
}));

router.get('/:id', asyncH(async (req, res) => res.json({ booking: await loadFor(req, req.params.id) })));

/* Change status: accept / decline / complete / cancel. */
router.patch('/:id/status', asyncH(async (req, res) => {
  const b = await loadFor(req, req.params.id); const to = req.body.status; const r = req.user.role;
  if (!canTransition(r, b.status, to)) throw new HttpError(409, `A ${b.status.toLowerCase()} booking can't be changed to ${String(to).toLowerCase()}.`);
  const s = await settings();
  const refund = ['Cancelled', 'Declined'].includes(to) ? (to === 'Declined' ? b.paid : refundFor(b, Date.now(), s.freeCancelHours, r)) : 0;
  b.status = to; b.history.push({ status: to, by: req.user._id }); await b.save();
  if (refund > 0) await Payment.create({ code: makeCode('RF'), type: 'Refund', booking: b._id, user: b.customer._id, vendor: b.vendor._id, amount: refund, status: 'Pending' });
  if (to === 'Completed') await Payment.create({ code: makeCode('PO'), type: 'Payout', booking: b._id, vendor: b.vendor._id, amount: payoutFor(b.paid, s.commission), status: 'Pending', meta: { commission: s.commission } });
  const v = b.vendor; const msgs = {
    Confirmed: [b.customer._id, 'check', `${v.name} confirmed your booking`, `${b.eventType} · ${b.date} · ${b.packageName}`],
    Declined: [b.customer._id, 'x', `${v.name} isn’t available on this date`, refund ? `Your advance of ₹${refund.toLocaleString('en-IN')} will be refunded.` : 'See similar vendors.'],
    Completed: [b.customer._id, 'star', `How was your ${b.eventType.toLowerCase()}?`, `Review ${v.name} to help other families`],
    Cancelled: [r === 'customer' ? v.owner : b.customer._id, 'x', r === 'customer' ? `${b.customer.name} cancelled a booking` : 'Your booking was cancelled', `${b.code} · ${b.date}${refund ? ` · refund ₹${refund.toLocaleString('en-IN')}` : ''}`],
  }[to];
  if (msgs) await notify(msgs[0], { icon: msgs[1], title: msgs[2], body: msgs[3], link: `booking:${b._id}` });
  emitTo(String(b.customer._id), 'booking', { id: String(b._id), status: to }); emitTo(String(v.owner), 'booking', { id: String(b._id), status: to });
  activity('list', `<b>${v.name}</b> booking ${b.code} is now ${to.toLowerCase()}`);
  res.json({ booking: b, refund });
}));

/* Pay the remaining balance (customer). */
router.post('/:id/pay-balance', role('customer'), asyncH(async (req, res) => {
  const b = await loadFor(req, req.params.id);
  if (!['Confirmed', 'Completed'].includes(b.status)) throw new HttpError(409, 'You can pay the balance once the vendor confirms.');
  const due = b.amount - b.paid;
  if (due <= 0) throw new HttpError(409, 'Nothing is due on this booking.');
  const payment = await Payment.create({ code: makeCode('PAY'), type: 'Balance', booking: b._id, user: req.user._id, vendor: b.vendor._id, amount: due, status: 'Created' });
  const order = await createOrder(due, payment.code, { booking: b.code });
  payment.orderId = order.id; await payment.save();
  res.json({ order: orderPayload(order, payment) });
}));

/* Retry the advance payment for an unpaid booking. */
router.post('/:id/pay-advance', role('customer'), asyncH(async (req, res) => {
  const b = await loadFor(req, req.params.id);
  if (b.status !== 'AwaitingPayment') throw new HttpError(409, 'The advance is already paid.');
  const payment = await Payment.findOne({ booking: b._id, type: 'Advance' });
  const order = await createOrder(b.advance, payment.code, { booking: b.code });
  payment.orderId = order.id; payment.status = 'Created'; await payment.save();
  res.json({ order: orderPayload(order, payment) });
}));

/* Review after a completed event (customer). */
router.post('/:id/review', role('customer'), asyncH(async (req, res) => {
  const b = await loadFor(req, req.params.id);
  if (b.status !== 'Completed') throw new HttpError(409, 'You can review after the event is completed.');
  if (b.reviewed) throw new HttpError(409, 'You have already reviewed this booking.');
  const rating = int(req.body.rating, { min: 1, max: 5, def: 5 });
  const review = await Review.create({ vendor: b.vendor._id, booking: b._id, author: req.user._id, authorName: req.user.name, rating, text: str(req.body.text, 2000) || 'Wonderful service.' });
  b.reviewed = true; await b.save();
  const all = await Review.find({ vendor: b.vendor._id, hidden: false }, 'rating');
  await Vendor.updateOne({ _id: b.vendor._id }, { rating: Math.round((all.reduce((a, r) => a + r.rating, 0) / all.length) * 10) / 10, reviewsCount: all.length });
  await notify(b.vendor.owner, { icon: 'star', title: `${req.user.name} left a ${rating}★ review`, body: review.text.slice(0, 120) });
  res.status(201).json({ review });
}));

module.exports = router;
