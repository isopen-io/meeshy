import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { CreatePostSchema, UpdatePostSchema, PostParams } from './types';

export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const postService = new PostService(prisma);

  // POST /posts — Create a new post
  fastify.post('/posts', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const parsed = CreatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid request', details: parsed.error.issues });
      }

      const post = await postService.createPost({
        ...parsed.data,
        type: parsed.data.type ?? 'POST',
        visibility: parsed.data.visibility ?? 'PUBLIC',
      }, authContext.registeredUser.id);

      // Broadcast via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        const postType = parsed.data.type ?? 'POST';
        const broadcastPost = post as unknown as Post;
        if (postType === 'STORY') {
          socialEvents.broadcastStoryCreated(broadcastPost, authContext.registeredUser.id).catch(() => {});
        } else if (postType === 'STATUS') {
          socialEvents.broadcastStatusCreated(broadcastPost, authContext.registeredUser.id).catch(() => {});
        } else {
          socialEvents.broadcastPostCreated(broadcastPost, authContext.registeredUser.id).catch(() => {});
        }
      }

      return reply.status(201).send({ success: true, data: post });
    } catch (error) {
      fastify.log.error(`[POST /posts] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /posts/:postId — Get post by ID
  fastify.get('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const viewerUserId = authContext?.registeredUser?.id;
      const { postId } = request.params;

      const post = await postService.getPostById(postId, viewerUserId);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.send({ success: true, data: post });
    } catch (error) {
      fastify.log.error(`[GET /posts/:postId] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // PUT /posts/:postId — Update a post (author only)
  fastify.put('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const parsed = UpdatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid request', details: parsed.error.issues });
      }

      const post = await postService.updatePost(postId, authContext.registeredUser.id, parsed.data);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.send({ success: true, data: post });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Not authorized to edit this post' });
      }
      fastify.log.error(`[PUT /posts/:postId] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /posts/:postId — Soft delete (author only)
  fastify.delete('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const result = await postService.deletePost(postId, authContext.registeredUser.id);
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      // Broadcast deletion via Socket.IO (use correct event based on post type)
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        if (result.type === 'STATUS') {
          socialEvents.broadcastStatusDeleted(postId, authContext.registeredUser.id, result.visibility, (result as any).visibilityUserIds ?? []).catch(() => {});
        } else {
          socialEvents.broadcastPostDeleted(postId, authContext.registeredUser.id).catch(() => {});
        }
      }

      return reply.send({ success: true, data: { deleted: true } });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Not authorized to delete this post' });
      }
      fastify.log.error(`[DELETE /posts/:postId] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
