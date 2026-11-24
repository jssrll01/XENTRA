import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase';
import { removePushSubscription } from './api';
import { pushSupported, currentSub, ensureSubscribed } from './push';
import { signOutApi, signIn } from './authApi';

const P = 'xentra-acct:';
const CACHE = 'xentra-cache:';
const FLAG = 'xentra-switched';

const get = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const put = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* storage blocked */ } };
const keys = (pre) => { try { return Object.keys(localStorage).filter((k) => k.indexOf(pre) === 0); } catch (e) { return []; } };
const drop = (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };

export const listAccounts = () => keys(P).map((k) => get(k)).filter((a) => a && a.id).sort((a, b) => (a.added_at || 0) - (b.added_at || 0));

export function saveCreds(s) {
  if (!s || !s.user || !s.refresh_token) return;
  const u = s.user;
  const m = u.user_metadata || {};
  const prev = get(P + u.id) || {};
  put(P + u.id, {
    id: u.id,
    email: u.email,
    name: prev.name || [m.first_name, m.last_name].filter(Boolean).join(' ') || u.email,
    avatar_url: prev.avatar_url !== undefined ? prev.avatar_url : (m.avatar_url || null),
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    added_at: prev.added_at || Date.now(),
    expired: false,
  });
}

export function setAccountLabel(uid, name, avatar) {
  const a = get(P + uid);
  if (!a) return;
  if (a.name === (name || a.name) && a.avatar_url === (avatar || null)) return;
  put(P + uid, { ...a, name: name || a.name, avatar_url: avatar || null });
}

export const wipeCacheFor = (uid) => keys(CACHE + uid + ':').forEach(drop);
export const wipeAllCache = () => keys(CACHE).forEach(drop);
export function removeAccount(uid) { drop(P + uid); wipeCacheFor(uid); }

async function dropPush() {
  if (!pushSupported()) return { ok: true };
  let sub = null;
  try { sub = await currentSub(); } catch (e) { sub = null; }
  if (!sub) return { ok: true };
  const r = await removePushSubscription(sub.endpoint);
  return r.ok ? { ok: true } : { ok: false, error: r.error || 'Could not update notifications. Check your connection and try again.' };
}

export async function restorePush() {
  try {
    if (pushSupported() && Notification.permission === 'granted') {
      const s = await currentSub();
      if (s) await ensureSubscribed();
    }
  } catch (e) { /* offline, retried on next start */ }
}

const flagSwitch = () => { try { sessionStorage.setItem(FLAG, '1'); } catch (e) { /* storage blocked */ } };
export function restorePushAfterSwitch() {
  let f = null;
  try { f = sessionStorage.getItem(FLAG); if (f) sessionStorage.removeItem(FLAG); } catch (e) { f = null; }
  if (f) restorePush();
}

async function refresh(rt) {
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    const j = await r.json();
    if (r.ok && j.access_token && j.refresh_token) return { ok: true, s: j };
    return { ok: false, dead: r.status === 400 || r.status === 401 || r.status === 403 };
  } catch (e) {
    return { ok: false, dead: false };
  }
}

async function revoke(a) {
  const f = await refresh(a.refresh_token);
  if (!f.ok) return;
  try {
    await fetch(SUPABASE_URL + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + f.s.access_token } });
  } catch (e) { /* best effort */ }
}

const current = async () => {
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session : null;
};

export async function switchAccount(uid, opts = {}) {
  const a = get(P + uid);
  if (!a) return { ok: false, error: 'Account not found.' };
  const cur = await current();
  if (cur && cur.user.id === uid) return { ok: true };
  const f = await refresh(a.refresh_token);
  if (!f.ok) {
    if (f.dead) { put(P + uid, { ...a, expired: true }); return { ok: false, error: 'Session expired. Sign in again to ' + a.email + '.' }; }
    return { ok: false, error: 'Network problem. Check your connection and try again.' };
  }
  saveCreds(f.s);
  if (!opts.skipPush) {
    const d = await dropPush();
    if (!d.ok) return d;
  }
  if (cur) saveCreds(cur);
  const r = await supabase.auth.setSession({ access_token: f.s.access_token, refresh_token: f.s.refresh_token });
  if (r.error) { restorePush(); return { ok: false, error: 'Could not switch accounts. Try again.' }; }
  flagSwitch();
  window.location.assign('/home');
  return { ok: true };
}

export async function addAccountSignIn(email, password) {
  const d = await dropPush();
  if (!d.ok) return d;
  const r = await signIn(email, password);
  if (!r.ok) { restorePush(); return r; }
  flagSwitch();
  window.location.assign('/home');
  return { ok: true };
}

export async function signOutActive() {
  const cur = await current();
  const uid = cur ? cur.user.id : null;
  await dropPush();
  await signOutApi();
  const next = listAccounts().find((a) => a.id !== uid && !a.expired);
  if (next) { const r = await switchAccount(next.id, { skipPush: true }); if (r.ok) return r; }
  return { ok: true };
}

export async function signOutOne(uid) {
  const cur = await current();
  if (cur && cur.user.id === uid) return signOutActive();
  const a = get(P + uid);
  if (a) await revoke(a);
  removeAccount(uid);
  return { ok: true };
}

export async function signOutAll() {
  const cur = await current();
  const all = listAccounts();
  await dropPush();
  for (const a of all) {
    if (cur && a.id === cur.user.id) continue;
    await revoke(a);
  }
  await signOutApi();
  all.forEach((a) => removeAccount(a.id));
  wipeAllCache();
  return { ok: true };
}
