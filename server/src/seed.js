/* Fills the database with the same demo data the prototype used. Run: npm run seed  (this WIPES existing data). */
const config = require('./config');
const { connect, mongoose } = require('./db');
const M = require('./models');
const { priceBooking, payoutFor, makeCode } = require('./lib/core');

const IMG = (n) => `${config.storage.publicUrl}/img/${n}.webp`;
const CAT_IMG = { Venue: 'venue', Catering: 'catering', Decor: 'decor', Photography: 'photography', Makeup: 'makeup', Mehendi: 'mehendi', 'DJ & Music': 'dj', Pandit: 'pandit', Cake: 'cake', Entertainment: 'entertainment' };
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function run() {
  await connect();
  if (config.isProd && !process.argv.includes('--force')) throw new Error('Refusing to wipe a production database. Use --force if you really mean it.');
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));

  await M.Category.insertMany(Object.keys(CAT_IMG).map((name, order) => ({ name, order, icon: CAT_IMG[name] })));
  await M.EventType.insertMany([
    ['wedding', 'Wedding', 'Ceremony, baraat, pheras', 'wedding', ['Venue', 'Catering', 'Decor', 'Photography', 'Makeup', 'Mehendi', 'DJ & Music', 'Pandit']],
    ['engagement', 'Engagement', 'Roka and ring ceremony', 'rings', ['Venue', 'Catering', 'Decor', 'Photography', 'Makeup', 'DJ & Music']],
    ['haldi', 'Haldi & Mehendi', 'Colours, songs, mehendi', 'haldi', ['Decor', 'Mehendi', 'Catering', 'Photography', 'DJ & Music']],
    ['birthday', 'Birthday', 'Kids to milestone birthdays', 'balloons', ['Venue', 'Cake', 'Decor', 'Catering', 'Entertainment', 'Photography']],
    ['anniversary', 'Anniversary', 'Silver, golden jubilee', 'anniversary', ['Venue', 'Catering', 'Decor', 'Cake', 'Photography', 'DJ & Music']],
    ['corporate', 'Corporate', 'Offsites, launches, galas', 'corporate', ['Venue', 'Catering', 'Decor', 'Photography', 'DJ & Music', 'Entertainment']],
    ['babyshower', 'Baby Shower', 'Godh bharai and blessings', 'baby', ['Decor', 'Catering', 'Cake', 'Photography']],
    ['puja', 'Puja & Griha Pravesh', 'Havan, katha and housewarming', 'griha', ['Pandit', 'Catering', 'Decor']],
  ].map(([key, name, sub, img, categories], order) => ({ key, name, sub, image: IMG(img), categories, order })));

  const [priya, kavya] = await M.User.create([
    { phone: '9876543210', role: 'customer', name: 'Priya Sharma', city: 'Lucknow', email: 'priya@example.com', eventDate: daysFromNow(48), partner: 'Arjun' },
    { phone: '9000000001', role: 'admin', name: 'Kavya Admin', city: 'Lucknow' },
  ]);
  const extraCustomers = await M.User.create([
    { phone: '9839011223', role: 'customer', name: 'Rohit Verma', city: 'Kanpur' },
    { phone: '9721044556', role: 'customer', name: 'Neha Gupta', city: 'Prayagraj' },
    { phone: '9935066110', role: 'customer', name: 'Vikas Tiwari', city: 'Fatehpur', status: 'Blocked' },
    { phone: '9415022334', role: 'customer', name: 'Aman Singh', city: 'Kanpur' },
  ]);

  const V = [
    ['Lumière Studios', 'Photography', 'Lucknow', '/ day', [['Basic', 45000, '1 photographer, 1 day, 300 edited photos'], ['Premium', 90000, 'Candid + traditional, cinematic film, 600 photos'], ['Royal', 135000, '2 days, drone, same-day edit, premium album']], 9, 'Candid and cinematic wedding photography. Drone coverage, same-day edits and premium albums.', '9123456780'],
    ['Shahi Rasoi Caterers', 'Catering', 'Kanpur', '/ plate', [['Veg Classic', 850, '2 starters, 4 mains, 2 desserts'], ['Veg Deluxe', 1105, 'Live counters, chaat, 6 mains'], ['Non-Veg Royal', 1445, 'Awadhi kebabs, biryani, 8 mains']], 15, 'Awadhi and North Indian menus with live counters. Separate veg and non-veg kitchens.'],
    ['Gulmohar Decor', 'Decor', 'Lucknow', '/ event', [['Basic', 120000, 'Stage and entrance decor'], ['Premium', 192000, 'Fresh-flower mandap, stage, entrance'], ['Royal', 288000, 'Full venue theme decor']], 11, 'Fresh-flower mandaps, stage design and theme decor for weddings and functions.'],
    ['Mehendi by Ruksar', 'Mehendi', 'Prayagraj', '/ bride', [['Bridal', 8000, 'Full bridal design, hands and feet'], ['Bridal + Family', 12800, 'Bride plus 10 family members'], ['Full Event', 19200, 'Team of 6 for all guests']], 8, 'Bridal and Arabic mehendi with organic henna. Team of 6 artists for guests.'],
    ['Glow by Ananya', 'Makeup', 'Lucknow', '/ bride', [['HD Bridal', 25000, 'HD makeup, hair and draping'], ['Airbrush Bridal', 40000, 'Airbrush makeup with trial'], ['Bride + Family', 60000, 'Bride plus 4 family members']], 6, 'HD and airbrush bridal makeup, hairstyling and draping. Trial session included.'],
    ['Beat Baraat DJs', 'DJ & Music', 'Kanpur', '/ night', [['Basic', 30000, 'DJ, sound and lights'], ['Premium', 48000, 'Plus LED dance floor'], ['Royal', 72000, 'Plus dhol and live percussion']], 7, 'DJ, sound and lights for sangeet and baraat. Dhol and LED floor on request.'],
    ['Rajmahal Lawns', 'Venue', 'Lucknow', '/ day', [['Lawn', 250000, 'Lawn for 1,200 guests'], ['Lawn + Hall', 400000, 'Lawn plus banquet hall'], ['Full Property', 600000, 'Lawn, hall and 24 rooms']], 20, 'Lawn for 1,200 guests with banquet hall, 24 rooms and parking for 300 cars.'],
    ['Pt. Ramesh Shastri', 'Pandit', 'Varanasi', '/ ceremony', [['Vivah', 11000, 'Full wedding rituals'], ['Griha Pravesh', 7100, 'Havan and puja'], ['Katha', 5100, 'Satyanarayan katha']], 25, 'Vivah, griha pravesh, satyanarayan katha. Samagri arranged on request.'],
    ['Sugar Bloom Cakes', 'Cake', 'Lucknow', '/ kg', [['Classic', 2500, 'Standard designs'], ['Theme', 4000, 'Custom theme cakes'], ['Dessert Table', 15000, 'Cake plus dessert table']], 5, 'Custom theme cakes, eggless options and dessert tables.'],
    ['Jadoo Junction', 'Entertainment', 'Kanpur', '/ show', [['Magic Show', 15000, '45-minute magic show'], ['Puppet + Magic', 24000, 'Two acts'], ['Full Party', 36000, 'Anchor, games, magic']], 6, 'Magic shows, puppet shows and anchors for birthdays and corporate events.'],
    ['Awadh Palace Banquet', 'Venue', 'Kanpur', '/ day', [['Hall', 180000, 'AC banquet for 500'], ['Hall + Catering', 450000, 'With in-house catering'], ['Premium', 600000, 'Hall, catering and decor']], 14, 'AC banquet for 500 guests with in-house catering option.'],
    ['Petal & Prism', 'Decor', 'Kanpur', '/ event', [['Basic', 65000, 'Balloon and floral decor'], ['Premium', 104000, 'Theme decor'], ['Royal', 156000, 'Neon and floral installations']], 4, 'Balloon, floral and neon decor for birthdays, baby showers and haldi.'],
  ];
  const ratings = [4.8, 4.7, 4.9, 4.9, 4.6, 4.5, 4.7, 4.9, 4.6, 4.4, 4.5, 4.6];
  const reviewsN = [212, 340, 158, 96, 121, 77, 189, 64, 142, 51, 133, 88];
  const vendors = [];
  for (const [i, [name, category, city, unit, pkgs, years, about, phone]] of V.entries()) {
    const owner = await M.User.create({ phone: phone || `9${String(800000000 + i * 1234567).slice(0, 9)}`, role: 'vendor', name: i === 0 ? 'Lumière Studios' : name, city });
    vendors.push(await M.Vendor.create({
      owner: owner._id, name, category, city, unit, years, about, status: 'Approved', rating: ratings[i], reviewsCount: reviewsN[i],
      packages: pkgs.map(([n, price, description]) => ({ name: n, price, description })), basePrice: pkgs[0][1],
      cover: IMG(CAT_IMG[category]), portfolio: [{ url: IMG(CAT_IMG[category]), label: 'Highlights' }],
      instagram: i === 0 ? '@lumiere.studios' : '', gst: i === 0 ? '09ABCDE1234F1Z5' : '', views: 600 + i * 97,
      replyMinutes: 30 + (i % 3) * 30, blockedDates: i === 0 ? [daysFromNow(35), daysFromNow(36)] : [],
      bank: { holder: name, last4: String(4421 + i).slice(-4), ifsc: 'HDFC0001234' },
    }));
  }
  for (const [name, category, city, docs] of [['Phoolwari Florists', 'Decor', 'Kanpur', ['GST certificate', 'Aadhaar']], ['Dhol Junction', 'DJ & Music', 'Fatehpur', ['Aadhaar']], ['Kesar Kitchen', 'Catering', 'Lucknow', ['FSSAI licence', 'GST certificate']]]) {
    const o = await M.User.create({ phone: `97${Math.floor(10000000 + Math.random() * 89999999)}`, role: 'vendor', name, city });
    await M.Vendor.create({ owner: o._id, name, category, city, status: 'Pending', documents: docs.map((d) => ({ name: d, url: '' })), packages: [{ name: 'Basic', price: 20000 }], basePrice: 20000 });
  }

  const s = config.platform;
  const mk = async (customer, vendor, pkgIdx, date, guests, status, eventType, paidAll) => {
    const pkg = vendor.packages[pkgIdx];
    const p = priceBooking({ unit: vendor.unit, packagePrice: pkg.price, guests, gstPercent: s.gst, advancePercent: s.advance });
    const paid = paidAll ? p.amount : p.advance;
    const b = await M.Booking.create({ code: makeCode('EVQ'), customer: customer._id, vendor: vendor._id, eventType, date, guests, packageName: pkg.name, ...p, paid, status, reviewed: status === 'Completed' && paidAll, history: [{ status }] });
    await M.Payment.create({ code: makeCode('PAY'), type: 'Advance', booking: b._id, user: customer._id, vendor: vendor._id, amount: p.advance, status: 'Received', orderId: 'order_seed_' + b.code, paymentId: 'pay_mock_seed' });
    if (status === 'Completed') await M.Payment.create({ code: makeCode('PO'), type: 'Payout', booking: b._id, vendor: vendor._id, amount: payoutFor(paid, s.commission), status: paidAll ? 'Paid' : 'Pending' });
    return b;
  };
  const [rohit, neha, , aman] = extraCustomers;
  await mk(priya, vendors[0], 1, daysFromNow(48), 450, 'Confirmed', 'Wedding');
  await mk(priya, vendors[2], 0, daysFromNow(47), 450, 'Pending', 'Wedding');
  const cakeB = await mk(priya, vendors[8], 0, daysFromNow(-21), 60, 'Completed', 'Engagement', true);
  await mk(rohit, vendors[0], 0, daysFromNow(62), 300, 'Pending', 'Engagement');
  await mk(neha, vendors[0], 2, daysFromNow(99), 600, 'Pending', 'Wedding');
  await mk(aman, vendors[1], 1, daysFromNow(13), 250, 'Confirmed', 'Anniversary');
  await mk(aman, vendors[0], 0, daysFromNow(-7), 200, 'Completed', 'Birthday');
  await M.Booking.updateOne({ _id: cakeB._id }, { reviewed: false });

  await M.Review.insertMany([
    { vendor: vendors[0]._id, authorName: 'Sneha Kapoor', rating: 5, text: 'Every photo came out so natural. The team was on time and very polite.', reply: 'Thank you Sneha! Shooting your wedding was a joy.' },
    { vendor: vendors[0]._id, authorName: 'Arjun Mehta', rating: 4, text: 'Great candid shots. The album was delivered 2 weeks late.' },
    { vendor: vendors[0]._id, authorName: 'Fatima Khan', rating: 5, text: 'Drone shots of the baraat were amazing. Highly recommend.' },
    { vendor: vendors[9]._id, authorName: 'Anonymous', rating: 1, text: 'Fake vendor!! Never book!!', flagged: true },
    { vendor: vendors[6]._id, authorName: 'Kunal P.', rating: 2, text: 'Parking was full, guests had trouble.', flagged: true },
  ]);

  const t1 = await M.Thread.create({ customer: rohit._id, vendor: vendors[0]._id, lastMessage: 'Can drone coverage be added to the Basic package?', lastAt: new Date(), unreadVendor: 2 });
  await M.Message.insertMany([{ thread: t1._id, from: 'customer', text: 'Hi, are you available for an engagement on 12 Dec?' }, { thread: t1._id, from: 'customer', text: 'Can drone coverage be added to the Basic package?' }]);
  const t2 = await M.Thread.create({ customer: priya._id, vendor: vendors[0]._id, lastMessage: 'Perfect, thank you!', lastAt: new Date(Date.now() - 864e5) });
  await M.Message.insertMany([{ thread: t2._id, from: 'vendor', text: 'I have sent the shoot schedule. Haldi starts at 10 am.' }, { thread: t2._id, from: 'customer', text: 'Perfect, thank you!' }]);

  await M.Complaint.insertMany([
    { from: extraCustomers[2]._id, fromName: 'Vikas Tiwari', vendor: vendors[5]._id, vendorName: 'Beat Baraat DJs', text: 'The DJ arrived 2 hours late and the sound system was faulty.' },
    { fromName: 'Ritu Saxena', vendor: vendors[10]._id, vendorName: 'Awadh Palace Banquet', text: 'Advance refund has been pending for 10 days.' },
    { fromName: 'Manish Jain', vendor: vendors[8]._id, vendorName: 'Sugar Bloom Cakes', text: 'The cake design did not match the order.', status: 'Resolved' },
  ]);

  await M.Guest.insertMany([['Sunita Sharma', 'Aunt (Mausi)', 'Bride', 3, 'Attending'], ['Rakesh Verma', 'Uncle (Chacha)', 'Groom', 4, 'Attending'], ['Anjali Gupta', 'College friend', 'Bride', 1, 'Awaiting'], ['Vivek Singh', 'Office', 'Groom', 2, 'Declined'], ['Meera Joshi', 'Neighbour', 'Bride', 2, 'Not invited'], ['Farhan Ali', 'Best friend', 'Groom', 1, 'Attending']]
    .map(([name, relation, side, people, rsvp]) => ({ user: priya._id, name, relation, side, people, rsvp })));
  await M.Expense.create({ user: priya._id, category: 'Other', amount: 18000, note: 'Wedding card printing' });

  await M.Notification.insertMany([
    { user: priya._id, icon: 'check', title: 'Lumière Studios confirmed your booking', body: 'Wedding · Premium package' },
    { user: priya._id, icon: 'tag', title: 'Diwali offer: up to 15% off on decor', body: 'Gulmohar Decor · valid until 31 Oct' },
    { user: vendors[0].owner, icon: 'inbox', title: 'New booking request: Neha Gupta', body: 'Wedding · Royal' },
    { user: kavya._id, icon: 'shield', title: '3 vendors are waiting for verification', body: 'Oldest request: 2 days' },
  ]);
  await M.Broadcast.create({ title: 'Diwali special: up to 15% off on vendors', message: 'Special offers on selected vendors until 31 Oct.', audience: 'Customers', sentBy: kavya._id, recipients: 5 });
  await M.Setting.create({ key: 'platform', ...config.platform });

  console.log('[seed] done. Demo logins (OTP %s): customer 9876543210 · vendor 9123456780 · admin 9000000001', config.otp.demoOtp);
  await mongoose.disconnect();
}

run().catch(async (e) => { console.error('[seed] failed:', e.message); await mongoose.disconnect(); process.exit(1); });
