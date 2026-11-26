// Service worker: notificaciones push + caché básico del "cascarón" de la app.
const CACHE = 'mgm-v87';
const SHELL = ['./', 'index.html', 'vendor/supabase-2.119.0.js', 'manifest.webmanifest', 'icons/icon-192.png', 'img/mark-green.png', 'img/logo-white.png', 'img/skyline.svg'];
// Instalación: baja el cascarón saltando la caché del CDN de GitHub (?sw=versión), para no guardar una página vieja justo después de publicar.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => fetch(u + (u.includes('?') ? '&' : '?') + 'sw=' + CACHE, { cache: 'reload' })
    .then(r => r.ok ? c.put(u, r) : null).catch(() => null)))));
  self.skipWaiting();
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;            // datos de Supabase siempre en vivo
  // Red primero (siempre la versión nueva); si la red no responde en 6 s o falla, usa la copia guardada.
  // Solo se guardan respuestas buenas (200), para no quedarse con una página rota.
  // Se pide con el Request original y sin opciones: así Safari conserva las redirecciones de una navegación
  // (una respuesta redirigida servida por el SW deja la página en blanco). La caché del CDN la salta la app con ?v=N.
  const red = fetch(e.request).then(r => { if (r.ok && !r.redirected) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; });
  const espera = new Promise(res => setTimeout(res, 6000)).then(() => caches.match(e.request, { ignoreSearch: true }));
  e.respondWith(Promise.race([red, espera.then(c => c || red)]).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'MGM Control App', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './#hoy' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => { for (const w of ws) { if ('focus' in w) { w.navigate(e.notification.data.url); return w.focus(); } } return clients.openWindow(e.notification.data.url); }));
});
