import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, greet } from '../lib/theme';
import { useApp } from '../lib/store';
import { useLoad } from '../lib/useLoad';
import { get, post, patch, put, del, upload, rupee, fmtDate, ago } from '../lib/api';
import { Body, Button, Card, Chips, Empty, ErrorBox, Eyebrow, Field, H1, Loading, Meter, Muted, Pill, Row, Screen } from '../components/ui';
import { BookingCard } from './Customer';

/* =================== VENDOR =================== */
export function VendorHomeScreen({ navigation }) {
  const { user, vendor } = useApp(); const t = useTheme('vendor');
  const s = useLoad(() => get('/vendor/me/stats'), []);
  return (
    <Screen onRefresh={s.reload} refreshing={s.loading}>
      <Eyebrow>{greet()}, {user.name.split(' ')[0]}</Eyebrow>
      <H1>{s.data?.pending ? `${s.data.pending} couples are waiting for your reply` : 'Everything is on track today'}</H1>
      {vendor?.status !== 'Approved' ? <Card style={{ backgroundColor: t.warnSoft }}><Body bold style={{ color: t.warn }}>Profile {vendor?.status === 'Rejected' ? 'not approved' : 'under review'}</Body><Muted>Complete your profile, packages and documents. An admin will verify you and take your profile live.</Muted></Card> : null}
      {s.error ? <ErrorBox error={s.error} onRetry={s.reload} /> : null}
      {s.data ? <>
        <Card style={{ backgroundColor: t.ac }}><Text style={{ color: t.onAc, opacity: 0.85 }}>Earnings (confirmed + completed)</Text><Text style={{ color: t.onAc, fontSize: 30, fontWeight: '700' }}>{rupee(s.data.earned)}</Text></Card>
        <Row>
          <Card style={{ flex: 1 }}><Body bold style={{ fontSize: 22 }}>{s.data.views.toLocaleString('en-IN')}</Body><Muted>Profile views</Muted></Card>
          <Card style={{ flex: 1 }} onPress={() => navigation.navigate('RequestsTab')}><Body bold style={{ fontSize: 22 }}>{s.data.pending}</Body><Muted>New requests</Muted></Card>
          <Card style={{ flex: 1 }}><Body bold style={{ fontSize: 22, color: t.gold }}>★ {s.data.rating || '–'}</Body><Muted>{s.data.reviewsCount} reviews</Muted></Card>
        </Row>
        <Card><Row between><Body bold>Profile strength</Body><Body bold>{s.data.profileScore}%</Body></Row><Meter pct={s.data.profileScore} /></Card>
        <Text style={{ fontFamily: t.serif, fontSize: 19, color: t.fg }}>Upcoming events</Text>
        {s.data.upcoming.map((b) => <Card key={b.id}><Row between><View><Body bold>{b.customer?.name}</Body><Muted>{b.eventType} · {fmtDate(b.date)} · {b.packageName}</Muted></View><Pill status={b.status} /></Row></Card>)}
        {!s.data.upcoming.length ? <Empty text="No upcoming events." /> : null}
      </> : <Loading />}
      <Row style={{ flexWrap: 'wrap' }}>
        <Button small kind="soft" title="Packages" onPress={() => navigation.navigate('Packages')} />
        <Button small kind="soft" title="Portfolio" onPress={() => navigation.navigate('Portfolio')} />
        <Button small kind="soft" title="Business profile" onPress={() => navigation.navigate('Business')} />
        <Button small kind="soft" title="Payments" onPress={() => navigation.navigate('Payments')} />
      </Row>
    </Screen>
  );
}

export function VendorRequestsScreen() {
  const { toast } = useApp(); const [f, setF] = useState('Pending');
  const d = useLoad(() => get(`/bookings?status=${f}`), [f]);
  const act = async (b, status, msg) => { try { await patch(`/bookings/${b.id}/status`, { status }); toast(msg); d.reload(); } catch (e) { toast(e.message); } };
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Booking requests</H1><Muted>Replying within 24 hours ranks you higher in search.</Muted>
      <Chips options={['Pending', 'Confirmed', 'Completed', 'Declined', 'All']} value={f} onChange={setF} />
      {d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : null}
      {(d.data?.bookings || []).map((b) => <BookingCard key={b.id} b={b} who="vendor" actions={
        b.status === 'Pending' ? <Row><Button small title="Accept" onPress={() => act(b, 'Confirmed', 'Booking accepted')} /><Button small kind="ghost" title="Decline" onPress={() => act(b, 'Declined', 'Request declined')} /></Row>
          : b.status === 'Confirmed' ? <Button small kind="soft" title="Mark completed" onPress={() => act(b, 'Completed', 'Event marked completed')} /> : null} />)}
      {d.data && !d.data.bookings.length ? <Empty text="No bookings match this filter." /> : null}
    </Screen>
  );
}

export function PackagesScreen() {
  const { vendor, setVendor, toast } = useApp();
  const [list, setList] = useState((vendor?.packages || []).map((p) => ({ id: p.id || p._id, name: p.name, price: String(p.price), description: p.description || '' })));
  const [busy, setBusy] = useState(false);
  const upd = (i, k, v) => setList((l) => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  async function save() { setBusy(true); try { const r = await put('/vendor/me/packages', { packages: list.map((p) => ({ ...p, price: +p.price })) }); setVendor(r.vendor); toast('Packages saved'); } catch (e) { toast(e.message); } finally { setBusy(false); } }
  return (
    <Screen>
      <H1>Services & packages</H1><Muted>Customers see these packages when they book.</Muted>
      {list.map((p, i) => <Card key={i} style={{ gap: 8 }}>
        <Field label="Package name" value={p.name} onChangeText={(v) => upd(i, 'name', v)} />
        <Field label="Price (₹)" value={p.price} onChangeText={(v) => upd(i, 'price', v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <Field label="What is included" value={p.description} onChangeText={(v) => upd(i, 'description', v)} multiline />
        <Button small kind="ghost" title="Remove" onPress={() => setList((l) => l.filter((_, j) => j !== i))} />
      </Card>)}
      <Button kind="soft" title="+ Add package" onPress={() => setList((l) => [...l, { name: '', price: '', description: '' }])} />
      <Button title="Save packages" loading={busy} onPress={save} />
    </Screen>
  );
}

export function PortfolioScreen() {
  const { vendor, setVendor, toast } = useApp();
  async function add() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!perm.granted) { toast('Allow photo access to upload'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 }); if (r.canceled) return;
    try { const res = await upload('/vendor/me/portfolio', r.assets[0].uri, 'files'); setVendor(res.vendor); toast('Photo added'); } catch (e) { toast(e.message); }
  }
  return (
    <Screen>
      <H1>Portfolio</H1><Muted>Show your best work. Vendors with 10+ photos get booked more.</Muted>
      <Button title="+ Upload photo" onPress={add} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(vendor?.portfolio || []).map((p, i) => <View key={i} style={{ width: '31%' }}><Image source={{ uri: p.url }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} />
          <Button small kind="ghost" title="Remove" onPress={async () => { try { const r = await del(`/vendor/me/portfolio/${i}`); setVendor(r.vendor); } catch (e) { toast(e.message); } }} /></View>)}
      </View>
    </Screen>
  );
}

export function BusinessScreen() {
  const { vendor, setVendor, toast } = useApp();
  const [f, setF] = useState({ name: vendor?.name || '', category: vendor?.category || '', city: vendor?.city || '', about: vendor?.about || '', years: String(vendor?.years || ''), instagram: vendor?.instagram || '', gst: vendor?.gst || '', unit: vendor?.unit || '/ event' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  async function save() { try { const r = await patch('/vendor/me', { ...f, years: +f.years || 0 }); setVendor(r.vendor); toast('Profile saved'); } catch (e) { toast(e.message); } }
  async function doc() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 }); if (r.canceled) return;
    try { const res = await upload('/vendor/me/documents', r.assets[0].uri, 'file', { name: 'Verification document' }); setVendor(res.vendor); toast('Document uploaded'); } catch (e) { toast(e.message); }
  }
  return (
    <Screen>
      <H1>Business profile</H1>
      <Card style={{ gap: 10 }}>
        <Field label="Business name" value={f.name} onChangeText={set('name')} />
        <Field label="Category" value={f.category} onChangeText={set('category')} />
        <Field label="City" value={f.city} onChangeText={set('city')} />
        <Field label="Price unit (e.g. / day, / plate)" value={f.unit} onChangeText={set('unit')} />
        <Field label="Experience (years)" value={f.years} onChangeText={set('years')} keyboardType="number-pad" />
        <Field label="About your business" value={f.about} onChangeText={set('about')} multiline />
        <Field label="Instagram" value={f.instagram} onChangeText={set('instagram')} autoCapitalize="none" />
        <Field label="GST number" value={f.gst} onChangeText={set('gst')} autoCapitalize="characters" />
        <Button title="Save profile" onPress={save} />
      </Card>
      <Card><Body bold>Verification documents</Body>{(vendor?.documents || []).map((d, i) => <Muted key={i}>✓ {d.name}</Muted>)}<Button small kind="soft" title="+ Upload document photo" onPress={doc} /></Card>
    </Screen>
  );
}

export function PaymentsScreen() {
  const { user } = useApp(); const [f, setF] = useState('All');
  const d = useLoad(() => get(`/payments?type=${f}`), [f]);
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Payments</H1>
      <Chips options={user.role === 'vendor' ? ['All', 'Advance', 'Balance', 'Payout'] : ['All', 'Advance', 'Payout', 'Refund']} value={f} onChange={setF} />
      {(d.data?.payments || []).map((p) => <PaymentRow key={p.id} p={p} admin={user.role === 'admin'} onDone={d.reload} />)}
      {d.data && !d.data.payments.length ? <Empty text="No payments yet." /> : null}
    </Screen>
  );
}
function PaymentRow({ p, admin, onDone }) {
  const { toast } = useApp();
  return (
    <Card>
      <Row between><Body bold>{p.type} · {p.code}</Body><Pill status={p.status} /></Row>
      <Row between><Muted style={{ flex: 1 }}>{p.user?.name ? `${p.user.name} → ` : ''}{p.vendor?.name || ''} · {ago(p.createdAt)}</Muted><Body bold>{rupee(p.amount)}</Body></Row>
      {admin && p.status === 'Pending' ? <Button small title={p.type === 'Refund' ? 'Process refund' : 'Record payout'} onPress={async () => { try { await post(`/admin/payments/${p.id}/process`); toast('Done'); onDone(); } catch (e) { toast(e.message); } }} /> : null}
    </Card>
  );
}

/* =================== ADMIN =================== */
export function AdminHomeScreen({ navigation }) {
  const t = useTheme('admin'); const { user } = useApp();
  const d = useLoad(() => get('/admin/overview'), []);
  const o = d.data; const max = o ? Math.max(1, ...o.monthly) : 1;
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <Eyebrow>{greet()}, {user.name.split(' ')[0]}</Eyebrow><H1>How the platform is doing today</H1>
      {d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : null}
      {o ? <>
        <Card style={{ backgroundColor: t.ac }}><Text style={{ color: t.onAc, opacity: 0.85 }}>Booking value this month</Text><Text style={{ color: t.onAc, fontSize: 30, fontWeight: '700' }}>{rupee(o.gmv)}</Text><Text style={{ color: t.onAc, opacity: 0.85 }}>Commission: {rupee(o.commission)}</Text>
          <Row style={{ alignItems: 'flex-end', height: 70, marginTop: 8 }}>{o.monthly.map((v, i) => <View key={i} style={{ flex: 1, height: `${Math.max(4, (v / max) * 100)}%`, backgroundColor: t.onAc, opacity: i === o.monthly.length - 1 ? 1 : 0.45, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />)}</Row></Card>
        <Row>
          <Card style={{ flex: 1 }} onPress={() => navigation.navigate('Users')}><Body bold style={{ fontSize: 22 }}>{o.customers}</Body><Muted>Customers</Muted></Card>
          <Card style={{ flex: 1 }}><Body bold style={{ fontSize: 22 }}>{o.vendors}</Body><Muted>Active vendors</Muted></Card>
        </Row>
        <Row>
          <Card style={{ flex: 1 }} onPress={() => navigation.navigate('VerifyTab')}><Body bold style={{ fontSize: 22 }}>{o.pendingVendors}</Body><Muted>Awaiting verification</Muted></Card>
          <Card style={{ flex: 1 }} onPress={() => navigation.navigate('Complaints')}><Body bold style={{ fontSize: 22, color: o.openComplaints ? t.bad : t.fg }}>{o.openComplaints}</Body><Muted>Open complaints</Muted></Card>
        </Row>
        <Card><Body bold>Bookings by category</Body>{o.byCategory.map((c) => <View key={c.name} style={{ gap: 4 }}><Row between><Muted>{c.name}</Muted><Muted>{c.percent}%</Muted></Row><Meter pct={c.percent} /></View>)}</Card>
        <Text style={{ fontFamily: t.serif, fontSize: 19, color: t.fg }}>Latest bookings</Text>
        {o.recent.map((b) => <BookingCard key={b.id} b={b} who="admin" />)}
      </> : <Loading />}
      <Row style={{ flexWrap: 'wrap' }}>
        <Button small kind="soft" title="Payments" onPress={() => navigation.navigate('Payments')} />
        <Button small kind="soft" title="Broadcast" onPress={() => navigation.navigate('Broadcast')} />
        <Button small kind="soft" title="Users" onPress={() => navigation.navigate('Users')} />
        <Button small kind="soft" title="Complaints" onPress={() => navigation.navigate('Complaints')} />
      </Row>
    </Screen>
  );
}

export function VerifyScreen() {
  const { toast } = useApp();
  const d = useLoad(() => get('/admin/vendors?status=Pending'), []);
  const act = async (v, status) => { try { await patch(`/admin/vendors/${v.id}`, { status }); toast(status === 'Approved' ? `${v.name} is now live` : `${v.name} rejected`); d.reload(); } catch (e) { toast(e.message); } };
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Vendor verification</H1><Muted>Check documents before taking a vendor live.</Muted>
      {(d.data?.vendors || []).map((v) => <Card key={v.id}>
        <Row between><Body bold>{v.name}</Body><Pill status="Pending" /></Row>
        <Muted>{v.category} · {v.city} · {v.owner?.phone ? '+91 ' + v.owner.phone : ''}</Muted>
        <Muted>Documents: {v.documents.length ? v.documents.map((x) => x.name).join(', ') : 'none uploaded'}</Muted>
        <Row><Button small title="Approve" onPress={() => act(v, 'Approved')} /><Button small kind="ghost" title="Reject" onPress={() => act(v, 'Rejected')} /></Row>
      </Card>)}
      {d.data && !d.data.vendors.length ? <Empty text="No vendors are waiting." /> : null}
    </Screen>
  );
}

export function AdminBookingsScreen({ navigation }) {
  const { toast } = useApp(); const [f, setF] = useState('All'); const [q, setQ] = useState('');
  const d = useLoad(() => get(`/bookings?status=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`), [f, q]);
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Booking management</H1>
      <Field placeholder="Booking ID, customer, vendor…" value={q} onChangeText={setQ} />
      <Chips options={['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled', 'Declined']} value={f} onChange={setF} />
      {(d.data?.bookings || []).map((b) => <BookingCard key={b.id} b={b} who="admin" actions={['Pending', 'Confirmed'].includes(b.status) ? <Button small kind="ghost" title="Cancel & refund" onPress={async () => { try { await patch(`/bookings/${b.id}/status`, { status: 'Cancelled' }); toast('Booking cancelled'); d.reload(); } catch (e) { toast(e.message); } }} /> : null} />)}
    </Screen>
  );
}

export function UsersScreen() {
  const { toast } = useApp(); const [type, setType] = useState('All'); const [q, setQ] = useState('');
  const d = useLoad(() => get(`/admin/users?type=${type}${q ? `&q=${encodeURIComponent(q)}` : ''}`), [type, q]);
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>User management</H1>
      <Field placeholder="Search name, phone, city…" value={q} onChangeText={setQ} />
      <Chips options={['All', 'Customers', 'Vendors', 'Blocked']} value={type} onChange={setType} />
      {(d.data?.users || []).map((u) => <Card key={u.id}><Row between><View style={{ flex: 1 }}><Body bold>{u.name}</Body><Muted>{u.role} · {u.city} · +91 {u.phone}</Muted></View><Pill status={u.status} /></Row>
        <Button small kind={u.status === 'Active' ? 'ghost' : 'primary'} title={u.status === 'Active' ? 'Block' : 'Unblock'} onPress={async () => { try { await patch(`/admin/users/${u.id}`, { status: u.status === 'Active' ? 'Blocked' : 'Active' }); d.reload(); } catch (e) { toast(e.message); } }} /></Card>)}
    </Screen>
  );
}

export function ComplaintsScreen() {
  const { toast } = useApp();
  const d = useLoad(() => get('/admin/complaints'), []);
  const act = async (c, action, msg) => { try { await patch(`/admin/complaints/${c.id}`, { action }); toast(msg); d.reload(); } catch (e) { toast(e.message); } };
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Complaints</H1>
      {(d.data?.complaints || []).map((c) => <Card key={c.id}><Row between><Body bold style={{ flex: 1 }}>Against {c.vendorName}</Body><Pill status={c.status} /></Row><Muted>From {c.fromName}</Muted><Body>{c.text}</Body>
        {c.status === 'Open' ? <Row><Button small title="Mark resolved" onPress={() => act(c, 'resolve', 'Complaint resolved')} /><Button small kind="ghost" title="Warn vendor" onPress={() => act(c, 'warn', 'Notice sent to vendor')} /></Row> : null}</Card>)}
    </Screen>
  );
}

export function BroadcastScreen() {
  const { toast } = useApp(); const [title, setTitle] = useState(''); const [message, setMessage] = useState(''); const [aud, setAud] = useState('Everyone'); const [busy, setBusy] = useState(false);
  const d = useLoad(() => get('/admin/broadcasts'), []);
  async function send() { setBusy(true); try { const r = await post('/admin/broadcasts', { title, message, audience: aud }); toast(`Sent to ${r.broadcast.recipients} people`); setTitle(''); setMessage(''); d.reload(); } catch (e) { toast(e.message); } finally { setBusy(false); } }
  return (
    <Screen>
      <H1>Broadcast</H1><Muted>Send an announcement. It appears in users' notifications instantly.</Muted>
      <Card style={{ gap: 10 }}>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Wedding season sale is live!" />
        <Field label="Message" value={message} onChangeText={setMessage} multiline />
        <Chips options={['Everyone', 'Customers', 'Vendors']} value={aud} onChange={setAud} />
        <Button title="Send broadcast" loading={busy} onPress={send} />
      </Card>
      {(d.data?.broadcasts || []).map((b) => <Card key={b.id}><Row between><Body bold style={{ flex: 1 }}>{b.title}</Body><Muted>{b.audience}</Muted></Row><Muted>{b.message}</Muted><Muted style={{ fontSize: 11.5 }}>{ago(b.createdAt)} · {b.recipients} people</Muted></Card>)}
    </Screen>
  );
}
