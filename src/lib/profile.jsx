import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { getMyProfile } from './api';

const Ctx = createContext(null);

const fromAuth = (u) => {
  const m = (u && u.user_metadata) || {};
  return { id: u && u.id, email: u && u.email, username: m.username || '', first_name: m.first_name || '', last_name: m.last_name || '', phone: m.phone || '', avatar_url: m.avatar_url || null };
};

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(() => fromAuth(user));
  const [notReady, setNotReady] = useState(false);

  const reload = useCallback(async () => {
    const r = await getMyProfile();
    if (r.ok && r.data) { setProfile((p) => ({ ...p, ...r.data })); setNotReady(false); } else if (r.notReady) setNotReady(true);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const value = useMemo(() => ({ profile, notReady, reload, patch: (x) => setProfile((p) => ({ ...p, ...x })) }), [profile, notReady, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useProfile = () => useContext(Ctx);
