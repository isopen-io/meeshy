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
      return reply.send({ success: true, data: { viewed: true } });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/view] Error: ${error}`);
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

      return reply.status(201).send({ success: true, data: repost });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/repost] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
