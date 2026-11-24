import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { saveCreds, removeAccount, signOutActive, signOutAll } from './accounts';

const Ctx = createContext({ session: undefined, user: null, signOut: () => {}, signOutAll: () => {} });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const last = useRef(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { last.current = data.session.user.id; saveCreds(data.session); }
      setSession(data.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (s && s.user) { last.current = s.user.id; saveCreds(s); }
      else if (event === 'SIGNED_OUT' && last.current) { removeAccount(last.current); last.current = null; }
      setSession(s || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const value = { session, user: session ? session.user : null, signOut: () => signOutActive(), signOutAll: () => signOutAll() };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
