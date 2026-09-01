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
const SW_VERSION = '1.4.0';

/**
 * NAMESPACE DE CACHE — le Cache Storage est à l'échelle de l'ORIGINE, pas du
 * worker. Tout script enregistré sur `meeshy.me` y écrit et peut y supprimer,
 * y compris le worker de la zone v3 que le § 7 de la conception planifie
 * « servi à la RACINE de l'URL par nécessité de portée ». Ce préfixe est donc
 * la frontière de propriété : ce worker ne détruit QUE ce qu'il a écrit
 * (§ ACTIVATION). JUMEAU de `LEGACY_CACHE_NAMESPACE`
 * (`apps/web/utils/service-worker.ts`), qui purge les mêmes caches depuis la
 * page — gardé par `__tests__/public/sw.v3-zone.test.ts`.
 */
const CACHE_NAMESPACE = 'meeshy-cache-';
const CACHE_NAME = `${CACHE_NAMESPACE}${APP_BUILD_VERSION}`;

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
// FRONTIÈRE DE ZONE — ce worker n'a AUCUNE juridiction sur la v3
// ============================================================================
// JUMEAU CLIENT de la règle Traefik du routeur `frontend-v3`
// (`docker-compose.prod.yml`, et son homologue de `/opt/meeshy/production/`).
// Ce worker est enregistré sur `scope: '/'`, donc sur l'origine ENTIÈRE : sans
// cette liste, il aiguille `meeshy.me` en second, derrière Traefik et sans
// l'avoir déclaré. Ajouter ou retirer un `PathPrefix` étant un
// `docker compose up -d` SANS rebuild, alors que `CACHE_NAME` est indexé sur
// un horodatage posé au DÉMARRAGE du conteneur `frontend`
// (`docker-entrypoint.sh:57-60`), son cache survit à l'opération dont il
// fausse le résultat : le retour arrière du § 4.3 de la conception en devient
// inerte côté client.
//
// ORDRE, dans UN sens seulement (§ 4.4 bis, § 10.4 étape 9) : un préfixe
// ENTRE ici dans un commit ANTÉRIEUR — déployé, et activé chez les clients —
// à celui qui l'ajoute au routeur `frontend-v3` ; il n'en SORT jamais. Cette
// liste est monotone croissante, et c'est ce qui garde vrai le retour arrière
// du § 4.3 : retirer un `PathPrefix` ne demande aucune contrepartie ici (ne
// pas intercepter n'est jamais faux, seulement moins mis en cache), alors que
// l'en retirer rouvrirait le défaut le temps d'une propagation de worker.
// Gardé par `scripts/check-v3-pipeline.mjs` — invariant « le worker legacy
// s'efface devant ce que la règle réclame », posé une fois PAR DÉPLOIEMENT
// (production ET staging) et qui EXÉCUTE `belongsToV3Zone` plutôt que de la
// recopier. `__tests__/public/sw.v3-zone.test.ts` garde l'autre moitié : que
// chaque chemin réclamé échappe VRAIMENT au listener.
//
// `/l` est entré ici pour l'ÉTAPE 2 du § 4.9 (« le rôle premier, une seule
// route »), dans le commit antérieur exigé ci-dessus.
//
// LES SIX SUIVANTS SONT UN RATTRAPAGE, ET IL FAUT LE DIRE. `/` a été réclamé
// par le routeur de staging quand la vitrine v3 a basculé (2026-09-01) SANS
// entrer dans cette liste : la vitrine était donc servie aux navigateurs neufs
// et le shell du legacy, sorti du cache, aux revenants. Aucun témoin n'a
// rougi — celui qui existait ne lisait que le compose de PRODUCTION et ne
// reconnaissait que `PathPrefix(…)`, jamais `Path(…)`, qui est justement la
// forme employée pour `/`. Les cinq pages institutionnelles entrent, elles,
// dans l'ordre nominal : ici d'abord, au routeur ensuite (#4686). `/login` et
// `/signup` suivent le même ordre : la v3 les sert désormais par un
// `<form method="post">` sans JavaScript, et le shell du legacy sorti du cache
// les recouvrirait sans cela chez tout visiteur revenant. `/chats` entre au
// meme titre : la v3 y sert desormais la liste des conversations du lecteur, et
// un shell mis en cache par le worker y montrerait celles de la session
// PRECEDENTE — le pire des defauts que ce cache puisse produire.
const V3_ZONE_PREFIXES = [
  '/__v3',
  '/l',
  '/',
  '/about',
  '/contact',
  '/partners',
  '/terms',
  '/privacy',
  '/login',
  '/signup',
  '/chats',
];

function belongsToV3Zone(pathname) {
  return V3_ZONE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
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
      // Nettoyer les anciens caches DE CE WORKER — ceux du namespace, et eux
      // seuls. Un `filter((name) => name !== CACHE_NAME)` sans préfixe est une
      // purge à l'échelle de l'ORIGINE : elle détruit le cache d'un worker qui
      // n'est pas celui-ci (la zone v3, § 4.4 bis de la conception), et ce
      // troisième canal de juridiction serait resté ouvert après la garde du
      // listener `fetch`.
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_NAMESPACE) && name !== CACHE_NAME)
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

  // 0. FRONTIÈRE DE ZONE — avant TOUT autre test, méthode comprise. Ne rien
  //    intercepter, c'est laisser le navigateur parler au routeur : la règle
  //    Traefik redevient la seule autorité, dans les DEUX sens (ajout ET
  //    retrait d'un `PathPrefix`). Ce n'est pas une règle d'aiguillage parmi
  //    d'autres — c'est l'absence de juridiction, donc elle passe en premier.
  if (belongsToV3Zone(url.pathname)) {
    return;
  }

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
    // Push de CONTRÔLE `notification_revoked` (data-only) : le serveur a
    // retiré une notification, la bannière déjà affichée se ferme — et rien
    // ne s'affiche à sa place. Le bloc de contrôle voyage sous `data.data`
    // (forme FCM) ou à la racine (forme Web Push brute).
    const revocation = parseNotificationRevocation(data.data) || parseNotificationRevocation(data);
    if (revocation) {
      event.waitUntil(closeRevokedNotifications(self.registration, revocation));
      return;
    }
    event.waitUntil(self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/android-chrome-192x192.png',
      badge: data.badge || '/favicon-32x32.png',
      data: data.data || {},
    }));
  } catch (e) { log('Push error', e); }
});


// ----------------------------------------------------------------------------
// Révocation d'une bannière déjà LIVRÉE — MIROIR de
// apps/web/utils/notification-revocation.ts (`parseNotificationRevocation`,
// `selectRevokedNotifications`) : un Service Worker ne peut pas importer le
// module, la règle est recopiée à l'IDENTIQUE. Toute évolution touche les
// TROIS sites (le module, ce SW, l'autre SW).
// ----------------------------------------------------------------------------

function parseNotificationRevocation(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.type !== 'notification_revoked' || typeof data.notificationIds !== 'string') return null;
  const ids = data.notificationIds.split(',').filter((id) => id !== '');
  if (ids.length === 0) return null;
  return {
    notificationIds: ids,
    conversationIds: typeof data.conversationIds === 'string' ? data.conversationIds.split(',') : [],
  };
}

function selectRevokedNotifications(notifications, revocation) {
  const revokedIds = new Set(revocation.notificationIds);
  const revokedConversations = new Set(revocation.conversationIds.filter((id) => id !== ''));
  return notifications.filter((notification) => {
    const data = notification.data && typeof notification.data === 'object' ? notification.data : null;
    if (!data) return false;
    if (typeof data.notificationId === 'string' && data.notificationId !== '') {
      return revokedIds.has(data.notificationId);
    }
    return typeof data.conversationId === 'string' && revokedConversations.has(data.conversationId);
  });
}

function closeRevokedNotifications(registration, revocation) {
  return registration.getNotifications().then((shown) => {
    const revoked = selectRevokedNotifications(shown, revocation);
    revoked.forEach((notification) => notification.close());
    log('Revoked notifications closed:', revoked.length);
  });
}

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
