/**
 * SERVICE WORKER - MEESHY PWA
 * Gère le cache de l'interface (App Shell) et le repli hors ligne des données API.
 *  - App Shell  : stale-while-revalidate — chargement instantané.
 *  - Données API : RÉSEAU D'ABORD, cache en repli HORS LIGNE uniquement.
 * Les deux stratégies ne sont PAS interchangeables : voir le § 2 du listener
 * `fetch` pour la raison, qui n'est pas négociable.
 */

/// <reference lib="webworker" />

/**
 * APP_BUILD_VERSION - Replaced at container startup by docker-entrypoint.sh
 * Falls back to timestamp if not replaced (dev mode).
 */
const APP_BUILD_VERSION = '__RUNTIME_BUILD_VERSION__' !== '__RUNTIME' + '_BUILD_VERSION__'
  ? '__RUNTIME_BUILD_VERSION__'
  : `DEV_${Date.now()}`;
const SW_VERSION = '1.3.2';
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

  // 1bis. Ne pas intercepter les fichiers d'attachements (avatars,
  // images, audio, video). Ces requêtes sont cross-origin / no-cors,
  // souvent volumineuses, et un échec réseau côté SW se traduit par un
  // Response.error() qui casse le <img>. On laisse le navigateur les
  // gérer directement (cache HTTP natif + ETag du gateway).
  if (url.pathname.includes('/attachments/file/') || url.pathname.includes('/static/')) {
    return;
  }

  // 2. RÉSEAU D'ABORD, REPLI SUR LE CACHE, pour les données API
  //    (Conversations, Messages, Profil…). Ce n'est PAS du stale-while-
  //    revalidate, et le nommer ainsi serait un mensonge coûteux :
  //
  //    EN LIGNE  → la réponse rendue est TOUJOURS celle du réseau. Servir
  //      l'entrée en cache à un appelant qui a pu joindre le gateway le fige
  //      sur la réponse PRÉCÉDENTE : un Service Worker ne peut pas rafraîchir
  //      une requête DÉJÀ résolue, donc le corps frais n'arriverait qu'à la
  //      requête d'après — et ainsi de suite, indéfiniment. C'est ce que
  //      faisait `return cachedResponse || fetchPromise` : chaque
  //      rechargement rendait l'état n-1, sous une couche React Query qui
  //      demandait pourtant bien le réseau (`refetchOnMount: 'always'`).
  //
  //    HORS LIGNE → le dernier corps connu est rendu s'il existe
  //      (« Offline Graceful Degradation », principe non négociable du
  //      dépôt). Le cache n'est donc lu que sur ÉCHEC réseau, ce qui évite en
  //      prime de retarder chaque requête d'une lecture de Cache Storage.
  //
  //    LIMITE CONNUE, VOLONTAIREMENT NON RÉSOLUE ICI : ces entrées ne portent
  //    aucun en-tête `Vary`, donc le cache n'est segmenté ni par jeton ni par
  //    utilisateur. Deux comptes utilisés sur le MÊME appareil partagent
  //    l'entrée d'une même URL, et le second peut lire HORS LIGNE le corps
  //    mis en cache par le premier. Fermer ce trou demande une purge du cache
  //    API à la déconnexion — autre lot. Ne pas supposer que c'est déjà fait.
  if (url.pathname.startsWith('/api/') || url.hostname.includes('gate.')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return (await cache.match(request)) || Response.error();
        }
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

// ----------------------------------------------------------------------------
// Construction de l'URL de clic depuis le bloc `data` du push.
// Miroir de `resolveContentRoute` / `getNotificationLink`
// (apps/web/utils/notification-helpers.ts) : un Service Worker ne peut pas
// importer les helpers applicatifs, on duplique donc le mapping minimal
// postType → route. Toute évolution doit toucher les DEUX SW + le helper.
// ----------------------------------------------------------------------------

function resolveContentRouteFromPostType(postType) {
  if (postType === 'STORY') return '/story';
  if (postType === 'MOOD' || postType === 'STATUS') return '/mood';
  if (postType === 'REEL') return '/reel';
  return '/post';
}

function buildNotificationTargetUrl(data) {
  if (data.url) return data.url;
  if (data.conversationId) {
    return data.messageId
      ? '/conversations/' + data.conversationId + '?messageId=' + encodeURIComponent(data.messageId)
      : '/conversations/' + data.conversationId;
  }
  if (data.postId) {
    const route = resolveContentRouteFromPostType(data.postType);
    const parentQuery = data.commentId && data.parentCommentId
      ? '?parent=' + encodeURIComponent(data.parentCommentId)
      : '';
    const anchor = data.commentId
      ? '#comment-' + encodeURIComponent(data.commentId)
      : '';
    return route + '/' + data.postId + parentQuery + anchor;
  }
  return '/notifications';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = buildNotificationTargetUrl(event.notification.data || {});
  const urlToOpen = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) { if (client.url === urlToOpen && 'focus' in client) return client.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
  }));
});
