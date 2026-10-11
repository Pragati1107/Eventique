/* Chat threads, reviews (vendor side), notifications and complaints. */
const router = require('express').Router();
const { Thread, Message, Vendor, Review, Notification, Complaint, User } = require('../models');
const { HttpError, asyncH, str, int } = require('../lib/core');
const { emitTo, notify } = require('../services');
const { auth, role, vendorOnly } = require('../middleware/auth');

router.use(auth);

/* ---------------- chat ---------------- */
const side = (req) => (req.user.role === 'vendor' ? 'vendor' : 'customer');
async function threadFor(req, id) {
  const t = await Thread.findById(id).populate('customer', 'name photo').populate('vendor', 'name cover owner category');
  if (!t) throw new HttpError(404, 'Conversation not found.');
  const mine = side(req) === 'customer' ? String(t.customer._id) === String(req.user._id) : req.vendor && String(t.vendor._id) === String(req.vendor._id);
  if (!mine) throw new HttpError(404, 'Conversation not found.');
  return t;
}

router.get('/threads', asyncH(async (req, res) => {
  if (!['customer', 'vendor'].includes(req.user.role)) return res.json({ threads: [] });
  const filter = side(req) === 'customer' ? { customer: req.user._id } : { vendor: req.vendor?._id };
  const threads = await Thread.find(filter).sort({ lastAt: -1 }).populate('customer', 'name photo').populate('vendor', 'name cover category');
  res.json({ threads });
}));

router.post('/threads', role('customer'), asyncH(async (req, res) => {
  const vendor = await Vendor.findOne({ _id: req.body.vendorId, status: 'Approved' });
  if (!vendor) throw new HttpError(404, 'Vendor not found.');
  const t = await Thread.findOneAndUpdate({ customer: req.user._id, vendor: vendor._id }, { $setOnInsert: { lastAt: new Date() } }, { upsert: true, new: true });
  res.json({ thread: await threadFor(req, t._id) });
}));

router.get('/threads/:id/messages', asyncH(async (req, res) => {
  const t = await threadFor(req, req.params.id);
  const messages = await Message.find({ thread: t._id }).sort({ createdAt: 1 }).limit(500);
  if (side(req) === 'customer') t.unreadCustomer = 0; else t.unreadVendor = 0;
  await t.save();
  res.json({ thread: t, messages });
}));

router.post('/threads/:id/messages', asyncH(async (req, res) => {
  const t = await threadFor(req, req.params.id);
  const text = str(req.body.text, 2000);
  if (!text) throw new HttpError(400, 'Type a message first.');
  const from = side(req);
  const msg = await Message.create({ thread: t._id, from, sender: req.user._id, text });
  t.lastMessage = text; t.lastAt = new Date();
  if (from === 'customer') t.unreadVendor += 1; else t.unreadCustomer += 1;
  await t.save();
  const to = from === 'customer' ? t.vendor.owner : t.customer._id;
  emitTo(String(to), 'message', { thread: String(t._id), message: msg.toJSON(), fromName: from === 'customer' ? t.customer.name : t.vendor.name });
  res.status(201).json({ message: msg });
}));

/* ---------------- reviews (vendor side + flagging) ---------------- */
router.get('/vendor/reviews', vendorOnly, asyncH(async (req, res) => {
  res.json({ reviews: await Review.find({ vendor: req.vendor._id }).sort({ createdAt: -1 }), rating: req.vendor.rating, count: req.vendor.reviewsCount });
}));
router.post('/reviews/:id/reply', vendorOnly, asyncH(async (req, res) => {
  const r = await Review.findOne({ _id: req.params.id, vendor: req.vendor._id });
  if (!r) throw new HttpError(404, 'Review not found.');
  r.reply = str(req.body.text, 1000); await r.save();
  if (r.author) await notify(r.author, { icon: 'msg', title: `${req.vendor.name} replied to your review`, body: r.reply.slice(0, 120) });
  res.json({ review: r });
}));
router.post('/reviews/:id/flag', asyncH(async (req, res) => {
  const r = await Review.findByIdAndUpdate(req.params.id, { flagged: true }, { new: true });
  if (!r) throw new HttpError(404, 'Review not found.');
  res.json({ review: r });
}));

/* ---------------- notifications ---------------- */
router.get('/notifications', asyncH(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(int(req.query.limit, { min: 1, max: 100, def: 50 })),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ notifications: items, unread });
}));
router.post('/notifications/read-all', asyncH(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ ok: true });
}));
router.post('/notifications/:id/read', asyncH(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ ok: true });
}));

/* ---------------- complaints (customer raises) ---------------- */
router.post('/complaints', role('customer'), asyncH(async (req, res) => {
  const vendor = await Vendor.findById(req.body.vendorId);
  const text = str(req.body.text, 2000);
  if (!vendor || !text) throw new HttpError(400, 'Choose a vendor and describe the problem.');
  const c = await Complaint.create({ from: req.user._id, fromName: req.user.name, vendor: vendor._id, vendorName: vendor.name, booking: req.body.bookingId || undefined, text });
  const admins = await User.find({ role: 'admin' }, '_id');
  await notify(admins.map((a) => a._id), { icon: 'alert', title: `New complaint: ${vendor.name}`, body: `${req.user.name} · ${text.slice(0, 80)}` });
  res.status(201).json({ complaint: c });
}));

module.exports = router;
