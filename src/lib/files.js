import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase';

export const MAX_FILE = 25 * 1024 * 1024;
const safe = (n) => String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';

export const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

export async function uploadChatFile(cid, file, onProgress) {
  const s = await supabase.auth.getSession();
  const token = s.data && s.data.session ? s.data.session.access_token : null;
  if (!token) return { ok: false, error: 'Not signed in.' };
  const path = cid + '/' + crypto.randomUUID() + '-' + safe(file.name);
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open('POST', SUPABASE_URL + '/storage/v1/object/chat-files/' + path);
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.setRequestHeader('apikey', SUPABASE_KEY);
    x.setRequestHeader('x-upsert', 'false');
    x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => resolve(x.status >= 200 && x.status < 300 ? { ok: true, path } : { ok: false, error: 'Upload failed (' + x.status + ').' });
    x.onerror = () => resolve({ ok: false, error: 'Network error. Check your connection.' });
    x.send(file);
  });
}

export async function signedUrl(path) {
  const r = await supabase.storage.from('chat-files').createSignedUrl(path, 3600);
  if (r.error || !r.data) return { ok: false, error: 'Could not load the file.' };
  return { ok: true, data: r.data.signedUrl };
}
