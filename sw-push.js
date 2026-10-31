// ============================================
// Service Worker de notificaciones push - Keicy Barber Club
// Solo muestra notificaciones: no guarda nada en caché ni intercepta la red.
// Reemplaza al sw.js anterior en los dispositivos que aún lo tenían.
// ============================================

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  // Borra las cachés del service worker anterior (sw.js), que ya no se usa
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('keicy-barber-club-')).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { body: event.data ? event.data.text() : '' }; }

  const urgente = data.tipo === 'cliente_llego';
  event.waitUntil(
    self.registration.showNotification(data.title || 'Keicy Barber Club', {
      body: data.body || '',
      icon: '/assets/icon-192-v3.png',
      badge: '/assets/favicon-32-v3.png',
      tag: data.tag || data.tipo || 'dn',
      renotify: true,
      requireInteraction: urgente,
      vibrate: urgente ? [300, 120, 300, 120, 300] : [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          return c.focus().then((w) => (w && 'navigate' in w && w.url !== destino ? w.navigate(destino) : w));
        }
      }
      return clients.openWindow ? clients.openWindow(destino) : undefined;
    })
  );
});
