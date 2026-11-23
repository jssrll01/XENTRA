const V = 'xentra-v1';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then((res) => {
      if (res.ok) { const c = res.clone(); caches.open(V).then((ch) => ch.put('/index.html', c)); }
      return res;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  if (u.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => {
      if (res.ok) { const c = res.clone(); caches.open(V).then((ch) => ch.put(r, c)); }
      return res;
    })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs.some((c) => c.visibilityState === 'visible' && c.focused)) return null;
    return self.registration.showNotification(d.title || 'XENTRA', { body: d.body || '', tag: d.tag, icon: '/icon-192.png', data: { url: d.url || '/messages' } });
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs.length) { cs[0].navigate(url); return cs[0].focus(); }
    return self.clients.openWindow(url);
  }));
});
