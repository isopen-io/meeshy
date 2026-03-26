/**
 * SERVICE WORKER - MEESHY PWA
 * Gère le cache de l'interface et des données (App Shell + API)
 * Optimisé pour des chargements instantanés et des mises à jour garanties.
 */

/// <reference lib="webworker" />

/**
 * APP_BUILD_VERSION - Replaced at container startup by docker-entrypoint.sh
 * Falls back to timestamp if not replaced (dev mode).
 */
const APP_BUILD_VERSION = '__RUNTIME_BUILD_VERSION__' !== '__RUNTIME' + '_BUILD_VERSION__'
  ? '__RUNTIME_BUILD_VERSION__'
  : `DEV_${Date.now()}`;
const SW_VERSION = '1.3.0';
const CACHE_NAME = `meeshy-cache-${APP_BUILD_VERSION}`;

// Assets critiques pour l'App Shell (chargement instantané)
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.svg',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
];

// Log helper
function log(...args) {
  console.log(`[SW ${SW_VERSION}]`, ...args);
}

// ============================================================================
// INSTALLATION
// ============================================================================

self.addEventListener('install', (event) => {
  log('Installing version:', SW_VERSION, 'Build:', APP_BUILD_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      log('Precaching critical UI assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// ============================================================================
// ACTIVATION
// ============================================================================

self.addEventListener('activate', (event) => {
  log('Activating and cleaning old caches...');

  event.waitUntil(
    (async () => {
      // Nettoyer ABSOLUMENT TOUS les anciens caches qui ne correspondent pas au build actuel
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            log('Deleting obsolete cache:', name);
            return caches.delete(name);
          })
      );

      // Prendre le contrôle immédiat
      await self.clients.claim();
      log('Activation complete. Clients claimed.');
    })()
  );
});

// ============================================================================
// STRATÉGIE DE CACHE (FETCH)
// ============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorer le streaming WebSocket et les uploads volumineux
  if (url.pathname.startsWith('/socket.io') || request.method !== 'GET') {
    return;
  }

  // 2. Stratégie SWR pour les données API (Conversations, Profil, etc.)
  // Permet d'afficher les données instantanément tout en les mettant à jour.
  if (url.pathname.startsWith('/api/') || url.hostname.includes('gate.')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse || Response.error());

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Stratégie Stale-While-Revalidate pour l'App Shell (JS, CSS, Images)
  if (request.mode === 'navigate' || request.destination === 'style' || request.destination === 'script' || request.destination === 'font' || request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse || Response.error());

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 4. Fallback Network First
  event.respondWith(
    fetch(request).catch(async () => {
      const cachedResponse = await caches.match(request);
      return cachedResponse || Response.error();
    })
  );
});

// ============================================================================
// MESSAGES DU CLIENT
// ============================================================================

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    log('Forcing skip waiting...');
    self.skipWaiting();
  }
});

// Logic pour Push Notifications reste inchangé
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/android-chrome-192x192.png',
      badge: data.badge || '/favicon-32x32.png',
      data: data.data || {},
    }));
  } catch (e) { log('Push error', e); }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) { if (client.url === urlToOpen && 'focus' in client) return client.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
  }));
});
