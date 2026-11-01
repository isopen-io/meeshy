/**
 * Dernier recours de #13350 : une notification qui pousse le CONTENU d'un
 * acteur (sa publication, son commentaire sous une story) ne part jamais vers
 * une personne en relation de blocage avec lui, dans un sens ou dans l'autre.
 *
 * Les éventails filtrent déjà à la source, en lot ; cette garde tient le
 * prochain appelant qui oubliera de le faire. FERMÉE sur l'échec : un contenu
 * d'acteur sans acteur, ou une lecture de blocage qui ne conclut pas, refuse.
 * Une notification perdue se rattrape ; un extrait poussé sur l'écran
 * verrouillé d'une personne bloquée, non.
 *
 * #14251 — même dernier recours pour les comptes MORTS : ni le destinataire ni
 * l'acteur ne peuvent être supprimés ou désactivés (`livingAmong`, ce que le
 * schéma déclare : `isActive` vrai, `deletedAt` absent ou nul). Les éventails
 * filtrent déjà en lot ; cette garde tient la notification qui vise
 * directement une personne (réaction, commentaire, réponse, republication).
 * Les deux lectures partent ensemble. `user_mentioned` n'en relève pas : il
 * sert aussi aux conversations ; ses mentions de post et de commentaire sont
 * gardées en amont par `resolveLinkedAudience`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationType } from '@meeshy/shared/types/notification';
import { isBlockedBetween } from '../../utils/blocking';
import { livingAmong } from './fanout/entourage';

const ACTOR_CONTENT_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'friend_new_story',
  'friend_new_post',
  'friend_new_mood',
  'friend_story_comment',
  'friend_content_reaction',
  'friend_content_share',
  'friend_content_repost',
  'friend_content_quote',
  // Interactions sociales : l'acteur réagit, commente, répond ou republie.
  // Commenter et réagir se refusent déjà entre l'acteur et l'AUTEUR du post
  // (`isBlockedWithAny`), mais pas entre l'acteur et l'auteur d'un commentaire
  // parent, un engagé antérieur du fil ou un ami de l'auteur (#13350, audit).
  'post_like',
  'story_reaction',
  'status_reaction',
  'post_comment',
  'post_repost',
  'comment_reply',
  'comment_like',
  'comment_reaction',
  'story_new_comment',
  'story_thread_reply',
]);

export async function refusesActorContent(
  prisma: PrismaClient,
  params: { readonly type: NotificationType; readonly recipientId: string; readonly actorId: string | undefined }
): Promise<boolean> {
  if (!ACTOR_CONTENT_TYPES.has(params.type)) return false;
  if (!params.actorId) return true;
  try {
    const [blocked, alive] = await Promise.all([
      isBlockedBetween(prisma, params.recipientId, params.actorId),
      livingAmong(prisma, [params.recipientId, params.actorId]),
    ]);
    return blocked || !alive.has(params.recipientId) || !alive.has(params.actorId);
  } catch {
    return true;
  }
}
