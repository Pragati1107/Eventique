const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const config = require('./config');
const { connect, mongoose } = require('./db');
const { HttpError } = require('./lib/core');
const { setIO, UPLOAD_DIR } = require('./services');
const { userFromToken } = require('./middleware/auth');
const payments = require('./routes/payments');
const translate = require('./routes/translate');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const corsOpts = { origin: (origin, cb) => cb(null, !origin || !config.corsOrigins.length || config.corsOrigins.includes(origin)), credentials: false };
app.use(cors(corsOpts));
if (!config.isProd) app.use(morgan('dev'));

// Razorpay webhooks need the raw body for signature checks, so this route comes before express.json().
app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => payments.webhook(req, res).catch(next));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1, paymentsMode: config.paymentsMock ? 'mock' : 'razorpay', otpProvider: config.otp.provider, translate: translate.enabled }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api', require('./routes/vendors'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', payments.router);
app.use('/api/planner', require('./routes/planner'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/translate', translate.router);
app.use('/api', require('./routes/social'));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// Static files: uploaded images, bundled demo images, and the web app.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use('/img', express.static(path.join(__dirname, '..', 'public', 'img'), { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, '..', '..', 'web')));

// Errors -> JSON
app.use((err, _req, res, _next) => {
  if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Invalid data' });
  if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
  if (err.code === 11000) return res.status(409).json({ error: 'That already exists.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too large (max 8 MB).' });
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && config.isProd ? 'Something went wrong. Please try again.' : err.message, code: err.code });
});

// Realtime: each user joins their own room; admins also join "admins".
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOpts.origin } });
io.use(async (socket, next) => {
  try { socket.user = await userFromToken(socket.handshake.auth?.token); next(); } catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => {
  socket.join(`user:${socket.user._id}`);
  if (socket.user.role === 'admin') socket.join('admins');
});
setIO(io);

if (require.main === module) {
  connect().then(async () => {
    // First deploy convenience: fill an empty database with demo data when AUTO_SEED=true.
    if (process.env.AUTO_SEED === 'true' && !(await require('./models').User.exists({}))) {
      console.log('[eventique] empty database, seeding demo data…');
      require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'seed.js'), '--force'], { stdio: 'inherit', env: process.env });
    }
  }).then(() => server.listen(config.port, () => {
    console.log(`[eventique] API + web on http://localhost:${config.port}  (payments: ${config.paymentsMock ? 'mock' : 'razorpay'}, otp: ${config.otp.provider})`);
  })).catch((e) => { console.error('[eventique] could not start:', e.message); process.exit(1); });
}

module.exports = { app, server };
