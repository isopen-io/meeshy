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
//
// LA FENÊTRE DE SUPPRESSION (mesuré au gate e2e, #5095) : `deconnexion.ts`
// poste ce signal à CHAQUE registration active — plusieurs, dans un
// navigateur réel — pendant qu'un `fetch` d'actif immuable resté EN VOL
// depuis la page qu'on quitte peut encore atteindre ce gestionnaire APRÈS la
// purge. Or `caches.open(CACHE_NAME)` seul — MÊME SANS AUCUN `.put()` derrière
// — RECRÉE l'entrée dans l'index que `caches.keys()` lit : la spec du Cache
// Storage crée le cache nommé s'il n'existe pas encore, à l'OUVERTURE, pas à
// l'écriture. Garder l'écriture derrière un drapeau (comme une première
// version de ce lot le faisait) laissait donc la résurrection intacte —
// l'ouverture suffisait. La fenêtre ci-dessous fait donc BYPASSER le Cache
// Storage EN BLOC (`caches.open` compris) pendant un court délai après le
// signal : la requête part au réseau nu, jamais au cache, ce qui ferme la
// course à sa source plutôt que de la rejouer. Mesuré ~1 fois sur 3 en
// Chromium réel sans cette garde ; jamais dans le harnais simulé de ce
// fichier, qui n'a pas de fetch concurrent à rejouer.
const DUREE_DE_SUPPRESSION_MS = 3000;
let cacheSuspenduJusqua = 0;

const cacheAutorise = () => Date.now() >= cacheSuspenduJusqua;

const purgeLeNamespace = async () => {
  const noms = await caches.keys();
  const cibles = noms.filter((nom) => nom.startsWith(NAMESPACE));
  await Promise.all(cibles.map((nom) => caches.delete(nom)));
};

// LE PUSH WEB (#5391) — le travailleur de zone porte trois lots de plus, dans
// le style plat de ce fichier :
//
//   1. `push` : la passerelle n'envoie QUE par FCM (`services/gateway/src/
//      services/PushNotificationService.ts:657-672`) — le corps arrive sous
//      `charge.notification.{title,body,icon,badge}`, DÉJÀ RÉSOLU AU PRISME
//      côté serveur (loi de la bannière, § Prisme du CLAUDE.md). Ce worker ne
//      touche à AUCUN des deux : ni troncature, ni recomposition, ni
//      résolution de langue — il les sert VERBATIM. `silent: true` (les
//      révocations, `call_cancel`) ⇒ `dataOnly` ⇒ le champ `notification` est
//      ABSENT de la charge (`PushNotificationService.ts:55`) : aucune
//      bannière n'est montrée, jamais une fabriquée à partir du seul `data`.
//   2. `notificationclick` : ouvre l'ADRESSE PORTÉE PAR LA CHARGE, DANS LA
//      ZONE — jamais un lien absolu forgé, jamais un hôte étranger. La
//      cascade (`cibleDansLaZone`) est la TRADUCTION, aux adresses de la
//      zone, de celle du legacy (`buildNotificationTargetUrl`,
//      `apps/web/public/firebase-messaging-sw.js:26-50`) : `fcmOptions.link`
//      (les deux casses du fil, § 2.4 de la spécification) au format legacy
//      `/conversations/<id>?messageId=<mid>` transposé sur `adresseDuFil` /
//      `adresseDuMessage` (`lib/api/adresses-du-fil.ts`) ; sinon
//      `data.conversationId` ; sinon `data.postId` (`/post/<id>`, la seule
//      adresse de contenu social de la v3 à ce jour) ; sinon
//      `/notifications`. Toute cible ABSOLUE ou HORS ZONE retombe sur
//      `/notifications` — FAIL-CLOSED : un `link` forgé n'ouvre jamais un
//      site tiers.
//   3. La purge de déconnexion (#5095, ci-dessus) désabonne aussi le
//      NAVIGATEUR — `self.registration.pushManager` — en BEST-EFFORT, à côté
//      de la purge des caches qu'elle faisait déjà : la déconnexion retire
//      l'abonnement de CET appareil, jamais celui d'un autre.
//
// `cibleDansLaZone` ne peut PAS importer `lib/api/adresses-du-fil.ts` — ce
// fichier est du JS plat, sans module — donc elle en RÉÉCRIT la formule
// (`/chats/<id>`, `#m-<id>`) : le lien entre les deux est l'EXÉCUTION, pas un
// import — `__tests__/sw-zone.test.ts` importe les fonctions réelles et
// compare leur résultat à ce que ce worker calcule, pour CHAQUE cas.
const ADRESSE_PAR_DEFAUT = '/notifications';

const adresseDuFilLocale = (id) => '/chats/' + encodeURIComponent(id);
const ancreDuMessageLocale = (id) => '#' + encodeURIComponent('m-' + id);
const adresseDuMessageLocale = (adresse, id) => adresse + ancreDuMessageLocale(id);

// Un chemin déjà DANS LA ZONE (fourni tel quel par la charge) est servi sans
// retouche — la cascade legacy (`/conversations/<id>`) ne s'applique QU'à un
// lien qui n'en est pas un.
const estUnCheminDeZone = (chemin) =>
  chemin.startsWith('/chats/') ||
  chemin.startsWith('/chat/') ||
  chemin.startsWith('/post/') ||
  chemin === '/notifications';

const estAbsolue = (lien) => /^[a-z][a-z0-9+.-]*:\/\//i.test(lien);

const cibleDepuisLeLien = (lien) => {
  if (typeof lien !== 'string' || lien === '' || estAbsolue(lien) || !lien.startsWith('/')) return null;
  const chemin = lien.split('?')[0].split('#')[0];
  if (estUnCheminDeZone(chemin)) return lien;
  const conversation = /^\/conversations\/([^/?#]+)/.exec(lien);
  if (conversation === null) return null;
  const id = decodeURIComponent(conversation[1]);
  const messageId = new URL(lien, 'https://zone.invalide').searchParams.get('messageId');
  return messageId === null ? adresseDuFilLocale(id) : adresseDuMessageLocale(adresseDuFilLocale(id), messageId);
};

const cibleDansLaZone = (charge) => {
  const lien =
    (charge.fcmOptions && charge.fcmOptions.link) ||
    (charge.fcm_options && charge.fcm_options.link) ||
    (charge.data && charge.data.url);
  const depuisLeLien = cibleDepuisLeLien(lien);
  if (depuisLeLien !== null) return depuisLeLien;

  const conversationId = charge.data && charge.data.conversationId;
  if (typeof conversationId === 'string' && conversationId !== '') {
    const messageId = charge.data.messageId;
    return typeof messageId === 'string' && messageId !== ''
      ? adresseDuMessageLocale(adresseDuFilLocale(conversationId), messageId)
      : adresseDuFilLocale(conversationId);
  }

  const postId = charge.data && charge.data.postId;
  if (typeof postId === 'string' && postId !== '') return '/post/' + encodeURIComponent(postId);

  return ADRESSE_PAR_DEFAUT;
};

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let charge;
  try {
    charge = event.data.json();
  } catch {
    return;
  }
  // `dataOnly` (`silent: true`) : AUCUN bloc `notification` — révocations,
  // signal d'appel annulé. Aucune bannière n'est montrée à leur sujet.
  const notification = charge && charge.notification;
  if (notification === undefined || notification === null) return;

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      tag: (charge.data && charge.data.notificationId) || undefined,
      data: { cible: cibleDansLaZone(charge) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const cible = event.notification.data && event.notification.data.cible;
  event.notification.close();
  if (typeof cible !== 'string' || cible === '') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      const ouvert = liste.find((client) => {
        try {
          const url = new URL(client.url);
          return url.pathname + url.hash === cible;
        } catch {
          return false;
        }
      });
      if (ouvert) return ouvert.focus();
      return self.clients.openWindow(cible);
    }),
  );
});

const purgeLAbonnementPush = async () => {
  const gestionnaire = self.registration && self.registration.pushManager;
  if (!gestionnaire) return;
  try {
    const abonnement = await gestionnaire.getSubscription();
    if (abonnement) await abonnement.unsubscribe();
  } catch {
    // best-effort — un navigateur qui refuse laisse l'abonnement en place,
    // et le token SERVEUR reste retiré par ailleurs (§ 3.5 de la spécification).
  }
};

self.addEventListener('message', (event) => {
  const donnees = event.data;
  if (typeof donnees !== 'object' || donnees === null || donnees.type !== 'meeshy-v3:deconnexion') return;
  cacheSuspenduJusqua = Date.now() + DUREE_DE_SUPPRESSION_MS;
  if (event.waitUntil) {
    event.waitUntil(purgeLeNamespace());
    event.waitUntil(purgeLAbonnementPush());
  }
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

  // LA FENÊTRE DE SUPPRESSION (voir plus haut) : pendant les quelques secondes
  // qui suivent un signal de déconnexion, le Cache Storage est BYPASSÉ EN BLOC
  // — `caches.open()` n'est même pas appelé — pour qu'aucun fetch en vol ne
  // puisse ressusciter le cache que la purge vient de vider. La requête part
  // au réseau nu ; c'est un dégradé temporaire, jamais un défaut permanent.
  if (!cacheAutorise()) return;

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
