/* global self, caches, fetch, Response, URL */
/**
 * LE TRAVAILLEUR DE ZONE (#4473) — le cache client que la frontière du § 4.4
 * bis a retiré à la zone, rendu par la zone elle-même.
 *
 * Ce fichier est du JavaScript PLAT, sans import ni export : il est compilé
 * tel quel par `scripts/build-participate.mjs` vers `.rt/sw.js`, servi par
 * `app/sw/route.ts` sous `/__v3/sw`, et EXÉCUTÉ par le harnais de
 * `__tests__/sw-zone.test.ts` (`new Function`, comme le témoin du legacy) —
 * c'est cette exécution qui prouve les invariants, pas la présence des lignes.
 *
 * QUATRE décisions, et leurs raisons :
 *
 * 1. Les PORTÉES arrivent par la query de l'URL du script
 *    (`/__v3/sw?portees=/l/,/chats,/chat/`). L'image est UNIQUE pour staging
 *    et prod alors que leurs périmètres diffèrent : la liste ne peut pas être
 *    cuite ici. Elle vient de l'environnement du conteneur
 *    (`V3_SW_PORTEES`, posée dans le compose À CÔTÉ des labels Traefik —
 *    #4472), traverse le document, et un changement de portées change l'URL,
 *    donc DÉCLENCHE l'update du worker. Sans query : worker INERTE. `/` est
 *    REFUSÉE — l'étape 7 du § 4.9 n'est pas franchie, et un `/` qui se
 *    glisserait dans l'env ne doit pas prendre l'origine en silence.
 *
 * 2. Le stale-while-revalidate ne sert que ce dont l'entrée de cache est
 *    aussi LOCALE que ce qu'elle contient : `/l/` (un document par LIEN — et
 *    la 302 qu'un humain y reçoit est `opaqueredirect`, `ok` faux, jamais
 *    mise en cache) et `/chat/` (l'espace INVITÉ où cette 302 atterrit — la
 *    place invitée vit dans le storage de CE navigateur, une entrée de cache
 *    n'y est pas moins locale). `/chats`, lui, est par COMPTE et le worker ne
 *    voit pas le cookie de session (les en-têtes de navigation ne l'exposent
 *    pas) : le mettre en cache servirait le compte précédent au suivant — le
 *    trou `Vary` du legacy, en pire. Les navigations MEMBRES passent donc au
 *    navigateur, jusqu'au lot « purge à la déconnexion ».
 *
 * 3. L'API est RÉSEAU D'ABORD, repli hors-ligne seulement — le § 2 du
 *    listener du legacy dit pourquoi et ce n'est pas recopié à l'aveugle :
 *    servir le cache à un appelant qui a pu joindre le gateway le fige
 *    indéfiniment sur la réponse n-1. La clé de cache est SEGMENTÉE par
 *    lecteur : l'empreinte FNV-1a du jeton (`Authorization` /
 *    `X-Session-Token`) entre dans la clé — jamais le jeton en clair.
 *
 * 4. Le namespace `meeshy-v3-sw-` est la moitié v3 du canal 3 du § 4.4 bis :
 *    le Cache Storage est à l'échelle de l'ORIGINE, et l'`activate` ne
 *    détruit que ce que CE worker a écrit. `__V3_SW_EMPREINTE__` est
 *    substitué par `app/sw/route.ts` avec l'empreinte du corps : un worker
 *    neuf purge les caches de l'ancien, jamais ceux du legacy ni d'un tiers.
 *
 * Pas de `skipWaiting` à l'install : décision produit du legacy (§ 4.4 bis,
 * « fenêtre de propagation »), reprise — un déploiement ne recharge personne.
 */

const NAMESPACE = 'meeshy-v3-sw-';
const CACHE_NAME = NAMESPACE + '__V3_SW_EMPREINTE__';

const PORTEES = (() => {
  const brut = new URL(self.location.href).searchParams.get('portees') || '';
  return brut
    .split(',')
    .map((portee) => portee.trim())
    .filter((portee) => portee.startsWith('/') && portee !== '/');
})();

// Une portée est SEGMENT-aware ici, même si la registration ne l'est pas
// (§ 4.4 bis : « une portée de Service Worker est une comparaison de chaîne »)
// — c'est la défense en profondeur contre `/chats` qui capturerait `/chatsfoo`.
const dansLesPortees = (pathname) =>
  PORTEES.some((portee) =>
    portee.endsWith('/')
      ? pathname.startsWith(portee)
      : pathname === portee || pathname.startsWith(portee + '/'),
  );

// FNV-1a 32 bits : une empreinte de SÉGRÉGATION, pas de sécurité — elle borne
// une entrée de cache à son lecteur, elle ne protège pas le jeton (qui ne
// quitte jamais la mémoire du worker).
const empreinteDuLecteur = (request) => {
  const jeton =
    request.headers.get('authorization') || request.headers.get('x-session-token') || '';
  let h = 0x811c9dc5;
  for (let i = 0; i < jeton.length; i += 1) {
    h ^= jeton.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

const cleSegmentee = (request) =>
  request.url + (request.url.includes('?') ? '&' : '?') + '__lecteur=' + empreinteDuLecteur(request);

self.addEventListener('install', () => {
  // Aucun précache : la zone inline tout ce que son premier pixel exige
  // (§ 8.5), et un précache de documents rejouerait la décision 2 à l'envers.
});

// LA PURGE À LA DÉCONNEXION (#5095) — le lot que la décision 2 du haut de ce
// fichier annonçait. `lib/realtime/deconnexion.ts` poste ce message à CHAQUE
// registration active du navigateur ; le travailleur purge alors SES caches
// EN BLOC, statiques compris. Une purge PARTIELLE (les seules entrées d'API)
// aurait dû réécrire `cleSegmentee` à l'envers pour retrouver les clés
// segmentées par jeton ; purger le NAMESPACE entier est la seule garantie
// simple que « plus aucune entrée d'API » après le signal — et les actifs
// immuables se re-téléchargent au prochain fetch, sans coût de fraîcheur.
// Le préfixe est celui du canal 3 (`NAMESPACE`) : jamais celui du legacy, ni
// un cache d'un tiers.
self.addEventListener('message', (event) => {
  const donnees = event.data;
  if (typeof donnees !== 'object' || donnees === null || donnees.type !== 'meeshy-v3:deconnexion') return;
  const purge = (async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((nom) => nom.startsWith(NAMESPACE)).map((nom) => caches.delete(nom)));
  })();
  if (event.waitUntil) event.waitUntil(purge);
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter((nom) => nom.startsWith(NAMESPACE) && nom !== CACHE_NAME)
          .map((nom) => caches.delete(nom)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (PORTEES.length === 0) return;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Le flux temps réel et les médias ne passent JAMAIS par ici : le premier
  // est un transport, les seconds ont le cache HTTP natif et l'ETag du
  // gateway — un échec réseau relayé par le worker casserait le <img>.
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.includes('/attachments/file/')) return;

  // Actifs immuables : le hash dans le nom EST la garantie de fraîcheur —
  // cache d'abord, le réseau ne sert qu'à la première rencontre.
  if (url.pathname.startsWith('/__v3/_next/static/') || url.pathname.startsWith('/__v3/rt/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const connue = await cache.match(request.url);
        if (connue) return connue;
        const reponse = await fetch(request);
        if (reponse.ok) cache.put(request.url, reponse.clone());
        return reponse;
      }),
    );
    return;
  }

  // Données API : réseau d'abord, repli hors ligne SEULEMENT, clé par lecteur.
  if (url.pathname.startsWith('/api/') || url.hostname.startsWith('gate.')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cle = cleSegmentee(request);
        try {
          const reponse = await fetch(request);
          if (reponse.ok) cache.put(cle, reponse.clone());
          return reponse;
        } catch {
          return (await cache.match(cle)) || Response.error();
        }
      }),
    );
    return;
  }

  // Navigations : la lecture dont le cache est local à ce navigateur
  // (décision 2) — le lien partagé, et l'espace invité où sa 302 atterrit.
  if (request.mode === 'navigate') {
    if (!dansLesPortees(url.pathname)) return;
    if (!url.pathname.startsWith('/l/') && !url.pathname.startsWith('/chat/')) return;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const connue = await cache.match(request.url);
        const revalidation = fetch(request)
          .then((reponse) => {
            if (reponse.ok) cache.put(request.url, reponse.clone());
            return reponse;
          })
          .catch(() => connue || Response.error());
        return connue || revalidation;
      }),
    );
  }
});
