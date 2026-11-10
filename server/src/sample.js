/* Sample vendors for demos. They are made-up businesses, every name ends in "(Sample)", and they use the app's own images.
   SAMPLE_VENDORS=<any new word> adds them once (replacing older samples); SAMPLE_VENDORS=off removes them. */
const config = require('./config');
const M = require('./models');

const IMG = (n) => `${config.storage.publicUrl}/img/${n}.webp`;
const CAT_IMG = { Venue: 'venue', Catering: 'catering', Decor: 'decor', Photography: 'photography', Makeup: 'makeup', Mehendi: 'mehendi', 'DJ & Music': 'dj', Pandit: 'pandit', Cake: 'cake', Entertainment: 'entertainment' };
const CITY = 'Prayagraj';
const LIST = [
  ['Ganga Vatika Lawns', 'Venue', '/ day', [['Lawn', 180000, 'Open lawn for up to 800 guests'], ['Lawn + Hall', 290000, 'Lawn plus AC hall for 300'], ['Full Property', 420000, 'Lawn, hall, 12 rooms and parking']], 12, 'Open lawn and AC banquet hall near Civil Lines, with rooms for the family and parking for 150 cars.'],
  ['Annapurna Rasoi Caterers', 'Catering', '/ plate', [['Veg Classic', 650, '2 starters, 4 mains, 2 desserts'], ['Veg Deluxe', 900, 'Chaat counter, 6 mains, 3 desserts'], ['Royal Thali', 1250, 'Live counters, 8 mains, kulfi bar']], 10, 'Pure vegetarian North Indian and Awadhi menus with live chaat and jalebi counters.'],
  ['Sangam Frames Studio', 'Photography', '/ day', [['Basic', 35000, '1 photographer, 300 edited photos'], ['Premium', 70000, 'Candid + traditional, short film'], ['Royal', 110000, '2 days, drone, premium album']], 7, 'Candid and traditional wedding photography with drone shots and cinematic films.'],
  ['Kesariya Decor House', 'Decor', '/ event', [['Basic', 60000, 'Stage and entrance decor'], ['Premium', 120000, 'Fresh-flower mandap and stage'], ['Royal', 210000, 'Full venue theme decor']], 9, 'Fresh-flower mandaps, stage design and haldi-mehendi theme decor.'],
  ['Shringaar Studio by Meera', 'Makeup', '/ bride', [['HD Bridal', 18000, 'HD makeup, hair and draping'], ['Airbrush Bridal', 30000, 'Airbrush makeup with trial'], ['Bride + Family', 45000, 'Bride plus 4 family members']], 6, 'HD and airbrush bridal makeup, hairstyling and saree draping. Trial session included.'],
  ['Heena Kala Mehendi', 'Mehendi', '/ bride', [['Bridal', 6000, 'Full bridal design, hands and feet'], ['Bridal + Family', 10000, 'Bride plus 10 family members'], ['Full Event', 16000, 'Team of 5 for all guests']], 8, 'Bridal, Arabic and Rajasthani mehendi with organic henna.'],
  ['Baraat Beats DJ', 'DJ & Music', '/ night', [['Basic', 22000, 'DJ, sound and lights'], ['Premium', 38000, 'Plus LED dance floor'], ['Royal', 55000, 'Plus dhol and live percussion']], 5, 'DJ, sound and lights for sangeet and baraat, with dhol on request.'],
  ['Pt. Shivkumar Mishra', 'Pandit', '/ ceremony', [['Vivah', 9100, 'Full wedding rituals'], ['Griha Pravesh', 5100, 'Havan and puja'], ['Katha', 3100, 'Satyanarayan katha']], 20, 'Vivah, griha pravesh, mundan and satyanarayan katha. Samagri arranged on request.'],
  ['Meetha Moment Cakes', 'Cake', '/ kg', [['Classic', 1800, 'Standard designs'], ['Theme', 3200, 'Custom theme cakes'], ['Dessert Table', 12000, 'Cake plus dessert table']], 4, 'Custom theme cakes, eggless options and dessert tables for birthdays and weddings.'],
  ['Khushiyan Entertainers', 'Entertainment', '/ show', [['Magic Show', 12000, '45-minute magic show'], ['Puppet + Magic', 19000, 'Two acts'], ['Full Party', 28000, 'Anchor, games and magic']], 6, 'Magic shows, puppet shows and anchors for birthdays and family functions.'],
];
const RATING = [4.6, 4.5, 4.7, 4.6, 4.8, 4.7, 4.4, 4.9, 4.5, 4.3];

async function removeSamples() {
  const vs = await M.Vendor.find({ sample: true }, '_id owner').lean();
  if (!vs.length) return 0;
  const vIds = vs.map((v) => v._id); const owners = vs.map((v) => v.owner);
  const bookings = await M.Booking.find({ vendor: { $in: vIds } }, '_id').lean();
  await Promise.all([
    M.Payment.deleteMany({ $or: [{ vendor: { $in: vIds } }, { booking: { $in: bookings.map((b) => b._id) } }] }),
    M.Review.deleteMany({ vendor: { $in: vIds } }),
    M.Booking.deleteMany({ vendor: { $in: vIds } }),
    M.Thread.deleteMany({ vendor: { $in: vIds } }),
    M.Notification.deleteMany({ user: { $in: owners } }),
  ]);
  await M.Vendor.deleteMany({ _id: { $in: vIds } });
  await M.User.deleteMany({ _id: { $in: owners } });
  return vs.length;
}

async function addSamples() {
  await removeSamples();
  for (const [i, [name, category, unit, pkgs, years, about]] of LIST.entries()) {
    const owner = await M.User.create({ phone: `90000010${String(i).padStart(2, '0')}`, role: 'vendor', name: `${name} (Sample)`, city: CITY });
    await M.Vendor.create({
      owner: owner._id, name: `${name} (Sample)`, category, city: CITY, unit, years, about: `${about} This is a sample listing for demonstration.`,
      status: 'Approved', sample: true, rating: RATING[i], reviewsCount: 0,
      packages: pkgs.map(([n, price, description]) => ({ name: n, price, description })), basePrice: pkgs[0][1],
      cover: IMG(CAT_IMG[category]), portfolio: [{ url: IMG(CAT_IMG[category]), label: 'Highlights' }], replyMinutes: 60,
    });
  }
  return LIST.length;
}

/** Called at startup. */
async function syncSamples(mongoose) {
  const want = (process.env.SAMPLE_VENDORS || '').trim();
  if (!want) return;
  const meta = mongoose.connection.db.collection('meta');
  const done = await meta.findOne({ _id: 'samples' });
  if (done && done.id === want) return;
  const n = want.toLowerCase() === 'off' ? -(await removeSamples()) : await addSamples();
  await meta.updateOne({ _id: 'samples' }, { $set: { id: want, at: new Date() } }, { upsert: true });
  console.log(n >= 0 ? `[eventique] added ${n} sample vendors in ${CITY}` : `[eventique] removed ${-n} sample vendors`);
}

module.exports = { syncSamples, addSamples, removeSamples };
