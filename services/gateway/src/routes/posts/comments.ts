import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostCommentService } from '../../services/PostCommentService';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { PostAudioService } from '../../services/posts/PostAudioService';
import { CreateCommentSchema, FeedQuerySchema, LikeSchema, PostParams, CommentParams } from './types';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response';
import { resolveMentionedUsers, MentionService } from '../../services/MentionService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { withMutationLog } from '../../utils/withMutationLog';

/**
 * Hisse `metadata.trackingLinks` ([{ url, token }]) en top-level sur le payload
 * socket d'un commentaire — miroir exact du hoist des messages / posts. Permet
 * au destinataire de rendre le lien cliquable/tracé vers `/l/<token>` sans
 * réécrire l'URL. No-op si le commentaire ne porte aucun lien tracé.
 */
function hoistCommentTrackingLinks<T extends Record<string, unknown>>(comment: T): T {
  const metadata = comment?.metadata as Record<string, unknown> | null | undefined;
  const tl = metadata?.trackingLinks;
  if (Array.isArray(tl) && tl.length > 0) {
    return { ...comment, trackingLinks: tl } as T;
  }
  return comment;
}

export function registerCommentRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const commentService = new PostCommentService(prisma);
  const mentionService = new MentionService(prisma);

  // GET /posts/:postId/comments — Top-level comments, cursor-paginated
  fastify.get('/posts/:postId/comments', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const { postId } = request.params;
      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const authContext = (request as UnifiedAuthRequest).authContext;
      const currentUserId = authContext.type === 'user' && !authContext.isAnonymous ? authContext.userId : undefined;

      const result = await commentService.getComments(postId, cursor, limit, currentUserId);

      const commentContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const mentionedUsers = commentContents.length > 0
        ? await resolveMentionedUsers(prisma, commentContents)
        : [];

      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/:postId/comments] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId/comments/:commentId/replies — Replies to a comment
  fastify.get('/posts/:postId/comments/:commentId/replies', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const { commentId } = request.params;
      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const authContext = (request as UnifiedAuthRequest).authContext;
      const currentUserId = authContext.type === 'user' && !authContext.isAnonymous ? authContext.userId : undefined;

      const result = await commentService.getReplies(commentId, cursor, limit, currentUserId);

      const replyContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const replyMentionedUsers = replyContents.length > 0
        ? await resolveMentionedUsers(prisma, replyContents)
        : [];

      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: replyMentionedUsers },
      });
    } catch (error) {
      fastify.log.error(`[GET comments/:commentId/replies] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments — Add a comment
  fastify.post('/posts/:postId/comments', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('comment') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = CreateCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      // Idempotent via clientMutationId — replays return the same comment.
      type CommentResult = NonNullable<Awaited<ReturnType<typeof commentService.addComment>>>;
      const comment = await withMutationLog<CommentResult>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'createComment',
        op: async () => {
          const c = await commentService.addComment(
            postId,
            authContext.registeredUser.id,
            parsed.data.content,
            parsed.data.parentId,
            parsed.data.effectFlags,
            parsed.data.originalLanguage,
            // Un seul média par commentaire : on lie le premier id du tableau.
            parsed.data.attachmentIds?.[0],
            parsed.data.mobileTranscription,
          );
          if (!c) throw new Error('POST_NOT_FOUND');
          return c as CommentResult & { id: string };
        },
        onDuplicate: async (resultId) => {
          const existing = await prisma.postComment.findUnique({ where: { id: resultId } });
          return existing ? (existing as unknown as CommentResult & { id: string }) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return null;
        throw err;
      });

      if (!comment) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Broadcast comment added via Socket.IO
      const socialEvents = fastify.socialEvents;
      const post = await fastify.prisma?.post?.findUnique({
        where: { id: postId },
        select: { authorId: true, commentCount: true, type: true, content: true, createdAt: true, expiresAt: true, visibility: true, visibilityUserIds: true },
      });
      if (socialEvents && post) {
        socialEvents.broadcastCommentAdded({
          postId,
          comment: hoistCommentTrackingLinks(comment as unknown as Record<string, unknown>) as unknown as typeof comment,
          commentCount: post.commentCount,
        }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: broadcast comment added failed'));
      }

      const notifService = fastify.notificationService;

      // Mention persistence + notifications (Phase 2B) — resolved FIRST so the
      // mentioned users can be excluded from the lower-priority recipient buckets
      // (priority: user_mentioned > comment_reply > post_comment > story_new_comment
      // > story_thread_reply > friend_story_comment). Sans cette résolution amont,
      // répondre à un commentaire EN mentionnant son auteur lui envoyait DEUX
      // notifications (user_mentioned + comment_reply) au lieu de la seule mention.
      let mentionedUserIds: string[] = [];
      if (parsed.data.content && notifService) {
        const mentionedUsernames = mentionService.extractMentions(parsed.data.content);
        if (mentionedUsernames.length > 0) {
          const resolvedUsers = await mentionService.resolveUsernames(mentionedUsernames);
          mentionedUserIds = Array.from(resolvedUsers.values()).map(u => u.id);

          if (mentionedUserIds.length > 0) {
            mentionService.createCommentMentions(comment.id, mentionedUserIds)
              .catch(err => fastify.log.error(`comment mention persistence failed: ${err}`));

            notifService.createCommentMentionNotificationsBatch({
              commentId: comment.id,
              postId,
              commenterId: authContext.registeredUser.id,
              mentionedUserIds,
              commentExcerpt: parsed.data.content?.slice(0, 100),
            }).catch(err => fastify.log.error(`comment mention notification failed: ${err}`));
          }
        }
      }

      // Notify post author (or parent comment author for replies) — but SKIP a
      // recipient already mentioned above: la mention (user_mentioned) prime sur
      // comment_reply / post_comment pour un même destinataire.
      if (notifService) {
        if (parsed.data.parentId) {
          // Reply to a comment — notify the parent comment author. Le contenu
          // du commentaire parent voyage en subtitle (« En réponse à « … » »)
          // pour que le destinataire sache À QUOI on lui répond.
          const parentComment = await fastify.prisma?.postComment?.findUnique({
            where: { id: parsed.data.parentId },
            select: { authorId: true, content: true },
          });
          if (parentComment?.authorId && !mentionedUserIds.includes(parentComment.authorId)) {
            notifService.createCommentReplyNotification({
              actorId: authContext.registeredUser.id,
              postId,
              commentAuthorId: parentComment.authorId,
              commentId: comment.id,
              replyPreview: parsed.data.content,
              parentCommentPreview: parentComment.content?.slice(0, 80),
              // Précise « sur votre story/réel/… » + date côté client (du JJ/MM/AAAA HH:MM).
              postType: post?.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
              postCreatedAt: post?.createdAt ?? undefined,
              postExpiresAt: post?.expiresAt ?? undefined,
            }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: notify comment reply failed'));
          }
        } else if (post?.authorId && post.type !== 'STORY' && !mentionedUserIds.includes(post.authorId)) {
          // Top-level comment on a regular post/mood/status — notify the
          // author with the typed subtitle. Pour une STORY, l'auteur est
          // notifié par le bucket story_new_comment du fan-out ci-dessous
          // (avant ce gate, il recevait DEUX notifications pour le même
          // commentaire : post_comment + story_new_comment).
          notifService.createPostCommentNotification({
            actorId: authContext.registeredUser.id,
            postId,
            postAuthorId: post.authorId,
            commentId: comment.id,
            commentPreview: parsed.data.content,
            postType: post.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
            postPreview: post.content?.slice(0, 80),
            postCreatedAt: post.createdAt ?? undefined,
            postExpiresAt: post.expiresAt ?? undefined,
          }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: notify post comment failed'));
        }
      }

      // Story comment fan-out notifications (Phase 1D)
      // excludeUserIds: skip users who already received user_mentioned (higher priority)
      if (notifService && post?.authorId && !parsed.data.parentId) {
        notifService.createStoryCommentNotificationsBatch({
          postId,
          commentId: comment.id,
          storyAuthorId: post.authorId,
          commenterId: authContext.registeredUser.id,
          commentExcerpt: parsed.data.content?.slice(0, 100),
          postType: post.type as 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL',
          postCreatedAt: post.createdAt ?? undefined,
          postExpiresAt: post.expiresAt ?? undefined,
          excludeUserIds: mentionedUserIds,
        }).catch(err => fastify.log.error(`story comment notification fan-out failed: ${err}`));
      }

      // Trigger async translation for comment content (fire-and-forget)
      if (parsed.data.content) {
        try {
          const translationService = PostTranslationService.shared;
          translationService.translateComment(
            comment.id,
            postId,
            parsed.data.content,
            (comment as any).originalLanguage,
          ).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: translate comment failed'));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      // Pipeline audio pour un média de commentaire audio (fire-and-forget).
      // Réutilise PostAudioService : Whisper → NLLB → TTS pour les langues plateforme.
      // Le routing ZMQ passe par `postId`/`postMediaId` (= commentMedia.id) ; à
      // l'arrivée, PostAudioService désambiguïse via `PostMedia.commentId` et émet
      // `comment:media-updated`. Pas de re-transcription si mobileTranscription fournie.
      const linkedMedia = (comment as unknown as { media?: Array<{ id: string; mimeType?: string; fileUrl?: string }> }).media?.[0];
      if (
        linkedMedia
        && linkedMedia.mimeType?.startsWith('audio/')
        && !parsed.data.mobileTranscription
      ) {
        PostAudioService.shared.processPostAudio({
          postId,
          postMediaId: linkedMedia.id,
          fileUrl: linkedMedia.fileUrl ?? '',
          authorId: authContext.registeredUser.id,
        }).catch((err) => fastify.log.error(`comment audio processing failed: ${err}`));
      }

      const newCommentMentionedUsers = parsed.data.content
        ? await resolveMentionedUsers(prisma, [parsed.data.content])
        : [];

      return sendSuccess(reply, comment, { statusCode: 201, meta: { mentionedUsers: newCommentMentionedUsers } });
    } catch (error) {
      if (error instanceof Error && error.message === 'PARENT_NOT_FOUND') {
        return sendNotFound(reply, 'Parent comment not found', { code: 'COMMENT_NOT_FOUND' });
      }
      if (error instanceof Error && error.message === 'MEDIA_NOT_AVAILABLE') {
        return sendBadRequest(reply, 'Attached media not found or already linked', { code: 'MEDIA_NOT_AVAILABLE' });
      }
      fastify.log.error(`[POST /posts/:postId/comments] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments/:commentId/like — Like a comment
  fastify.post('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      const result = await commentService.likeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Broadcast comment liked via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents && result.authorId) {
        socialEvents.broadcastCommentLiked({
          postId: request.params.postId,
          commentId,
          userId: authContext.registeredUser.id,
          emoji,
          likeCount: result.likeCount,
        }, result.authorId);
      }

      // Notify comment author — l'extrait du commentaire liké voyage en
      // subtitle pour identifier QUEL commentaire reçoit la réaction.
      const notifService = fastify.notificationService;
      if (notifService && result.authorId) {
        const likedComment = await fastify.prisma?.postComment?.findUnique({
          where: { id: commentId },
          select: { content: true },
        });
        notifService.createCommentLikeNotification({
          actorId: authContext.registeredUser.id,
          postId: request.params.postId,
          commentId,
          commentAuthorId: result.authorId,
          emoji,
          commentPreview: likedComment?.content?.slice(0, 80),
        }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments/:commentId/like]: notify comment like failed'));
      }

      return sendSuccess(reply, { liked: true, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      fastify.log.error(`[POST comments/:commentId/like] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId/like — Unlike a comment
  fastify.delete('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      const result = await commentService.unlikeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      return sendSuccess(reply, { liked: false, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      fastify.log.error(`[DELETE comments/:commentId/like] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId — Delete a comment
  fastify.delete('/posts/:postId/comments/:commentId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const { postId } = request.params;
      // Idempotent via clientMutationId. The MutationLog row records
      // the deleted comment id so replays are observably consistent
      // (broadcast side-effect fires exactly once).
      const result = await withMutationLog({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'deleteComment',
        op: async () => {
          const res = await commentService.deleteComment(commentId, authContext.registeredUser.id);
          if (!res) throw new Error('COMMENT_NOT_FOUND');
          return { id: commentId, ...res } as { id: string } & typeof res;
        },
        onDuplicate: async () => ({ id: commentId }) as any,
      }).catch((err) => {
        if (err instanceof Error && err.message === 'COMMENT_NOT_FOUND') return null;
        throw err;
      });
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Broadcast comment deleted via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        const post = await fastify.prisma?.post?.findUnique({
          where: { id: postId },
          select: { authorId: true, commentCount: true, visibility: true, visibilityUserIds: true },
        });
        if (post) {
          socialEvents.broadcastCommentDeleted({
            postId,
            commentId,
            commentCount: post.commentCount,
          }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err) => fastify.log.warn({ err }, '[DELETE /posts/:postId/comments/:commentId]: broadcast comment deleted failed'));
        }
      }

      return sendSuccess(reply, { deleted: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to delete this comment', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[DELETE comments/:commentId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
