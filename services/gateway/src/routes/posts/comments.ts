import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostCommentService } from '../../services/PostCommentService';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { CreateCommentSchema, FeedQuerySchema, LikeSchema, PostParams, CommentParams } from './types';
import { sendSuccess } from '../../utils/response';
import { resolveMentionedUsers } from '../../services/MentionService';

export function registerCommentRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const commentService = new PostCommentService(prisma);

  // GET /posts/:postId/comments — Top-level comments, cursor-paginated
  fastify.get('/posts/:postId/comments', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const { postId } = request.params;
      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await commentService.getComments(postId, cursor, limit);

      const commentContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const mentionedUsers = commentContents.length > 0
        ? await resolveMentionedUsers(prisma, commentContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/:postId/comments] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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

      const result = await commentService.getReplies(commentId, cursor, limit);

      const replyContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const replyMentionedUsers = replyContents.length > 0
        ? await resolveMentionedUsers(prisma, replyContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: replyMentionedUsers },
      });
    } catch (error) {
      fastify.log.error(`[GET comments/:commentId/replies] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/comments — Add a comment
  fastify.post('/posts/:postId/comments', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const parsed = CreateCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid request', details: parsed.error.issues });
      }

      const comment = await commentService.addComment(
        postId,
        authContext.registeredUser.id,
        parsed.data.content,
        parsed.data.parentId,
        parsed.data.effectFlags
      );

      if (!comment) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      // Broadcast comment added via Socket.IO
      const socialEvents = fastify.socialEvents;
      const post = await fastify.prisma?.post?.findUnique({
        where: { id: postId },
        select: { authorId: true, commentCount: true },
      });
      if (socialEvents && post) {
        socialEvents.broadcastCommentAdded({
          postId,
          comment,
          commentCount: post.commentCount,
        }, post.authorId).catch(() => {});
      }

      // Notify post author (or parent comment author for replies)
      const notifService = fastify.notificationService;
      if (notifService) {
        if (parsed.data.parentId) {
          // Reply to a comment — notify the parent comment author
          const parentComment = await fastify.prisma?.postComment?.findUnique({
            where: { id: parsed.data.parentId },
            select: { authorId: true },
          });
          if (parentComment?.authorId) {
            notifService.createCommentReplyNotification({
              actorId: authContext.registeredUser.id,
              postId,
              commentAuthorId: parentComment.authorId,
              commentId: comment.id,
              replyPreview: parsed.data.content,
            }).catch(() => {});
          }
        } else if (post?.authorId) {
          // Top-level comment — notify post author
          notifService.createPostCommentNotification({
            actorId: authContext.registeredUser.id,
            postId,
            postAuthorId: post.authorId,
            commentId: comment.id,
            commentPreview: parsed.data.content,
          }).catch(() => {});
        }
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
          ).catch(() => {});
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      const newCommentMentionedUsers = parsed.data.content
        ? await resolveMentionedUsers(prisma, [parsed.data.content])
        : [];

      return sendSuccess(reply, comment, { statusCode: 201, meta: { mentionedUsers: newCommentMentionedUsers } });
    } catch (error) {
      if (error instanceof Error && error.message === 'PARENT_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Parent comment not found' });
      }
      fastify.log.error(`[POST /posts/:postId/comments] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/comments/:commentId/like — Like a comment
  fastify.post('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { commentId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      const result = await commentService.likeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Comment not found' });
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

      // Notify comment author
      const notifService = fastify.notificationService;
      if (notifService && result.authorId) {
        notifService.createCommentLikeNotification({
          actorId: authContext.registeredUser.id,
          postId: request.params.postId,
          commentId,
          commentAuthorId: result.authorId,
          emoji,
        }).catch(() => {});
      }

      return sendSuccess(reply, { liked: true, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      fastify.log.error(`[POST comments/:commentId/like] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId/like — Unlike a comment
  fastify.delete('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { commentId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      const result = await commentService.unlikeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Comment not found' });
      }

      return sendSuccess(reply, { liked: false, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      fastify.log.error(`[DELETE comments/:commentId/like] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId — Delete a comment
  fastify.delete('/posts/:postId/comments/:commentId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { commentId } = request.params;
      const { postId } = request.params;
      const result = await commentService.deleteComment(commentId, authContext.registeredUser.id);
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Comment not found' });
      }

      // Broadcast comment deleted via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        const post = await fastify.prisma?.post?.findUnique({
          where: { id: postId },
          select: { authorId: true, commentCount: true },
        });
        if (post) {
          socialEvents.broadcastCommentDeleted({
            postId,
            commentId,
            commentCount: post.commentCount,
          }, post.authorId).catch(() => {});
        }
      }

      return sendSuccess(reply, { deleted: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Not authorized to delete this comment' });
      }
      fastify.log.error(`[DELETE comments/:commentId] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
