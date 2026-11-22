import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

// One channel per signed-in user. Any change in the messaging tables fires a debounced callback.
export function useMessageEvents(onEvent, userId) {
  const cb = useRef(onEvent);
  useEffect(() => { cb.current = onEvent; });
  useEffect(() => {
    if (!userId) return undefined;
    let timer = null;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb.current(), 250); };
    const ch = supabase.channel('msg-' + userId + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_pins' }, fire)
      .subscribe((s) => { if (s === 'SUBSCRIBED') fire(); });
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [userId]);
}
