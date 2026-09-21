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
const TAP_FIELDS = ['notificationId', 'type', 'conversationId', 'postId', 'postType', 'contentType', 'friendRequestId', 'route'];

/**
 * LE NOM DU MESSAGE remis à un client déjà ouvert — JUMEAU de
 * `NOTIFICATION_CLICKED_MESSAGE` (`src/lib/notifications/tap-navigation.ts`),
 * qui l'écoute et navigue. Focaliser sans naviguer laisserait le lecteur là
 * où il était : un contrôle qui ment (loi 4).
 */
const NOTIFICATION_CLICKED_MESSAGE = 'NOTIFICATION_CLICKED';

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

async function dejaAffichee(notificationId) {
  if (notificationId === '') return false;
  try {
    const affichees = await self.registration.getNotifications();
    return affichees.some((affichee) => affichee && texte(objet(affichee.data).notificationId) === notificationId);
  } catch {
    return false;
  }
}

function donneesDuTap(data) {
  const retenu = {};
  TAP_FIELDS.forEach((champ) => {
    const valeur = texte(data[champ]);
    if (valeur !== '') retenu[champ] = valeur;
  });
  return retenu;
}

async function afficher(payload) {
  if (payload === null) return;
  const data = objet(payload.data);
  const notification = objet(payload.notification);

  poserBadge(data);

  const titre = texte(notification.title) || texte(data.title);
  const corps = texte(notification.body) || texte(data.body);
  /* Rien à dire : le worker se tait plutôt que d'écrire un libellé qu'aucun
     catalogue ne porte. */
  if (titre === '' && corps === '') return;

  /* D-11 point 1 — quelqu'un REGARDE l'application : le socket porte la
     bannière in-app, une bannière système la doublerait. */
  const ouvertes = await fenetres();
  if (ouvertes.some((client) => client.visibilityState === 'visible')) return;

  const notificationId = texte(data.notificationId);
  /* D-11 point 4 — la course résiduelle entre le push et le socket. */
  if (await dejaAffichee(notificationId)) return;

  await self.registration.showNotification(titre === '' ? corps : titre, {
    body: titre === '' ? '' : corps,
    tag: texte(data.conversationId) || notificationId || undefined,
    icon: BANNER_ICON,
    badge: BANNER_BADGE,
    data: donneesDuTap(data),
  });
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
  evenement.waitUntil(ouvrir(objet(evenement.notification.data)));
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
  PROGRESSION_TYPES: PROGRESSION_TYPES,
  SECURITY_TYPES: SECURITY_TYPES,
  HINTED_ROUTES: HINTED_ROUTES,
  NOTIFICATION_CLICKED_MESSAGE: NOTIFICATION_CLICKED_MESSAGE,
  resolvePushTarget: resolvePushTarget,
  pushTargetUrl: pushTargetUrl,
};
