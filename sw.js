// ============================================
// Service Worker - Keicy Barbería
// VERSIÓN OPTIMIZADA - Carga ultra rápida
// ============================================

const CACHE_NAME = 'keicy-barber-club-v37';
const STATIC_CACHE = 'keicy-barber-club-static-v37';
const API_CACHE = 'keicy-barber-club-api-v37';
const OFFLINE_PAGE = '/offline.html';

// Assets críticos para pre-cachear (carga instantánea)
const PRECACHE_ASSETS = [
  // CSS críticos
  '/assets/design-system.css',
  '/assets/mobile-admin.css',
  '/assets/mobile-admin-premium.css',
  '/assets/barbero-nav.css',
  '/assets/barbero-white.css',
  '/assets/dn-modals.css',
  // JS críticos
  '/assets/supabase-client.js?v=20261014e',
  '/assets/theme-manager.js',
  '/assets/mobile-nav.js',
  '/assets/sidebar-toggle.js',
  '/assets/dn-modals.js',
  '/assets/splash-screen.js',
  '/assets/turbo-loader.js',
  '/assets/offline-manager.js',
  // Imágenes críticas
  '/assets/apple-touch-icon-v3.png',
  '/assets/icon-192-v3.png',
  '/assets/icon-512-v3.png',
  '/assets/favicon-32-v3.png',
  '/assets/logo-transparent.png',
  '/assets/logo-oro.png',
  // Páginas principales (shell)
  '/admin/dashboard.html',
  '/admin/calendario.html',
  '/admin/clientes.html',
  '/admin/caja.html',
  '/admin/configuracion.html',
  '/barbero/home.html',
  '/barbero/historial.html',
  '/barbero/perfil.html',
  '/reservar/index.html',
  '/cliente/home.html',
  '/cliente/login.html',
  '/admin_sede/dashboard.html',
  '/recepcion/dashboard.html',
  '/index.html',
  '/auth.html',
  '/offline.html',
  // CDN externos críticos
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Instalación - Pre-cachear assets críticos
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando:', CACHE_NAME);
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-cacheando assets críticos...');
      // Cachear en paralelo, ignorar errores individuales
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activación - Limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (![CACHE_NAME, STATIC_CACHE, API_CACHE].includes(cacheName)) {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => clients.claim()).then(() => {
      return clients.matchAll({ type: 'window' }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// Mensaje desde la página
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_ALL_CACHES') {
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => event.source.postMessage({ type: 'CACHES_CLEARED' }));
  }
});

// Obtener página offline
const getOfflinePage = async () => {
  const cached = await caches.match(OFFLINE_PAGE);
  if (cached) return cached;
  return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/html' } });
};

// Estrategias de cache
const strategies = {
  // Cache First - Para assets estáticos (ultra rápido)
  cacheFirst: async (request, cacheName = STATIC_CACHE) => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    } catch (e) {
      // Para assets, devolver respuesta vacía silenciosa
      return new Response('', { status: 503 });
    }
  },

  // Stale While Revalidate - Para HTML (rápido + actualizado)
  staleWhileRevalidate: async (request, cacheName = CACHE_NAME, isHTML = false) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(async () => {
      // Sin conexión: devolver cache o página offline
      if (cached) return cached;
      if (isHTML) return getOfflinePage();
      return new Response('', { status: 503 });
    });

    return cached || fetchPromise;
  },

  // Network First - Para datos dinámicos
  networkFirst: async (request, cacheName = CACHE_NAME, timeout = 3000, isHTML = false) => {
    const cache = await caches.open(cacheName);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(request, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (e) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (isHTML) return getOfflinePage();
      return new Response('', { status: 503 });
    }
  }
};

// Fetch handler optimizado
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const path = url.pathname;

  // CDN externos - Cache First (muy rápido)
  if (url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(strategies.cacheFirst(event.request));
    return;
  }

  // Solo manejar requests de nuestro origen
  if (url.origin !== self.location.origin) return;

  // Assets estáticos - Cache First (instantáneo)
  if (path.startsWith('/assets/') ||
      path.endsWith('.css') ||
      path.endsWith('.js') ||
      path.endsWith('.png') ||
      path.endsWith('.jpg') ||
      path.endsWith('.svg') ||
      path.endsWith('.woff2') ||
      path.endsWith('.woff')) {
    event.respondWith(strategies.cacheFirst(event.request));
    return;
  }

  // HTML - Stale While Revalidate (rápido + actualizado)
  if (path.endsWith('.html') || path === '/' || !path.includes('.')) {
    event.respondWith(strategies.staleWhileRevalidate(event.request, CACHE_NAME, true));
    return;
  }

  // Todo lo demás - Network First con fallback
  event.respondWith(strategies.networkFirst(event.request, CACHE_NAME, 3000, false));
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Keicy Barber', body: 'Nueva notificación' };
  if (event.data) {
    try { data = event.data.json(); }
    catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Keicy Barber', {
      body: data.body || 'Nueva notificación',
      icon: '/assets/apple-touch-icon-v3.png',
      badge: '/assets/favicon-32-v3.png',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: data
    })
  );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/';
  if (data.solicitudId) url = '/admin/dashboard.html';
  else if (data.citaId) url = '/admin/calendario.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
