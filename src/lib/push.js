import { VAPID_PUBLIC } from './vapid';
import { savePushSubscription, removePushSubscription } from './api';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const toKey = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

export async function currentSub() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush() {
  if (!pushSupported()) return { ok: false, error: 'This browser does not support notifications.' };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'Notifications are blocked. Allow them in your browser settings.' };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) });
    const j = sub.toJSON();
    return savePushSubscription(j.endpoint, j.keys.p256dh, j.keys.auth, navigator.userAgent);
  } catch (x) {
    return { ok: false, error: 'Could not turn on notifications.' };
  }
}

export async function disablePush() {
  try {
    const sub = await currentSub();
    if (sub) {
      const ep = sub.endpoint;
      await sub.unsubscribe();
      return removePushSubscription(ep);
    }
    return { ok: true };
  } catch (x) {
    return { ok: false, error: 'Could not turn off notifications.' };
  }
}
