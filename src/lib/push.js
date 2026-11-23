import { cfg } from './config';
import { savePushSubscription, removePushSubscription } from './api';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

const toKey = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

const sameKey = (sub, key) => {
  const k = sub.options && sub.options.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((v, i) => v === key[i]);
};

const ready = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, rej) => { setTimeout(() => rej(new Error('sw')), 8000); }),
]);

export async function currentSub() {
  const reg = await ready();
  return reg.pushManager.getSubscription();
}

export async function ensureSubscribed() {
  if (!pushSupported()) return { ok: false, error: 'This browser does not support notifications.' };
  const VAPID_PUBLIC = cfg('vapid_public_key');
  if (!VAPID_PUBLIC) return { ok: false, error: 'Notifications are not configured. The public key is missing.' };
  try {
    const reg = await ready();
    const key = toKey(VAPID_PUBLIC);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j = sub.toJSON();
    return savePushSubscription(j.endpoint, j.keys.p256dh, j.keys.auth, navigator.userAgent);
  } catch (x) {
    return { ok: false, error: 'Could not register this device for notifications.' };
  }
}

export async function enablePush() {
  if (!pushSupported()) return { ok: false, error: 'This browser does not support notifications.' };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'Notifications are not allowed yet. Tap Allow on the browser prompt.' };
  } catch (x) {
    return { ok: false, error: 'Could not ask for notification permission.' };
  }
  return ensureSubscribed();
}
