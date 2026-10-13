const router = require('express').Router();
const multer = require('multer');
const config = require('../config');
const { User, Vendor, Otp, Notification, Card } = require('../models');
const { HttpError, asyncH, isPhone, isEmail, isDate, str, int, generateOtp, hashOtp, safeEqual } = require('../lib/core');
const { sendSms, verifyStart, verifyCheck, storeFile } = require('../services');
const { auth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
router.use(auth);

router.get('/', asyncH(async (req, res) => {
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ user: req.user, vendor: req.vendor || null, unread });
}));

router.patch('/', asyncH(async (req, res) => {
  const b = req.body; const u = req.user;
  if (b.name !== undefined) { if (str(b.name, 80).length < 2) throw new HttpError(400, 'Name must be at least 2 characters.'); u.name = str(b.name, 80); }
  if (b.email !== undefined) { if (b.email && !isEmail(b.email)) throw new HttpError(400, 'Enter a valid email, like name@gmail.com'); u.email = str(b.email, 120); }
  if (b.eventDate !== undefined) { if (b.eventDate && !isDate(b.eventDate)) throw new HttpError(400, 'Invalid event date.'); u.eventDate = b.eventDate; }
  for (const k of ['city', 'dob', 'gender', 'address', 'partner', 'photo']) if (b[k] !== undefined) u[k] = str(b[k], k === 'address' ? 300 : 500);
  if (b.budget !== undefined) u.budget = int(b.budget, { min: 0, max: 1e9, def: u.budget });
  if (b.prefs && typeof b.prefs === 'object') u.prefs = { ...u.prefs?.toObject?.() || u.prefs, ...b.prefs };
  await u.save();
  res.json({ user: u });
}));

router.post('/photo', upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose an image to upload.');
  req.user.photo = await storeFile(req.file.buffer, req.file.mimetype, 'avatars');
  await req.user.save();
  res.json({ user: req.user });
}));

/* Change phone number: OTP is sent to the NEW number. */
router.post('/phone/otp', asyncH(async (req, res) => {
  const { phone } = req.body;
  if (!isPhone(phone)) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
  if (await User.exists({ phone })) throw new HttpError(409, 'That number is already linked to another account.');
  if (config.otp.provider === 'twilio_verify') {
    await verifyStart(phone);
    await Otp.create({ phone, purpose: 'change-phone', codeHash: 'twilio-verify', expiresAt: new Date(Date.now() + 10 * 60e3) });
    return res.json({ sent: true });
  }
  const code = generateOtp();
  await sendSms(phone, code);
  await Otp.create({ phone, purpose: 'change-phone', codeHash: hashOtp(phone, code, config.jwtSecret), expiresAt: new Date(Date.now() + config.otp.ttlMinutes * 60e3) });
  res.json({ sent: true, ...(config.otp.provider === 'dev' ? { devCode: code } : {}) });
}));
router.post('/phone/verify', asyncH(async (req, res) => {
  const { phone, code } = req.body;
  const otp = await Otp.findOne({ phone, purpose: 'change-phone', usedAt: null }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= config.otp.maxAttempts) throw new HttpError(400, 'This OTP has expired. Request a new one.');
  const ok = otp.codeHash === 'twilio-verify' ? await verifyCheck(phone, String(code)) : safeEqual(otp.codeHash, hashOtp(phone, String(code), config.jwtSecret));
  if (!ok) { otp.attempts += 1; await otp.save(); throw new HttpError(400, 'Incorrect OTP. Please try again.'); }
  otp.usedAt = new Date(); await otp.save();
  req.user.phone = phone; await req.user.save();
  res.json({ user: req.user });
}));

/* Saved vendors */
router.get('/favs', asyncH(async (req, res) => {
  const vendors = await Vendor.find({ _id: { $in: req.user.favs }, status: 'Approved' });
  res.json({ vendors });
}));
router.post('/favs/:vendorId', asyncH(async (req, res) => {
  const id = req.params.vendorId;
  if (!(await Vendor.exists({ _id: id }))) throw new HttpError(404, 'Vendor not found.');
  const has = req.user.favs.some((f) => String(f) === id);
  req.user.favs = has ? req.user.favs.filter((f) => String(f) !== id) : [...req.user.favs, id];
  await req.user.save();
  res.json({ saved: !has, favs: req.user.favs });
}));

/* Card Studio: saved invitation images */
router.get('/cards', asyncH(async (req, res) => res.json({ cards: await Card.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50) })));
router.post('/cards', upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Card image is missing.');
  const imageUrl = await storeFile(req.file.buffer, req.file.mimetype, 'cards');
  let design = {}; try { design = JSON.parse(req.body.design || '{}'); } catch { /* keep empty */ }
  const card = await Card.create({ user: req.user._id, event: str(req.body.event, 40), template: str(req.body.template, 40), design, imageUrl });
  res.status(201).json({ card });
}));
router.delete('/cards/:id', asyncH(async (req, res) => {
  await Card.deleteOne({ _id: req.params.id, user: req.user._id });
  res.json({ ok: true });
}));

module.exports = router;
