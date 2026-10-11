const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, Vendor } = require('../models');
const { HttpError } = require('../lib/core');

const sign = (user) => jwt.sign({ sub: String(user._id || user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

async function userFromToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, 'Your session has ended. Please log in again.');
  if (user.status === 'Blocked') throw new HttpError(403, 'This account is blocked. Contact Eventique support.');
  return user;
}

/** Requires a valid Bearer token; attaches req.user (and req.vendor for vendors). */
async function auth(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw new HttpError(401, 'Please log in to continue.');
    req.user = await userFromToken(token);
    if (req.user.role === 'vendor') req.vendor = await Vendor.findOne({ owner: req.user._id });
    next();
  } catch (e) {
    next(e instanceof HttpError ? e : new HttpError(401, 'Your session has ended. Please log in again.'));
  }
}

/** Optional auth: attaches req.user if a valid token is present, otherwise continues anonymously. */
async function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return auth(req, res, (err) => next(err && err.status === 403 ? err : undefined));
}

const role = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this.'));

const vendorOnly = (req, _res, next) => {
  if (req.user?.role !== 'vendor') return next(new HttpError(403, 'Vendor access only.'));
  if (!req.vendor) return next(new HttpError(404, 'Create your vendor profile first.'));
  next();
};

module.exports = { sign, auth, optionalAuth, role, vendorOnly, userFromToken };
