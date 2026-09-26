/**
 * LE SERVICE WORKER REÇOIT LE PUSH, LE MONTRE, ET LE TAP ATTERRIT (#7305).
 *
 * Chargé par `importScripts` EN TÊTE du service worker généré
 * (`SERVICE_WORKER_SCRIPTS`, `vite.config.ts`), donc ses écouteurs passent
 * avant ceux de Workbox. Il n'intercepte aucune requête.
 *
 * ## CE QU'IL NE FAIT PAS, ET POURQUOI C'EST LE PLUS IMPORTANT
 *
 * **Il n'affiche QUE ce que le serveur a composé.** Le corps de la bannière
 * est descendu dans le Prisme du LECTEUR côté passerelle
 * (`NotificationService.servedBannerBody`, quatrième famille du Prisme). Ce
 * worker ne lit donc ni `translatedContent`, ni `translatedLanguage`, ni
 * `content`, ni `originalLanguage`, ni `encryptedContent` : ce sont des champs
 * de SERVICE destinés à l'extension de notification iOS. Une seconde descente
 * servirait, pour un même message, un texte différent de celui qu'iOS montre
 * — le défaut qui a coûté trois cycles à la passerelle (cycles 121→123).
 *
 * **Il ne rend AUCUNE URL venue de la charge** — ni pièce jointe, ni avatar.
 * La présence de `notificationLocKey` est une DÉCLARATION de contenu protégé
 * (éphémère, vue unique, flouté, chiffré) ; la passerelle vide déjà les champs
 * de média dans ce cas, mais une protection de contenu se mesure sur tout ce
 * que la charge TRANSPORTE, jamais sur sa seule chaîne (cycle 125 : une photo
 * à vue unique s'est affichée ENTIÈRE sur un écran verrouillé sous une
 * bannière qui disait « 👁️ 🖼️ »). L'icône de la bannière est donc un actif
 * STATIQUE de l'application, et la carte `data` qu'elle emporte est une liste
 * BLANCHE : les seules clés qui routent le tap.
 *
 * ## D-11 — JAMAIS DEUX NOTIFICATIONS POUR UN MÊME ÉVÉNEMENT
 *
 * (`decisions.md` § D-11.) Point 1 : aucune bannière SYSTÈME si un client est
 * ouvert ET visible — dans ce cas le socket porte la bannière in-app, et le
 * navigateur ne dit pas tout seul au worker si quelqu'un regarde. Point 4 :
 * déduplication par `notificationId` contre les bannières déjà affichées,
 * pour la course résiduelle entre push et socket.
 *
 * Une CORRECTION n'est pas un second événement (#7342) : elle remplace la
 * bannière de sa notification là où elle est encore affichée — voir
 * `corriger()`.
 *
 * ## LA TABLE DE DESTINATIONS EST UN JUMEAU GATÉ
 *
 * Un script classique chargé par `importScripts` ne peut importer aucun module
 * TypeScript — ni `resolveTarget` (`src/lib/notifications/target.ts`), ni
 * `href` (`src/lib/router.tsx`), ni les constantes de `lib/discover/view`. Le
 * dépôt a déjà tranché ce cas (`src/lib/sw-caches.ts` § `LEGACY_CACHE_NAMESPACE`) :
 * le jumeau est licite, la dérive ne l'est pas. `scripts/check-push-target-parity.mjs`
 * compare CE fichier à `target.ts` ET aux motifs de `route-table.tsx`.
 *
 * Ce n'est pas une précaution théorique. `public/firebase-messaging-sw.js`,
 * que ce lot supprime, portait exactement la bonne règle en commentaire
 * (« toute évolution doit toucher les DEUX SW + le helper ») et composait
 * quand même `/conversations/<id>`, `/mood` et `/reel` — trois routes sur
 * trois, dont aucune n'existe. Une règle en prose ne couvre que ce que son
 * outil exprime.
 */

/** JUMEAU des motifs de `src/routes/route-table.tsx`. */
const PUSH_ROUTE_PATTERNS = {
  thread: '/c/$conversation',
  story: '/story/$post',
  post: '/post/$post',
  discover: '/discover',
  userProfile: '/u/$username',
  progression: '/me/progression',
  settings: '/settings',
  notifications: '/notifications',
};

/** JUMEAUX de `src/lib/discover/view.ts`. */
const DISCOVER_TAB_PARAM = 'onglet';
const REQUEST_FILTER_PARAM = 'demandes';

/** JUMEAUX des tables de `src/lib/notifications/target.ts`. */
const EPHEMERAL_ENTITIES = ['STORY', 'STATUS', 'MOOD'];
const EPHEMERAL_ONLY_TYPES = [
  'story_reaction',
  'status_reaction',
  'story_new_comment',
  'friend_story_comment',
  'story_thread_reply',
  'friend_new_story',
  'friend_new_mood',
];
const REQUEST_TYPES = ['friend_request', 'contact_request'];
const PROFILE_TYPES = ['contact_joined'];
const PROGRESSION_TYPES = [
  'achievement_unlocked',
  'ACHIEVEMENT_UNLOCKED',
  'badge_earned',
  'streak_milestone',
  'level_up',
];
const SECURITY_TYPES = [
  'security_alert',
  'login_new_device',
  'SYSTEM_ALERT',
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
];
const HINTED_ROUTES = ['discover', 'progression', 'settings', 'notifications'];

/**
 * LES SEULES CLÉS QUI VOYAGENT AVEC LA BANNIÈRE. Liste BLANCHE, et non un
 * `delete` des champs sensibles : une liste noire oublie le champ ajouté
 * demain, une liste blanche le refuse par défaut.
 */
const TAP_FIELDS = [
  'notificationId',
  'type',
  'conversationId',
  'postId',
  'postType',
  'contentType',
  'friendRequestId',
  'senderUsername',
  'route',
];

/**
 * LE NOM DU MESSAGE remis à un client déjà ouvert — JUMEAU de
 * `NOTIFICATION_CLICKED_MESSAGE` (`src/lib/notifications/tap-navigation.ts`),
 * qui l'écoute et navigue. Focaliser sans naviguer laisserait le lecteur là
 * où il était : un contrôle qui ment (loi 4).
 */
const NOTIFICATION_CLICKED_MESSAGE = 'NOTIFICATION_CLICKED';

/**
 * LE CHAMP PAR LEQUEL LA PASSERELLE DÉCLARE UNE CORRECTION — JUMEAU de
 * `REPRODUCED_PUSH_FIELD` / `REPRODUCED_PUSH_VALUE`
 * (`packages/shared/types/reproduced-notification-push.ts`), que ce script
 * classique ne peut pas importer. `sw-push.test.ts` compose ses charges avec
 * les constantes PARTAGÉES : si ce jumeau dérive, ses témoins rougissent.
 */
const REPRODUCED_PUSH_FIELD = 'reproduced';
const REPRODUCED_PUSH_VALUE = 'true';

/**
 * L'ACCUSÉ DE REMISE (#7368, W4) — JUMEAU web de
 * `NSEDataSync.postDeliveryReceipt` (`apps/ios/MeeshyNotificationExtension/NSEDataSync.swift:453-466`),
 * appelé sans condition par `NotificationService.didReceive` (`NotificationService.swift:65`).
 *
 * SANS accusé, l'auteur reste bloqué sur une coche tant que ce destinataire
 * n'a pas rouvert l'application — l'auto-livraison EN LIGNE de la passerelle
 * ne part jamais pour un onglet fermé, une PWA suspendue ou une coque en
 * arrière-plan (`services/gateway/src/routes/conversations/receipts.ts:292`,
 * doc-comment de la porte iOS). C'est EXACTEMENT le symptôme du relevé
 * (#7368 § Contexte) : « ✓ jusqu'à reconnexion ».
 *
 * `DELIVERY_RECEIPT_TYPES` est le JUMEAU de
 * `NotificationPayloadHelpers.deliveryReceiptTypes`
 * (`NotificationPayloadHelpers.swift:244-247`, dérivé de `messageArrivalTypes`
 * `:224-226`) — les réactions et les événements sociaux portent un
 * `messageId` (celui du message RÉAGI, pas remis) sans être une remise ; ils
 * restent dehors.
 */
const DELIVERY_RECEIPT_TYPES = [
  'new_message', 'message_reply', 'reply', 'message_forwarded', 'user_mentioned',
  'new_conversation', 'new_conversation_direct', 'new_conversation_group',
  'added_to_conversation',
];

/**
 * JUMEAU des TROIS littéraux de `src/lib/notifications/delivery-receipt-credential.ts`
 * — nom de base, magasin, clé. `sw-push.test.ts` écrit et lit au travers du
 * MÊME double (`test-support/fake-indexed-db.ts`) que le module TS : c'est le
 * témoin qui rougirait sur toute dérive entre les deux fichiers, aucun script
 * classique ne pouvant importer l'autre (doctrine de l'en-tête de ce fichier).
 */
const CREDENTIAL_DB_NAME = 'meeshy-push';
const CREDENTIAL_DB_VERSION = 1;
const CREDENTIAL_STORE_NAME = 'credential';
const CREDENTIAL_KEY = 'current';

/**
 * Lit le crédential posé par la page — `null` si absent, IndexedDB
 * indisponible (portée privée, navigateur ancien) ou en échec : un accusé
 * manqué se rattrape à la reconnexion, EXACTEMENT le comportement PRÉCÉDENT
 * (#7368 § Contexte) — jamais une erreur qui empêcherait la bannière.
 */
function lireCredential() {
  return new Promise((resolve) => {
    if (typeof self.indexedDB === 'undefined') { resolve(null); return; }
    let requete;
    try {
      requete = self.indexedDB.open(CREDENTIAL_DB_NAME, CREDENTIAL_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(CREDENTIAL_STORE_NAME)) db.createObjectStore(CREDENTIAL_STORE_NAME);
    };
    requete.onerror = () => resolve(null);
    requete.onsuccess = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(CREDENTIAL_STORE_NAME)) {
        db.close();
        resolve(null);
        return;
      }
      try {
        const lecture = db.transaction(CREDENTIAL_STORE_NAME).objectStore(CREDENTIAL_STORE_NAME).get(CREDENTIAL_KEY);
        lecture.onsuccess = () => {
          db.close();
          resolve(lecture.result || null);
        };
        lecture.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    };
  });
}

/** JUMEAU de `credentialHeaders()` (`src/lib/api/http.ts:215-219`) — les DEUX
 * régimes, jamais mélangés : un compte enregistré parle en `Authorization`,
 * un invité de lien en `X-Session-Token`. */
function entetesCredential(credential) {
  if (!credential) return null;
  if (credential.kind === 'registered') return { Authorization: 'Bearer ' + credential.token };
  if (credential.kind === 'anonymous') return { 'X-Session-Token': credential.sessionToken };
  return null;
}

/**
 * ACCUSE LA REMISE, SI CE PUSH EN ANNONCE UNE — fire-and-forget : un échec
 * réseau ici laisse le message « envoyé » jusqu'à la reconnexion, le
 * comportement PRÉCÉDENT, jamais une régression. Route CANONIQUE
 * (`POST …/receipts`, `services/gateway/src/routes/conversations/receipts.ts:967`),
 * pas l'alias en sursis `.../delivery-receipt`
 * (`services/gateway/src/routes/message-read-status.ts:229`, `depreciee()`
 * depuis le 2026-08-30) : un code neuf n'ouvre pas une porte déjà en sursis.
 */
async function accuserRemise(data) {
  if (DELIVERY_RECEIPT_TYPES.indexOf(texte(data.type)) < 0) return;
  const conversationId = texte(data.conversationId);
  const messageId = texte(data.messageId);
  if (conversationId === '' || messageId === '') return;

  const stocke = await lireCredential();
  if (stocke === null) return;
  const entetes = entetesCredential(stocke.credential);
  if (entetes === null) return;
  const base = texte(stocke.apiBase);

  try {
    await self.fetch(base + '/api/v1/conversations/' + encodeURIComponent(conversationId) + '/receipts', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, entetes),
      body: JSON.stringify({ type: 'delivered', messageIds: [messageId] }),
      keepalive: true,
    });
  } catch {
    /* Best-effort — voir doc-comment. */
  }
}

/** L'icône de la bannière — un actif de l'application, jamais une URL de la charge. */
const BANNER_ICON = '/android-chrome-192x192.png';
const BANNER_BADGE = '/badge-72x72.png';

/** `''` vaut absence — la convention de la carte `data` du fil push. */
function texte(valeur) {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

function surfaceSociale(data) {
  const discriminant = (texte(data.postType) || texte(data.contentType)).toUpperCase();
  if (discriminant !== '') return EPHEMERAL_ENTITIES.indexOf(discriminant) >= 0 ? 'story' : 'post';
  return EPHEMERAL_ONLY_TYPES.indexOf(texte(data.type)) >= 0 ? 'story' : 'post';
}

function demandes() {
  const search = {};
  search[DISCOVER_TAB_PARAM] = 'requests';
  search[REQUEST_FILTER_PARAM] = 'received';
  return { route: 'discover', params: {}, search };
}

/** JUMEAU de `resolveTarget()` + son repli de tap (`pushTapTarget()`). */
function resolvePushTarget(data) {
  const postId = texte(data.postId);
  if (postId !== '') return { route: surfaceSociale(data), params: { post: postId }, search: {} };

  const conversationId = texte(data.conversationId);
  if (conversationId !== '') return { route: 'thread', params: { conversation: conversationId }, search: {} };

  const type = texte(data.type);
  if (texte(data.friendRequestId) !== '' || REQUEST_TYPES.indexOf(type) >= 0) return demandes();

  const pseudo = texte(data.senderUsername);
  if (PROFILE_TYPES.indexOf(type) >= 0 && pseudo !== '') return { route: 'userProfile', params: { username: pseudo }, search: {} };

  const indice = texte(data.route);
  if (HINTED_ROUTES.indexOf(indice) >= 0) {
    return indice === 'discover' ? demandes() : { route: indice, params: {}, search: {} };
  }

  if (PROGRESSION_TYPES.indexOf(type) >= 0) return { route: 'progression', params: {}, search: {} };
  if (SECURITY_TYPES.indexOf(type) >= 0) return { route: 'settings', params: {}, search: {} };
  return { route: 'notifications', params: {}, search: {} };
}

/** JUMEAU de `href()` (`src/lib/router.tsx`) — segments `$` encodés, query triée par insertion. */
function pushTargetUrl(data) {
  const cible = resolvePushTarget(data);
  const chemin = PUSH_ROUTE_PATTERNS[cible.route]
    .split('/')
    .map((segment) => {
      if (segment.charAt(0) !== '$') return segment;
      const valeur = cible.params[segment.slice(1)];
      return encodeURIComponent(typeof valeur === 'string' ? valeur : '');
    })
    .join('/');
  const query = new URLSearchParams();
  Object.keys(cible.search).forEach((nom) => query.set(nom, cible.search[nom]));
  const chaine = query.toString();
  return chaine === '' ? chemin : chemin + '?' + chaine;
}

function charge(evenement) {
  if (!evenement || !evenement.data) return null;
  try {
    const lu = evenement.data.json();
    return lu !== null && typeof lu === 'object' ? lu : null;
  } catch {
    /* Une charge illisible n'est pas une notification : ne rien montrer plutôt
       que de montrer un libellé inventé. */
    return null;
  }
}

function objet(valeur) {
  return valeur !== null && typeof valeur === 'object' ? valeur : {};
}

function poserBadge(data) {
  const brut = texte(data.unreadCount);
  if (brut === '') return;
  const compte = Number(brut);
  if (!Number.isFinite(compte) || compte < 0) return;
  const nav = self.navigator;
  if (!nav || typeof nav.setAppBadge !== 'function') return;
  try {
    /* Le badge n'est pas une bannière : il vaut même quand D-11 retient
       l'affichage, sans quoi le compteur de l'application installée resterait
       en retard sur ce que le lecteur a déjà reçu. */
    void nav.setAppBadge(compte);
  } catch {
    /* Permission retirée, API absente sous cette portée : rien à faire. */
  }
}

async function fenetres() {
  try {
    return await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  } catch {
    return [];
  }
}

/** La bannière encore affichée de cette notification, ou `null`. */
async function banniereAffichee(notificationId) {
  if (notificationId === '') return null;
  try {
    const affichees = await self.registration.getNotifications();
    return (
      affichees.find((affichee) => affichee && texte(objet(affichee.data).notificationId) === notificationId) || null
    );
  } catch {
    return null;
  }
}

/**
 * LE SON ET L'EMPILEMENT SONT CEUX QUE LE LECTEUR A CHOISIS (#7308).
 *
 * La passerelle les calcule au chokepoint de ses préférences et les pose dans
 * le bloc `notification` : `silent` pour `soundEnabled:false`, `tag` pour
 * l'empilement par conversation — et AUCUN `tag` quand il a choisi
 * `groupNotifications:false`. Le repli est donc l'identifiant de la
 * notification, jamais `conversationId` : ce repli-là empilerait quand même.
 *
 * Une bannière qui REMPLACE une autre de même tag n'alerte qu'avec
 * `renotify` ; sans lui, chaque message après le premier d'une conversation
 * arriverait sans son ni annonce. Il accompagne aussi une bannière muette :
 * `silent` retire le son et la vibration, pas l'annonce. `showNotification`
 * lève un TypeError sur `renotify` sans tag et sur `silent` avec `vibrate` —
 * `renotify` ne part qu'avec un tag, et ce worker ne pose jamais `vibrate`.
 */
function livraison(notification, notificationId) {
  const tag = texte(notification.tag) || notificationId;
  return {
    ...(tag === '' ? {} : { tag: tag, renotify: true }),
    ...(notification.silent === true ? { silent: true } : {}),
  };
}

function donneesDuTap(data) {
  const retenu = {};
  TAP_FIELDS.forEach((champ) => {
    const valeur = texte(data[champ]);
    if (valeur !== '') retenu[champ] = valeur;
  });
  return retenu;
}

function montrer(banniere, notification, data) {
  return self.registration.showNotification(banniere.titre, {
    body: banniere.corps,
    ...livraison(notification, texte(data.notificationId)),
    icon: BANNER_ICON,
    badge: BANNER_BADGE,
    data: donneesDuTap(data),
  });
}

/**
 * UNE CORRECTION REMPLACE UNE BANNIÈRE, ELLE N'EN LÈVE JAMAIS UNE (#7342).
 *
 * Éditer un message, un post ou un commentaire réécrit sa notification sous
 * la MÊME identité, et la passerelle repousse la version d'après en la
 * déclarant (`REPRODUCED_PUSH_FIELD`). Sur iOS et Android, un push de
 * révocation retire d'abord la bannière d'avant ; le web ne le reçoit pas
 * (#7308), et le dédoublonnage de D-11 point 4 écartait donc la correction.
 *
 * - La bannière de CETTE notification est encore affichée : elle est
 *   remplacée EN PLACE, sous SON tag — pas sous celui de la charge. Si le
 *   lecteur a changé `groupNotifications` entre les deux pushes, le tag neuf
 *   laisserait l'ancienne bannière à côté de la nouvelle ; et chaque bannière
 *   de ce worker porte un tag, puisque `livraison()` en pose un dès que
 *   l'identifiant existe.
 * - Elle dit DÉJÀ le texte d'après (correction livrée deux fois, édition qui
 *   ne touche pas le texte notifié) : rien — D-11 point 4.
 * - Elle n'est plus affichée : rien. Un message plus récent de la conversation
 *   l'a remplacée (même tag, #7340) et la faire remonter cacherait le message
 *   que le lecteur n'a pas lu ; ou il l'a fermée ; ou il lisait l'application
 *   quand elle est arrivée (D-11 point 1). Dans les trois cas, la bannière
 *   visible n'est plus la sienne.
 *
 * Le remplacement s'annonce (`renotify`), muet si le son est coupé : iOS fait
 * sonner le push nominal qui suit la révocation, comme tout contenu neuf.
 */
async function corriger(banniere, notification, data) {
  const affichee = await banniereAffichee(texte(data.notificationId));
  if (affichee === null) return;
  if (texte(affichee.title) === banniere.titre && texte(affichee.body) === banniere.corps) return;
  await montrer(banniere, { ...notification, tag: affichee.tag }, data);
}

async function afficher(payload) {
  if (payload === null) return;
  const data = objet(payload.data);
  const notification = objet(payload.notification);
  if (estPushDAppel(data)) {
    await traiterAppel(data);
    return;
  }

  /* Démarré EN PARALLÈLE de la logique de bannière, jamais attendu avant —
     un accusé de remise ne doit pas retarder ce que le lecteur VOIT. Le
     `finally` couvre CHAQUE sortie (bannière montrée, corrigée, supprimée ou
     tue) : `waitUntil` (l'appelant, § bas de fichier) ne tient le worker en
     vie que pour la promesse qu'`afficher` rend, donc un accusé lancé sans
     être attendu ici pourrait être tué avant sa fin. */
  const accuse = accuserRemise(data);
  try {
    poserBadge(data);

    const titre = texte(notification.title) || texte(data.title);
    const corps = texte(notification.body) || texte(data.body);
    /* Rien à dire : le worker se tait plutôt que d'écrire un libellé qu'aucun
       catalogue ne porte. */
    if (titre === '' && corps === '') return;
    const banniere = titre === '' ? { titre: corps, corps: '' } : { titre: titre, corps: corps };

    /* D-11 point 1 — quelqu'un REGARDE l'application : le socket porte la
       bannière in-app, une bannière système la doublerait. */
    const ouvertes = await fenetres();
    if (ouvertes.some((client) => client.visibilityState === 'visible')) return;

    if (texte(data[REPRODUCED_PUSH_FIELD]) === REPRODUCED_PUSH_VALUE) {
      await corriger(banniere, notification, data);
      return;
    }

    /* D-11 point 4 — la course résiduelle entre le push et le socket. */
    if ((await banniereAffichee(texte(data.notificationId))) !== null) return;

    await montrer(banniere, notification, data);
  } finally {
    await accuse;
  }
}

/**
 * L'APPEL ENTRANT, ONGLET FERMÉ (#8043) — la sonnerie iOS (CallKit) et
 * Android (plein écran) a son équivalent web : une notification qui RESTE
 * (`requireInteraction`), avec Répondre et Refuser.
 *
 * La passerelle pousse l'appel DATA-ONLY (`call-incoming-push.ts`), titre,
 * corps et libellés des deux actions déjà localisés à la langue du lecteur :
 * ce worker ne charge aucun catalogue. D-11 vaut ici aussi — un onglet
 * visible sonne déjà par le socket, une notification le doublerait.
 *
 * Elle porte le tag `call:<id>` : `call_cancel` (l'appelant a raccroché,
 * personne n'a répondu) et `call_answered_elsewhere` (un autre appareil a
 * décroché) la RETIRENT. Une sonnerie qui survit à l'appel est un contrôle
 * qui ment (loi 4).
 */
const CALL_PUSH_TYPE = 'call';
const CALL_CLOSING_TYPES = ['call_cancel', 'call_answered_elsewhere'];
const CALL_TAG_PREFIX = 'call:';
const CALL_ANSWER_ACTION = 'answer';
const CALL_DECLINE_ACTION = 'decline';
/** JUMEAU de `CALL_ANSWER_PARAM` (`src/lib/calls/call-answer-intent.ts`). */
const CALL_ANSWER_PARAM = 'repondre';

function estPushDAppel(data) {
  const type = texte(data.type);
  return type === CALL_PUSH_TYPE || CALL_CLOSING_TYPES.indexOf(type) >= 0;
}

async function fermerSonnerie(callId) {
  if (callId === '') return;
  try {
    const affichees = await self.registration.getNotifications({ tag: CALL_TAG_PREFIX + callId });
    affichees
      .filter((affichee) => affichee && affichee.tag === CALL_TAG_PREFIX + callId)
      .forEach((affichee) => affichee.close());
  } catch {
    /* Rien à fermer, ou l'API refuse sous cette portée : l'expiration du push
       (TTL de sonnerie) borne de toute façon ce qui pourrait rester. */
  }
}

async function sonner(data) {
  const callId = texte(data.callId);
  const conversationId = texte(data.conversationId);
  const titre = texte(data.title) || texte(data.callerName);
  if (callId === '' || conversationId === '' || titre === '') return;

  const ouvertes = await fenetres();
  if (ouvertes.some((client) => client.visibilityState === 'visible')) return;

  const actions = [
    { action: CALL_ANSWER_ACTION, title: texte(data.answerLabel) },
    { action: CALL_DECLINE_ACTION, title: texte(data.declineLabel) },
  ].filter((action) => action.title !== '');

  await self.registration.showNotification(titre, {
    body: texte(data.body),
    tag: CALL_TAG_PREFIX + callId,
    renotify: true,
    requireInteraction: true,
    icon: BANNER_ICON,
    badge: BANNER_BADGE,
    actions: actions,
    data: { type: CALL_PUSH_TYPE, callId: callId, conversationId: conversationId },
  });
}

async function traiterAppel(data) {
  if (texte(data.type) === CALL_PUSH_TYPE) {
    await sonner(data);
    return;
  }
  await fermerSonnerie(texte(data.callId));
}

/** Refuse sans socket — `DELETE /api/v1/calls/:callId?reason=rejected`, le refus AVANT d'avoir rejoint. */
async function refuserAppel(callId) {
  const stocke = await lireCredential();
  if (stocke === null) return;
  const entetes = entetesCredential(stocke.credential);
  if (entetes === null) return;
  try {
    await self.fetch(texte(stocke.apiBase) + '/api/v1/calls/' + encodeURIComponent(callId) + '?reason=rejected', {
      method: 'DELETE',
      headers: entetes,
      keepalive: true,
    });
  } catch {
    /* Le refus manqué laisse l'appelant sonner jusqu'à la fin de sa sonnerie :
       c'est ce que faisait un onglet fermé avant ce lot, jamais pire. */
  }
}

/**
 * Répondre ouvre le fil de l'appel et le fait DÉCROCHER : l'onglet ouvert
 * reçoit l'identifiant de l'appel, un onglet neuf le lit dans son adresse
 * (`?repondre=<id>`). Le toucher du corps ouvre seulement le fil, où
 * `call:check-active` rejoue la sonnerie à la connexion.
 */
async function ouvrirAppel(data, action) {
  const callId = texte(data.callId);
  if (action === CALL_DECLINE_ACTION) {
    await refuserAppel(callId);
    return;
  }
  const fil = pushTargetUrl({ conversationId: data.conversationId });
  const repondre = action === CALL_ANSWER_ACTION;
  const ouvertes = await fenetres();
  const client = ouvertes[0];
  if (client === undefined) {
    await self.clients.openWindow(repondre ? fil + '?' + CALL_ANSWER_PARAM + '=' + encodeURIComponent(callId) : fil);
    return;
  }
  try {
    await client.focus();
  } catch {
    /* Voir `ouvrir()`. */
  }
  client.postMessage({ type: NOTIFICATION_CLICKED_MESSAGE, url: fil, data: data, ...(repondre ? { answerCallId: callId } : {}) });
}

async function ouvrir(data) {
  const url = pushTargetUrl(data);
  const ouvertes = await fenetres();
  const client = ouvertes[0];
  if (client === undefined) {
    await self.clients.openWindow(url);
    return;
  }
  try {
    await client.focus();
  } catch {
    /* Un client qui refuse le focus reçoit quand même l'adresse : la
       navigation, elle, aboutit. */
  }
  client.postMessage({ type: NOTIFICATION_CLICKED_MESSAGE, url: url, data: data });
}

self.addEventListener('push', (evenement) => {
  evenement.waitUntil(afficher(charge(evenement)));
});

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  const data = objet(evenement.notification.data);
  evenement.waitUntil(
    texte(data.type) === CALL_PUSH_TYPE ? ouvrirAppel(data, texte(evenement.action)) : ouvrir(data),
  );
});

/**
 * CE QUE LE GATE INTERROGE. Un jumeau qu'on ne peut pas EXÉCUTER ne se garde
 * qu'à la lecture — et une lecture ne dit pas dans quel ORDRE les règles
 * décident. `scripts/check-push-target-parity.mjs` monte donc ce fichier et
 * fait décider sa table, comme `check-sw-api-cache.mjs` fait décider le
 * matcher du seau `api` extrait de `dist/sw.js`.
 */
self.meeshyPushTarget = {
  PUSH_ROUTE_PATTERNS: PUSH_ROUTE_PATTERNS,
  DISCOVER_TAB_PARAM: DISCOVER_TAB_PARAM,
  REQUEST_FILTER_PARAM: REQUEST_FILTER_PARAM,
  EPHEMERAL_ENTITIES: EPHEMERAL_ENTITIES,
  EPHEMERAL_ONLY_TYPES: EPHEMERAL_ONLY_TYPES,
  REQUEST_TYPES: REQUEST_TYPES,
  PROFILE_TYPES: PROFILE_TYPES,
  PROGRESSION_TYPES: PROGRESSION_TYPES,
  SECURITY_TYPES: SECURITY_TYPES,
  HINTED_ROUTES: HINTED_ROUTES,
  NOTIFICATION_CLICKED_MESSAGE: NOTIFICATION_CLICKED_MESSAGE,
  resolvePushTarget: resolvePushTarget,
  pushTargetUrl: pushTargetUrl,
};
