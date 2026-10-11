import { useCallback, useEffect, useState } from 'react';
import { useApp } from './store';

/** Fetch data for a screen; refetches when live events arrive (store.tick) or deps change. */
export function useLoad(fn, deps = []) {
  const { tick } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fn()); } catch (e) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load, tick]);
  return { data, setData, error, loading, reload: load };
}
