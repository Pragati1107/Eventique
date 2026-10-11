import React from 'react';
import { ActivityIndicator, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, WALL } from '../lib/theme';
import { useApp } from '../lib/store';

export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, footer }) {
  const { user } = useApp(); const role = user?.role || 'none'; const t = useTheme(role);
  const body = scroll
    ? <ScrollView contentContainerStyle={[padded && { padding: 16, paddingBottom: 40 }, { gap: 12 }]} refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.ac} /> : undefined} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[{ flex: 1 }, padded && { padding: 16 }]}>{children}</View>;
  return (
    <ImageBackground source={WALL[role]} style={{ flex: 1, backgroundColor: t.bg }} resizeMode="cover">
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: t.veil }} />
      <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']}>{body}{footer}</SafeAreaView>
    </ImageBackground>
  );
}

export function H1({ children, style }) { const t = useTheme(useApp().user?.role); return <Text style={[{ fontFamily: t.serif, fontSize: 26, color: t.fg }, style]}>{children}</Text>; }
export function Eyebrow({ children }) { const t = useTheme(useApp().user?.role); return <Text style={{ fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: t.muted, fontWeight: '700' }}>{children}</Text>; }
export function Muted({ children, style }) { const t = useTheme(useApp().user?.role); return <Text style={[{ color: t.muted, fontSize: 13.5 }, style]}>{children}</Text>; }
export function Body({ children, style, bold }) { const t = useTheme(useApp().user?.role); return <Text style={[{ color: t.fg, fontSize: 14.5, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>; }

export function Card({ children, style, onPress }) {
  const t = useTheme(useApp().user?.role);
  const st = [{ backgroundColor: t.glass, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, gap: 6, shadowColor: '#3c1428', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, style];
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [st, pressed && { transform: [{ scale: 0.985 }] }]}>{children}</Pressable> : <View style={st}>{children}</View>;
}

export function Button({ title, onPress, kind = 'primary', small, loading, disabled, style, icon }) {
  const t = useTheme(useApp().user?.role);
  const bg = kind === 'primary' ? t.ac : kind === 'soft' ? t.acSoft : 'transparent';
  const fg = kind === 'primary' ? t.onAc : t.ac;
  return (
    <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 14, paddingVertical: small ? 8 : 14, paddingHorizontal: small ? 12 : 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: kind === 'ghost' ? 1.5 : 0, borderColor: t.ac, opacity: disabled ? 0.45 : 1 }, pressed && { transform: [{ scale: 0.98 }] }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{icon ? icon + '  ' : ''}{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, style, ...props }) {
  const t = useTheme(useApp().user?.role);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.muted }}>{label}</Text> : null}
      <TextInput placeholderTextColor={t.muted} {...props} style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: t.fg, fontSize: 15 }, style]} />
    </View>
  );
}

export function Chip({ label, on, onPress }) {
  const t = useTheme(useApp().user?.role);
  return <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, backgroundColor: on ? t.ac : t.glass, borderWidth: 1, borderColor: on ? t.ac : t.line }}><Text style={{ color: on ? t.onAc : t.fg, fontWeight: '600', fontSize: 13 }}>{label}</Text></Pressable>;
}
export function Chips({ options, value, onChange }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{options.map((o) => <Chip key={o} label={o} on={value === o} onPress={() => onChange(o)} />)}</ScrollView>;
}

const PILL = { Confirmed: 'ok', Completed: 'ok', Approved: 'ok', Active: 'ok', Paid: 'ok', Received: 'ok', Resolved: 'ok', Attending: 'ok', Pending: 'warn', Open: 'warn', Awaiting: 'warn', AwaitingPayment: 'bad' };
export function Pill({ status, label }) {
  const t = useTheme(useApp().user?.role); const k = PILL[status] || 'bad';
  return <View style={{ backgroundColor: t[k + 'Soft'], paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, alignSelf: 'flex-start' }}><Text style={{ color: t[k], fontSize: 12, fontWeight: '700' }}>{label || (status === 'AwaitingPayment' ? 'Unpaid' : status)}</Text></View>;
}

export function Row({ children, style, between }) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, between && { justifyContent: 'space-between' }, style]}>{children}</View>; }
export function Thumb({ uri, size = 56, radius = 12 }) { return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#eee' }} />; }
export function Loading() { const t = useTheme(useApp().user?.role); return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={t.ac} size="large" /></View>; }
export function Empty({ text }) { return <View style={{ padding: 28, alignItems: 'center' }}><Muted style={{ textAlign: 'center' }}>{text}</Muted></View>; }
export function ErrorBox({ error, onRetry }) {
  const t = useTheme(useApp().user?.role);
  return <Card style={{ borderColor: t.bad }}><Body style={{ color: t.bad }}>{error}</Body>{onRetry ? <Button small kind="soft" title="Try again" onPress={onRetry} /> : null}</Card>;
}
export function Toast() {
  const { toastMsg } = useApp(); const t = useTheme();
  if (!toastMsg) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', bottom: 96, left: 0, right: 0, alignItems: 'center' }}><View style={{ backgroundColor: t.fg, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99 }}><Text style={{ color: t.bg, fontWeight: '600' }}>✓ {toastMsg}</Text></View></View>;
}
export function Meter({ pct }) { const t = useTheme(useApp().user?.role); return <View style={{ height: 6, backgroundColor: t.acSoft, borderRadius: 6, overflow: 'hidden' }}><View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', backgroundColor: t.ac }} /></View>; }
