/* Customer wedding planner: checklist, budget/expenses and guest list. */
const router = require('express').Router();
const { Task, Expense, Guest, Booking } = require('../models');
const { HttpError, asyncH, str, int } = require('../lib/core');
const { auth, role } = require('../middleware/auth');

router.use(auth, role('customer'));

const DEFAULT_TASKS = [
  ['Fix the event date', '12+ months before', '', true], ['Set the total budget', '12+ months before', '', true],
  ['Book the venue', '9–12 months before', 'Venue'], ['Book the photographer', '6–9 months before', 'Photography'],
  ['Finalise the caterer', '6–9 months before', 'Catering'], ['Book the decorator', '4–6 months before', 'Decor'],
  ['Makeup artist trial', '3–4 months before', 'Makeup'], ['Book the mehendi artist', '3–4 months before', 'Mehendi'],
  ['Send e-invites', '2–3 months before', '_invite'], ['Confirm the muhurat with Pandit ji', '1–2 months before', 'Pandit'],
  ['DJ and sangeet playlist', '1–2 months before', 'DJ & Music'], ['Send final guest count to caterer', '2 weeks before', ''],
  ['Pay vendor balances', 'After the event', ''],
];
const SPLIT = { Venue: 28, Catering: 35, Decor: 12, Photography: 10, Makeup: 4, Mehendi: 2, 'DJ & Music': 4, Pandit: 2, Other: 3 };

router.get('/', asyncH(async (req, res) => {
  const uid = req.user._id;
  if (!(await Task.exists({ user: uid }))) await Task.insertMany(DEFAULT_TASKS.map(([title, group, category, done], order) => ({ user: uid, title, group, category, done: !!done, order })));
  const [tasks, expenses, guests, bookings] = await Promise.all([
    Task.find({ user: uid }).sort({ order: 1, createdAt: 1 }), Expense.find({ user: uid }).sort({ createdAt: -1 }),
    Guest.find({ user: uid }).sort({ createdAt: -1 }),
    Booking.find({ customer: uid, status: { $in: ['Pending', 'Confirmed', 'Completed'] } }).populate('vendor', 'category'),
  ]);
  const booked = [...new Set(bookings.map((b) => b.vendor?.category).filter(Boolean))];
  const invited = guests.some((g) => g.rsvp !== 'Not invited');
  const auto = (t) => t.done || (t.category === '_invite' ? invited : booked.includes(t.category));
  const spent = Object.fromEntries(Object.keys(SPLIT).map((k) => [k, 0]));
  bookings.forEach((b) => { const c = b.vendor?.category; spent[c in spent ? c : 'Other'] += b.amount; });
  expenses.forEach((e) => { spent[e.category in spent ? e.category : 'Other'] += e.amount; });
  res.json({
    tasks: tasks.map((t) => ({ ...t.toJSON(), done: auto(t), auto: !t.done && auto(t) })),
    budget: { total: req.user.budget, split: SPLIT, spent, used: Object.values(spent).reduce((a, b) => a + b, 0) },
    expenses, guests, bookedCategories: booked,
  });
}));

/* tasks */
router.post('/tasks', asyncH(async (req, res) => {
  const title = str(req.body.title, 120); if (!title) throw new HttpError(400, 'Write the task first.');
  res.status(201).json({ task: await Task.create({ user: req.user._id, title, group: str(req.body.group, 40) || 'My tasks', order: 999 }) });
}));
router.patch('/tasks/:id', asyncH(async (req, res) => {
  const t = await Task.findOne({ _id: req.params.id, user: req.user._id }); if (!t) throw new HttpError(404, 'Task not found.');
  if (req.body.done !== undefined) t.done = !!req.body.done; if (req.body.title) t.title = str(req.body.title, 120);
  await t.save(); res.json({ task: t });
}));
router.delete('/tasks/:id', asyncH(async (req, res) => { await Task.deleteOne({ _id: req.params.id, user: req.user._id }); res.json({ ok: true }); }));

/* expenses */
router.post('/expenses', asyncH(async (req, res) => {
  const amount = int(req.body.amount, { min: 1, max: 1e9, def: 0 }); const note = str(req.body.note, 120);
  if (!amount || !note) throw new HttpError(400, 'Enter both a description and an amount');
  res.status(201).json({ expense: await Expense.create({ user: req.user._id, amount, note, category: str(req.body.category, 30) || 'Other' }) });
}));
router.delete('/expenses/:id', asyncH(async (req, res) => { await Expense.deleteOne({ _id: req.params.id, user: req.user._id }); res.json({ ok: true }); }));

/* guests */
router.post('/guests', asyncH(async (req, res) => {
  const name = str(req.body.name, 80); if (!name) throw new HttpError(400, 'Enter the guest name');
  res.status(201).json({ guest: await Guest.create({ user: req.user._id, name, relation: str(req.body.relation, 60) || 'Guest', side: ['Bride', 'Groom', 'Host'].includes(req.body.side) ? req.body.side : 'Bride', people: int(req.body.people, { min: 1, max: 50, def: 1 }), phone: str(req.body.phone, 15) }) });
}));
router.patch('/guests/:id', asyncH(async (req, res) => {
  const g = await Guest.findOne({ _id: req.params.id, user: req.user._id }); if (!g) throw new HttpError(404, 'Guest not found.');
  for (const k of ['name', 'relation', 'side', 'rsvp', 'phone']) if (req.body[k] !== undefined) g[k] = req.body[k];
  if (req.body.people !== undefined) g.people = int(req.body.people, { min: 1, max: 50, def: g.people });
  await g.save(); res.json({ guest: g });
}));
router.delete('/guests/:id', asyncH(async (req, res) => { await Guest.deleteOne({ _id: req.params.id, user: req.user._id }); res.json({ ok: true }); }));
router.post('/guests/mark-invited', asyncH(async (req, res) => {
  const r = await Guest.updateMany({ user: req.user._id, rsvp: 'Not invited' }, { rsvp: 'Awaiting' });
  res.json({ updated: r.modifiedCount });
}));

module.exports = router;
