import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { LikeSchema, RepostSchema, PostParams } from './types';

export function registerInteractionRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const postService = new PostService(prisma);

  // POST /posts/:postId/like
  fastify.post('/posts/:postId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      const post = await postService.likePost(postId, authContext.registeredUser.id, emoji);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      // Broadcast like via Socket.IO
      const socialEvents = (fastify as any).socialEvents;
      if (socialEvents && post.authorId) {
        socialEvents.broadcastPostLiked({
          postId,
          userId: authContext.registeredUser.id,
          emoji,
          likeCount: post.likeCount,
          reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
        }, post.authorId).catch(() => {});
      }

      // Create notification for post author
      const notifService = (fastify as any).notificationService;
      if (notifService && post.authorId) {
        notifService.createPostLikeNotification({
          actorId: authContext.registeredUser.id,
          postId,
          postAuthorId: post.authorId,
          emoji,
          postType: post.type,
        }).catch(() => {});
      }

      return reply.send({ success: true, data: { liked: true, reactionSummary: post.reactionSummary } });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/like] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /posts/:postId/like
  fastify.delete('/posts/:postId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const post = await postService.unlikePost(postId, authContext.registeredUser.id);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      // Broadcast unlike via Socket.IO
      const socialEvents = (fastify as any).socialEvents;
      if (socialEvents && post.authorId) {
        socialEvents.broadcastPostUnliked({
          postId,
          userId: authContext.registeredUser.id,
          emoji: '❤️',
          likeCount: post.likeCount,
          reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
        }, post.authorId).catch(() => {});
      }

      return reply.send({ success: true, data: { liked: false, reactionSummary: post.reactionSummary } });
    } catch (error) {
      fastify.log.error(`[DELETE /posts/:postId/like] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/bookmark
  fastify.post('/posts/:postId/bookmark', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      await postService.bookmarkPost(postId, authContext.registeredUser.id);
      return reply.send({ success: true, data: { bookmarked: true } });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/bookmark] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /posts/:postId/bookmark
  fastify.delete('/posts/:postId/bookmark', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      await postService.unbookmarkPost(postId, authContext.registeredUser.id);
      return reply.send({ success: true, data: { bookmarked: false } });
    } catch (error) {
      fastify.log.error(`[DELETE /posts/:postId/bookmark] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/view
  fastify.post('/posts/:postId/view', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const { duration } = (request.body as any) ?? {};
      await postService.recordView(postId, authContext.registeredUser.id, duration);

      // If this is a story, broadcast the view to the story author
      const socialEvents = (fastify as any).socialEvents;
      if (socialEvents) {
        // Fetch post to check type and get author + viewCount
        const post = await postService.getPostById(postId);
        if (post && post.type === 'STORY' && post.authorId !== authContext.registeredUser.id) {
          socialEvents.broadcastStoryViewed({
            storyId: postId,
            viewerId: authContext.registeredUser.id,
            viewerUsername: authContext.registeredUser.username ?? '',
            viewCount: post.viewCount,
          }, post.authorId);
        }
      }

      return reply.send({ success: true, data: { viewed: true } });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/view] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/share — Track a share
  fastify.post('/posts/:postId/share', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const { platform } = (request.body as any) ?? {};
      const post = await postService.sharePost(postId, authContext.registeredUser.id, platform);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.send({ success: true, data: { shared: true, shareCount: post.shareCount } });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/share] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/pin — Pin a post (author only)
  fastify.post('/posts/:postId/pin', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const post = await postService.pinPost(postId, authContext.registeredUser.id);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.send({ success: true, data: { pinned: true } });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Only the author can pin this post' });
      }
      fastify.log.error(`[POST /posts/:postId/pin] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /posts/:postId/pin — Unpin a post (author only)
  fastify.delete('/posts/:postId/pin', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const post = await postService.unpinPost(postId, authContext.registeredUser.id);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.send({ success: true, data: { pinned: false } });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Only the author can unpin this post' });
      }
      fastify.log.error(`[DELETE /posts/:postId/pin] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /posts/:postId/views — Story/post seen-by list (author only)
  fastify.get('/posts/:postId/views', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const query = request.query as any;
      const limit = parseInt(query.limit) || 50;
      const offset = parseInt(query.offset) || 0;

      const result = await postService.getPostViews(postId, authContext.registeredUser.id, limit, offset);
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.send({ success: true, data: result.items, pagination: { total: result.total, hasMore: result.hasMore, limit, offset } });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Only the author can view this list' });
      }
      fastify.log.error(`[GET /posts/:postId/views] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/repost
  fastify.post('/posts/:postId/repost', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const parsed = RepostSchema.safeParse(request.body ?? {});
      const data = parsed.success ? parsed.data : { isQuote: false };

      const repost = await postService.repostPost(
        postId,
        authContext.registeredUser.id,
        data.content,
        data.isQuote
      );

      if (!repost) {
        return reply.status(404).send({ success: false, error: 'Original post not found' });
      }

      // Broadcast repost via Socket.IO
      const socialEvents = (fastify as any).socialEvents;
      if (socialEvents) {
        socialEvents.broadcastPostReposted({
          originalPostId: postId,
          repost,
        }, authContext.registeredUser.id).catch(() => {});
      }

      // Notify original post author
      const notifService = (fastify as any).notificationService;
      if (notifService && repost.repostOfId) {
        const original = await postService.getPostById(postId);
        if (original?.authorId) {
          notifService.createPostRepostNotification({
            actorId: authContext.registeredUser.id,
            originalPostId: postId,
            postAuthorId: original.authorId,
            repostId: repost.id,
          }).catch(() => {});
        }
      }

      return reply.status(201).send({ success: true, data: repost });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/repost] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
