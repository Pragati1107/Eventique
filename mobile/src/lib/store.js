import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, loadToken, setToken, connectSocket, disconnectSocket } from './api';

/* App-wide session: who is logged in, catalogue, unread notifications, live events. */
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [catalog, setCatalog] = useState({ categories: [], events: [], settings: { gst: 18, advance: 20, freeCancelHours: 72 } });
  const [unread, setUnread] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [tick, setTick] = useState(0); // bumps when live data changes so screens can refetch

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2600); }, []);

  const refreshMe = useCallback(async () => {
    const me = await get('/me'); setUser(me.user); setVendor(me.vendor); setUnread(me.unread); return me;
  }, []);

  const startLive = useCallback(() => {
    connectSocket({
      notification: (n) => { setUnread((u) => u + 1); toast(n.title); setTick((t) => t + 1); },
      booking: () => setTick((t) => t + 1),
      message: () => setTick((t) => t + 1),
    });
  }, [toast]);

  useEffect(() => {
    (async () => {
      try { setCatalog(await get('/catalog')); } catch (e) { /* server offline: screens show the error */ }
      if (await loadToken()) { try { await refreshMe(); startLive(); } catch (e) { await setToken(null); } }
      setBooting(false);
    })();
  }, [refreshMe, startLive]);

  const login = useCallback(async (payload) => {
    const r = await post('/auth/verify', payload);
    await setToken(r.token); setUser(r.user); setVendor(r.vendor);
    try { setCatalog(await get('/catalog')); } catch (e) { /* keep old */ }
    await refreshMe(); startLive();
    return r;
  }, [refreshMe, startLive]);

  const logout = useCallback(async () => { disconnectSocket(); await setToken(null); setUser(null); setVendor(null); setUnread(0); }, []);

  const value = useMemo(() => ({ booting, user, vendor, catalog, unread, setUnread, toast, toastMsg, login, logout, refreshMe, setUser, setVendor, tick, bump: () => setTick((t) => t + 1) }),
    [booting, user, vendor, catalog, unread, toast, toastMsg, login, logout, refreshMe, tick]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
