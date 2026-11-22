import { useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { markAllDelivered } from './api';

// One channel per signed-in user. Any change in the messaging tables fires a debounced callback.
export function useMessageEvents(onEvent, userId) {
  const cb = useRef(onEvent);
  useEffect(() => { cb.current = onEvent; });
  useEffect(() => {
    if (!userId) return undefined;
    let timer = null;
    let lastD = 0;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => { cb.current(); const n = Date.now(); if (n - lastD > 4000) { lastD = n; markAllDelivered(); } }, 250); };
    const ch = supabase.channel('msg-' + userId + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_pins' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_posts' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_join_requests' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, fire)
      .subscribe((s) => { if (s === 'SUBSCRIBED') fire(); });
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [userId]);
}
