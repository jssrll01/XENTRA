import { useSyncExternalStore } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { supabase } from './supabase';

const IDLE = { phase: 'IDLE', id: null, status: null, mine: false, peer: '', avatar: null, muted: false, live: false, reconnecting: false, since: null, notice: null };
let st = IDLE;
let room = null;
let els = [];
let poll = null;
let nt = null;
let busy = false;
let fails = 0;
const subs = new Set();

const set = (p) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useCall = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => st);

async function rpc(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { ok: false, error: error.message || 'Request failed.' };
    if (data && data.ok === false) return { ok: false, error: data.error || 'Request failed.' };
    return { ok: true, data: data && typeof data === 'object' && 'data' in data ? data.data : data };
  } catch (e) { return { ok: false, error: 'Network problem. Check your connection and try again.' }; }
}
export const callHistory = (n = 30) => rpc('list_call_history', { p_limit: n });

function teardown() {
  clearInterval(poll); poll = null; fails = 0;
  els.forEach((e) => { try { e.remove(); } catch (x) { /* gone */ } });
  els = [];
  const r = room; room = null;
  if (r) { try { r.disconnect(); } catch (x) { /* closed */ } }
}
function finish(text, ms = 3500) {
  teardown();
  clearTimeout(nt);
  set({ ...IDLE, notice: text || null });
  if (text) nt = setTimeout(() => set({ notice: null }), ms);
}
function applyPhase() {
  if (!st.id) return;
  let p;
  if (st.status === 'active') p = !st.live ? 'CONNECTING' : st.reconnecting ? 'RECONNECTING' : 'CONNECTED';
  else p = st.mine ? 'RINGING' : 'INCOMING';
  set({ phase: p, since: p === 'CONNECTED' && !st.since ? Date.now() : st.since });
}
function startPoll() { if (!poll) poll = setInterval(refresh, 3000); }

function sync(c) {
  if (!c || c.id !== st.id) return;
  const s = c.status;
  if (s === 'ringing' || s === 'active') {
    if (s === 'active' && st.phase === 'INCOMING') return;
    set({ status: s });
    applyPhase();
    return;
  }
  const t = { declined: 'Call declined', missed: st.mine ? 'No answer' : 'Missed call', cancelled: 'Call cancelled', ended: 'Call ended' };
  finish(t[s] || 'Call ended');
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    if (st.id) {
      const r = await rpc('get_call', { p_meeting: st.id });
      if (r.ok && r.data) { fails = 0; sync(r.data); }
      else if (++fails >= 3) finish('Call ended');
    } else if (st.phase === 'IDLE') {
      const l = await rpc('list_my_active_calls');
      const c = l.ok && Array.isArray(l.data) ? l.data.find((x) => x.status === 'ringing' && !x.mine) : null;
      if (c) {
        const g = await rpc('get_call', { p_meeting: c.id });
        if (g.ok && g.data && st.phase === 'IDLE') {
          clearTimeout(nt);
          set({ ...IDLE, phase: 'INCOMING', id: c.id, status: 'ringing', mine: false, peer: g.data.peer_name || 'Someone', avatar: g.data.peer_avatar || null });
          startPoll();
        }
      }
    }
  } finally { busy = false; }
}

export function startCallEvents(userId) {
  if (!userId) return () => {};
  const ch = supabase.channel('calls-' + userId + '-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_participants' }, refresh)
    .subscribe((s) => { if (s === 'SUBSCRIBED') refresh(); });
  const vis = () => { if (document.visibilityState === 'visible') refresh(); };
  document.addEventListener('visibilitychange', vis);
  return () => { document.removeEventListener('visibilitychange', vis); supabase.removeChannel(ch); };
}

async function micCheck() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { ok: false, error: 'This browser cannot make calls.' };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    return { ok: false, error: denied ? 'Microphone is blocked. Allow microphone access in your browser site settings, then try again.' : 'No microphone was found.' };
  }
}

async function connect(id) {
  const r = await supabase.functions.invoke('join-meeting', { body: { meeting_id: id } });
  if (r.error || !r.data || !r.data.token) {
    let m = 'Could not join the call.';
    try { const b = await r.error.context.json(); if (b && b.error) m = b.error; } catch (x) { /* no body */ }
    return { ok: false, error: m };
  }
  const rm = new Room();
  rm.on(RoomEvent.TrackSubscribed, (t) => {
    if (t.kind === Track.Kind.Audio) { const el = t.attach(); el.style.display = 'none'; document.body.appendChild(el); els.push(el); }
  });
  rm.on(RoomEvent.Reconnecting, () => { if (room === rm) { set({ reconnecting: true }); applyPhase(); } });
  rm.on(RoomEvent.Reconnected, () => { if (room === rm) { set({ reconnecting: false }); applyPhase(); } });
  rm.on(RoomEvent.Disconnected, () => {
    if (room !== rm || !st.id) return;
    const cid = st.id;
    rpc(st.status === 'active' ? 'end_call' : 'cancel_call', { p_meeting: cid });
    finish('Connection lost', 5000);
  });
  room = rm;
  try {
    await rm.connect(r.data.url, r.data.token);
    await rm.localParticipant.setMicrophoneEnabled(true);
  } catch (e) {
    if (room === rm) room = null;
    try { rm.disconnect(); } catch (x) { /* closed */ }
    return { ok: false, error: 'Could not connect the call. Check your connection and try again.' };
  }
  if (room !== rm) return { ok: true };
  set({ live: true, muted: false });
  applyPhase();
  return { ok: true };
}

export async function startCall(cid, name) {
  if (st.phase !== 'IDLE' || !cid) return;
  clearTimeout(nt);
  set({ ...IDLE, phase: 'INITIATING', mine: true, peer: name || '' });
  const m = await micCheck();
  if (!m.ok) { finish(m.error, 7000); return; }
  const r = await rpc('create_call', { p_conversation: cid, p_mode: 'voice' });
  if (!r.ok || !r.data) { finish(r.error, 5000); return; }
  set({ id: r.data.id, status: 'ringing', mine: true });
  applyPhase();
  startPoll();
  const c = await connect(r.data.id);
  if (!c.ok && st.id === r.data.id) { await rpc('cancel_call', { p_meeting: r.data.id }); finish(c.error, 5000); }
}

export async function acceptCall() {
  if (st.phase !== 'INCOMING') return;
  const id = st.id;
  const m = await micCheck();
  if (!m.ok) { await rpc('respond_call', { p_meeting: id, p_accept: false }); finish(m.error, 7000); return; }
  const r = await rpc('respond_call', { p_meeting: id, p_accept: true });
  if (!r.ok) { finish(r.error, 5000); return; }
  set({ status: 'active', live: false });
  applyPhase();
  const c = await connect(id);
  if (!c.ok && st.id === id) { await rpc('end_call', { p_meeting: id }); finish(c.error, 5000); }
}

export async function declineCall() {
  const id = st.id;
  if (!id) return;
  await rpc('respond_call', { p_meeting: id, p_accept: false });
  finish(null);
}
export async function cancelCall() {
  const id = st.id;
  if (!id) return;
  await rpc('cancel_call', { p_meeting: id });
  finish('Call cancelled');
}
export async function hangUp() {
  const id = st.id;
  if (!id) return;
  const r = await supabase.functions.invoke('end-meeting', { body: { meeting_id: id } });
  if (r.error) await rpc('end_call', { p_meeting: id });
  finish('Call ended');
}
export function toggleMute() {
  if (!room) return;
  const m = !st.muted;
  room.localParticipant.setMicrophoneEnabled(!m);
  set({ muted: m });
}
