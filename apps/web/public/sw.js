/**
 * SERVICE WORKER - MEESHY PWA
 * Gère les notifications push et le cache de l'interface (App Shell)
 * Optimisé pour des chargements instantanés et une faible consommation de données.
 */

/// <reference lib="webworker" />

// Déclaration du contexte du service worker
const SW_VERSION = '1.1.0';
const CACHE_NAME = `meeshy-v${SW_VERSION}`;

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
  log('Installing...');

  // Pré-cache des ressources essentielles
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      log('Precaching critical assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      log('Precaching complete');
      // On ne fait plus de skipWaiting() automatique ici pour permettre
      // à l'utilisateur de choisir quand mettre à jour via l'interface.
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
      // Nettoyer les anciens caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            log('Deleting old cache:', name);
            return caches.delete(name);
          })
      );

      // Prendre le contrôle de tous les clients immédiatement après l'activation
      await self.clients.claim();
      log('Activated and claimed clients');
    })()
  );
});

// ============================================================================
// NOTIFICATIONS PUSH
// ============================================================================

self.addEventListener('push', (event) => {
  log('Push received');

  if (!event.data) {
    log('Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    const { title, body, icon, badge, image, data: notificationData, tag, renotify, requireInteraction, vibrate, actions } = data;

    const options = {
      body: body || '',
      icon: icon || '/android-chrome-192x192.png',
      badge: badge || '/favicon-32x32.png',
      image: image,
      data: notificationData || {},
      tag: tag || notificationData?.conversationId || 'default',
      renotify: renotify !== undefined ? renotify : true,
      requireInteraction: requireInteraction || false,
      vibrate: vibrate || [200, 100, 200],
      actions: actions || [
        {
          action: 'open',
          title: 'Ouvrir',
        },
        {
          action: 'close',
          title: 'Fermer',
        },
      ],
      timestamp: Date.now(),
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    log('Error showing notification:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};

  if (action === 'close') return;

  let targetUrl = notificationData.url || (notificationData.conversationId ? `/conversations/${notificationData.conversationId}` : '/');
  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of clients) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }

      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          const focusedClient = await client.focus();
          focusedClient.postMessage({ type: 'NOTIFICATION_CLICKED', url: targetUrl });
          return focusedClient;
        }
      }

      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })()
  );
});

// ============================================================================
// MESSAGES DU CLIENT
// ============================================================================

self.addEventListener('message', (event) => {
  if (!event.data) return;

  log('Message received:', event.data.type);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Autres handlers (badge, etc)
  if (event.data.type === 'CLEAR_BADGE' && 'clearAppBadge' in navigator) {
    navigator.clearAppBadge();
  }
});

// ============================================================================
// STRATÉGIE DE CACHE (FETCH)
// ============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorer les requêtes vers l'API ou socket.io (toujours réseau)
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.hostname.includes('gate.')) {
    return;
  }

  // 2. Stratégie Stale-While-Revalidate pour l'interface et les assets
  // Permet un chargement instantané depuis le cache tout en mettant à jour en arrière-plan
  if (request.mode === 'navigate' || request.destination === 'style' || request.destination === 'script' || request.destination === 'font' || request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then((networkResponse) => {
          // Ne mettre en cache que les réponses valides
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // En cas d'échec réseau total (offline)
          return cachedResponse || Response.error();
        });

        // Retourner la version en cache immédiatement si disponible, sinon attendre le réseau
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Par défaut : Network First
  event.respondWith(
    fetch(request).catch(async () => {
      const cachedResponse = await caches.match(request);
      return cachedResponse || Response.error();
    })
  );
});

log('Service Worker loaded');
