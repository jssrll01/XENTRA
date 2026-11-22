const CLOUD = 'bvw3okdf';
const PRESET = 'xmarket_user_profile';

export function thumb(url, size = 128) {
  if (!url || url.indexOf('res.cloudinary.com') === -1) return url;
  const t = 'c_fill,g_auto,w_' + Math.round(size) + ',h_' + Math.round(size) + ',f_auto,q_auto';
  return url.replace(/\/upload\/(?:[a-z]{1,3}_[^/]*\/)?/, '/upload/' + t + '/');
}

export async function uploadAvatar(file) {
  if (!file || !String(file.type).startsWith('image/')) return { ok: false, error: 'Choose an image file.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'Image must be under 5 MB.' };
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', PRESET);
    const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok || !j.secure_url) return { ok: false, error: (j.error && j.error.message) || 'Upload failed.' };
    return { ok: true, data: j.secure_url };
  } catch (e) {
    return { ok: false, error: 'Network problem. Check your connection and try again.' };
  }
}
