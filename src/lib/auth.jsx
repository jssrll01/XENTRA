import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { signOutApi } from './authApi';

const wipeCache = () => {
  try { Object.keys(localStorage).filter((k) => k.indexOf('xentra-cache:') === 0).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* storage blocked */ }
};

const Ctx = createContext({ session: undefined, user: null, signOut: () => {} });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  const value = { session, user: session ? session.user : null, signOut: async () => { wipeCache(); return signOutApi(); } };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
