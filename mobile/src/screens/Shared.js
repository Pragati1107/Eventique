import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { useLoad } from '../lib/useLoad';
import { get, post, patch, upload, rupee, ago } from '../lib/api';
import { Body, Button, Card, Empty, ErrorBox, Field, H1, Loading, Muted, Row, Screen } from '../components/ui';

/* ---------------- Payment: Razorpay Checkout in a WebView, or the server's test gateway ---------------- */
export function PayScreen({ route, navigation }) {
  const { order, label, bookingId } = route.params; const { user, toast, bump } = useApp(); const t = useTheme(user.role);
  const [busy, setBusy] = useState(false);
  const amount = Math.round(order.amount / 100);
  const done = (r) => { bump(); toast('Payment successful'); navigation.replace('Booking', { id: bookingId || r?.booking?._id || r?.booking?.id }); };
  async function verify(sig) { setBusy(true); try { done(await post('/payments/verify', sig)); } catch (e) { toast(e.message); setBusy(false); } }
  if (order.mock) {
    return (
      <Screen>
        <H1>Test payment</H1>
        <Muted>Razorpay keys are not set on the server, so this is a simulated payment. No money moves.</Muted>
        <Card><Row between><Body bold>{label}</Body><Body bold>{rupee(amount)}</Body></Row></Card>
        <Button title={`Pay ${rupee(amount)}`} loading={busy} onPress={async () => { try { verify(await post('/payments/mock-complete', { orderId: order.id })); } catch (e) { toast(e.message); } }} />
        <Button kind="ghost" title="Cancel" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
  <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;color:#6F6068">Opening secure payment…<script>
  var rzp=new Razorpay({key:${JSON.stringify(order.keyId)},amount:${order.amount},currency:'INR',order_id:${JSON.stringify(order.id)},name:'Eventique',description:${JSON.stringify(label)},
  prefill:{name:${JSON.stringify(user.name)},contact:'+91${user.phone}'},theme:{color:'#8B1E3F'},
  handler:function(r){window.ReactNativeWebView.postMessage(JSON.stringify({ok:true,orderId:r.razorpay_order_id,paymentId:r.razorpay_payment_id,signature:r.razorpay_signature}))},
  modal:{ondismiss:function(){window.ReactNativeWebView.postMessage(JSON.stringify({ok:false,cancel:true}))}}});
  rzp.on('payment.failed',function(r){window.ReactNativeWebView.postMessage(JSON.stringify({ok:false,error:r.error&&r.error.description}))});rzp.open();</script></body></html>`;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {busy ? <Loading /> : <WebView originWhitelist={['*']} source={{ html }} javaScriptEnabled onMessage={(e) => {
        const m = JSON.parse(e.nativeEvent.data);
        if (m.ok) verify({ orderId: m.orderId, paymentId: m.paymentId, signature: m.signature });
        else { toast(m.cancel ? 'Payment cancelled' : m.error || 'Payment failed'); navigation.goBack(); }
      }} />}
    </View>
  );
}

/* ---------------- Chats ---------------- */
export function ChatsScreen({ navigation }) {
  const { user } = useApp(); const t = useTheme(user.role);
  const d = useLoad(() => get('/threads'), []);
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Messages</H1>
      <Card onPress={() => navigation.navigate('Evora')}><Row><Image source={require('../../assets/evora.png')} style={{ width: 44, height: 44, borderRadius: 22 }} /><View style={{ flex: 1 }}><Body bold>Evora</Body><Muted>Your Eventique assistant</Muted></View></Row></Card>
      {d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : null}
      {(d.data?.threads || []).map((th) => {
        const other = user.role === 'vendor' ? th.customer?.name : th.vendor?.name; const unread = user.role === 'vendor' ? th.unreadVendor : th.unreadCustomer;
        return <Card key={th.id} onPress={() => navigation.navigate('Chat', { id: th.id, title: other })}>
          <Row><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.ac, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.onAc, fontWeight: '700' }}>{(other || '?')[0]}</Text></View>
            <View style={{ flex: 1 }}><Row between><Body bold>{other}</Body><Muted style={{ fontSize: 12 }}>{th.lastAt ? ago(th.lastAt) : ''}</Muted></Row><Muted numberOfLines={1}>{th.lastMessage || 'Say hello'}</Muted></View>
            {unread ? <View style={{ backgroundColor: t.ac, borderRadius: 99, paddingHorizontal: 7 }}><Text style={{ color: t.onAc, fontSize: 12, fontWeight: '700' }}>{unread}</Text></View> : null}</Row>
        </Card>;
      })}
      {d.data && !d.data.threads.length ? <Empty text={user.role === 'vendor' ? 'No messages yet. Customers can chat with you from your profile.' : 'No chats yet. Open any vendor and tap Chat.'} /> : null}
    </Screen>
  );
}

export function ChatScreen({ route }) {
  const { user, tick } = useApp(); const t = useTheme(user.role); const me = user.role === 'vendor' ? 'vendor' : 'customer';
  const [msgs, setMsgs] = useState([]); const [text, setText] = useState(''); const [err, setErr] = useState(''); const list = useRef(null);
  useEffect(() => { get(`/threads/${route.params.id}/messages`).then((r) => setMsgs(r.messages)).catch((e) => setErr(e.message)); }, [route.params.id, tick]);
  async function send() { const v = text.trim(); if (!v) return; setText(''); try { const r = await post(`/threads/${route.params.id}/messages`, { text: v }); setMsgs((m) => [...m, r.message]); } catch (e) { setErr(e.message); } }
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {err ? <Text style={{ color: t.bad, padding: 12 }}>{err}</Text> : null}
      <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 14, gap: 8 }} onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item: m }) => { const mine = m.from === me; return <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: mine ? t.ac : t.surface, borderRadius: 16, padding: 10, borderWidth: mine ? 0 : 1, borderColor: t.line }}>
          <Text style={{ color: mine ? t.onAc : t.fg, fontSize: 14.5 }}>{m.text}</Text><Text style={{ color: mine ? t.onAc : t.muted, opacity: 0.7, fontSize: 10.5, textAlign: 'right' }}>{ago(m.createdAt)}{mine ? ' ✓✓' : ''}</Text></View>; }}
        ListEmptyComponent={<Empty text="Send your first message." />} />
      <Row style={{ padding: 10, backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line }}>
        <TextInput value={text} onChangeText={setText} placeholder="Type a message…" placeholderTextColor={t.muted} style={{ flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10, color: t.fg }} onSubmitEditing={send} returnKeyType="send" />
        <Button small title="Send" onPress={send} />
      </Row>
    </KeyboardAvoidingView>
  );
}

/* ---------------- Evora (rule-based assistant) ---------------- */
function evoraReply(q, role) {
  const has = (...w) => w.some((x) => q.includes(x));
  if (has('otp')) return 'The OTP arrives within 30 seconds. Check your number, then tap Resend OTP. Demo numbers use 123456.';
  if (has('cancel')) return 'Open the booking from the Bookings tab and tap Cancel booking. Cancellation is free within the free-cancellation window.';
  if (has('budget', 'cost', 'price')) return 'A rough budget for a 400-guest wedding: venue ₹2–2.5 lakh, catering ₹3.4 lakh, decor ₹1.2 lakh, photography ₹45–90k, makeup ₹25k. Track yours in Planner → Budget.';
  if (has('pay', 'payout', 'refund')) return role === 'vendor' ? 'Payouts reach your bank within 3 working days of the event, after the platform commission.' : 'You pay a small advance to book. The balance is paid after the vendor confirms. Refunds take 5–7 working days.';
  if (has('accept', 'request')) return 'Open Requests and tap Accept or Decline on each booking. Replying within 24 hours ranks you higher.';
  if (has('photo', 'photographer')) return 'Go to Home → Wedding → Photography to see top-rated photographers near you.';
  if (has('hi', 'hello')) return 'Hello! How can I help you today?';
  return 'I can help with vendors, bookings, budgets, OTP and payments. Try asking about one of these.';
}
export function EvoraScreen() {
  const { user } = useApp(); const t = useTheme(user.role);
  const [msgs, setMsgs] = useState([{ bot: true, t: `Hello ${user.name.split(' ')[0]}! I'm Evora, your Eventique assistant. Ask me about vendors, bookings, payments or your account.` }]); const [text, setText] = useState('');
  const send = (v = text) => { const q = v.trim(); if (!q) return; setText(''); setMsgs((m) => [...m, { t: q }, { bot: true, t: evoraReply(q.toLowerCase(), user.role) }]); };
  const chips = user.role === 'vendor' ? ['How do I accept requests?', 'When do I get paid?'] : user.role === 'admin' ? ['Pending approvals', 'Commission rate'] : ['Wedding budget?', 'How do I cancel?', 'Suggest a photographer'];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList data={msgs} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ padding: 14, gap: 8 }} renderItem={({ item }) => (
        <View style={{ alignSelf: item.bot ? 'flex-start' : 'flex-end', maxWidth: '85%', backgroundColor: item.bot ? t.surface : t.ac, borderRadius: 16, padding: 10, borderWidth: item.bot ? 1 : 0, borderColor: t.line }}><Text style={{ color: item.bot ? t.fg : t.onAc }}>{item.t}</Text></View>)} />
      <Row style={{ paddingHorizontal: 10, flexWrap: 'wrap' }}>{chips.map((c) => <Button key={c} small kind="ghost" title={c} onPress={() => send(c)} />)}</Row>
      <Row style={{ padding: 10 }}><TextInput value={text} onChangeText={setText} placeholder="Ask me anything…" placeholderTextColor={t.muted} onSubmitEditing={() => send()} style={{ flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10, color: t.fg, backgroundColor: t.surface }} /><Button small title="Send" onPress={() => send()} /></Row>
    </View>
  );
}

/* ---------------- Notifications ---------------- */
export function NotificationsScreen() {
  const { user, setUnread } = useApp(); const t = useTheme(user.role);
  const d = useLoad(() => get('/notifications'), []);
  useEffect(() => { if (d.data) setUnread(d.data.unread); }, [d.data, setUnread]);
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <Row between><H1>Notifications</H1>{d.data?.unread ? <Button small kind="soft" title="Mark all read" onPress={async () => { await post('/notifications/read-all'); setUnread(0); d.reload(); }} /> : null}</Row>
      {(d.data?.notifications || []).map((n) => <Card key={n.id} style={!n.read && { backgroundColor: t.acSoft }}><Row between><Body bold style={{ flex: 1 }}>{n.title}</Body><Muted style={{ fontSize: 11.5 }}>{ago(n.createdAt)}</Muted></Row>{n.body ? <Muted>{n.body}</Muted> : null}</Card>)}
      {d.data && !d.data.notifications.length ? <Empty text="All quiet. No notifications." /> : null}
    </Screen>
  );
}

/* ---------------- Profile ---------------- */
export function ProfileScreen({ navigation }) {
  const { user, setUser, logout, toast } = useApp(); const t = useTheme(user.role);
  const [f, setF] = useState({ name: user.name, email: user.email || '', city: user.city || '', address: user.address || '', eventDate: user.eventDate || '', partner: user.partner || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast('Allow photo access to change your picture'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (r.canceled) return;
    try { const res = await upload('/me/photo', r.assets[0].uri); setUser(res.user); toast('Photo updated'); } catch (e) { toast(e.message); }
  }
  async function save() { setBusy(true); try { const r = await patch('/me', f); setUser(r.user); toast('Profile updated'); } catch (e) { toast(e.message); } finally { setBusy(false); } }
  return (
    <Screen>
      <Row>
        <Pressable onPress={pickPhoto}>{user.photo ? <Image source={{ uri: user.photo }} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: t.ac }} /> : <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: t.ac, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.onAc, fontSize: 30 }}>{user.name[0]}</Text></View>}</Pressable>
        <View style={{ flex: 1 }}><H1 style={{ fontSize: 22 }}>{user.name}</H1><Muted>+91 {user.phone} · {user.role}</Muted><Muted style={{ fontSize: 12 }}>Tap the photo to change it</Muted></View>
      </Row>
      <Card style={{ gap: 10 }}>
        <Field label={user.role === 'vendor' ? 'Owner name' : 'Full name'} value={f.name} onChangeText={set('name')} />
        <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="City" value={f.city} onChangeText={set('city')} />
        <Field label="Address" value={f.address} onChangeText={set('address')} multiline />
        {user.role === 'customer' ? <><Field label="Event date (YYYY-MM-DD)" value={f.eventDate} onChangeText={set('eventDate')} /><Field label="Partner name" value={f.partner} onChangeText={set('partner')} /></> : null}
        <Button title="Save changes" loading={busy} onPress={save} />
      </Card>
      {user.role === 'customer' ? <Button kind="soft" title="♥ Saved vendors" onPress={() => navigation.navigate('Saved')} /> : null}
      <Button kind="soft" title="Notifications" onPress={() => navigation.navigate('Notifications')} />
      <Button kind="ghost" title="Log out" onPress={logout} />
    </Screen>
  );
}

export function SavedScreen({ navigation }) {
  const d = useLoad(() => get('/me/favs'), []);
  return (
    <Screen onRefresh={d.reload} refreshing={d.loading}>
      <H1>Saved vendors</H1>
      {(d.data?.vendors || []).map((v) => <Card key={v.id} onPress={() => navigation.navigate('Vendor', { id: v.id })}><Body bold>{v.name}</Body><Muted>{v.category} · {v.city} · ★ {v.rating}</Muted></Card>)}
      {d.data && !d.data.vendors.length ? <Empty text="No saved vendors yet. Tap ♡ Save on any vendor." /> : null}
    </Screen>
  );
}
