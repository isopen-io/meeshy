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
 * sans prétendre ouvrir quoi que ce soit : une demande de contact qui
 * ouvrirait la liste des conversations serait un contrôle qui ment (loi 4).
 * Le réel n'a pas de lecteur immersif sur le web : il ouvre le détail de la
 * publication, qui le lit.
 */
export type NotificationTarget =
  | { readonly route: 'thread'; readonly params: { readonly conversation: string } }
  | { readonly route: 'story' | 'post'; readonly params: { readonly post: string } }
  | { readonly route: 'progression' | 'settings' };

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

function socialSurface(notification: NotificationRecord): 'story' | 'post' {
  const discriminant = (notification.metadata.postType ?? notification.metadata.contentType)?.toUpperCase();
  if (discriminant !== undefined) return EPHEMERAL_ENTITIES.has(discriminant) ? 'story' : 'post';
  return EPHEMERAL_ONLY_TYPES.has(notification.type) ? 'story' : 'post';
}

export function notificationTarget(notification: NotificationRecord): NotificationTarget | null {
  const { postId, conversationId } = notification.context;
  if (postId !== undefined) return { route: socialSurface(notification), params: { post: postId } };
  if (conversationId !== undefined) return { route: 'thread', params: { conversation: conversationId } };
  if (PROGRESSION_TYPES.has(notification.type)) return { route: 'progression' };
  if (SECURITY_TYPES.has(notification.type)) return { route: 'settings' };
  return null;
}
