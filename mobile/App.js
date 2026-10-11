import React from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppProvider, useApp } from './src/lib/store';
import { useTheme } from './src/lib/theme';
import { Toast } from './src/components/ui';
import { TourScreen, LoginScreen } from './src/screens/Onboarding';
import { HomeScreen, VendorsScreen, VendorScreen, BookScreen, BookingsScreen, BookingScreen, PlannerScreen } from './src/screens/Customer';
import { PayScreen, ChatsScreen, ChatScreen, EvoraScreen, NotificationsScreen, ProfileScreen, SavedScreen } from './src/screens/Shared';
import { VendorHomeScreen, VendorRequestsScreen, PackagesScreen, PortfolioScreen, BusinessScreen, PaymentsScreen, AdminHomeScreen, VerifyScreen, AdminBookingsScreen, UsersScreen, ComplaintsScreen, BroadcastScreen } from './src/screens/VendorAdmin';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const EVORA = require('./assets/evora.png');

const ICONS = { Home: '⌂', PlannerTab: '☑', BookingsTab: '▦', ChatsTab: '✉', ProfileTab: '☺', RequestsTab: '▤', VerifyTab: '✓', AllBookingsTab: '▦' };

function Bell({ navigation }) {
  const { unread, user } = useApp(); const t = useTheme(user?.role);
  return (
    <Pressable onPress={() => navigation.navigate('Notifications')} style={{ paddingHorizontal: 12 }} accessibilityLabel={`Notifications, ${unread} unread`}>
      <Text style={{ fontSize: 20, color: t.fg }}>🔔</Text>
      {unread ? <View style={{ position: 'absolute', right: 6, top: -4, backgroundColor: t.bad, borderRadius: 9, minWidth: 18, paddingHorizontal: 4 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>{unread}</Text></View> : null}
    </Pressable>
  );
}

function RoleTabs({ navigation }) {
  const { user } = useApp(); const t = useTheme(user.role);
  const tabs = {
    customer: [['Home', HomeScreen, 'Home'], ['PlannerTab', PlannerScreen, 'Planner'], ['BookingsTab', BookingsScreen, 'Bookings'], ['ChatsTab', ChatsScreen, 'Messages'], ['ProfileTab', ProfileScreen, 'Profile']],
    vendor: [['Home', VendorHomeScreen, 'Home'], ['RequestsTab', VendorRequestsScreen, 'Requests'], ['ChatsTab', ChatsScreen, 'Messages'], ['ProfileTab', ProfileScreen, 'Profile']],
    admin: [['Home', AdminHomeScreen, 'Overview'], ['VerifyTab', VerifyScreen, 'Verify'], ['AllBookingsTab', AdminBookingsScreen, 'Bookings'], ['ProfileTab', ProfileScreen, 'Profile']],
  }[user.role];
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerTitle: () => <Text style={{ fontFamily: 'serif', fontSize: 20, color: t.brand }}>Eventique</Text>,
      headerRight: () => <Bell navigation={navigation} />,
      headerStyle: { backgroundColor: t.surface }, tabBarActiveTintColor: t.ac, tabBarInactiveTintColor: t.muted, tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
      tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{ICONS[route.name] || '•'}</Text>,
    })}>
      {tabs.map(([name, C, label]) => <Tab.Screen key={name} name={name} component={C} options={{ title: label }} />)}
    </Tab.Navigator>
  );
}

function EvoraButton({ navigation }) {
  return (
    <Pressable onPress={() => navigation.navigate('Evora')} accessibilityLabel="Open Evora assistant" style={{ position: 'absolute', right: 16, bottom: 90, width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: '#D4A440', overflow: 'hidden', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8 }}>
      <Image source={EVORA} style={{ width: '100%', height: '100%' }} />
    </Pressable>
  );
}
function TabsWithEvora(props) { return <View style={{ flex: 1 }}><RoleTabs {...props} /><EvoraButton navigation={props.navigation} /></View>; }

function Root() {
  const { booting, user } = useApp(); const t = useTheme(user?.role);
  if (booting) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator color={t.brand} size="large" /></View>;
  const navTheme = { ...(t.dark ? DarkTheme : DefaultTheme), colors: { ...(t.dark ? DarkTheme : DefaultTheme).colors, primary: t.ac, background: t.bg, card: t.surface, text: t.fg, border: t.line } };
  const head = { headerStyle: { backgroundColor: t.surface }, headerTintColor: t.fg };
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={head}>
        {!user ? <>
          <Stack.Screen name="Tour" component={TourScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        </> : <>
          <Stack.Screen name="Tabs" component={TabsWithEvora} options={{ headerShown: false }} />
          <Stack.Screen name="Vendors" component={VendorsScreen} options={({ route }) => ({ title: route.params?.title || 'Vendors' })} />
          <Stack.Screen name="Vendor" component={VendorScreen} options={{ title: 'Vendor details' }} />
          <Stack.Screen name="Book" component={BookScreen} options={{ title: 'Booking' }} />
          <Stack.Screen name="Pay" component={PayScreen} options={{ title: 'Payment' }} />
          <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Booking details' }} />
          <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params?.title || 'Chat' })} />
          <Stack.Screen name="Evora" component={EvoraScreen} options={{ title: 'Evora' }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Saved" component={SavedScreen} options={{ title: 'Saved vendors' }} />
          <Stack.Screen name="Packages" component={PackagesScreen} options={{ title: 'Packages' }} />
          <Stack.Screen name="Portfolio" component={PortfolioScreen} />
          <Stack.Screen name="Business" component={BusinessScreen} options={{ title: 'Business profile' }} />
          <Stack.Screen name="Payments" component={PaymentsScreen} />
          <Stack.Screen name="Users" component={UsersScreen} options={{ title: 'Users' }} />
          <Stack.Screen name="Complaints" component={ComplaintsScreen} />
          <Stack.Screen name="Broadcast" component={BroadcastScreen} />
        </>}
      </Stack.Navigator>
      <Toast />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="auto" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
