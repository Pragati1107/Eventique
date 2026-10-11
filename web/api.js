/* =====================================================================
   Eventique web: API layer.
   Loaded after the app script. If the page is served by the Eventique
   server (/api/health answers), every screen switches from demo data to
   the real backend: OTP login, vendors, bookings, Razorpay payments,
   chat, planner, notifications and the admin console.
   ===================================================================== */
(function () {
  const API = (window.EVQ_API_BASE || '') + '/api';
  let TOKEN = null; try { TOKEN = localStorage.getItem('evq-token'); } catch (e) {}
  let socket = null;
  const sidMap = { vendor: new Map(), task: new Map(), guest: new Map(), thread: new Map() };

  async function call(method, path, body, isForm) {
    const headers = {}; if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
    if (body && !isForm) headers['Content-Type'] = 'application/json';
    const r = await fetch(API + path, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401 && TOKEN) { setToken(null); toast('Your session has ended. Please log in again.'); S.screen = 'auth'; render(); }
    if (!r.ok) { const err = new Error(j.error || 'Something went wrong. Please try again.'); err.status = r.status; throw err; }
    return j;
  }
  const get = (p) => call('GET', p), post = (p, b) => call('POST', p, b || {}), patch = (p, b) => call('PATCH', p, b), put = (p, b) => call('PUT', p, b), del = (p) => call('DELETE', p);
  const fail = (e) => { toast(e.message || 'Something went wrong'); };
  function setToken(t) { TOKEN = t; try { t ? localStorage.setItem('evq-token', t) : localStorage.removeItem('evq-token'); } catch (e) {} }
  const tm = (d) => { const x = new Date(d); const diff = (Date.now() - x) / 1000; return diff < 60 ? 'just now' : diff < 3600 ? Math.round(diff / 60) + ' min' : diff < 86400 ? Math.round(diff / 3600) + ' hr' : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  const clock = (d) => { const x = new Date(d); return `${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const phoneFmt = (p) => (p ? p.slice(0, 5) + ' ' + p.slice(5) : '');
  const dataUrlToBlob = async (u) => (await fetch(u)).blob();

  /* ---------------- mapping server data -> prototype state ---------------- */
  const COLS = ['#6B2D5C', '#A0522D', '#B23A48', '#2F6B3A', '#9C4F7A', '#3B3F8F', '#8A6A1F', '#B45309', '#C2410C', '#4D7C0F', '#7C2D12', '#BE185D'];
  function localVendor(v) {
    const sid = String(v.id || v._id);
    if (sidMap.vendor.has(sid)) { const lv = vById(sidMap.vendor.get(sid)); if (lv) { Object.assign(lv, mapVendor(v, lv.id)); return lv; } }
    const id = VENDORS.length + 1; const lv = mapVendor(v, id); VENDORS.push(lv); sidMap.vendor.set(sid, id); return lv;
  }
  function mapVendor(v, id) {
    return { id, sid: String(v.id || v._id), name: v.name, cat: v.category, city: v.city, price: v.basePrice || (v.packages && v.packages[0] && v.packages[0].price) || 0, unit: v.unit || '/ event',
      rating: v.rating || 0, reviews: v.reviewsCount || 0, col: COLS[id % COLS.length], years: v.years || 0, about: v.about || '', cover: v.cover,
      pk: (v.packages || []).map((p) => ({ n: p.name, p: p.price, d: p.description || '', sid: String(p.id || p._id) })), unavailable: v.unavailable || [] };
  }
  function resetVendors(list, mine) {
    VENDORS.length = 0; sidMap.vendor.clear();
    if (mine) localVendor(mine);
    list.forEach(localVendor);
  }
  const mapBooking = (b) => ({ id: b.code, sid: String(b.id), vendor: localVendor(b.vendor).id, customer: b.customer ? b.customer.name : '', date: b.date, guests: b.guests,
    status: b.status === 'AwaitingPayment' ? 'Unpaid' : b.status, amount: b.amount, paid: b.paid, event: b.eventType, pkg: b.packageName, reviewed: b.reviewed });
  const mapNotif = (n) => ({ i: n.icon || 'bell', t: n.title, s: n.body || '', tm: tm(n.createdAt), read: n.read, sid: String(n.id) });

  /* ---------------- loading ---------------- */
  async function loadCatalog() {
    const c = await get('/catalog');
    CATS.length = 0; c.categories.forEach((x) => CATS.push({ name: x.name, icon: x.icon || 'sparkle', active: true, sid: String(x.id) }));
    S.settings.gst = c.settings.gst; S.settings.cancelHrs = c.settings.freeCancelHours; S.settings.advance = c.settings.advance;
  }
  async function loadNotifs() { const n = await get('/notifications'); S.notifs[S.role] = n.notifications.map(mapNotif); }
  async function loadBookings() { const b = await get('/bookings'); S.bookings = b.bookings.filter((x) => !(S.role !== 'customer' && x.status === 'AwaitingPayment')).map(mapBooking); }
  async function loadThreads() {
    const { threads } = await get('/threads'); sidMap.thread.clear();
    if (S.role === 'vendor') {
      S.threads = threads.map((t, i) => { sidMap.thread.set(i + 1, String(t.id)); return { id: i + 1, sid: String(t.id), name: t.customer.name, unread: t.unreadVendor, msgs: t.lastMessage ? [{ me: 0, t: t.lastMessage, tm: tm(t.lastAt) }] : [] }; });
    } else {
      S.cthreads = {}; threads.forEach((t) => { const lv = localVendor(t.vendor); S.cthreads[lv.id] = { sid: String(t.id), msgs: t.lastMessage ? [{ me: 1, t: t.lastMessage, tm: tm(t.lastAt) }] : [] }; });
    }
  }
  async function loadPlanner() {
    const p = await get('/planner'); sidMap.task.clear(); sidMap.guest.clear();
    S.tasks = p.tasks.map((t, i) => ({ id: i + 1, sid: String(t.id), t: t.title, g: t.group, cat: t.category || '', d: !!t.done && !t.auto }));
    S.guests = p.guests.map((g, i) => ({ id: i + 1, sid: String(g.id), n: g.name, rel: g.relation, side: g.side, ppl: g.people, r: g.rsvp }));
    S.expenses = p.expenses.map((e) => ({ sid: String(e.id), cat: e.category, amt: e.amount, note: e.note }));
    S.budget = p.budget.total; S.invite.sent = S.guests.some((g) => g.r !== 'Not invited');
  }
  async function loadVendorSide() {
    const [{ vendor }, { reviews }, stats, pay] = await Promise.all([get('/vendor/me'), get('/vendor/reviews'), get('/vendor/me/stats'), get('/payments')]);
    S.myVendor = vendor; S.views = stats.views; S.vstats = stats;
    S.vprofile = { name: vendor.name, cat: vendor.category, city: vendor.city, about: vendor.about, years: vendor.years, insta: vendor.instagram || '', gst: vendor.gst || '' };
    S.services = vendor.packages.map((p) => ({ name: p.name, price: p.price, desc: p.description, sid: String(p.id) }));
    S.portfolio = vendor.portfolio.map((p) => ({ l: p.label, src: p.url }));
    S.blocked = vendor.blockedDates.slice();
    S.vreviews = reviews.map((r) => ({ sid: String(r.id), name: r.authorName || 'Customer', rating: r.rating, text: r.text, date: r.createdAt.slice(0, 10), reply: r.reply || '' }));
    S.vpayments = pay.payments;
  }
  async function loadAdmin() {
    const [ov, users, pend, pay, comp, flg, cats, bc, st] = await Promise.all([get('/admin/overview'), get('/admin/users'), get('/admin/vendors?status=Pending'), get('/payments'), get('/admin/complaints'), get('/admin/reviews?flagged=1'), get('/admin/categories'), get('/admin/broadcasts'), get('/admin/settings')]);
    S.ov = ov;
    S.users = users.users.map((u) => ({ sid: String(u.id), name: u.name, phone: phoneFmt(u.phone), type: u.role[0].toUpperCase() + u.role.slice(1), city: u.city, status: u.status, joined: new Date(u.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) }));
    S.pendingVendors = pend.vendors.map((v) => ({ id: String(v.id), name: v.name, cat: v.category, city: v.city, docs: v.documents.map((d) => d.name), since: tm(v.createdAt) }));
    S.payments = pay.payments.map((p) => ({ id: p.code, sid: String(p.id), type: p.type, party: p.type === 'Payout' ? (p.vendor ? p.vendor.name : '') : `${p.user ? p.user.name : ''}${p.vendor ? ' → ' + p.vendor.name : ''}`, amount: p.amount, status: p.status, date: p.createdAt.slice(0, 10) }));
    S.complaints = comp.complaints.map((c) => ({ id: String(c.id), from: c.fromName, against: c.vendorName, text: c.text, status: c.status }));
    S.flagged = flg.reviews.map((r) => ({ id: String(r.id), name: r.authorName, vendor: r.vendor ? r.vendor.name : '', rating: r.rating, text: r.text, hidden: r.hidden }));
    CATS.length = 0; cats.categories.forEach((x) => CATS.push({ name: x.name, icon: x.icon || 'sparkle', active: x.active, sid: String(x.id) }));
    S.broadcasts = bc.broadcasts.map((b) => ({ t: b.title, m: b.message, a: b.audience, d: tm(b.createdAt) }));
    Object.assign(S.settings, { commission: st.settings.commission, gst: st.settings.gst, cancelHrs: st.settings.freeCancelHours, maintenance: st.settings.maintenance });
    S.afeed = ov.recent.map((b) => ({ i: 'list', t: `<b>${esc(b.customer ? b.customer.name : '')}</b> booked <b>${esc(b.vendor ? b.vendor.name : '')}</b>`, ts: new Date(b.createdAt).getTime() }));
  }
  async function loadAll() {
    S.live = true; S.loading = false;
    await loadCatalog();
    const [{ vendors }, me] = await Promise.all([get('/vendors?limit=50'), get('/me')]);
    applyUser(me.user);
    resetVendors(vendors, S.role === 'vendor' ? me.vendor : null);
    const jobs = [loadNotifs()];
    if (S.role === 'customer') jobs.push(loadBookings(), loadPlanner(), loadThreads(), get('/me/favs').then((f) => { S.favs = f.vendors.map((v) => localVendor(v).id); }));
    if (S.role === 'vendor') jobs.push(loadVendorSide(), loadBookings(), loadThreads());
    if (S.role === 'admin') jobs.push(loadAdmin(), loadBookings());
    await Promise.all(jobs);
    connectSocket();
  }
  function applyUser(u) {
    S.role = u.role;
    S.user = { name: u.name, phone: u.phone, email: u.email || '', city: u.city || 'Lucknow', dob: u.dob || '', gender: u.gender || '', address: u.address || '', photo: u.photo || '', eventDate: u.eventDate || '', partner: u.partner || '', sid: String(u.id) };
    if (u.city) S.city = u.city;
  }
  const refresh = async (...fns) => { try { await Promise.all(fns.map((f) => f())); render(true); } catch (e) { fail(e); } };

  /* ---------------- realtime ---------------- */
  function connectSocket() {
    if (!window.io || !TOKEN) return;
    if (socket) socket.disconnect();
    socket = window.io({ auth: { token: TOKEN } });
    socket.on('notification', (n) => { (S.notifs[S.role] = S.notifs[S.role] || []).unshift(mapNotif(n)); toast(n.title); if (S.screen === 'dash' && !document.querySelector('.sheet.show')) render(true); });
    socket.on('booking', () => refresh(loadBookings, ...(S.role === 'customer' ? [loadPlanner] : [])));
    socket.on('message', async (m) => {
      if (S.role === 'vendor') { await loadThreads(); const open = S.page === 'thread' && sidMap.thread.get(S.ctx.thread) === m.thread; if (open) await openThreadMsgs(S.ctx.thread); render(true); }
      else { const vid = Object.keys(S.cthreads).find((k) => S.cthreads[k].sid === m.thread); if (vid) { S.cthreads[vid].msgs.push({ me: 1, t: m.message.text, tm: clock(m.message.createdAt) }); S.typing = null; if (S.page === 'cchat') render(true); else toast(`New message from ${m.fromName}`); } }
    });
    socket.on('activity', (a) => { S.afeed.unshift({ i: a.icon || 'list', t: a.text, ts: Date.now() }); S.afeed = S.afeed.slice(0, 8); const f = document.getElementById('afeed'); if (f) f.innerHTML = S.afeed.map(feedItem).join(''); });
  }

  /* ---------------- payments ---------------- */
  function loadRazorpay() { return window.Razorpay ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load Razorpay. Check your internet connection.')); document.head.appendChild(s); }); }
  function pay(order, label) {
    return new Promise((resolve, reject) => {
      const amount = Math.round(order.amount / 100);
      if (order.mock) {
        openSheet(`<div class="stack"><div class="row between"><h3 style="font-size:20px">Test payment</h3><span class="pill warn">Test mode</span></div>
          <div class="muted" style="font-size:13.5px">Razorpay keys are not set on the server, so this is a simulated payment. No money moves.</div>
          <div class="card sumrow total"><span>${esc(label)}</span><span class="num">${rupee(amount)}</span></div>
          <button class="btn block" id="mockpay"><span>Pay ${rupee(amount)}</span></button><button class="btn block ghost" id="mockcancel"><span>Cancel</span></button></div>`);
        document.getElementById('mockcancel').onclick = () => { closeSheet(); reject(new Error('Payment cancelled')); };
        document.getElementById('mockpay').onclick = async () => { try { const sig = await post('/payments/mock-complete', { orderId: order.id }); const r = await post('/payments/verify', sig); closeSheet(); resolve(r); } catch (e) { reject(e); } };
        return;
      }
      loadRazorpay().then(() => {
        const rz = new window.Razorpay({ key: order.keyId, amount: order.amount, currency: 'INR', order_id: order.id, name: 'Eventique', description: label, prefill: { name: S.user.name, contact: '+91' + S.user.phone, email: S.user.email || undefined }, theme: { color: '#8B1E3F' },
          handler: async (resp) => { try { resolve(await post('/payments/verify', { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })); } catch (e) { reject(e); } },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) } });
        rz.on('payment.failed', (r) => reject(new Error(r.error && r.error.description ? r.error.description : 'Payment failed')));
        rz.open();
      }).catch(reject);
    });
  }

  /* ---------------- overrides ---------------- */
  function install() {
    window.pkgsFor = (v) => (v.id === 1 && S.role === 'vendor' ? S.services.map((s) => ({ n: s.name, p: s.price, d: s.desc, sid: s.sid })) : (v.pk && v.pk.length ? v.pk : [{ n: 'Standard', p: v.price, d: '' }]));
    window.gmv = () => (S.ov ? S.ov.gmv : 0);

    /* auth */
    window.sendOtp = async function (fill) {
      const err = document.getElementById('err');
      try {
        const r = await post('/auth/otp', { phone: S.phone, role: S.role, mode: S.mode, name: S.name, inviteCode: S.invite });
        S.otp = r.devCode || ''; S.otpSent = true; render();
        const sms = document.getElementById('sms');
        sms.innerHTML = r.devCode ? `${ic('inbox')}<div><b>Eventique</b> · Your OTP is <b>${r.devCode}</b>. (development mode)</div>` : `${ic('inbox')}<div>OTP sent to +91 ${S.phone}</div>`;
        setTimeout(() => sms.classList.add('show'), 60); setTimeout(() => sms.classList.remove('show'), 6000);
        startResend();
        if (fill === true && r.devCode) r.devCode.split('').forEach((c, i) => { const el = document.getElementById('o' + i); if (el) el.value = c; });
      } catch (e) { if (err) err.textContent = e.message; else fail(e); }
    };
    window.verifyOtp = async function () {
      const v = [...document.querySelectorAll('#otp input')].map((x) => x.value).join(''); const err = document.getElementById('err');
      if (v.length < 6) { err.textContent = 'Enter all 6 digits of the OTP.'; return; }
      try {
        const r = await post('/auth/verify', { phone: S.phone, role: S.role, mode: S.mode, name: S.name, inviteCode: S.invite, code: v });
        setToken(r.token); clearInterval(resendTimer);
        await loadAll();
        S.screen = 'dash'; S.hist = []; S.ctx = {}; S.q = ''; S.fil = 'All'; S.page = { customer: 'events', vendor: 'vdash', admin: 'adash' }[S.role];
        render(); toast(r.created ? 'Account created. Welcome!' : 'Logged in');
      } catch (e) { err.textContent = e.message; document.querySelectorAll('#otp input').forEach((x) => (x.value = '')); const o = document.getElementById('o0'); if (o) o.focus(); }
    };
    window.logout = function () { setToken(null); if (socket) socket.disconnect(); S.live = false; S.screen = 'auth'; S.otpSent = false; S.phone = ''; S.user = null; S.page = ''; S.hist = []; closeSheet(); render(); };

    /* profile */
    window.saveEdit = async function () {
      const g = (id) => (document.getElementById(id)?.value || '').trim(); const errEl = document.getElementById('perr');
      const body = { name: g('ef_name'), email: g('ef_email'), dob: g('ef_dob'), gender: g('ef_gender'), city: g('ef_city'), address: g('ef_address'), photo: S.user.photo };
      if (S.role === 'customer') { body.eventDate = g('ef_event'); body.partner = g('ef_partner'); }
      const phone = g('ef_phone');
      try {
        if (S.user.photo && S.user.photo.startsWith('data:')) { const fd = new FormData(); fd.append('file', await dataUrlToBlob(S.user.photo), 'photo.jpg'); const r = await call('POST', '/me/photo', fd, true); body.photo = r.user.photo; }
        const r = await patch('/me', body); applyUser(r.user);
        if (phone !== r.user.phone) {
          const o = await post('/me/phone/otp', { phone });
          openSheet(`<div class="stack"><h3 style="font-size:20px">Verify new number</h3><div class="muted">We sent a 6-digit OTP to +91 ${phone}.${o.devCode ? ` (development code: <b>${o.devCode}</b>)` : ''}</div>
            <div class="input"><input id="pot" inputmode="numeric" maxlength="6" placeholder="Enter OTP" style="letter-spacing:.3em;font-size:18px;text-align:center"></div><div class="err" id="poterr"></div>
            <button class="btn block" id="potbtn"><span>Verify & save</span></button></div>`);
          document.getElementById('potbtn').onclick = async () => { try { const rr = await post('/me/phone/verify', { phone, code: document.getElementById('pot').value.trim() }); applyUser(rr.user); closeSheet(); toast('Profile updated'); back(); } catch (e) { document.getElementById('poterr').textContent = e.message; } };
          return;
        }
        toast('Profile updated'); back();
      } catch (e) { if (errEl) errEl.textContent = e.message; else fail(e); }
    };
    window.toggleFav = async function (id, ev) { if (ev) ev.stopPropagation(); const v = vById(id); try { const r = await post('/me/favs/' + v.sid); S.favs = r.saved ? [...S.favs, id] : S.favs.filter((x) => x !== id); toast(r.saved ? 'Vendor saved ♥' : 'Removed from saved'); render(true); } catch (e) { fail(e); } };

    /* vendor detail: load packages + availability */
    const _nav = window.nav;
    window.nav = function (p, ctx) {
      _nav(p, ctx);
      if (p === 'vendor' && ctx && ctx.vendor) { const v = vById(ctx.vendor); if (v && v.sid) get('/vendors/' + v.sid).then((r) => { localVendor({ ...r.vendor, unavailable: r.unavailable }); if (S.page === 'vendor') render(true); }).catch(() => {}); }
      if (p === 'cchat' && ctx && ctx.vendor) openCustomerChat(ctx.vendor);
    };

    /* booking + payment */
    window.confirmBook = async function () {
      const c = calc(); if (!S.ctx.date) { toast('Choose an event date'); return; }
      if ((c.v.unavailable || []).includes(S.ctx.date)) { toast(`${c.v.name} is not available on this date`); return; }
      const pk = pkgsFor(c.v)[S.ctx.pkg]; const evName = (EVENTS.find((e) => e.id === S.ctx.event) || { name: 'Event' }).name;
      try {
        const r = await post('/bookings', { vendorId: c.v.sid, packageId: pk.sid, date: S.ctx.date, slot: S.ctx.slot, guests: +S.ctx.guests, address: S.ctx.addr || '', eventType: evName });
        await pay(r.order, `Advance · ${c.v.name}`);
        await loadBookings(); await loadPlanner();
        S.hist = [{ page: 'events', ctx: {}, q: '', fil: 'All' }]; S.page = 'success'; S.ctx = { bid: r.booking.code }; render(); setTimeout(confetti, 150);
      } catch (e) { fail(e); await loadBookings().catch(() => {}); }
    };
    window.payBalance = async function (id) {
      const b = S.bookings.find((x) => x.id === id);
      try { const r = await post(`/bookings/${b.sid}/pay-balance`); await pay(r.order, `Balance · ${b.id}`); await loadBookings(); toast('Payment done'); confetti(); render(true); } catch (e) { fail(e); }
    };
    window.setStatus = async function (id, s) {
      const b = S.bookings.find((x) => x.id === id);
      try { const r = await patch(`/bookings/${b.sid}/status`, { status: s }); toast({ Confirmed: 'Booking accepted', Declined: 'Request declined', Completed: 'Event marked completed', Cancelled: r.refund ? `Booking cancelled · refund ${rupee(r.refund)} started` : 'Booking cancelled' }[s]); await refresh(loadBookings, ...(S.role === 'admin' ? [loadAdmin] : []), ...(S.role === 'vendor' ? [loadVendorSide] : [])); } catch (e) { fail(e); }
    };
    window.submitReview = async function (id) {
      const b = S.bookings.find((x) => x.id === id); const text = document.getElementById('rvt').value.trim();
      try { await post(`/bookings/${b.sid}/review`, { rating: S.rate, text }); S.reviewed[id] = S.rate; closeSheet(); toast('Thanks for your review!'); await refresh(loadBookings); } catch (e) { fail(e); }
    };

    /* customer chat */
    async function openCustomerChat(vid) {
      const v = vById(vid);
      try { const { thread } = await post('/threads', { vendorId: v.sid }); const { messages } = await get(`/threads/${thread.id}/messages`);
        S.cthreads[vid] = { sid: String(thread.id), msgs: messages.map((m) => ({ me: m.from === 'vendor' ? 1 : 0, t: m.text, tm: clock(m.createdAt) })) }; if (S.page === 'cchat') render(true); } catch (e) { fail(e); }
    }
    window.thr = (vid) => S.cthreads[vid] || (S.cthreads[vid] = { msgs: [] });
    window.cSend = async function (txt) {
      const el = document.getElementById('cin'); const q = (txt || el.value).trim(); if (!q) return; const vid = S.ctx.vendor; const t = thr(vid);
      if (!t.sid) { await openCustomerChat(vid); }
      try { const { message } = await post(`/threads/${thr(vid).sid}/messages`, { text: q }); thr(vid).msgs.push({ me: 0, t: message.text, tm: clock(message.createdAt) }); render(true); } catch (e) { fail(e); }
    };

    /* vendor chat */
    async function openThreadMsgs(localId) {
      const t = S.threads.find((x) => x.id === localId); if (!t) return;
      const { messages } = await get(`/threads/${t.sid}/messages`);
      t.msgs = messages.map((m) => ({ me: m.from === 'vendor' ? 1 : 0, t: m.text, tm: clock(m.createdAt) })); t.unread = 0;
    }
    window.openThread = async function (id) { await openThreadMsgs(id).catch(fail); nav('thread', { thread: id }); };
    window.vSend = async function (txt) {
      const el = document.getElementById('vin'); const v = (txt || el.value).trim(); if (!v) return; const t = S.threads.find((x) => x.id === S.ctx.thread);
      try { const { message } = await post(`/threads/${t.sid}/messages`, { text: v }); t.msgs.push({ me: 1, t: message.text, tm: clock(message.createdAt) }); render(true); } catch (e) { fail(e); }
    };
    window.vChatWith = async function (name) { await loadThreads(); const t = S.threads.find((x) => x.name === name); if (t) openThread(t.id); else toast('The customer has not started a chat yet.'); };

    /* notifications */
    window.readAll = async function () { try { await post('/notifications/read-all'); S.notifs[S.role].forEach((n) => (n.read = true)); render(true); openNotifs(); } catch (e) { fail(e); } };

    /* planner */
    window.toggleTask = async function (id) { const t = S.tasks.find((x) => x.id === id); try { await patch('/planner/tasks/' + t.sid, { done: !t.d }); if (!t.d) toast('Nice! One more task done'); await refresh(loadPlanner); } catch (e) { fail(e); } };
    window.addTask = async function () { const el = document.getElementById('newtask'); const v = el.value.trim(); if (!v) return; try { await post('/planner/tasks', { title: v }); toast('Task added'); await refresh(loadPlanner); } catch (e) { fail(e); } };
    window.saveExpense = async function () { const n = document.getElementById('exn').value.trim(), a = +document.getElementById('exa').value; try { await post('/planner/expenses', { note: n, amount: a, category: document.getElementById('exc').value }); closeSheet(); toast('Expense added'); await refresh(loadPlanner); } catch (e) { fail(e); } };
    window.delExpense = async function (i) { try { await del('/planner/expenses/' + S.expenses[i].sid); await refresh(loadPlanner); } catch (e) { fail(e); } };
    window.saveGuest = async function () { const n = document.getElementById('gn').value.trim(); try { await post('/planner/guests', { name: n, relation: document.getElementById('gr').value.trim(), side: document.getElementById('gs').value, people: +document.getElementById('gp').value }); closeSheet(); toast(n + ' added'); await refresh(loadPlanner); } catch (e) { fail(e); } };
    window.delGuest = async function (id) { const g = S.guests.find((x) => x.id === id); try { await del('/planner/guests/' + g.sid); await refresh(loadPlanner); } catch (e) { fail(e); } };
    window.cycleRsvp = async function (id) { const g = S.guests.find((x) => x.id === id); const order = ['Awaiting', 'Attending', 'Declined']; const next = order[(order.indexOf(g.r) + 1) % 3]; try { await patch('/planner/guests/' + g.sid, { rsvp: next }); await refresh(loadPlanner); } catch (e) { fail(e); } };
    window.markSent = async function () { try { const r = await post('/planner/guests/mark-invited'); toast(`Invites sent to ${r.updated} guests`); confetti(); await refresh(loadPlanner); } catch (e) { fail(e); } };
    const _editBudget = window.editBudget;
    window.editBudget = function () { _editBudget(); const btn = document.querySelector('#sheet .btn.block'); if (btn) btn.onclick = async () => { const v = +document.getElementById('bud').value; try { await patch('/me', { budget: v }); S.budget = v; closeSheet(); toast('Budget updated'); render(true); } catch (e) { fail(e); } }; };

    /* vendor self-service */
    const pushPackages = async () => { const r = await put('/vendor/me/packages', { packages: S.services.map((s) => ({ id: s.sid, name: s.name, price: s.price, description: s.desc })) }); S.myVendor = r.vendor; await loadVendorSide(); localVendor(r.vendor); };
    window.saveSvc = async function (i) {
      const n = document.getElementById('sn').value.trim(), p = +document.getElementById('sp').value, d = document.getElementById('sd').value.trim();
      if (!n || !p) { toast('Enter both a name and a price'); return; }
      const before = S.services.slice(); const o = { name: n, price: p, desc: d, sid: i >= 0 ? S.services[i].sid : undefined }; if (i >= 0) S.services[i] = o; else S.services.push(o);
      try { await pushPackages(); closeSheet(); toast('Package saved'); setTimeout(() => render(true), 200); } catch (e) { S.services = before; fail(e); }
    };
    window.delService = async function (i) { const before = S.services.slice(); S.services.splice(i, 1); try { await pushPackages(); toast('Package removed'); render(true); } catch (e) { S.services = before; fail(e); } };
    window.saveProfile = async function () {
      const g = (id) => document.getElementById(id).value.trim();
      try { const r = await patch('/vendor/me', { name: g('pn'), category: g('pc'), city: g('pci'), years: +g('py') || 0, about: g('pa'), instagram: g('pi'), gst: g('pg') }); localVendor(r.vendor); await loadVendorSide(); toast('Profile saved'); render(true); } catch (e) { fail(e); }
    };
    window.addPhotos = async function (files) { const fd = new FormData(); [...files].forEach((f) => fd.append('files', f)); toast('Uploading photos…'); try { await call('POST', '/vendor/me/portfolio', fd, true); await loadVendorSide(); toast('Photos added'); render(true); } catch (e) { fail(e); } };
    window.delPortfolio = async function (i) { try { await del('/vendor/me/portfolio/' + i); await loadVendorSide(); render(true); } catch (e) { fail(e); } };
    window.dayTap = async function (k) {
      const b = S.bookings.find((x) => x.vendor === 1 && x.date === k && !['Declined', 'Cancelled'].includes(x.status)); if (b) { toast(`${b.customer} · ${b.event} (${b.status})`); return; }
      const dates = S.blocked.includes(k) ? S.blocked.filter((d) => d !== k) : [...S.blocked, k];
      try { const r = await put('/vendor/me/blocked-dates', { dates }); S.blocked = r.blockedDates; toast(dates.includes(k) ? 'Date blocked' : 'Date freed'); render(true); } catch (e) { fail(e); }
    };
    window.replyRev = async function (i) { const v = document.getElementById('rr' + i).value.trim(); if (!v) return; try { await post(`/reviews/${S.vreviews[i].sid}/reply`, { text: v }); S.vreviews[i].reply = v; toast('Reply posted'); render(true); } catch (e) { fail(e); } };

    /* admin */
    window.blockUser = async function (n) { const u = S.users.find((x) => x.name === n); try { await patch('/admin/users/' + u.sid, { status: u.status === 'Active' ? 'Blocked' : 'Active' }); toast(`${n} ${u.status === 'Active' ? 'blocked' : 'unblocked'}`); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.approve = async function (id, ok) { const v = S.pendingVendors.find((x) => x.id === id); try { await patch('/admin/vendors/' + id, { status: ok ? 'Approved' : 'Rejected' }); toast(ok ? `${v.name} is now live` : `${v.name} rejected`); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.addCat = async function () { const v = document.getElementById('newcat').value.trim(); if (!v) return; try { await post('/admin/categories', { name: v }); toast(v + ' added'); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.toggleCat = async function (i) { const c = CATS[i]; try { await patch('/admin/categories/' + c.sid, { active: !c.active }); toast(c.name + (c.active ? ' is hidden' : ' is visible')); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.payDo = async function (id) { const p = S.payments.find((x) => x.id === id); try { await post(`/admin/payments/${p.sid}/process`); toast(p.type === 'Refund' ? 'Refund processed' : 'Payout recorded'); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.resolveC = async function (id) { try { await patch('/admin/complaints/' + id, { action: 'resolve' }); toast('Complaint resolved'); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.warnVendor = async function (id) { try { await patch('/admin/complaints/' + id, { action: 'warn' }); toast('Notice sent to vendor'); } catch (e) { fail(e); } };
    window.toggleFlag = async function (i) { const r = S.flagged[i]; try { await patch('/admin/reviews/' + r.id, { hidden: !r.hidden }); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.sendBroadcast = async function () { const t = document.getElementById('bt').value.trim(), m = document.getElementById('bm').value.trim(); if (!t) { toast('Write a title'); return; } try { const r = await post('/admin/broadcasts', { title: t, message: m, audience: S.ctx.aud || 'Everyone' }); toast(`Sent to ${r.broadcast.recipients} people`); await refresh(loadAdmin); } catch (e) { fail(e); } };
    window.setSetting = async function (k, v) { const map = { commission: 'commission', gst: 'gst', cancelHrs: 'freeCancelHours' }; S.settings[k] = v; if (!map[k]) return; try { await put('/admin/settings', { [map[k]]: v }); toast('Setting saved'); } catch (e) { fail(e); } };
    window.toggleSetting = async function (k) { S.settings[k] = !S.settings[k]; render(true); if (k === 'maintenance' && S.role === 'admin') { try { await put('/admin/settings', { maintenance: S.settings[k] }); } catch (e) { fail(e); } } else if (S.user) { patch('/me', { prefs: { [k === 'wa' ? 'whatsapp' : k]: S.settings[k] } }).catch(() => {}); } };

    /* Card Studio: also keep a copy of saved cards on the server */
    const _saveCard = window.saveCard;
    window.saveCard = async function () { await _saveCard(); const m = S.myCards[0]; if (m && m.blob && S.user) { const fd = new FormData(); fd.append('file', m.blob, 'card.png'); fd.append('event', m.ev); fd.append('template', S.card.tpl); fd.append('design', JSON.stringify({ f: S.card.f, o: S.card.o, size: S.card.size })); call('POST', '/me/cards', fd, true).catch(() => {}); } };
  }

  /* ---------------- boot ---------------- */
  fetch(API + '/health').then((r) => (r.ok ? r.json() : null)).then(async (h) => {
    if (!h) return;
    install();
    const badge = document.createElement('div'); badge.className = 'livebadge'; badge.textContent = h.paymentsMode === 'mock' ? 'Live server · test payments' : 'Live server'; document.body.appendChild(badge);
    if (TOKEN) { try { await loadAll(); stopTour(); S.screen = 'dash'; S.page = { customer: 'events', vendor: 'vdash', admin: 'adash' }[S.role]; render(); } catch (e) { setToken(null); } }
  }).catch(() => { /* not served by the API: stay in demo mode */ });
})();

/* Served build: real file downloads and server-side translation. */
(function () {
  const API = (window.EVQ_API_BASE || '') + '/api';
  fetch(API + '/health').then((r) => (r.ok ? r.json() : null)).then((h) => {
    if (!h) return;
    window.dlCard = function (i) {
      const m = S.myCards[i]; const a = document.createElement('a');
      a.href = URL.createObjectURL(m.blob); a.download = `eventique-${m.ev}-card.png`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Card downloaded');
    };
    if (h.translate) {
      window.getSample = async () => ({
        json: async (prompt) => {
          const texts = JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n[') + 2));
          const r = await fetch(API + '/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts, lang: langOf(S.lang)[2] }) });
          if (!r.ok) { const e = new Error('translate failed'); e.code = r.status === 429 ? 'rate_limited' : 'unavailable'; throw e; }
          return (await r.json()).translations;
        },
      });
    }
  }).catch(() => {});
})();
