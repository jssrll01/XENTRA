import { useSyncExternalStore } from 'react';
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';
import { supabase } from './supabase';

const IDLE = { phase: 'IDLE', id: null, status: null, mode: 'voice', mine: false, peer: '', avatar: null, muted: false, live: false, reconnecting: false, since: null, notice: null, camOn: false, facing: 'user', localTrack: null, remoteTrack: null, remoteOff: false, quality: 'unknown', parts: [], group: false, members: [], role: null, title: '' };
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
const note = (t, ms = 4000) => { clearTimeout(nt); set({ notice: t }); nt = setTimeout(() => set({ notice: null }), ms); };

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
  if (st.group && s === 'active') {
    if (c.my_status === 'removed') { finish('You were removed from the meeting', 5000); return; }
    if (c.my_status !== 'joined') { finish('You left the meeting'); return; }
    set({ members: c.members || [], role: c.my_role || null, title: c.title || st.title, since: c.started_at ? Date.parse(c.started_at) : st.since });
  }
  if (s === 'ringing' || s === 'active') {
    if (s === 'active' && st.phase === 'INCOMING') return;
    set({ status: s });
    applyPhase();
    return;
  }
  const t = { declined: 'Call declined', missed: st.mine ? 'No answer' : 'Missed call', cancelled: 'Call cancelled', ended: st.group ? 'Meeting ended' : 'Call ended' };
  finish(t[s] || 'Call ended');
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    if (st.id) {
      const r = await rpc(st.group ? 'get_meeting' : 'get_call', { p_meeting: st.id });
      if (r.ok && r.data) { fails = 0; sync(r.data); }
      else if (++fails >= 3) finish('Call ended');
    } else if (st.phase === 'IDLE') {
      const l = await rpc('list_my_active_calls');
      const c = l.ok && Array.isArray(l.data) ? l.data.find((x) => x.status === 'ringing' && !x.mine) : null;
      if (c) {
        const g = await rpc('get_call', { p_meeting: c.id });
        if (g.ok && g.data && st.phase === 'IDLE') {
          clearTimeout(nt);
          set({ ...IDLE, phase: 'INCOMING', id: c.id, status: 'ringing', mode: g.data.mode === 'video' ? 'video' : 'voice', mine: false, peer: g.data.peer_name || 'Someone', avatar: g.data.peer_avatar || null });
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

async function mediaCheck(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { ok: false, error: 'This browser cannot make calls.' };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
    s.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    const what = video ? 'Camera or microphone' : 'Microphone';
    return { ok: false, error: denied ? what + ' is blocked. Allow access in your browser site settings, then try again.' : 'No ' + (video ? 'camera or microphone' : 'microphone') + ' was found.' };
  }
}

function snap(rm) {
  if (room !== rm) return;
  const mk = (p) => {
    const cam = p.getTrackPublication(Track.Source.Camera);
    const mic = p.getTrackPublication(Track.Source.Microphone);
    return { id: p.identity, name: p.isLocal ? 'You' : (p.name || st.peer || 'Guest'), local: p.isLocal, speaking: p.isSpeaking, micOff: !mic || mic.isMuted, track: cam && !cam.isMuted && cam.videoTrack ? cam.videoTrack : null };
  };
  set({ parts: [mk(rm.localParticipant), ...Array.from(rm.remoteParticipants.values()).map(mk)] });
}

async function connect(id) {
  const r = await supabase.functions.invoke('join-meeting', { body: { meeting_id: id } });
  if (r.error || !r.data || !r.data.token) {
    let m = 'Could not join the call.';
    try { const b = await r.error.context.json(); if (b && b.error) m = b.error; } catch (x) { /* no body */ }
    return { ok: false, error: m };
  }
  const rm = new Room();
  [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ActiveSpeakersChanged, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished].forEach((ev) => rm.on(ev, () => snap(rm)));
  rm.on(RoomEvent.TrackSubscribed, (t) => {
    if (t.kind === Track.Kind.Audio) { const el = t.attach(); el.style.display = 'none'; document.body.appendChild(el); els.push(el); }
    else if (t.kind === Track.Kind.Video) set({ remoteTrack: t, remoteOff: false });
  });
  rm.on(RoomEvent.TrackUnsubscribed, (t) => { if (t.kind === Track.Kind.Video) set({ remoteTrack: null }); });
  rm.on(RoomEvent.TrackMuted, (pub, p) => { if (pub.kind === Track.Kind.Video && p && !p.isLocal) set({ remoteOff: true }); });
  rm.on(RoomEvent.TrackUnmuted, (pub, p) => { if (pub.kind === Track.Kind.Video && p && !p.isLocal) set({ remoteOff: false }); });
  rm.on(RoomEvent.ConnectionQualityChanged, (q, p) => { if (p && p.isLocal) set({ quality: String(q) }); });
  rm.on(RoomEvent.Reconnecting, () => { if (room === rm) { set({ reconnecting: true }); applyPhase(); } });
  rm.on(RoomEvent.Reconnected, () => { if (room === rm) { set({ reconnecting: false }); applyPhase(); } });
  rm.on(RoomEvent.Disconnected, (reason) => {
    if (room !== rm || !st.id) return;
    rpc(st.group ? 'leave_meeting' : st.status === 'active' ? 'end_call' : 'cancel_call', { p_meeting: st.id });
    finish(reason === DisconnectReason.PARTICIPANT_REMOVED ? 'You were removed from the meeting' : 'Connection lost', 5000);
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
  snap(rm);
  if (st.mode === 'video') {
    try {
      const pub = await rm.localParticipant.setCameraEnabled(true);
      set({ camOn: !!pub, localTrack: pub ? pub.videoTrack : null });
    } catch (e) { note('The camera could not start. Continuing with audio only.'); }
  }
  applyPhase();
  return { ok: true };
}

export async function startCall(cid, name, mode = 'voice') {
  if (st.phase !== 'IDLE' || !cid) return;
  clearTimeout(nt);
  set({ ...IDLE, phase: 'INITIATING', mine: true, peer: name || '', mode });
  const m = await mediaCheck(mode === 'video');
  if (!m.ok) { finish(m.error, 7000); return; }
  const r = await rpc('create_call', { p_conversation: cid, p_mode: mode });
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
  const m = await mediaCheck(st.mode === 'video');
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
export async function toggleCamera() {
  if (!room || st.mode !== 'video') return;
  const on = !st.camOn;
  try {
    const pub = await room.localParticipant.setCameraEnabled(on);
    set({ camOn: on, localTrack: on && pub ? pub.videoTrack : null });
  } catch (e) { note('The camera could not be turned ' + (on ? 'on' : 'off') + '.'); }
}
export async function switchCamera() {
  const t = st.localTrack;
  if (!t || !st.camOn) return;
  const next = st.facing === 'user' ? 'environment' : 'user';
  try { await t.restartTrack({ facingMode: next }); set({ facing: next }); } catch (e) { note('This device cannot switch cameras.'); }
}
export async function listDevices() {
  const get = (k) => Room.getLocalDevices(k).catch(() => []);
  const [a, v, o] = await Promise.all([get('audioinput'), get('videoinput'), get('audiooutput')]);
  return { audioinput: a, videoinput: v, audiooutput: o };
}
export async function pickDevice(kind, id) {
  if (!room) return false;
  try { return await room.switchActiveDevice(kind, id || 'default'); } catch (e) { note('Could not switch that device.'); return false; }
}

export const meetingFor = (cid) => rpc('get_conversation_meeting', { p_conversation: cid });
async function enterMeeting(id) {
  const j = await rpc('join_meeting', { p_meeting: id });
  if (!j.ok) { finish(j.error, 5000); return; }
  set({ id, status: 'active', mine: false });
  applyPhase();
  startPoll();
  refresh();
  const c = await connect(id);
  if (!c.ok && st.id === id) { await rpc('leave_meeting', { p_meeting: id }); finish(c.error, 5000); }
}
export async function startMeeting(cid, title) {
  if (st.phase !== 'IDLE' || !cid) return;
  clearTimeout(nt);
  set({ ...IDLE, phase: 'INITIATING', group: true, mode: 'video', peer: title || 'Meeting', title: title || 'Meeting' });
  const m = await mediaCheck(false);
  if (!m.ok) { finish(m.error, 7000); return; }
  const r = await rpc('create_meeting', { p_conversation: cid, p_title: title || '', p_mode: 'video' });
  if (!r.ok || !r.data) { finish(r.error, 5000); return; }
  await enterMeeting(r.data.id);
}
export async function joinMeeting(id, title, mode) {
  if (st.phase !== 'IDLE' || !id) return;
  clearTimeout(nt);
  set({ ...IDLE, phase: 'INITIATING', group: true, mode: mode === 'voice' ? 'voice' : 'video', peer: title || 'Meeting', title: title || 'Meeting' });
  const m = await mediaCheck(false);
  if (!m.ok) { finish(m.error, 7000); return; }
  await enterMeeting(id);
}
export async function leaveMeeting() {
  const id = st.id;
  if (!id) return;
  await rpc('leave_meeting', { p_meeting: id });
  finish('You left the meeting');
}
export async function endForAll() {
  const id = st.id;
  if (!id) return;
  const r = await supabase.functions.invoke('end-meeting', { body: { meeting_id: id } });
  if (r.error) { note('Could not end the meeting. Try again.'); return; }
  finish('Meeting ended');
}
export async function removePerson(uid) {
  const id = st.id;
  if (!id || !uid) return;
  const r = await supabase.functions.invoke('remove-participant', { body: { meeting_id: id, user_id: uid } });
  if (r.error) {
    let m = 'Could not remove that person.';
    try { const b = await r.error.context.json(); if (b && b.error) m = b.error; } catch (x) { /* no body */ }
    note(m);
    return;
  }
  refresh();
}
export async function setRole(uid, role) {
  const r = await rpc('set_participant_role', { p_meeting: st.id, p_user: uid, p_role: role });
  if (!r.ok) note(r.error);
  refresh();
}
