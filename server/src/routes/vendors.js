const router = require('express').Router();
const multer = require('multer');
const { Vendor, Category, EventType, Review, Booking, Payment } = require('../models');
const { HttpError, asyncH, str, int, isDate, escapeRegex } = require('../lib/core');
const { storeFile, settings } = require('../services');
const { auth, optionalAuth, vendorOnly } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/* ---------------- public catalogue ---------------- */
router.get('/catalog', asyncH(async (_req, res) => {
  const [categories, events, s] = await Promise.all([
    Category.find({ active: true }).sort({ order: 1, name: 1 }),
    EventType.find().sort({ order: 1 }),
    settings(),
  ]);
  res.json({ categories, events, settings: { gst: s.gst, advance: s.advance, freeCancelHours: s.freeCancelHours, maintenance: s.maintenance } });
}));

const SORTS = { rating: { rating: -1, reviewsCount: -1 }, price_asc: { basePrice: 1 }, price_desc: { basePrice: -1 }, reviews: { reviewsCount: -1 } };
router.get('/vendors', asyncH(async (req, res) => {
  const { q, category, city, event, sort = 'rating' } = req.query;
  const filter = { status: 'Approved' };
  const active = (await Category.find({ active: true }, 'name')).map((c) => c.name);
  let cats = active;
  if (event) { const ev = await EventType.findOne({ key: event }); if (ev) cats = ev.categories.filter((c) => active.includes(c)); }
  if (category && category !== 'All') cats = cats.filter((c) => c === category);
  filter.category = { $in: cats };
  if (city && city !== 'All cities') filter.city = city;
  if (q) { const rx = new RegExp(escapeRegex(str(q, 60)), 'i'); filter.$or = [{ name: rx }, { category: rx }, { city: rx }]; }
  const page = int(req.query.page, { min: 1, max: 100, def: 1 }); const limit = int(req.query.limit, { min: 1, max: 50, def: 20 });
  const [vendors, total] = await Promise.all([
    Vendor.find(filter).sort(SORTS[sort] || SORTS.rating).skip((page - 1) * limit).limit(limit).select('-documents -bank -blockedDates'),
    Vendor.countDocuments(filter),
  ]);
  res.json({ vendors, total, page });
}));

router.get('/vendors/:id', optionalAuth, asyncH(async (req, res) => {
  const v = await Vendor.findOneAndUpdate({ _id: req.params.id, status: 'Approved' }, { $inc: { views: 1 } }, { new: true }).select('-documents -bank');
  if (!v) throw new HttpError(404, 'Vendor not found.');
  const [reviews, taken] = await Promise.all([
    Review.find({ vendor: v._id, hidden: false }).sort({ createdAt: -1 }).limit(20),
    Booking.find({ vendor: v._id, status: { $in: ['Pending', 'Confirmed'] } }, 'date'),
  ]);
  res.json({ vendor: v, reviews, unavailable: [...new Set([...v.blockedDates, ...taken.map((b) => b.date)])], saved: !!req.user?.favs?.some((f) => String(f) === String(v._id)) });
}));

/* ---------------- vendor self-service ---------------- */
const me = require('express').Router();
me.use(auth, vendorOnly);

me.get('/', (req, res) => res.json({ vendor: req.vendor }));

me.patch('/', asyncH(async (req, res) => {
  const v = req.vendor; const b = req.body;
  if (b.name !== undefined) { if (!str(b.name)) throw new HttpError(400, 'Business name is required'); v.name = str(b.name, 80); }
  for (const k of ['category', 'city', 'about', 'instagram', 'gst', 'unit']) if (b[k] !== undefined) v[k] = str(b[k], k === 'about' ? 1500 : 80);
  if (b.years !== undefined) v.years = int(b.years, { min: 0, max: 80 });
  if (b.bank) v.bank = { holder: str(b.bank.holder, 80), ifsc: str(b.bank.ifsc, 15).toUpperCase(), last4: str(b.bank.account, 30).slice(-4) };
  await v.save();
  res.json({ vendor: v });
}));

me.put('/packages', asyncH(async (req, res) => {
  const list = Array.isArray(req.body.packages) ? req.body.packages : [];
  const packages = list.slice(0, 10).map((p) => ({ ...(p.id ? { _id: p.id } : {}), name: str(p.name, 60), price: int(p.price, { min: 0, max: 1e8 }), description: str(p.description, 300) }));
  if (packages.some((p) => !p.name || !p.price)) throw new HttpError(400, 'Every package needs a name and a price.');
  req.vendor.packages = packages;
  req.vendor.basePrice = packages.length ? Math.min(...packages.map((p) => p.price)) : 0;
  await req.vendor.save();
  res.json({ vendor: req.vendor });
}));

me.post('/portfolio', upload.array('files', 10), asyncH(async (req, res) => {
  if (!req.files?.length) throw new HttpError(400, 'Choose at least one photo.');
  for (const f of req.files) req.vendor.portfolio.unshift({ url: await storeFile(f.buffer, f.mimetype, 'portfolio'), label: str(req.body.label || f.originalname.replace(/\.[^.]+$/, ''), 40) });
  if (!req.vendor.cover && req.vendor.portfolio[0]) req.vendor.cover = req.vendor.portfolio[0].url;
  await req.vendor.save();
  res.status(201).json({ vendor: req.vendor });
}));
me.delete('/portfolio/:index', asyncH(async (req, res) => {
  req.vendor.portfolio.splice(int(req.params.index, { min: 0 }), 1);
  await req.vendor.save();
  res.json({ vendor: req.vendor });
}));

me.post('/documents', upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a document.');
  req.vendor.documents.push({ name: str(req.body.name, 60) || req.file.originalname, url: await storeFile(req.file.buffer, req.file.mimetype, 'docs') });
  await req.vendor.save();
  res.status(201).json({ vendor: req.vendor });
}));

me.put('/blocked-dates', asyncH(async (req, res) => {
  const dates = (Array.isArray(req.body.dates) ? req.body.dates : []).filter(isDate);
  req.vendor.blockedDates = [...new Set(dates)].sort();
  await req.vendor.save();
  res.json({ blockedDates: req.vendor.blockedDates });
}));

me.get('/stats', asyncH(async (req, res) => {
  const v = req.vendor; const today = new Date().toISOString().slice(0, 10);
  const [bookings, payouts] = await Promise.all([
    Booking.find({ vendor: v._id }).populate('customer', 'name phone').sort({ date: 1 }),
    Payment.find({ vendor: v._id, type: 'Payout' }).sort({ createdAt: -1 }),
  ]);
  const earned = bookings.filter((b) => ['Confirmed', 'Completed'].includes(b.status)).reduce((a, b) => a + b.amount, 0);
  const months = [...Array(7)].map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 6 + i); return d.toISOString().slice(0, 7); });
  const trend = months.map((m) => bookings.filter((b) => b.date.startsWith(m) && ['Confirmed', 'Completed'].includes(b.status)).reduce((a, b) => a + b.amount, 0));
  res.json({
    earned, trend, months, views: v.views, rating: v.rating, reviewsCount: v.reviewsCount,
    pending: bookings.filter((b) => b.status === 'Pending').length,
    upcoming: bookings.filter((b) => b.date >= today && ['Pending', 'Confirmed'].includes(b.status)).slice(0, 5),
    payouts,
    profileScore: Math.min(100, ['name', 'category', 'city', 'about', 'instagram', 'gst'].filter((k) => v[k]).length * 10 + Math.min(20, v.portfolio.length * 2) + Math.min(20, v.packages.length * 7)),
  });
}));

router.use('/vendor/me', me);
module.exports = router;
