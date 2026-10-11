import React, { useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, greet } from '../lib/theme';
import { useApp } from '../lib/store';
import { useLoad } from '../lib/useLoad';
import { get, post, patch, del, rupee, fmtDate } from '../lib/api';
import { Body, Button, Card, Chips, Empty, ErrorBox, Eyebrow, Field, H1, Loading, Meter, Muted, Pill, Row, Screen, Thumb } from '../components/ui';

/* ---------------- Home: events + top vendors ---------------- */
export function HomeScreen({ navigation }) {
  const { user, catalog } = useApp(); const t = useTheme('customer');
  const [q, setQ] = useState('');
  const top = useLoad(() => get(`/vendors?sort=rating&limit=8${user.city ? `&city=${encodeURIComponent(user.city)}` : ''}`), [user.city]);
  const days = user.eventDate ? Math.max(0, Math.ceil((new Date(user.eventDate + 'T00:00:00') - new Date()) / 864e5)) : null;
  return (
    <Screen onRefresh={top.reload} refreshing={top.loading}>
      <Eyebrow>{greet()}, {user.name.split(' ')[0]}</Eyebrow>
      <H1>{user.eventDate ? 'Your wedding plans, all in one place' : 'What are you planning?'}</H1>
      <Field placeholder="Search vendors, caterers, venues…" value={q} onChangeText={setQ} returnKeyType="search" onSubmitEditing={() => navigation.navigate('Vendors', { q })} />
      {days !== null ? (
        <Card style={{ backgroundColor: t.ac }} onPress={() => navigation.navigate('PlannerTab')}>
          <Text style={{ color: t.onAc, opacity: 0.9 }}>{user.partner ? `${user.name.split(' ')[0]} & ${user.partner}` : 'Your big day'} · {fmtDate(user.eventDate)}</Text>
          <Row between><Text style={{ color: t.onAc, fontSize: 40, fontFamily: t.serif }}>{days}</Text><Text style={{ color: t.onAc }}>days to go  ›</Text></Row>
        </Card>
      ) : null}
      <Text style={{ fontFamily: t.serif, fontSize: 19, color: t.fg, marginTop: 6 }}>Plan by event</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {catalog.events.map((e) => (
          <Pressable key={e.key} onPress={() => navigation.navigate('Vendors', { event: e.key, title: e.name })} style={{ width: '48%', backgroundColor: t.glass, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}>
            <Image source={{ uri: e.image }} style={{ width: '100%', height: 96 }} />
            <View style={{ padding: 10 }}><Body bold>{e.name}</Body><Muted style={{ fontSize: 12 }}>{e.sub}</Muted></View>
          </Pressable>
        ))}
      </View>
      <Text style={{ fontFamily: t.serif, fontSize: 19, color: t.fg, marginTop: 6 }}>Top rated {user.city ? `in ${user.city}` : ''}</Text>
      {top.error ? <ErrorBox error={top.error} onRetry={top.reload} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {(top.data?.vendors || []).map((v) => (
          <Pressable key={v.id} onPress={() => navigation.navigate('Vendor', { id: v.id })} style={{ width: 190, backgroundColor: t.glass, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}>
            <Image source={{ uri: v.cover }} style={{ width: '100%', height: 110 }} />
            <View style={{ padding: 10 }}><Body bold numberOfLines={1}>{v.name}</Body><Muted style={{ fontSize: 12 }}>{v.category} · {v.city}</Muted><Text style={{ color: t.gold, fontWeight: '700' }}>★ {v.rating}  <Text style={{ color: t.fg }}>{rupee(v.basePrice)}</Text></Text></View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

/* ---------------- Vendors list ---------------- */
export function VendorsScreen({ route, navigation }) {
  const { catalog } = useApp(); const t = useTheme('customer');
  const event = route.params?.event; const [q, setQ] = useState(route.params?.q || ''); const [cat, setCat] = useState('All'); const [sort, setSort] = useState('rating');
  const ev = catalog.events.find((e) => e.key === event);
  const cats = ['All', ...(ev ? ev.categories : catalog.categories.map((c) => c.name))];
  const list = useLoad(() => get(`/vendors?limit=50&sort=${sort}${event ? `&event=${event}` : ''}${cat !== 'All' ? `&category=${encodeURIComponent(cat)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`), [event, cat, sort, q]);
  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      <Field placeholder="Search by name or city…" value={q} onChangeText={setQ} />
      <Chips options={cats} value={cat} onChange={setCat} />
      <Chips options={['rating', 'price_asc', 'price_desc', 'reviews']} value={sort} onChange={setSort} />
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? <Loading /> : (list.data?.vendors || []).map((v) => (
        <Card key={v.id} onPress={() => navigation.navigate('Vendor', { id: v.id, event })}>
          <Row>
            <Thumb uri={v.cover} size={72} />
            <View style={{ flex: 1, gap: 2 }}>
              <Body bold>{v.name}</Body><Muted>{v.category} · {v.city}</Muted>
              <Row between><Text style={{ color: t.gold, fontWeight: '700' }}>★ {v.rating} <Text style={{ color: t.muted, fontWeight: '400' }}>({v.reviewsCount})</Text></Text><Body bold>{rupee(v.basePrice)} <Muted>{v.unit}</Muted></Body></Row>
            </View>
          </Row>
        </Card>
      ))}
      {list.data && !list.data.vendors.length ? <Empty text="No vendors found. Try another search or category." /> : null}
    </Screen>
  );
}

/* ---------------- Vendor detail ---------------- */
export function VendorScreen({ route, navigation }) {
  const { toast } = useApp(); const t = useTheme('customer');
  const d = useLoad(() => get(`/vendors/${route.params.id}`), [route.params.id]);
  if (d.loading && !d.data) return <Screen><Loading /></Screen>;
  if (d.error) return <Screen><ErrorBox error={d.error} onRetry={d.reload} /></Screen>;
  const { vendor: v, reviews, saved } = d.data;
  const fav = async () => { try { const r = await post(`/me/favs/${v.id}`); d.setData({ ...d.data, saved: r.saved }); toast(r.saved ? 'Vendor saved ♥' : 'Removed from saved'); } catch (e) { toast(e.message); } };
  const chat = async () => { try { const { thread } = await post('/threads', { vendorId: v.id }); navigation.navigate('Chat', { id: thread.id, title: v.name }); } catch (e) { toast(e.message); } };
  return (
    <Screen footer={<Row style={{ padding: 12, backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line }} between>
      <View><Muted style={{ fontSize: 12 }}>Starting at</Muted><Body bold style={{ fontSize: 18 }}>{rupee(v.basePrice)} <Muted>{v.unit}</Muted></Body></View>
      <Row><Button kind="ghost" small title="Chat" onPress={chat} /><Button title="Book now" onPress={() => navigation.navigate('Book', { id: v.id, event: route.params.event })} /></Row>
    </Row>}>
      <Image source={{ uri: v.cover }} style={{ width: '100%', height: 220, borderRadius: 20 }} />
      <Row between><H1 style={{ flex: 1 }}>{v.name}</H1><Button small kind="soft" title={saved ? '♥ Saved' : '♡ Save'} onPress={fav} /></Row>
      <Muted>{v.category} · {v.city} · {v.years} yrs · ★ {v.rating} ({v.reviewsCount} reviews) · ✓ Verified</Muted>
      <Card><Body bold>About</Body><Muted>{v.about}</Muted></Card>
      <Text style={{ fontFamily: t.serif, fontSize: 19, color: t.fg }}>Packages</Text>
      {v.packages.map((p) => <Card key={p.id}><Row between><Body bold>{p.name}</Body><Body bold>{rupee(p.price)}</Body></Row><Muted>{p.description}</Muted></Card>)}
      {v.portfolio.length ? <><Text style={{ fontFamily: t.serif, fontSize: 19, color: t.fg }}>Portfolio</Text>
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{v.portfolio.map((p, i) => <Image key={i} source={{ uri: p.url }} style={{ width: 140, height: 140, borderRadius: 12 }} />)}</ScrollView></> : null}
      <Text style={{ fontFamily: t.serif, fontSize: 19, color: t.fg }}>Reviews</Text>
      {reviews.length ? reviews.map((r) => <Card key={r.id}><Row between><Body bold>{r.authorName}</Body><Text style={{ color: t.gold }}>{'★'.repeat(r.rating)}</Text></Row><Body>{r.text}</Body>{r.reply ? <Muted>Vendor reply: {r.reply}</Muted> : null}</Card>) : <Empty text="No reviews yet." />}
      <View style={{ height: 70 }} />
    </Screen>
  );
}

/* ---------------- Book ---------------- */
export function BookScreen({ route, navigation }) {
  const { catalog, user, toast } = useApp(); const t = useTheme('customer');
  const d = useLoad(() => get(`/vendors/${route.params.id}`), [route.params.id]);
  const [pkg, setPkg] = useState(0); const [date, setDate] = useState(user.eventDate || ''); const [show, setShow] = useState(false);
  const [guests, setGuests] = useState('400'); const [slot, setSlot] = useState('Evening'); const [address, setAddress] = useState(''); const [busy, setBusy] = useState(false);
  const v = d.data?.vendor; const s = catalog.settings;
  const price = useMemo(() => {
    if (!v) return null; const p = v.packages[pkg]; if (!p) return null;
    const base = /plate/i.test(v.unit) ? p.price * Math.max(1, +guests || 1) : p.price; const gst = Math.round(base * s.gst / 100); const total = base + gst;
    return { base, gst, total, adv: Math.round(total * s.advance / 100) };
  }, [v, pkg, guests, s]);
  if (!v) return <Screen>{d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : <Loading />}</Screen>;
  const blocked = d.data.unavailable.includes(date);
  async function book() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Choose an event date'); return; }
    setBusy(true);
    try {
      const ev = catalog.events.find((e) => e.key === route.params.event);
      const r = await post('/bookings', { vendorId: v.id, packageId: v.packages[pkg].id, date, slot, guests: +guests, address, eventType: ev ? ev.name : 'Wedding' });
      navigation.replace('Pay', { order: r.order, label: `Advance · ${v.name}`, bookingId: r.booking.id });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  return (
    <Screen>
      <H1>{v.name}</H1>
      <Body bold>Choose package</Body>
      {v.packages.map((p, i) => <Card key={p.id} onPress={() => setPkg(i)} style={pkg === i && { borderColor: t.ac, borderWidth: 1.5, backgroundColor: t.acSoft }}><Row between><Body bold>{p.name}</Body><Body bold>{rupee(p.price)}</Body></Row><Muted>{p.description}</Muted></Card>)}
      <Pressable onPress={() => setShow(true)}><Field label="Event date" value={date ? fmtDate(date) : ''} placeholder="Tap to choose" editable={false} pointerEvents="none" /></Pressable>
      {show ? <DateTimePicker value={date ? new Date(date + 'T00:00:00') : new Date()} minimumDate={new Date()} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
        onChange={(_e, dt) => { setShow(Platform.OS === 'ios'); if (dt) setDate(new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10)); }} /> : null}
      {blocked ? <Text style={{ color: t.bad }}>{v.name} is not available on this date.</Text> : null}
      <Field label="Guests" value={guests} onChangeText={(x) => setGuests(x.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Body bold>Time slot</Body><Chips options={['Morning', 'Afternoon', 'Evening', 'Full day']} value={slot} onChange={setSlot} />
      <Field label="Event venue / address" value={address} onChangeText={setAddress} placeholder="e.g. Rajmahal Lawns, Gomti Nagar" />
      {price ? <Card>
        <Row between><Muted>{v.packages[pkg].name}</Muted><Body>{rupee(price.base)}</Body></Row>
        <Row between><Muted>GST ({s.gst}%)</Muted><Body>{rupee(price.gst)}</Body></Row>
        <Row between><Body bold>Total</Body><Body bold>{rupee(price.total)}</Body></Row>
        <Row between><Text style={{ color: t.ac, fontWeight: '700' }}>Pay now ({s.advance}% advance)</Text><Text style={{ color: t.ac, fontWeight: '700' }}>{rupee(price.adv)}</Text></Row>
      </Card> : null}
      <Muted>Free cancellation up to {s.freeCancelHours} hours after booking. The balance is paid after the vendor confirms.</Muted>
      <Button title={`Confirm & pay ${price ? rupee(price.adv) : ''}`} loading={busy} disabled={blocked} onPress={book} />
    </Screen>
  );
}

/* ---------------- Bookings ---------------- */
export function BookingsScreen({ navigation }) {
  const [f, setF] = useState('All');
  const d = useLoad(() => get(`/bookings${f !== 'All' ? `?status=${f}` : ''}`), [f]);
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>My bookings</H1>
      <Chips options={['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled']} value={f} onChange={setF} />
      {d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : null}
      {(d.data?.bookings || []).map((b) => <BookingCard key={b.id} b={b} onPress={() => navigation.navigate('Booking', { id: b.id })} who="customer" />)}
      {d.data && !d.data.bookings.length ? <Empty text="No bookings yet. Pick an event from Home." /> : null}
    </Screen>
  );
}
export function BookingCard({ b, onPress, who, actions }) {
  return (
    <Card onPress={onPress}>
      <Row>
        <Thumb uri={b.vendor?.cover} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row between><Body bold style={{ flex: 1 }} numberOfLines={1}>{who === 'vendor' ? b.customer?.name : b.vendor?.name}</Body><Pill status={b.status} /></Row>
          <Muted>{b.eventType} · {fmtDate(b.date)} · {b.guests} guests · {b.packageName}</Muted>
          <Row between><Muted>{b.code}{who === 'admin' ? ` · ${b.customer?.name}` : ''}</Muted><Body bold>{rupee(b.amount)}</Body></Row>
        </View>
      </Row>
      {actions}
    </Card>
  );
}

export function BookingScreen({ route, navigation }) {
  const { toast } = useApp(); const t = useTheme('customer');
  const d = useLoad(() => get(`/bookings/${route.params.id}`), [route.params.id]);
  const [rating, setRating] = useState(5); const [text, setText] = useState('');
  if (!d.data) return <Screen>{d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : <Loading />}</Screen>;
  const b = d.data.booking; const due = b.amount - b.paid; const ok = ['Confirmed', 'Completed'].includes(b.status);
  const steps = [['Request sent', true], ['Vendor confirmed', ok], ['Advance paid', b.paid > 0], ['Event day', b.status === 'Completed'], ['Review posted', b.reviewed]];
  const act = async (fn, msg) => { try { await fn(); toast(msg); d.reload(); } catch (e) { toast(e.message); } };
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <Image source={{ uri: b.vendor.cover }} style={{ width: '100%', height: 150, borderRadius: 18 }} />
      <Row between><H1 style={{ flex: 1 }}>{b.vendor.name}</H1><Pill status={b.status} /></Row>
      <Muted>{b.code} · {b.eventType} · {fmtDate(b.date)}</Muted>
      <Card><Body bold>Booking status</Body>{steps.map(([s, done]) => <Row key={s}><Text style={{ color: done ? t.ok : t.muted, fontSize: 18 }}>{done ? '●' : '○'}</Text><Body style={!done && { color: t.muted }}>{s}</Body></Row>)}</Card>
      <Card>
        <Row between><Muted>Total (incl. GST)</Muted><Body>{rupee(b.amount)}</Body></Row>
        <Row between><Muted>Paid</Muted><Text style={{ color: t.ok }}>{rupee(b.paid)}</Text></Row>
        <Row between><Body bold>Balance</Body><Body bold>{rupee(due)}</Body></Row>
        {due > 0 && ok ? <Button title={`Pay balance · ${rupee(due)}`} onPress={async () => { try { const r = await post(`/bookings/${b.id}/pay-balance`); navigation.navigate('Pay', { order: r.order, label: `Balance · ${b.code}`, bookingId: b.id }); } catch (e) { toast(e.message); } }} /> : null}
        {b.status === 'AwaitingPayment' ? <Button title="Pay advance" onPress={async () => { try { const r = await post(`/bookings/${b.id}/pay-advance`); navigation.navigate('Pay', { order: r.order, label: `Advance · ${b.code}`, bookingId: b.id }); } catch (e) { toast(e.message); } }} /> : null}
      </Card>
      {b.status === 'Completed' && !b.reviewed ? <Card>
        <Body bold>How was {b.vendor.name}?</Body>
        <Row>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)}><Text style={{ fontSize: 32, color: n <= rating ? t.gold : t.line }}>★</Text></Pressable>)}</Row>
        <Field value={text} onChangeText={setText} placeholder="What went well, and what could be better?" multiline />
        <Button title="Post review" onPress={() => act(() => post(`/bookings/${b.id}/review`, { rating, text }), 'Thanks for your review!')} />
      </Card> : null}
      {['AwaitingPayment', 'Pending'].includes(b.status) ? <Button kind="ghost" title="Cancel booking" onPress={() => act(() => patch(`/bookings/${b.id}/status`, { status: 'Cancelled' }), 'Booking cancelled')} /> : null}
    </Screen>
  );
}

/* ---------------- Planner ---------------- */
export function PlannerScreen() {
  const { toast } = useApp(); const t = useTheme('customer');
  const d = useLoad(() => get('/planner'), []);
  const [task, setTask] = useState(''); const [guest, setGuest] = useState(''); const [tab, setTab] = useState('Checklist');
  if (!d.data) return <Screen>{d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : <Loading />}</Screen>;
  const { tasks, budget, guests } = d.data; const done = tasks.filter((x) => x.done).length;
  const run = async (fn) => { try { await fn(); d.reload(); } catch (e) { toast(e.message); } };
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Wedding planner</H1>
      <Chips options={['Checklist', 'Budget', 'Guests']} value={tab} onChange={setTab} />
      {tab === 'Checklist' ? <>
        <Card><Row between><Body bold>{done}/{tasks.length} tasks done</Body><Body bold>{Math.round(done / tasks.length * 100)}%</Body></Row><Meter pct={done / tasks.length * 100} /></Card>
        <Row><View style={{ flex: 1 }}><Field value={task} onChangeText={setTask} placeholder="New task, e.g. Sherwani fitting" /></View><Button small title="Add" onPress={() => run(async () => { await post('/planner/tasks', { title: task }); setTask(''); })} /></Row>
        {tasks.map((x) => <Card key={x.id} onPress={() => (x.auto ? toast('Ticked automatically by your booking') : run(() => patch(`/planner/tasks/${x.id}`, { done: !x.done })))}>
          <Row><Text style={{ fontSize: 20, color: x.done ? t.ok : t.muted }}>{x.done ? '☑' : '☐'}</Text><View style={{ flex: 1 }}><Body style={x.done && { textDecorationLine: 'line-through', color: t.muted }}>{x.title}</Body><Muted style={{ fontSize: 12 }}>{x.group}{x.auto ? ' · Booked via Eventique' : ''}</Muted></View></Row>
        </Card>)}
      </> : null}
      {tab === 'Budget' ? <>
        <Card><Muted>Total budget</Muted><H1>{rupee(budget.total)}</H1><Body>{rupee(budget.used)} used · <Text style={{ color: budget.total - budget.used < 0 ? t.bad : t.ok }}>{rupee(Math.abs(budget.total - budget.used))} {budget.total - budget.used < 0 ? 'over budget' : 'left'}</Text></Body><Meter pct={budget.used / budget.total * 100} /></Card>
        {Object.entries(budget.split).map(([c, p]) => { const plan = budget.total * p / 100; const sp = budget.spent[c] || 0; return <Card key={c}><Row between><Body>{c}</Body><Body><Text style={{ fontWeight: '700', color: sp > plan ? t.bad : t.fg }}>{rupee(sp)}</Text> / {rupee(plan)}</Body></Row><Meter pct={sp / plan * 100} /></Card>; })}
      </> : null}
      {tab === 'Guests' ? <>
        <Row><View style={{ flex: 1 }}><Field value={guest} onChangeText={setGuest} placeholder="Guest name" /></View><Button small title="Add" onPress={() => run(async () => { await post('/planner/guests', { name: guest }); setGuest(''); })} /></Row>
        <Button kind="soft" title="Mark all as invited" onPress={() => run(() => post('/planner/guests/mark-invited'))} />
        {guests.map((g) => <Card key={g.id}><Row between><View style={{ flex: 1 }}><Body bold>{g.name}</Body><Muted>{g.relation} · {g.side} · {g.people} people</Muted></View>
          <Pressable onPress={() => run(() => patch(`/planner/guests/${g.id}`, { rsvp: { 'Not invited': 'Awaiting', Awaiting: 'Attending', Attending: 'Declined', Declined: 'Awaiting' }[g.rsvp] }))}><Pill status={g.rsvp} /></Pressable>
          <Pressable onPress={() => run(() => del(`/planner/guests/${g.id}`))}><Text style={{ color: t.muted, fontSize: 18, paddingLeft: 8 }}>✕</Text></Pressable></Row></Card>)}
        {!guests.length ? <Empty text="No guests yet. Add your first guest above." /> : null}
      </> : null}
    </Screen>
  );
}
