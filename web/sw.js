// Service worker: notificaciones push + caché básico del "cascarón" de la app.
const CACHE = 'mgm-v21';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'mgmx.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'img/mark-green.png', 'img/logo-white.png', 'img/skyline.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;            // datos de Supabase siempre en vivo
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'MGM Control App', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './#hoy' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => { for (const w of ws) { if ('focus' in w) { w.navigate(e.notification.data.url); return w.focus(); } } return clients.openWindow(e.notification.data.url); }));
});
