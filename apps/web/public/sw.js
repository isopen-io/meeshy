/**
 * SERVICE WORKER - MEESHY PWA
 * Gère les notifications push et le cache de l'interface (App Shell)
 * Optimisé pour des chargements instantanés (UI + Données API)
 */

/// <reference lib="webworker" />

// Déclaration du contexte du service worker
// On utilise un timestamp de build pour forcer la mise à jour lors d'un nouveau déploiement Docker
const BUILD_ID = 'BUILD_20250226_143000';
const SW_VERSION = '1.2.0';
const CACHE_NAME = `meeshy-v${SW_VERSION}-${BUILD_ID}`;

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
  log('Installing version:', SW_VERSION, 'Build:', BUILD_ID);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      log('Precaching critical assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// ============================================================================
// ACTIVATION
// ============================================================================

self.addEventListener('activate', (event) => {
  log('Activating...');

  event.waitUntil(
    (async () => {
      // Nettoyer tous les anciens caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            log('Deleting old cache:', name);
            return caches.delete(name);
          })
      );

      await self.clients.claim();
      log('Activated and claimed clients');
    })()
  );
});

// ============================================================================
// STRATÉGIE DE CACHE (FETCH)
// ============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorer les requêtes Socket.IO (streaming direct)
  if (url.pathname.startsWith('/socket.io')) {
    return;
  }

  // 2. Stratégie pour les API (Données de conversation, etc.)
  // On utilise SWR pour permettre un chargement instantané de la liste des conversations
  // même si le réseau est lent. Le WebSocket synchronisera le reste.
  if (url.pathname.startsWith('/api/') || url.hostname.includes('gate.')) {
    // On ne met pas en cache les POST/PUT/DELETE
    if (request.method !== 'GET') return;

    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse || Response.error());

        // Priorité au cache pour l'instantanéité, suivi de la mise à jour réseau (SWR)
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Stratégie Stale-While-Revalidate pour l'interface (App Shell)
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

  // 4. Par défaut : Network First
  event.respondWith(
    fetch(request).catch(async () => {
      const cachedResponse = await caches.match(request);
      return cachedResponse || Response.error();
    })
  );
});

// Notifications Push et Notification Click restent inchangés
// [Logic pour Push Notifications et Messages du Client...]
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

log('Service Worker loaded (Version: ' + SW_VERSION + ')');
