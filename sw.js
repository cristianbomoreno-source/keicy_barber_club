// ============================================
// Service Worker - Keicy Barbería
// VERSIÓN ACTUALIZADA - Forzar limpieza de caché
// ============================================

const CACHE_NAME = 'diego-neira-v27';
const FORCE_UPDATE = true;

// Instalación - skipWaiting inmediato
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando nueva versión:', CACHE_NAME);
  // Forzar activación inmediata sin esperar
  self.skipWaiting();
});

// Activación - limpiar TODOS los caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[SW] Caches encontrados:', cacheNames);
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Eliminar TODOS los caches que no sean el actual
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Tomando control de todos los clientes');
      return clients.claim();
    }).then(() => {
      // Notificar a todos los clientes que recarguen
      return clients.matchAll({ type: 'window' }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// Mensaje desde la página para forzar actualización
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((name) => caches.delete(name)));
    }).then(() => {
      event.source.postMessage({ type: 'CACHES_CLEARED' });
    });
  }
});

// Manejar notificaciones push
self.addEventListener('push', (event) => {
  console.log('Push recibido:', event);

  let data = { title: 'Keicy Barber', body: 'Nueva notificación' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'Nueva notificación',
    icon: '/assets/apple-touch-icon-v2.png',
    badge: '/assets/favicon-32.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Keicy Barber', options)
  );
});

// Manejar click en notificación
self.addEventListener('notificationclick', (event) => {
  console.log('Notificación clickeada:', event);
  event.notification.close();

  const data = event.notification.data || {};

  // Abrir la app en la página correspondiente
  let url = '/';

  if (data.solicitudId) {
    url = '/admin/dashboard.html';
  } else if (data.citaId) {
    url = '/admin/calendario.html';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Manejar cierre de notificación
self.addEventListener('notificationclose', (event) => {
  console.log('Notificación cerrada:', event);
});

// Fetch handler - Network first, sin cache para HTML/CSS/JS
self.addEventListener('fetch', (event) => {
  // Solo manejar requests GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Para archivos de la app, siempre ir a la red primero
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clonar y guardar en cache para offline
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Si falla la red, intentar cache como fallback
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si no hay cache, devolver error de red
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
        })
    );
  }
});
