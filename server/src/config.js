require('dotenv').config();

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

const config = {
  port: num(process.env.PORT, 4000),
  env: process.env.NODE_ENV || 'development',
  corsOrigins: list(process.env.CORS_ORIGINS),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventique',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  otp: {
    provider: (process.env.OTP_PROVIDER || 'dev').toLowerCase(),
    demoPhones: list(process.env.DEMO_PHONES),
    demoOtp: process.env.DEMO_OTP || '123456',
    ttlMinutes: 5,
    maxAttempts: 5,
    resendSeconds: 30,
    msg91: { authKey: process.env.MSG91_AUTH_KEY, templateId: process.env.MSG91_TEMPLATE_ID },
    twilio: { sid: process.env.TWILIO_SID, token: process.env.TWILIO_TOKEN, from: process.env.TWILIO_FROM },
  },
  adminInviteCode: process.env.ADMIN_INVITE_CODE || 'EVQ-ADMIN',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  storage: {
    driver: (process.env.STORAGE || 'local').toLowerCase(),
    cloudinaryUrl: process.env.CLOUDINARY_URL || '',
    publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:4000').replace(/\/$/, ''),
  },
  platform: {
    commission: num(process.env.COMMISSION_PERCENT, 8),
    gst: num(process.env.GST_PERCENT, 18),
    advance: num(process.env.ADVANCE_PERCENT, 20),
    freeCancelHours: num(process.env.FREE_CANCEL_HOURS, 72),
  },
};

config.isProd = config.env === 'production';
config.paymentsMock = !(config.razorpay.keyId && config.razorpay.keySecret);

if (!config.jwtSecret) {
  if (config.isProd) throw new Error('JWT_SECRET must be set in production');
  config.jwtSecret = 'dev-only-secret-do-not-use-in-production';
  console.warn('[config] JWT_SECRET not set, using an insecure development secret');
}
if (config.isProd && config.otp.provider === 'dev' && !config.otp.demoPhones.length) {
  console.warn('[config] OTP_PROVIDER=dev in production: OTPs are returned in API responses. Set msg91 or twilio.');
}

module.exports = config;
