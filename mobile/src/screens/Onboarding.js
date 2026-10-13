import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useTheme, WALL } from '../lib/theme';
import { useApp } from '../lib/store';
import { post } from '../lib/api';
import { Body, Button, Card, Field, Muted, Row } from '../components/ui';

const EVORA = require('../../assets/evora.png');
const LOGO = require('../../assets/logo.png');

const SLIDES = [
  { t: 'Welcome to Eventique', say: "Hello, and welcome! I'm Evora, your personal guide to Eventique. In the next minute, I'll show you how simple it is to plan a wedding, or any celebration, right here." },
  { t: 'A verified vendor for every need', say: "Let's start with vendors. Photographers, caterers, decorators and mehendi artists, all verified, with genuine ratings and transparent prices." },
  { t: 'All your planning, in one place', say: 'Your checklist, budget and guest list live together. The moment you book a vendor, your checklist updates itself.' },
  { t: 'Secure booking, live tracking', say: 'Pay just a small advance, track every step live, and leave a review after the event. No hidden fees.' },
  { t: 'Built for everyone', say: "Eventique is built for customers, vendors and admins alike. So, let's begin your journey!" },
];

export function TourScreen({ navigation }) {
  const t = useTheme(); const [i, setI] = useState(0); const [typed, setTyped] = useState(0); const [voice, setVoice] = useState(true);
  const say = SLIDES[i].say;
  useEffect(() => {
    setTyped(0);
    const iv = setInterval(() => setTyped((n) => { if (n >= say.length) { clearInterval(iv); return n; } return n + 2; }), 30);
    if (voice) { Speech.stop(); Speech.speak(say, { language: 'en-IN', rate: 1, pitch: 1.05 }); }
    return () => { clearInterval(iv); };
  }, [i, voice, say]);
  useEffect(() => () => Speech.stop(), []);
  const next = () => { Speech.stop(); if (i < SLIDES.length - 1) setI(i + 1); else navigation.replace('Login'); };
  return (
    <ImageBackground source={WALL.customer} style={{ flex: 1 }}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: t.veil }} />
      <SafeAreaView style={{ flex: 1, padding: 18, gap: 14 }}>
        <Row between>
          <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>{SLIDES.map((_, k) => <View key={k} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: k <= i ? t.brand : t.line }} />)}</View>
          <Pressable onPress={() => { Speech.stop(); navigation.replace('Login'); }} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: t.brand }}><Text style={{ color: t.brand, fontWeight: '700' }}>Skip</Text></Pressable>
        </Row>
        <Text style={{ fontSize: 30, fontFamily: t.serif, color: t.fg, marginTop: 6 }}>{SLIDES[i].t}</Text>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={LOGO} style={{ width: 210, height: 210, borderRadius: 105 }} />
        </View>
        <Row style={{ alignItems: 'flex-end' }}>
          <Image source={EVORA} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: t.gold }} />
          <Card style={{ flex: 1, minHeight: 110 }}>
            <Text style={{ fontWeight: '700', color: t.fg }}>Evora <Text style={{ color: t.muted, fontWeight: '400', fontSize: 12 }}>· Eventique guide</Text></Text>
            <Text style={{ color: t.fg, fontSize: 14.5, lineHeight: 21 }}>{say.slice(0, typed)}</Text>
          </Card>
        </Row>
        <Row between>
          <Button small kind="soft" title="Back" disabled={i === 0} onPress={() => setI(Math.max(0, i - 1))} />
          <Button small kind="soft" title={voice ? 'Voice on' : 'Voice off'} onPress={() => { Speech.stop(); setVoice(!voice); }} />
          <Button small title={i === SLIDES.length - 1 ? 'Get started' : 'Next'} onPress={next} />
        </Row>
      </SafeAreaView>
    </ImageBackground>
  );
}

const ROLES = [['customer', 'Customer', 'Plan & book'], ['vendor', 'Vendor', 'Get bookings'], ['admin', 'Admin', 'Manage app']];
const DEMO = { customer: '9876543210', vendor: '9123456780', admin: '9000000001' };

const SU_CITIES = ['Lucknow', 'Kanpur', 'Prayagraj', 'Varanasi', 'Fatehpur', 'Agra', 'Delhi', 'Jaipur'];
const SU_CATS = ['Venue', 'Catering', 'Decor', 'Photography', 'Makeup', 'Mehendi', 'DJ & Music', 'Pandit', 'Cake', 'Entertainment'];
const NAME_OK = /^[A-Za-zÀ-ɏ .'-]{2,60}$/;

export function LoginScreen() {
  const { login, toast } = useApp();
  const [role, setRole] = useState('customer'); const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState(''); const [name, setName] = useState(''); const [invite, setInvite] = useState('');
  const [owner, setOwner] = useState(''); const [email, setEmail] = useState(''); const [city, setCity] = useState('Lucknow'); const [cat, setCat] = useState('Photography');
  const [agree, setAgree] = useState(false); const [adminOpen, setAdminOpen] = useState(false);
  const [sent, setSent] = useState(false); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [wait, setWait] = useState(0);
  const t = useTheme(role); const timer = useRef(null);
  const signup = mode === 'signup';
  useEffect(() => () => clearInterval(timer.current), []);
  const startWait = () => { setWait(30); clearInterval(timer.current); timer.current = setInterval(() => setWait((w) => { if (w <= 1) { clearInterval(timer.current); return 0; } return w - 1; }), 1000); };
  const switchMode = (m, r) => { setMode(m); if (r) setRole(r); setSent(false); setErr(''); if (m === 'signup' && role === 'admin' && !adminOpen) setRole('customer'); };
  const body = (m = mode, r = role, p = phone) => ({ phone: p, role: r, mode: m, name: name.trim(), inviteCode: invite, email: email.trim(), city, category: cat, ownerName: owner.trim() });

  function validate() {
    if (!/^[6-9]\d{9}$/.test(phone)) return 'Enter a valid 10-digit Indian mobile number.';
    if (!signup) return '';
    if (role === 'vendor') { if (name.trim().length < 2) return 'Enter your business name.'; if (!NAME_OK.test(owner.trim())) return 'Enter your own name, using letters only.'; }
    else if (!NAME_OK.test(name.trim())) return 'Enter your full name, using letters only.';
    if (role === 'admin' && !invite.trim()) return 'Enter the admin invite code.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Enter a valid email, or leave it empty.';
    if (!agree) return 'Please accept the Terms and Privacy Policy.';
    return '';
  }
  async function sendOtp(p = phone, r = role, fill, m = mode) {
    setErr('');
    if (!fill) { const v = validate(); if (v) { setErr(v); return; } }
    setBusy(true);
    try {
      const res = await post('/auth/otp', body(m, r, p));
      setSent(true); startWait();
      if (res.devCode) { toast(`Test OTP: ${res.devCode}`); if (fill) setCode(res.devCode); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function verify(c = code) {
    setErr(''); setBusy(true);
    try { const r = await login({ ...body(), code: c }); toast(r.created ? `Welcome to Eventique, ${r.user.name.split(' ')[0]}!${r.vendor ? ' Your profile goes live after verification.' : ''}` : 'Logged in'); }
    catch (e) { setErr(e.message); setCode(''); } finally { setBusy(false); }
  }
  const useDemo = (r) => { setRole(r); setMode('login'); setPhone(DEMO[r]); setSent(false); setTimeout(() => sendOtp(DEMO[r], r, true, 'login'), 0); };
  const roles = signup ? ROLES.filter(([k]) => k !== 'admin' || adminOpen) : ROLES;
  const errAction = /no account/i.test(err) ? ['Create an account', () => switchMode('signup')] : /already exists/i.test(err) ? ['Log in instead', () => switchMode('login')]
    : (/registered as a (customer|vendor|admin)/i.exec(err) || [])[1] ? [`Log in as ${/registered as a (\w+)/i.exec(err)[1]}`, () => switchMode('login', /registered as a (\w+)/i.exec(err)[1].toLowerCase())] : null;
  const Chips = ({ list, value, onPick }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {list.map((x) => <Pressable key={x} onPress={() => onPick(x)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, borderColor: value === x ? t.ac : t.line, backgroundColor: value === x ? t.acSoft : t.glass }}><Text style={{ color: value === x ? t.ac : t.fg, fontWeight: '600' }}>{x}</Text></Pressable>)}
    </ScrollView>
  );

  return (
    <ImageBackground source={WALL[role]} style={{ flex: 1 }}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: t.veil }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Row><Image source={LOGO} style={{ width: 36, height: 36, borderRadius: 18 }} /><Text style={{ fontFamily: t.serif, fontSize: 22, color: t.brand }}>Eventique</Text></Row>
          <Text style={{ fontFamily: t.serif, fontSize: 28, color: t.fg }}>{signup ? 'Create your account' : 'Welcome back'}</Text>
          <Muted>{signup ? 'Join Eventique in under a minute. Just your details and a mobile OTP.' : 'Log in with your mobile number. We will send a 6-digit OTP.'}</Muted>
          <Row style={{ backgroundColor: t.glass, borderRadius: 14, padding: 4 }}>
            {['login', 'signup'].map((m) => <Pressable key={m} onPress={() => switchMode(m)} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: mode === m ? t.ac : 'transparent', alignItems: 'center' }}><Text style={{ color: mode === m ? t.onAc : t.muted, fontWeight: '700' }}>{m === 'login' ? 'Log in' : 'Create account'}</Text></Pressable>)}
          </Row>
          {!(signup && sent) ? <Row>{roles.map(([k, l, s]) => <Pressable key={k} onPress={() => { setRole(k); setSent(false); setErr(''); }} style={{ flex: 1, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: role === k ? t.ac : t.line, backgroundColor: role === k ? t.acSoft : t.glass, alignItems: 'center' }}><Text style={{ fontWeight: '700', color: role === k ? t.ac : t.fg }}>{l}</Text><Muted style={{ fontSize: 11.5 }}>{signup ? { customer: 'Plan my event', vendor: 'List my services', admin: 'Manage the app' }[k] : s}</Muted></Pressable>)}</Row> : null}
          {signup && !sent && !adminOpen ? <Pressable onPress={() => setAdminOpen(true)}><Text style={{ color: t.ac, fontWeight: '600', textDecorationLine: 'underline' }}>Joining as an admin? Use an invite code</Text></Pressable> : null}
          {signup && !sent ? (
            <View style={{ gap: 12 }}>
              <Field label={role === 'vendor' ? 'Business name' : 'Full name'} value={name} onChangeText={setName} placeholder={role === 'vendor' ? 'e.g. Lumière Studios' : 'e.g. Priya Sharma'} />
              {role === 'vendor' ? <Field label="Your name" value={owner} onChangeText={setOwner} placeholder="e.g. Rahul Verma" /> : null}
              {role === 'vendor' ? <View style={{ gap: 6 }}><Muted>Service category</Muted><Chips list={SU_CATS} value={cat} onPick={setCat} /></View> : null}
              {role !== 'admin' ? <View style={{ gap: 6 }}><Muted>City</Muted><Chips list={SU_CITIES} value={city} onPick={setCity} /></View> : null}
              {role === 'admin' ? <Field label="Admin invite code" value={invite} onChangeText={setInvite} autoCapitalize="characters" /> : null}
              <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
            </View>
          ) : null}
          {signup && sent ? <Card><Row between><View style={{ flex: 1 }}><Body bold>{name}</Body><Muted>{[{ customer: 'Customer', vendor: 'Vendor', admin: 'Admin' }[role], role === 'vendor' ? cat : null, role !== 'admin' ? city : null].filter(Boolean).join(' · ')}</Muted></View><Button small kind="soft" title="Edit details" onPress={() => setSent(false)} /></Row></Card> : null}
          <Field label="Mobile number (+91)" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="98765 43210" editable={!sent} />
          {signup && !sent ? <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: agree ? t.ac : t.line, backgroundColor: agree ? t.ac : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{agree ? <Text style={{ color: t.onAc, fontWeight: '800' }}>✓</Text> : null}</View><Text style={{ flex: 1, color: t.fg }}>I agree to the Terms of Service and Privacy Policy.</Text></Pressable> : null}
          {sent ? (
            <View style={{ gap: 8 }}>
              <Field label={`Enter the OTP sent to +91 ${phone}`} value={code} onChangeText={(v) => { const c = v.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6) verify(c); }} keyboardType="number-pad" maxLength={6} style={{ letterSpacing: 8, fontSize: 20, textAlign: 'center' }} />
              <Row between><Button small kind="soft" title="Change number" onPress={() => setSent(false)} /><Button small kind="ghost" title={wait ? `Resend in 0:${String(wait).padStart(2, '0')}` : 'Resend OTP'} disabled={!!wait} onPress={() => sendOtp()} /></Row>
            </View>
          ) : null}
          {err ? <View style={{ gap: 6 }}><Text style={{ color: t.bad }}>{err}</Text>{errAction ? <Pressable onPress={errAction[1]}><Text style={{ color: t.ac, fontWeight: '700', textDecorationLine: 'underline' }}>{errAction[0]}</Text></Pressable> : null}</View> : null}
          <Button title={sent ? (signup ? 'Verify & create account' : 'Verify & log in') : (signup ? 'Continue' : 'Send OTP')} loading={busy} onPress={() => (sent ? verify() : sendOtp())} />
          <Pressable onPress={() => switchMode(signup ? 'login' : 'signup')} style={{ alignItems: 'center' }}><Text style={{ color: t.muted }}>{signup ? 'Already have an account? ' : 'New to Eventique? '}<Text style={{ color: t.ac, fontWeight: '700' }}>{signup ? 'Log in' : 'Create an account'}</Text></Text></Pressable>
          {!signup ? (
            <Card style={{ borderStyle: 'dashed', borderColor: t.gold }}>
              <Row between><Text style={{ fontWeight: '700', color: t.fg }}>Demo accounts</Text><Muted>OTP: 123456</Muted></Row>
              {ROLES.map(([k, l]) => <Row key={k} between><Text style={{ color: t.fg }}><Text style={{ fontWeight: '700' }}>{l}</Text> · +91 {DEMO[k]}</Text><Button small kind="soft" title="Use" onPress={() => useDemo(k)} /></Row>)}
            </Card>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}
