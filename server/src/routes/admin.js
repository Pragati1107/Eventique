const router = require('express').Router();
const { User, Vendor, Booking, Payment, Review, Complaint, Broadcast, Category, Setting } = require('../models');
const { HttpError, asyncH, str, int, escapeRegex } = require('../lib/core');
const { notify, refund, settings } = require('../services');
const { auth, role } = require('../middleware/auth');

router.use(auth, role('admin'));

router.get('/overview', asyncH(async (_req, res) => {
  const s = await settings();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [customers, vendors, pendingVendors, openComplaints, bookings, recent] = await Promise.all([
    User.countDocuments({ role: 'customer' }), Vendor.countDocuments({ status: 'Approved' }), Vendor.countDocuments({ status: 'Pending' }),
    Complaint.countDocuments({ status: 'Open' }),
    Booking.find({ status: { $in: ['Pending', 'Confirmed', 'Completed'] } }).populate('vendor', 'category name rating'),
    Booking.find({ status: { $ne: 'AwaitingPayment' } }).sort({ createdAt: -1 }).limit(5).populate('customer', 'name').populate('vendor', 'name category cover'),
  ]);
  const gmv = bookings.filter((b) => b.createdAt >= monthStart).reduce((a, b) => a + b.amount, 0);
  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
  const monthly = months.map((m) => bookings.filter((b) => b.createdAt.toISOString().startsWith(m)).reduce((a, b) => a + b.amount, 0));
  const byCat = {}; bookings.forEach((b) => { const c = b.vendor?.category || 'Other'; byCat[c] = (byCat[c] || 0) + 1; });
  const totalB = bookings.length || 1;
  const topVendors = await Vendor.find({ status: 'Approved' }).sort({ rating: -1, reviewsCount: -1 }).limit(5).select('name rating reviewsCount category city');
  res.json({
    customers, vendors, pendingVendors, openComplaints, totalBookings: bookings.length, gmv, commission: Math.round((gmv * s.commission) / 100),
    months, monthly, byCategory: Object.entries(byCat).map(([name, n]) => ({ name, percent: Math.round((n / totalB) * 100) })).sort((a, b) => b.percent - a.percent),
    topVendors, recent,
  });
}));

/* users */
router.get('/users', asyncH(async (req, res) => {
  const f = {}; const { q, type } = req.query;
  if (type === 'Customers') f.role = 'customer'; if (type === 'Vendors') f.role = 'vendor'; if (type === 'Blocked') f.status = 'Blocked';
  if (q) { const rx = new RegExp(escapeRegex(str(q, 60)), 'i'); f.$or = [{ name: rx }, { phone: rx }, { city: rx }]; }
  res.json({ users: await User.find(f).sort({ createdAt: -1 }).limit(200) });
}));
router.patch('/users/:id', asyncH(async (req, res) => {
  const u = await User.findById(req.params.id); if (!u) throw new HttpError(404, 'User not found.');
  if (String(u._id) === String(req.user._id)) throw new HttpError(400, 'You cannot block yourself.');
  if (['Active', 'Blocked'].includes(req.body.status)) u.status = req.body.status;
  await u.save(); res.json({ user: u });
}));

/* vendor verification */
router.get('/vendors', asyncH(async (req, res) => {
  const status = req.query.status || 'Pending';
  res.json({ vendors: await Vendor.find(status === 'All' ? {} : { status }).sort({ createdAt: 1 }).populate('owner', 'name phone') });
}));
router.patch('/vendors/:id', asyncH(async (req, res) => {
  const v = await Vendor.findById(req.params.id); if (!v) throw new HttpError(404, 'Vendor not found.');
  if (!['Approved', 'Rejected', 'Suspended', 'Pending'].includes(req.body.status)) throw new HttpError(400, 'Invalid status.');
  v.status = req.body.status; await v.save();
  const msg = { Approved: ['shield', 'Your profile is live!', 'Customers can now find and book you on Eventique.'], Rejected: ['x', 'Verification was not approved', str(req.body.reason, 200) || 'Please check your documents and try again.'], Suspended: ['alert', 'Your profile is paused', str(req.body.reason, 200) || 'Contact Eventique support.'] }[v.status];
  if (msg) await notify(v.owner, { icon: msg[0], title: msg[1], body: msg[2] });
  res.json({ vendor: v });
}));

/* categories */
router.get('/categories', asyncH(async (_req, res) => res.json({ categories: await Category.find().sort({ order: 1, name: 1 }) })));
router.post('/categories', asyncH(async (req, res) => {
  const name = str(req.body.name, 40); if (!name) throw new HttpError(400, 'Enter a category name.');
  if (await Category.exists({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) throw new HttpError(409, 'That category already exists');
  res.status(201).json({ category: await Category.create({ name, icon: str(req.body.icon, 20) || 'sparkle', order: 99 }) });
}));
router.patch('/categories/:id', asyncH(async (req, res) => {
  const c = await Category.findById(req.params.id); if (!c) throw new HttpError(404, 'Category not found.');
  if (req.body.active !== undefined) c.active = !!req.body.active; if (req.body.name) c.name = str(req.body.name, 40);
  await c.save(); res.json({ category: c });
}));

/* payments: process refunds and payouts */
router.post('/payments/:id/process', asyncH(async (req, res) => {
  const p = await Payment.findById(req.params.id); if (!p) throw new HttpError(404, 'Payment not found.');
  if (p.status !== 'Pending') throw new HttpError(409, 'This payment is already processed.');
  if (p.type === 'Refund') {
    const original = await Payment.findOne({ booking: p.booking, type: 'Advance', status: 'Received' });
    const r = await refund(original?.paymentId, p.amount);
    p.status = 'Refunded'; p.meta = { ...(p.meta || {}), refundId: r.id };
    await notify(p.user, { icon: 'card', title: `Refund of ₹${p.amount.toLocaleString('en-IN')} processed`, body: 'It reaches your account in 5–7 working days.' });
  } else if (p.type === 'Payout') {
    // Bank transfer happens outside the app (or via RazorpayX). Record the reference here.
    p.status = 'Paid'; p.meta = { ...(p.meta || {}), reference: str(req.body.reference, 60) || 'manual' };
    const v = await Vendor.findById(p.vendor);
    if (v) await notify(v.owner, { icon: 'card', title: `Payout of ₹${p.amount.toLocaleString('en-IN')} sent`, body: v.bank?.last4 ? `To account ••${v.bank.last4}` : 'To your registered account' });
  } else throw new HttpError(400, 'Only refunds and payouts can be processed.');
  await p.save(); res.json({ payment: p });
}));

/* reviews & complaints */
router.get('/reviews', asyncH(async (req, res) => res.json({ reviews: await Review.find(req.query.flagged === '1' ? { flagged: true } : {}).sort({ createdAt: -1 }).limit(100).populate('vendor', 'name') })));
router.patch('/reviews/:id', asyncH(async (req, res) => {
  const r = await Review.findByIdAndUpdate(req.params.id, { hidden: !!req.body.hidden }, { new: true });
  if (!r) throw new HttpError(404, 'Review not found.');
  const all = await Review.find({ vendor: r.vendor, hidden: false }, 'rating');
  await Vendor.updateOne({ _id: r.vendor }, { rating: all.length ? Math.round((all.reduce((a, x) => a + x.rating, 0) / all.length) * 10) / 10 : 0, reviewsCount: all.length });
  res.json({ review: r });
}));
router.get('/complaints', asyncH(async (_req, res) => res.json({ complaints: await Complaint.find().sort({ status: -1, createdAt: -1 }).limit(100) })));
router.patch('/complaints/:id', asyncH(async (req, res) => {
  const c = await Complaint.findById(req.params.id); if (!c) throw new HttpError(404, 'Complaint not found.');
  if (req.body.action === 'resolve') { c.status = 'Resolved'; await c.save(); if (c.from) await notify(c.from, { icon: 'check', title: 'Your complaint was resolved', body: `About ${c.vendorName}` }); }
  if (req.body.action === 'warn') { const v = await Vendor.findById(c.vendor); if (v) await notify(v.owner, { icon: 'alert', title: 'Notice from Eventique', body: `A customer complaint needs your attention: ${c.text.slice(0, 100)}` }); }
  res.json({ complaint: c });
}));

/* broadcasts */
router.get('/broadcasts', asyncH(async (_req, res) => res.json({ broadcasts: await Broadcast.find().sort({ createdAt: -1 }).limit(50) })));
router.post('/broadcasts', asyncH(async (req, res) => {
  const title = str(req.body.title, 120); if (!title) throw new HttpError(400, 'Write a title');
  const audience = ['Everyone', 'Customers', 'Vendors'].includes(req.body.audience) ? req.body.audience : 'Everyone';
  const roles = audience === 'Everyone' ? ['customer', 'vendor'] : audience === 'Customers' ? ['customer'] : ['vendor'];
  const users = await User.find({ role: { $in: roles }, status: 'Active' }, '_id');
  const message = str(req.body.message, 1000);
  for (let i = 0; i < users.length; i += 500) await notify(users.slice(i, i + 500).map((u) => u._id), { icon: 'bell', title, body: message || 'From the Eventique team' });
  res.status(201).json({ broadcast: await Broadcast.create({ title, message, audience, sentBy: req.user._id, recipients: users.length }) });
}));

/* platform settings */
router.get('/settings', asyncH(async (_req, res) => res.json({ settings: await settings() })));
router.put('/settings', asyncH(async (req, res) => {
  const b = req.body; const upd = {};
  if (b.commission !== undefined) upd.commission = int(b.commission, { min: 0, max: 30 });
  if (b.gst !== undefined) upd.gst = int(b.gst, { min: 0, max: 28 });
  if (b.advance !== undefined) upd.advance = int(b.advance, { min: 0, max: 100 });
  if (b.freeCancelHours !== undefined) upd.freeCancelHours = int(b.freeCancelHours, { min: 0, max: 720 });
  if (b.maintenance !== undefined) upd.maintenance = !!b.maintenance;
  await Setting.findOneAndUpdate({ key: 'platform' }, upd, { upsert: true });
  res.json({ settings: await settings() });
}));

module.exports = router;
