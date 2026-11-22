import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { getDrafts, setDraft } from './api';
import { useProfile } from './profile';

const PREFIX = 'xentra-draft-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let map = {};
let pending = {};
let timers = {};
let recent = {};
let loaded = false;
let loading = null;
let loadErr = '';
let saveErr = '';
let version = 0;
let owner = null;
let channel = null;
const subs = new Set();

const emit = () => { version += 1; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => version;
export const draftOf = (id) => map[id] || '';

async function flush(id) {
  clearTimeout(timers[id]);
  delete timers[id];
  const v = pending[id];
  if (v === undefined) return;
  if (!recent[id]) recent[id] = new Set();
  recent[id].add(v);
  setTimeout(() => { if (recent[id]) recent[id].delete(v); }, 20000);
  const r = await setDraft(id, v);
  if (r.ok) {
    if (pending[id] === v) delete pending[id];
    if (saveErr) { saveErr = ''; emit(); }
  } else if (r.error === 'Conversation not found.') {
    delete pending[id];
  } else {
    saveErr = 'Draft not saved: ' + r.error;
    emit();
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => flush(id), 5000);
  }
}

export function queueDraft(id, v) {
  const blank = !String(v || '').trim();
  const body = blank ? '' : v;
  if (blank) delete map[id]; else map[id] = body;
  pending[id] = body;
  emit();
  clearTimeout(timers[id]);
  if (blank) flush(id); else timers[id] = setTimeout(() => flush(id), 700);
}

async function migrate() {
  let keys = [];
  try { keys = Object.keys(localStorage).filter((k) => k.indexOf(PREFIX) === 0); } catch (e) { return; }
  for (const k of keys) {
    const cid = k.slice(PREFIX.length);
    let body = '';
    try { body = localStorage.getItem(k) || ''; } catch (e) { continue; }
    let drop = !UUID.test(cid) || !body.trim() || Boolean(map[cid]);
    if (!drop) {
      const r = await setDraft(cid, body);
      if (r.ok) map[cid] = body;
      drop = r.ok || r.error === 'Conversation not found.';
    }
    if (drop) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
  }
}

async function load() {
  const r = await getDrafts();
  if (!r.ok) { loadErr = 'Drafts could not load: ' + r.error; emit(); return; }
  loadErr = '';
  const next = {};
  for (const d of r.data || []) if (d.body) next[d.conversation_id] = d.body;
  for (const k of Object.keys(pending)) { if (pending[k]) next[k] = pending[k]; else delete next[k]; }
  map = next;
  loaded = true;
  emit();
  await migrate();
  emit();
}

function init(force) {
  if (loading) return loading;
  if (loaded && !force) return Promise.resolve();
  loading = load().finally(() => { loading = null; });
  return loading;
}

function onEvent(p) {
  if (p.eventType === 'DELETE') {
    const o = p.old || {};
    if (o.conversation_id && map[o.conversation_id]) { delete map[o.conversation_id]; emit(); }
    return;
  }
  const row = p.new;
  if (!row || !row.conversation_id) return;
  const cid = row.conversation_id;
  const body = row.body || '';
  if (pending[cid] !== undefined) return;
  if (recent[cid] && recent[cid].has(body)) return;
  if ((map[cid] || '') === body) return;
  if (body) map[cid] = body; else delete map[cid];
  emit();
}

function start(uid) {
  if (owner === uid) { init(false); return; }
  if (channel) { supabase.removeChannel(channel); channel = null; }
  Object.keys(timers).forEach((k) => clearTimeout(timers[k]));
  map = {}; pending = {}; timers = {}; recent = {};
  loaded = false; loadErr = ''; saveErr = ''; owner = uid;
  emit();
  channel = supabase.channel('drafts-' + uid + '-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drafts', filter: 'user_id=eq.' + uid }, onEvent)
    .subscribe((s) => { if (s === 'SUBSCRIBED') init(true); });
  init(false);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Object.keys(pending).forEach((k) => flush(k));
  });
}

export function useDrafts() {
  const { profile } = useProfile();
  const uid = profile ? profile.id : null;
  useEffect(() => { if (uid) start(uid); }, [uid]);
  const v = useSyncExternalStore(subscribe, snap);
  return { loaded, error: loadErr || saveErr, version: v };
}
