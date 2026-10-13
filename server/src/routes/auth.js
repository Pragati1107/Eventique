const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { User, Vendor, Otp } = require('../models');
const { HttpError, asyncH, isPhone, isEmail, isDate, str, generateOtp, hashOtp, safeEqual } = require('../lib/core');
const { sendSms, emitTo } = require('../services');
const { sign } = require('../middleware/auth');

const limiter = rateLimit({ windowMs: 10 * 60e3, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
router.use(limiter);

const ROLES = ['customer', 'vendor', 'admin'];
const isDemo = (phone) => config.otp.demoPhones.includes(phone);

function checkIntent(body) {
  const { phone, role, mode, name, inviteCode } = body;
  if (!isPhone(phone)) throw new HttpError(400, 'Enter a valid 10-digit Indian mobile number.');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Choose Customer, Vendor or Admin.');
  if (!['login', 'signup'].includes(mode)) throw new HttpError(400, 'Invalid mode.');
  if (mode === 'signup') {
    if (str(name, 80).length < 2) throw new HttpError(400, role === 'vendor' ? 'Enter your business name.' : 'Enter your name to sign up.');
    if (str(body.email) && !isEmail(str(body.email))) throw new HttpError(400, 'Enter a valid email, or leave it empty.');
    if (role === 'admin' && str(inviteCode).toUpperCase() !== config.adminInviteCode.toUpperCase()) throw new HttpError(403, 'That admin invite code is wrong.');
  }
}

/** Step 1: send an OTP. */
router.post('/otp', asyncH(async (req, res) => {
  const { phone, role, mode = 'login' } = req.body;
  checkIntent(req.body);
  const existing = await User.findOne({ phone });
  if (mode === 'login' && !existing) throw new HttpError(404, 'No account with this number yet. Please sign up first.');
  if (mode === 'login' && existing.role !== role) throw new HttpError(409, `This number is registered as a ${existing.role}. Choose "${existing.role[0].toUpperCase() + existing.role.slice(1)}" to log in.`);
  if (mode === 'signup' && existing) throw new HttpError(409, 'An account with this number already exists. Please log in.');

  const last = await Otp.findOne({ phone, purpose: 'login' }).sort({ createdAt: -1 });
  if (last && Date.now() - last.createdAt.getTime() < config.otp.resendSeconds * 1000) {
    throw new HttpError(429, `Please wait ${config.otp.resendSeconds} seconds before asking for a new OTP.`);
  }
  const code = isDemo(phone) ? config.otp.demoOtp : generateOtp();
  await Otp.create({ phone, purpose: 'login', codeHash: hashOtp(phone, code, config.jwtSecret), expiresAt: new Date(Date.now() + config.otp.ttlMinutes * 60e3) });
  if (!isDemo(phone)) await sendSms(phone, code);
  res.json({ sent: true, expiresInSeconds: config.otp.ttlMinutes * 60, resendInSeconds: config.otp.resendSeconds, ...(config.otp.provider === 'dev' || isDemo(phone) ? { devCode: code } : {}) });
}));

/** Step 2: verify the OTP, then log in or create the account. */
router.post('/verify', asyncH(async (req, res) => {
  const { phone, role, mode = 'login', name, code } = req.body;
  checkIntent(req.body);
  if (!/^\d{6}$/.test(String(code || ''))) throw new HttpError(400, 'Enter all 6 digits of the OTP.');
  const otp = await Otp.findOne({ phone, purpose: 'login', usedAt: null }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) throw new HttpError(400, 'This OTP has expired. Tap "Resend OTP".');
  if (otp.attempts >= config.otp.maxAttempts) throw new HttpError(429, 'Too many wrong attempts. Request a new OTP.');
  if (!safeEqual(otp.codeHash, hashOtp(phone, String(code), config.jwtSecret))) {
    otp.attempts += 1; await otp.save();
    throw new HttpError(400, "That OTP doesn't match. Check the SMS and try again.");
  }
  otp.usedAt = new Date(); await otp.save();

  let user = await User.findOne({ phone });
  let created = false;
  if (!user) {
    if (mode !== 'signup') throw new HttpError(404, 'No account with this number yet. Please sign up first.');
    const b = req.body;
    const profile = { phone, role, name: str((role === 'vendor' && str(b.ownerName, 80).length >= 2) ? b.ownerName : name, 80) };
    if (str(b.email) && isEmail(str(b.email))) profile.email = str(b.email, 120).toLowerCase();
    if (str(b.city)) profile.city = str(b.city, 60);
    if (role === 'customer' && isDate(str(b.eventDate))) profile.eventDate = str(b.eventDate);
    user = await User.create(profile);
    created = true;
    if (role === 'vendor') {
      await Vendor.create({ owner: user._id, name: str(name, 80), category: str(b.category, 40) || 'Photography', city: str(b.city, 60) || 'Lucknow', status: 'Pending' });
    }
    const admins = await User.find({ role: 'admin' }, '_id');
    admins.forEach((a) => emitTo(String(a._id), 'activity', { icon: 'user', text: `New ${role} sign-up: <b>${user.name}</b>` }));
  } else if (user.role !== role) {
    throw new HttpError(409, `This number is registered as a ${user.role}.`);
  }
  if (user.status === 'Blocked') throw new HttpError(403, 'This account is blocked. Contact Eventique support.');
  const vendor = user.role === 'vendor' ? await Vendor.findOne({ owner: user._id }) : null;
  res.status(created ? 201 : 200).json({ token: sign(user), user, vendor, created });
}));

module.exports = router;
