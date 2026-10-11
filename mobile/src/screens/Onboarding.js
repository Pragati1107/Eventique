import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useTheme, WALL } from '../lib/theme';
import { useApp } from '../lib/store';
import { post } from '../lib/api';
import { Button, Card, Field, Muted, Row } from '../components/ui';

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

export function LoginScreen() {
  const { login, toast } = useApp();
  const [role, setRole] = useState('customer'); const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState(''); const [name, setName] = useState(''); const [invite, setInvite] = useState('');
  const [sent, setSent] = useState(false); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [wait, setWait] = useState(0);
  const t = useTheme(role); const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const startWait = () => { setWait(30); clearInterval(timer.current); timer.current = setInterval(() => setWait((w) => { if (w <= 1) { clearInterval(timer.current); return 0; } return w - 1; }), 1000); };

  async function sendOtp(p = phone, r = role, fill, m = mode) {
    setErr(''); setBusy(true);
    try {
      const res = await post('/auth/otp', { phone: p, role: r, mode: m, name, inviteCode: invite });
      setSent(true); startWait();
      if (res.devCode) { toast(`Test OTP: ${res.devCode}`); if (fill) setCode(res.devCode); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function verify(c = code) {
    setErr(''); setBusy(true);
    try { const r = await login({ phone, role, mode, name, inviteCode: invite, code: c }); toast(r.created ? 'Account created. Welcome!' : 'Logged in'); }
    catch (e) { setErr(e.message); setCode(''); } finally { setBusy(false); }
  }
  const useDemo = (r) => { setRole(r); setMode('login'); setPhone(DEMO[r]); setSent(false); setTimeout(() => sendOtp(DEMO[r], r, true, 'login'), 0); };

  return (
    <ImageBackground source={WALL[role]} style={{ flex: 1 }}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: t.veil }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Row><Image source={LOGO} style={{ width: 36, height: 36, borderRadius: 18 }} /><Text style={{ fontFamily: t.serif, fontSize: 22, color: t.brand }}>Eventique</Text></Row>
          <Text style={{ fontFamily: t.serif, fontSize: 28, color: t.fg }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
          <Muted>Log in with your mobile number. We will send a 6-digit OTP.</Muted>
          <Row style={{ backgroundColor: t.glass, borderRadius: 14, padding: 4 }}>
            {['login', 'signup'].map((m) => <Pressable key={m} onPress={() => { setMode(m); setSent(false); }} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: mode === m ? t.ac : 'transparent', alignItems: 'center' }}><Text style={{ color: mode === m ? t.onAc : t.muted, fontWeight: '700' }}>{m === 'login' ? 'Login' : 'Sign up'}</Text></Pressable>)}
          </Row>
          <Row>{ROLES.map(([k, l, s]) => <Pressable key={k} onPress={() => { setRole(k); setSent(false); }} style={{ flex: 1, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: role === k ? t.ac : t.line, backgroundColor: role === k ? t.acSoft : t.glass, alignItems: 'center' }}><Text style={{ fontWeight: '700', color: role === k ? t.ac : t.fg }}>{l}</Text><Text style={{ fontSize: 11, color: t.muted }}>{s}</Text></Pressable>)}</Row>
          {mode === 'signup' ? <Field label={role === 'vendor' ? 'Business name' : 'Full name'} value={name} onChangeText={setName} placeholder={role === 'vendor' ? 'e.g. Lumière Studios' : 'e.g. Priya Sharma'} /> : null}
          {mode === 'signup' && role === 'admin' ? <Field label="Admin invite code" value={invite} onChangeText={setInvite} autoCapitalize="characters" /> : null}
          <Field label="Mobile number (+91)" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="98765 43210" editable={!sent} />
          {sent ? (
            <View style={{ gap: 8 }}>
              <Field label={`Enter the OTP sent to +91 ${phone}`} value={code} onChangeText={(v) => { const c = v.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6) verify(c); }} keyboardType="number-pad" maxLength={6} style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }} />
              <Row between><Button small kind="soft" title="Change number" onPress={() => setSent(false)} /><Button small kind="ghost" title={wait ? `Resend in 0:${String(wait).padStart(2, '0')}` : 'Resend OTP'} disabled={!!wait} onPress={() => sendOtp()} /></Row>
            </View>
          ) : null}
          {err ? <Text style={{ color: t.bad }}>{err}</Text> : null}
          <Button title={sent ? 'Verify & continue' : 'Send OTP'} loading={busy} onPress={() => (sent ? verify() : sendOtp())} />
          <Card style={{ borderStyle: 'dashed', borderColor: t.gold }}>
            <Row between><Text style={{ fontWeight: '700', color: t.fg }}>Demo accounts</Text><Muted>OTP: 123456</Muted></Row>
            {ROLES.map(([k, l]) => <Row key={k} between><Text style={{ color: t.fg }}><Text style={{ fontWeight: '700' }}>{l}</Text> · +91 {DEMO[k]}</Text><Button small kind="soft" title="Use" onPress={() => useDemo(k)} /></Row>)}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}
