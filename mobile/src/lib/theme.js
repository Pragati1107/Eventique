import { useColorScheme } from 'react-native';

const ROLE = {
  customer: { light: '#6B2D5C', lightSoft: '#F2E4EE', dark: '#D9A0CA', darkSoft: '#371F31' },
  vendor: { light: '#0D6B4E', lightSoft: '#DDF0E8', dark: '#55CFA2', darkSoft: '#13332A' },
  admin: { light: '#946A12', lightSoft: '#F7EDD5', dark: '#E6BE62', darkSoft: '#372C14' },
  none: { light: '#8B1E3F', lightSoft: '#F6E5EA', dark: '#E07A98', darkSoft: '#3A1E29' },
};

export function useTheme(role = 'none') {
  const dark = useColorScheme() === 'dark';
  const r = ROLE[role] || ROLE.none;
  return {
    dark,
    bg: dark ? '#120D10' : '#FBF7F8',
    surface: dark ? '#1C1519' : '#FFFFFF',
    glass: dark ? 'rgba(28,21,25,0.92)' : 'rgba(255,255,255,0.9)',
    fg: dark ? '#F4ECF0' : '#241820',
    muted: dark ? '#AA9AA2' : '#6F6068',
    line: dark ? '#34282F' : '#EBDFE3',
    brand: dark ? '#E07A98' : '#8B1E3F',
    gold: dark ? '#E3B861' : '#B8862B',
    ac: dark ? r.dark : r.light,
    acSoft: dark ? r.darkSoft : r.lightSoft,
    onAc: dark ? '#1A0910' : '#FFFFFF',
    ok: dark ? '#5FD39A' : '#1E7A4F', okSoft: dark ? '#173327' : '#E1F2E9',
    warn: dark ? '#F0C25A' : '#9A6A00', warnSoft: dark ? '#3A2E12' : '#FBF0D6',
    bad: dark ? '#FF8A80' : '#B3261E', badSoft: dark ? '#3E1C1A' : '#FBE4E2',
    veil: dark ? 'rgba(16,10,13,0.86)' : 'rgba(252,247,248,0.35)',
    serif: 'serif',
  };
}

export const WALL = {
  customer: require('../../assets/wall-customer.jpg'),
  vendor: require('../../assets/wall-vendor.jpg'),
  admin: require('../../assets/wall-admin.jpg'),
  none: require('../../assets/wall-customer.jpg'),
};

export function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
