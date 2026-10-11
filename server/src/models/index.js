const { mongoose } = require('../db');
const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const opts = { timestamps: true, toJSON: { virtuals: true, versionKey: false, transform: (_d, r) => { r.id = String(r._id); delete r._id; return r; } } };

/* ---------- Users & auth ---------- */
const UserSchema = new Schema({
  phone: { type: String, required: true, unique: true, match: /^[6-9]\d{9}$/ },
  role: { type: String, enum: ['customer', 'vendor', 'admin'], required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, trim: true, lowercase: true, maxlength: 120 },
  city: { type: String, default: 'Lucknow' },
  dob: String,
  gender: String,
  address: { type: String, maxlength: 300 },
  photo: String,
  eventDate: String,
  partner: String,
  status: { type: String, enum: ['Active', 'Blocked'], default: 'Active', index: true },
  favs: [{ type: ObjectId, ref: 'Vendor' }],
  budget: { type: Number, default: 900000 },
  prefs: { lang: { type: String, default: 'en' }, theme: String, sms: { type: Boolean, default: true }, whatsapp: { type: Boolean, default: true }, email: { type: Boolean, default: false } },
}, opts);

const OtpSchema = new Schema({
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  purpose: { type: String, enum: ['login', 'change-phone'], default: 'login' },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  usedAt: Date,
}, { timestamps: true });
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

/* ---------- Catalogue ---------- */
const CategorySchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  icon: { type: String, default: 'sparkle' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, opts);

const EventTypeSchema = new Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  sub: String,
  image: String,
  categories: [String],
  order: { type: Number, default: 0 },
}, opts);

const PackageSchema = new Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
}, { _id: true });

const VendorSchema = new Schema({
  owner: { type: ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, index: true },
  city: { type: String, required: true, index: true },
  about: { type: String, default: '' },
  years: { type: Number, default: 0 },
  instagram: String,
  gst: String,
  unit: { type: String, default: '/ event' },
  basePrice: { type: Number, default: 0 },
  packages: [PackageSchema],
  portfolio: [{ url: String, label: String }],
  cover: String,
  blockedDates: [String],
  documents: [{ name: String, url: String }],
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Suspended'], default: 'Pending', index: true },
  rating: { type: Number, default: 0 },
  reviewsCount: { type: Number, default: 0 },
  replyMinutes: { type: Number, default: 60 },
  views: { type: Number, default: 0 },
  bank: { holder: String, last4: String, ifsc: String },
}, opts);
VendorSchema.index({ name: 'text', category: 'text', city: 'text' });

/* ---------- Bookings & money ---------- */
const BookingSchema = new Schema({
  code: { type: String, required: true, unique: true },
  customer: { type: ObjectId, ref: 'User', required: true, index: true },
  vendor: { type: ObjectId, ref: 'Vendor', required: true, index: true },
  eventType: { type: String, default: 'Wedding' },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  slot: { type: String, default: 'Evening' },
  guests: { type: Number, default: 100, min: 1 },
  address: String,
  note: String,
  packageName: String,
  base: Number,
  gst: Number,
  amount: { type: Number, required: true },
  advance: { type: Number, required: true },
  paid: { type: Number, default: 0 },
  status: { type: String, enum: ['AwaitingPayment', 'Pending', 'Confirmed', 'Completed', 'Declined', 'Cancelled'], default: 'AwaitingPayment', index: true },
  reviewed: { type: Boolean, default: false },
  history: [{ status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' } }],
}, opts);

const PaymentSchema = new Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ['Advance', 'Balance', 'Refund', 'Payout'], required: true, index: true },
  booking: { type: ObjectId, ref: 'Booking', index: true },
  user: { type: ObjectId, ref: 'User' },
  vendor: { type: ObjectId, ref: 'Vendor' },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['Created', 'Received', 'Pending', 'Paid', 'Refunded', 'Failed'], default: 'Created', index: true },
  gateway: { type: String, default: 'razorpay' },
  orderId: { type: String, index: true },
  paymentId: String,
  meta: Schema.Types.Mixed,
}, opts);

/* ---------- Social ---------- */
const ReviewSchema = new Schema({
  vendor: { type: ObjectId, ref: 'Vendor', required: true, index: true },
  booking: { type: ObjectId, ref: 'Booking', unique: true, sparse: true },
  author: { type: ObjectId, ref: 'User' },
  authorName: String,
  rating: { type: Number, min: 1, max: 5, required: true },
  text: { type: String, maxlength: 2000 },
  reply: String,
  hidden: { type: Boolean, default: false },
  flagged: { type: Boolean, default: false },
}, opts);

const ThreadSchema = new Schema({
  customer: { type: ObjectId, ref: 'User', required: true },
  vendor: { type: ObjectId, ref: 'Vendor', required: true },
  lastMessage: String,
  lastAt: Date,
  unreadCustomer: { type: Number, default: 0 },
  unreadVendor: { type: Number, default: 0 },
}, opts);
ThreadSchema.index({ customer: 1, vendor: 1 }, { unique: true });

const MessageSchema = new Schema({
  thread: { type: ObjectId, ref: 'Thread', required: true, index: true },
  from: { type: String, enum: ['customer', 'vendor'], required: true },
  sender: { type: ObjectId, ref: 'User' },
  text: { type: String, required: true, maxlength: 2000 },
}, opts);

const NotificationSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  icon: { type: String, default: 'bell' },
  title: { type: String, required: true },
  body: String,
  link: String,
  read: { type: Boolean, default: false, index: true },
}, opts);

const ComplaintSchema = new Schema({
  from: { type: ObjectId, ref: 'User' },
  fromName: String,
  vendor: { type: ObjectId, ref: 'Vendor' },
  vendorName: String,
  booking: { type: ObjectId, ref: 'Booking' },
  text: { type: String, required: true },
  status: { type: String, enum: ['Open', 'Resolved'], default: 'Open', index: true },
}, opts);

const BroadcastSchema = new Schema({
  title: { type: String, required: true },
  message: String,
  audience: { type: String, enum: ['Everyone', 'Customers', 'Vendors'], default: 'Everyone' },
  sentBy: { type: ObjectId, ref: 'User' },
  recipients: Number,
}, opts);

/* ---------- Planner ---------- */
const TaskSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  group: { type: String, default: 'My tasks' },
  category: String,
  done: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, opts);

const ExpenseSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  category: { type: String, default: 'Other' },
  amount: { type: Number, required: true, min: 0 },
  note: String,
}, opts);

const GuestSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  relation: String,
  side: { type: String, enum: ['Bride', 'Groom', 'Host'], default: 'Bride' },
  people: { type: Number, default: 1, min: 1 },
  phone: String,
  rsvp: { type: String, enum: ['Not invited', 'Awaiting', 'Attending', 'Declined'], default: 'Not invited' },
}, opts);

const CardSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  event: String,
  template: String,
  design: Schema.Types.Mixed,
  imageUrl: String,
}, opts);

const SettingSchema = new Schema({
  key: { type: String, unique: true, default: 'platform' },
  commission: Number, gst: Number, advance: Number, freeCancelHours: Number,
  maintenance: { type: Boolean, default: false },
}, opts);

module.exports = {
  User: model('User', UserSchema),
  Otp: model('Otp', OtpSchema),
  Category: model('Category', CategorySchema),
  EventType: model('EventType', EventTypeSchema),
  Vendor: model('Vendor', VendorSchema),
  Booking: model('Booking', BookingSchema),
  Payment: model('Payment', PaymentSchema),
  Review: model('Review', ReviewSchema),
  Thread: model('Thread', ThreadSchema),
  Message: model('Message', MessageSchema),
  Notification: model('Notification', NotificationSchema),
  Complaint: model('Complaint', ComplaintSchema),
  Broadcast: model('Broadcast', BroadcastSchema),
  Task: model('Task', TaskSchema),
  Expense: model('Expense', ExpenseSchema),
  Guest: model('Guest', GuestSchema),
  Card: model('Card', CardSchema),
  Setting: model('Setting', SettingSchema),
};
