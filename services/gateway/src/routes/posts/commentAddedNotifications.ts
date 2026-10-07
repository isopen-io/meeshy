/**
 * Qui est prévenu d'un commentaire neuf — extrait de `comments.ts` (budget de
 * taille, #9584), à l'identique : mentions d'abord (elles priment), puis
 * l'auteur du commentaire parent ou du post, puis l'éventail des stories.
 * `postId` / `post` sont le post où le commentaire est RANGÉ.
 */

import type { FastifyInstance } from 'fastify';
import type { Post } from '@meeshy/shared/prisma/client';
import type { MentionService } from '../../services/MentionService';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sliceCodePointsOrUndefined } from '@meeshy/shared/utils/text-truncate';

type CommentedPost = Pick<Post, 'authorId' | 'type' | 'createdAt' | 'expiresAt' | 'visibility' | 'visibilityUserIds'>;

export async function notifyCommentAdded(params: {
  readonly fastify: FastifyInstance;
  readonly mentionService: MentionService;
  readonly commenterId: string;
  readonly commentId: string;
  readonly postId: string;
  readonly post: CommentedPost | null | undefined;
  readonly content: string | undefined;
  readonly parentId: string | undefined;
}): Promise<void> {
  const { fastify, mentionService, commenterId, commentId, postId, post, content, parentId } = params;
  const notifService = fastify.notificationService;

  // Mention persistence + notifications (Phase 2B) — resolved FIRST so the
  // mentioned users can be excluded from the lower-priority recipient buckets
  // (priority: user_mentioned > comment_reply > post_comment > story_new_comment
  // > story_thread_reply > friend_story_comment). Sans cette résolution amont,
  // répondre à un commentaire EN mentionnant son auteur lui envoyait DEUX
  // notifications (user_mentioned + comment_reply) au lieu de la seule mention.
  let mentionedUserIds: string[] = [];
  // `post` conditionne le lot : c'est lui qui porte l'audience. Sans lui, on
  // ne peut pas établir qui a le droit d'être prévenu — donc on ne prévient
  // personne, plutôt que de pousser un extrait à l'aveugle.
  if (content && notifService && post) {
    const mentionedUsernames = mentionService.extractMentions(content);
    if (mentionedUsernames.length > 0) {
      const resolvedUsers = await mentionService.resolveUsernames(mentionedUsernames);
      mentionedUserIds = Array.from(resolvedUsers.values()).map(u => u.id);

      if (mentionedUserIds.length > 0) {
        mentionService.createCommentMentions(commentId, mentionedUserIds)
          .catch(err => enhancedLogger.error('comment mention persistence failed', err));

        notifService.createCommentMentionNotificationsBatch({
          commentId,
          postId,
          commenterId,
          mentionedUserIds,
          commentExcerpt: sliceCodePointsOrUndefined(content, 100),
          // Discriminant d'entité → surface ouverte au tap côté client.
          postType: post?.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
          // Un commentaire n'a pas d'audience propre : il hérite de celle du
          // post. Sans ce passage, nommer quelqu'un hors audience lui
          // poussait un extrait du commentaire — donc du fil d'un post qu'il
          // n'a pas le droit d'ouvrir.
          postAuthorId: post.authorId,
          visibility: post.visibility,
          visibilityUserIds: post.visibilityUserIds ?? [],
        }).catch(err => enhancedLogger.error('comment mention notification failed', err));
      }
    }
  }

  // Notify post author (or parent comment author for replies) — but SKIP a
  // recipient already mentioned above: la mention (user_mentioned) prime sur
  // comment_reply / post_comment pour un même destinataire.
  if (notifService) {
    if (parentId) {
      // Reply to a comment — notify the parent comment author. Le contenu
      // du commentaire parent voyage en subtitle (« En réponse à « … » »)
      // pour que le destinataire sache À QUOI on lui répond.
      const parentComment = await fastify.prisma?.postComment?.findUnique({
        where: { id: parentId },
        select: { authorId: true, content: true },
      });
      if (parentComment?.authorId && !mentionedUserIds.includes(parentComment.authorId)) {
        notifService.createCommentReplyNotification({
          actorId: commenterId,
          postId,
          commentAuthorId: parentComment.authorId,
          commentId,
          parentCommentId: parentId,
          replyPreview: content,
          parentCommentPreview: sliceCodePointsOrUndefined(parentComment.content, 80),
          // Précise « sur votre story/réel/… » + date côté client (du JJ/MM/AAAA HH:MM).
          postType: post?.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
          postCreatedAt: post?.createdAt ?? undefined,
          postExpiresAt: post?.expiresAt ?? undefined,
        }).catch((err) => enhancedLogger.warn('[POST /posts/:postId/comments]: notify comment reply failed', { err }));
      }
    } else if (post?.authorId && post.type !== 'STORY' && !mentionedUserIds.includes(post.authorId)) {
      // Top-level comment on a regular post/mood/status — notify the
      // author with the typed subtitle. Pour une STORY, l'auteur est
      // notifié par le bucket story_new_comment du fan-out ci-dessous
      // (avant ce gate, il recevait DEUX notifications pour le même
      // commentaire : post_comment + story_new_comment).
      notifService.createPostCommentNotification({
        actorId: commenterId,
        postId,
        postAuthorId: post.authorId,
        commentId,
        commentPreview: content,
        postType: post.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
        postCreatedAt: post.createdAt ?? undefined,
        postExpiresAt: post.expiresAt ?? undefined,
      }).catch((err) => enhancedLogger.warn('[POST /posts/:postId/comments]: notify post comment failed', { err }));
    }
  }

  // Story comment fan-out notifications (Phase 1D)
  // excludeUserIds: skip users who already received user_mentioned (higher priority)
  if (notifService && post?.authorId && !parentId) {
    notifService.createStoryCommentNotificationsBatch({
      postId,
      commentId,
      storyAuthorId: post.authorId,
      commenterId,
      commentExcerpt: sliceCodePointsOrUndefined(content, 100),
      postType: post.type as 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL',
      postCreatedAt: post.createdAt ?? undefined,
      postExpiresAt: post.expiresAt ?? undefined,
      excludeUserIds: mentionedUserIds,
      // Passée BRUTE : un `?? 'PUBLIC'` ici rétablirait, un étage plus haut
      // et hors de vue du build, le défaut permissif que le paramètre vient
      // de perdre. Une visibilité absente doit restreindre, pas ouvrir.
      visibility: post.visibility,
      visibilityUserIds: post.visibilityUserIds ?? [],
    }).catch(err => enhancedLogger.error('story comment notification fan-out failed', err));
  }
}
