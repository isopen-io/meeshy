/**
 * COMMENT MENTION NOTIFICATIONS (Phase 2B) — extrait de
 * `NotificationService.ts` (#7093).
 */
import { notificationLogger } from '../../../utils/logger-enhanced';
import { filterPostConsumers } from '../../posts/postAudience';
import { truncateMessage } from '../notification-preview';
import type { FanoutDependencies } from './dependencies';

export type CommentMentionFanoutParams = {
  commentId: string;
  postId: string;
  commenterId: string;
  mentionedUserIds: string[];
  commentExcerpt?: string;
  /**
   * Type de l'entité portant le commentaire — discriminant qui décide de la
   * surface ouverte au tap côté client. Sans lui, une mention dans le
   * commentaire d'un réel ouvre le détail de post plat. Défaut POST.
   */
  postType?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
  /**
   * Auteur du POST commenté — le sommet du graphe qui définit l'audience.
   * C'est bien lui et non le commentateur : l'auteur seul a choisi qui peut
   * voir. Requis, pour qu'aucun appelant ne puisse rouvrir la fuite par
   * omission.
   */
  postAuthorId: string;
  /**
   * Visibilité du POST commenté. Un commentaire n'a pas d'audience propre :
   * il hérite de celle du post. Requis — cf. `postAuthorId`.
   */
  visibility: string | null | undefined;
  /** `Post.visibilityUserIds` — liste blanche en ONLY, liste noire en EXCEPT. */
  visibilityUserIds?: readonly string[];
};

/**
 * Envoie des notifications user_mentioned en batch pour les mentions dans un commentaire.
 *
 * Priority dedup: user_mentioned > story_new_comment > story_thread_reply > friend_story_comment
 * Les mentionedUserIds doivent être passés en excludeUserIds dans createStoryCommentNotificationsBatch
 * pour éviter la double notification.
 *
 * Skip: self-mention, rate-limit anti-spam (MAX_MENTIONS_PER_MINUTE par paire sender:recipient).
 */
export async function createCommentMentionNotificationsBatch(
  deps: FanoutDependencies,
  params: CommentMentionFanoutParams
): Promise<void> {
  if (params.mentionedUserIds.length === 0) return;

  const commenter = await deps.prisma.user.findUnique({
    where: { id: params.commenterId },
    select: { username: true, displayName: true, avatar: true },
  });

  if (!commenter) return;

  // Nommer quelqu'un ne lui donne pas le droit de voir : un mentionné hors
  // audience ne reçoit rien. Sans ce filtre, l'extrait du commentaire — donc
  // du contenu d'un post restreint — atterrissait sur son écran verrouillé,
  // avec un lien de tap vers un post qui le refuserait.
  //
  // Audience de CONSOMMATION (amis ∪ contacts DM) — la même que
  // `canNotifyAboutPost` pour les notifications unitaires du fil, et que le
  // feed. Un contact DM non-ami à qui le feed montre ce post doit être averti
  // qu'on l'y a nommé.
  const audience = await filterPostConsumers({
    prisma: deps.prisma,
    authorId: params.postAuthorId,
    visibility: params.visibility,
    visibilityUserIds: params.visibilityUserIds,
    candidateUserIds: params.mentionedUserIds,
  });
  if (audience.length === 0) return;

  const content = params.commentExcerpt
    ? truncateMessage(params.commentExcerpt)
    : '';
  const langs = await deps.resolveRecipientLangs(audience);

  const actorInfo = {
    id: params.commenterId,
    username: commenter.username,
    displayName: commenter.displayName,
    avatar: commenter.avatar,
  };

  const tasks: Array<Promise<unknown>> = [];

  for (const userId of audience) {
    if (userId === params.commenterId) continue;

    if (!deps.shouldCreateMentionNotification(params.commenterId, userId)) {
      notificationLogger.info('Comment mention notification blocked (rate limit)', {
        commenterId: params.commenterId,
        recipientId: userId,
      });
      continue;
    }

    tasks.push(
      deps.createNotification({
        userId,
        type: 'user_mentioned',
        priority: 'high',
        content,
        actor: actorInfo,
        lang: langs.get(userId) ?? 'fr',
        context: {
          postId: params.postId,
          commentId: params.commentId,
        },
        metadata: {
          action: 'view_post',
          entityType: 'comment',
          postId: params.postId,
          commentId: params.commentId,
          commentPreview: content,
          postType: params.postType ?? 'POST',
        } as any,
      })
    );
  }

  // createNotification ne rejette jamais (catch interne + log du userId
  // exact) : attendre les tasks suffit, pas de gestion rejected ici.
  await Promise.allSettled(tasks);
}
