import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Typing state travels over a realtime broadcast channel only. Nothing is stored.
export function useTyping(cid, me) {
  const [typing, setTyping] = useState(false);
  const ch = useRef(null);
  const off = useRef(null);
  const sent = useRef(0);
  useEffect(() => {
    if (!cid || !me) return undefined;
    const c = supabase.channel('typing-' + cid, { config: { broadcast: { self: false } } });
    c.on('broadcast', { event: 'typing' }, (p) => {
      if (p && p.payload && p.payload.u !== me) {
        setTyping(true);
        clearTimeout(off.current);
        off.current = setTimeout(() => setTyping(false), 3000);
      }
    }).subscribe();
    ch.current = c;
    return () => { clearTimeout(off.current); supabase.removeChannel(c); ch.current = null; };
  }, [cid, me]);
  const ping = useCallback(() => {
    const now = Date.now();
    if (!ch.current || now - sent.current < 2000) return;
    sent.current = now;
    ch.current.send({ type: 'broadcast', event: 'typing', payload: { u: me } });
  }, [me]);
  return { typing, ping };
}
