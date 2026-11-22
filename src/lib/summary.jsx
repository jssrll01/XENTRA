import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { homeSummary } from './api';
import { useProfile } from './profile';
import { useMessageEvents } from './realtime';

const Ctx = createContext(null);

export function SummaryProvider({ children }) {
  const [summary, setSummary] = useState(null);
  const [state, setState] = useState('loading');
  const [tick, setTick] = useState(0);
  const { profile } = useProfile();

  const reload = useCallback(async () => {
    const r = await homeSummary();
    if (r.ok) { setSummary(r.data); setState('ok'); } else setState(r.notReady ? 'notready' : 'error');
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    reload();
    const vis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(reload, 60000);
    return () => { document.removeEventListener('visibilitychange', vis); clearInterval(t); };
  }, [reload]);

  useMessageEvents(reload, profile.id);
  const value = useMemo(() => ({ summary, state, reload, tick }), [summary, state, reload, tick]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSummary = () => useContext(Ctx);
