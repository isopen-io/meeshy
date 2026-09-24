import { DISCOVER_TAB_PARAM, REQUEST_FILTER_PARAM } from '@/lib/discover/view';

import type { NotificationRecord } from './record';

/**
 * **OÙ MÈNE UNE NOTIFICATION** (#6288) — miroir de `NotificationContentRouter`
 * (`apps/ios/Meeshy/Features/Main/Navigation/NotificationContentRouter.swift`).
 *
 * **Le TYPE n'est pas un discriminant d'entité.** La passerelle émet
 * `story_thread_reply` / `friend_story_comment` / `story_new_comment` pour un
 * commentaire posé sur N'IMPORTE quel contenu — publication, réel, humeur ou
 * story. Seul `metadata.postType` (ou `contentType` pour la famille
 * `friend_new_*`) dit la vérité ; le type ne sert qu'en repli, quand une ligne
 * ancienne ne porte aucun discriminant.
 *
 * **Une destination absente du web rend `null`.** La ligne se marque alors lue
 * sans prétendre ouvrir quoi que ce soit — un contrôle qui ment est pire qu'un
 * contrôle absent (loi 4). Le réel n'a pas de lecteur immersif sur le web : il
 * ouvre le détail de la publication, qui le lit.
 *
 * **Refuser la mauvaise destination n'est que la moitié du travail** (#7173).
 * Une demande de contact a longtemps rendu `null` « tant que le web n'a pas
 * d'écran de contacts » — une exemption dont la condition est devenue fausse
 * quand #6363 a livré `/discover` et son onglet « Demandes ». Apprendre qu'on
 * a reçu une demande et pouvoir y répondre restaient deux écrans sans chemin
 * entre eux. La destination porte donc son onglet et son filtre en `search`,
 * lus des constantes de `lib/discover/view` — jamais recopiés ici.
 *
 * ---
 *
 * **CE MODULE EST LA LOI, ET LE PUSH LA CONSOMME** (#7305). La carte `data`
 * d'une notification poussée porte EXACTEMENT les mêmes clés
 * (`NotificationService`, § carte `data`), à ceci près qu'elles y sont des
 * chaînes plates dont `''` vaut absence. Le lot du service worker a donc
 * EXTRAIT le noyau pur `resolveTarget()` au lieu d'écrire un second mappage :
 * c'est précisément le défaut que portait `public/firebase-messaging-sw.js`,
 * supprimé par le même lot, qui composait `/conversations/<id>`, `/mood` et
 * `/reel` — trois routes dont AUCUNE n'existe dans cette application.
 *
 * Le service worker, lui, est un script CLASSIQUE chargé par `importScripts` :
 * il ne peut importer aucun module TypeScript. Sa table vit donc en JUMEAU
 * dans `public/sw-push.js` (même arbitrage que `LEGACY_CACHE_NAMESPACE`,
 * `src/lib/sw-caches.ts`), et `scripts/check-push-target-parity.mjs` interdit
 * la dérive. **Toute évolution de ce fichier touche les DEUX**, et le gate le
 * dit avant la CI.
 */
export type NotificationTarget =
  | { readonly route: 'thread'; readonly params: { readonly conversation: string } }
  | { readonly route: 'story' | 'post'; readonly params: { readonly post: string } }
  | { readonly route: 'discover'; readonly search: Readonly<Record<string, string>> }
  | { readonly route: 'progression' | 'settings' };

/**
 * **LA DESTINATION D'UN TAP DE BANNIÈRE — elle n'est JAMAIS nulle** (#7305).
 *
 * Divergence délibérée, et la SEULE, avec la cloche in-app : une ligne de
 * liste sans destination se marque lue sans rien ouvrir (loi 4), mais un doigt
 * posé sur une bannière système a demandé quelque chose. Il atterrit donc au
 * pire sur la liste des notifications, d'où la ligne reste atteignable.
 *
 * `notifications` n'entre pas dans `NotificationTarget` : la cloche ne peut
 * pas l'émettre, et son rendu (`components/notification-row.tsx`) énumère la
 * bijection de l'union. Un membre qu'elle n'émet jamais y serait un cas mort.
 */
export type PushTapTarget = NotificationTarget | { readonly route: 'notifications' };

/**
 * **CE QU'UNE CHARGE DE PUSH REMET AU RÉSOLVEUR.** Les mêmes noms que
 * `NotificationRecord`, aplatis — parce que c'est sous cette forme que le fil
 * push les porte, et qu'une adaptation qui RENOMME est une jumelle de plus.
 */
export type NotificationTargetInput = {
  readonly type?: string | undefined;
  readonly conversationId?: string | undefined;
  readonly postId?: string | undefined;
  readonly postType?: string | undefined;
  readonly contentType?: string | undefined;
  readonly friendRequestId?: string | undefined;
  /**
   * L'indice de ROUTE posé par la passerelle pour les notifications de
   * réengagement. Son propre commentaire dit QUAND il le pose : « quand la
   * notification ne porte ni conversation ni contenu social ». Il prime donc
   * sur toute déduction par TYPE, et cède devant une entité.
   */
  readonly route?: string | undefined;
};

const EPHEMERAL_ENTITIES: ReadonlySet<string> = new Set(['STORY', 'STATUS', 'MOOD']);

/** Types éphémères PAR CONSTRUCTION — consultés seulement sans discriminant. */
const EPHEMERAL_ONLY_TYPES: ReadonlySet<string> = new Set([
  'story_reaction',
  'status_reaction',
  'story_new_comment',
  'friend_story_comment',
  'story_thread_reply',
  'friend_new_story',
  'friend_new_mood',
]);

/**
 * Les types qui ANNONCENT une demande en attente — donc ceux dont la réponse
 * se donne dans l'onglet « Demandes ». `friend_accepted` / `contact_accepted`
 * n'en sont PAS : ils portent `conversationId` et ouvrent le fil, ce qui est
 * la bonne destination — on peut désormais écrire.
 */
const REQUEST_TYPES: ReadonlySet<string> = new Set(['friend_request', 'contact_request']);

const PROGRESSION_TYPES: ReadonlySet<string> = new Set([
  'achievement_unlocked',
  'ACHIEVEMENT_UNLOCKED',
  'badge_earned',
  'streak_milestone',
  'level_up',
]);

const SECURITY_TYPES: ReadonlySet<string> = new Set([
  'security_alert',
  'login_new_device',
  'SYSTEM_ALERT',
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
]);

/**
 * Les routes qu'un indice SERVEUR peut nommer — celles qui s'ouvrent SANS
 * paramètre. Un indice hors de cette liste ne fabrique aucune adresse : une
 * route inventée côté client vaudrait le `/mood` du fichier supprimé.
 */
const HINTED_ROUTES: ReadonlySet<string> = new Set(['discover', 'progression', 'settings', 'notifications']);

const DISCOVER_REQUESTS: NotificationTarget = {
  route: 'discover',
  search: { [DISCOVER_TAB_PARAM]: 'requests', [REQUEST_FILTER_PARAM]: 'received' },
};

/** `''` vaut absence — c'est la convention de la carte `data` du fil push. */
function present(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function socialSurface(input: NotificationTargetInput): 'story' | 'post' {
  const discriminant = present(input.postType ?? input.contentType).toUpperCase();
  if (discriminant !== '') return EPHEMERAL_ENTITIES.has(discriminant) ? 'story' : 'post';
  return EPHEMERAL_ONLY_TYPES.has(present(input.type)) ? 'story' : 'post';
}

function hinted(route: string): PushTapTarget | null {
  if (!HINTED_ROUTES.has(route)) return null;
  if (route === 'discover') return DISCOVER_REQUESTS;
  if (route === 'notifications') return { route: 'notifications' };
  return { route: route as 'progression' | 'settings' };
}

/**
 * **LE NOYAU, dans l'ordre des signaux du plus FORT au plus faible** : l'entité
 * que la notification porte, puis l'indice explicite du serveur, puis la
 * déduction par type — la seule qui devine.
 */
export function resolveTarget(input: NotificationTargetInput): PushTapTarget | null {
  const postId = present(input.postId);
  if (postId !== '') return { route: socialSurface(input), params: { post: postId } };

  const conversationId = present(input.conversationId);
  if (conversationId !== '') return { route: 'thread', params: { conversation: conversationId } };

  const type = present(input.type);
  if (present(input.friendRequestId) !== '' || REQUEST_TYPES.has(type)) return DISCOVER_REQUESTS;

  const indice = hinted(present(input.route));
  if (indice !== null) return indice;

  if (PROGRESSION_TYPES.has(type)) return { route: 'progression' };
  if (SECURITY_TYPES.has(type)) return { route: 'settings' };
  return null;
}

/** LA CLOCHE : une destination absente du web n'ouvre rien (loi 4). */
export function notificationTarget(notification: NotificationRecord): NotificationTarget | null {
  const resolved = resolveTarget({
    type: notification.type,
    conversationId: notification.context.conversationId,
    postId: notification.context.postId,
    postType: notification.metadata.postType,
    contentType: notification.metadata.contentType,
    friendRequestId: notification.context.friendRequestId,
  });
  /* La cloche ne construit jamais l'indice `route` (`NotificationRecord` ne le
     décode pas) : `notifications` est donc hors d'atteinte ici, et le repli de
     tap ne s'applique pas à elle. */
  return resolved === null || resolved.route === 'notifications' ? null : resolved;
}

/** LE TAP : il atterrit toujours quelque part (#7305). */
export function pushTapTarget(input: NotificationTargetInput): PushTapTarget {
  return resolveTarget(input) ?? { route: 'notifications' };
}
