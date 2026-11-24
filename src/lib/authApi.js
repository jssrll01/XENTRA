import { supabase } from './supabase';

const msg = (e) => {
  const m = String((e && e.message) || e || '');
  if (/invalid login/i.test(m)) return 'Incorrect email or password.';
  if (/already.*registered|already exists/i.test(m)) return 'An account with this email already exists. Try signing in.';
  if (/database error/i.test(m)) return 'This username or phone number is already in use.';
  if (/rate limit|too many|only request this after/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  if (/token.*(expired|invalid)|otp/i.test(m)) return 'That code is invalid or has expired.';
  if (/password/i.test(m) && /(short|least|weak|characters)/i.test(m)) return 'Password is too weak. Use at least 8 characters with letters and numbers.';
  if (/network|fetch/i.test(m)) return 'Network problem. Check your connection and try again.';
  return m || 'Something went wrong. Please try again.';
};

const wrap = async (fn) => {
  try {
    const { data, error } = await fn();
    if (error) return { ok: false, error: msg(error), raw: error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
};

export const normEmail = (e) => String(e || '').trim().toLowerCase();

let memDevice = null;
const deviceId = () => {
  try {
    let d = localStorage.getItem('xentra-device');
    if (!d) { d = crypto.randomUUID(); localStorage.setItem('xentra-device', d); }
    return d;
  } catch (e) {
    if (!memDevice) memDevice = crypto.randomUUID();
    return memDevice;
  }
};

const guard = async (body) => {
  try {
    const { data, error } = await supabase.functions.invoke('auth-guard', { body: { ...body, device: deviceId() } });
    if (error || !data) return { ok: false, error: 'Sign-in service is unavailable. Please try again.' };
    if (!data.ok) return { ok: false, code: data.code, error: data.error, retry_after: data.retry_after };
    if (data.session) {
      const s = await supabase.auth.setSession(data.session);
      if (s.error) return { ok: false, error: msg(s.error) };
      return { ok: true, data: s.data };
    }
    return { ok: true, data: {} };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
};


export async function signUpEmail(f) {
  const parts = f.name.trim().split(/\s+/);
  const r = await wrap(() => supabase.auth.signUp({
    email: normEmail(f.email),
    password: f.password,
    options: { data: { username: f.username.trim().toLowerCase(), first_name: parts[0], last_name: parts.slice(1).join(' '), phone: f.phone.trim() || null } },
  }));
  const u = r.ok && r.data.user;
  if (u && Array.isArray(u.identities) && u.identities.length === 0) return { ok: false, error: msg('already registered') };
  return r;
}

export const verifySignup = (email, code) => guard({ action: 'verify', type: 'signup', email: normEmail(email), code: String(code).replace(/\D/g, '') });
export const resendCode = (email) => wrap(() => supabase.auth.resend({ type: 'signup', email: normEmail(email) }));

export async function signIn(email, password) {
  const r = await guard({ action: 'signin', email: normEmail(email), password });
  
  return r;
}

export const signOutApi = () => wrap(() => supabase.auth.signOut());

export const sendResetCode = (email) => wrap(() => supabase.auth.resetPasswordForEmail(normEmail(email)));
export const verifyRecovery = (email, code) => guard({ action: 'verify', type: 'recovery', email: normEmail(email), code: String(code).replace(/\D/g, '') });
export const setNewPassword = (password) => wrap(() => supabase.auth.updateUser({ password }));
