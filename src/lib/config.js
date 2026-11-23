import { supabase } from './supabase';

const KEY = 'xentra-config';
let store = null;
let signup = null;

export const cfg = (k) => (store && store[k] !== undefined ? store[k] : undefined);

export async function loadConfig() {
  try {
    const { data, error } = await supabase.rpc('get_app_config');
    if (!error && data && data.ok && data.data) {
      store = data.data;
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage blocked */ }
      return { ok: true, stale: false };
    }
  } catch (e) { /* fall through to saved copy */ }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { store = JSON.parse(raw); return { ok: true, stale: true }; }
  } catch (e) { /* no saved copy */ }
  return { ok: false };
}

export async function loadSignupConfig() {
  try {
    const { data, error } = await supabase.rpc('get_signup_config');
    if (!error && data && data.ok && data.data && Array.isArray(data.data.allowed_email_domains)) {
      signup = data.data.allowed_email_domains;
      return true;
    }
  } catch (e) { /* not loaded */ }
  return false;
}

// true or false once loaded, null while sign-up settings are unavailable
export function emailCheck(e) {
  if (!signup) return null;
  const m = /^[^\s@]+@([^\s@]+)$/.exec(String(e || '').trim().toLowerCase());
  return Boolean(m) && signup.indexOf(m[1]) >= 0;
}
export const domainText = () => (signup ? signup.map((d) => '@' + d).join(' or ') : '');
