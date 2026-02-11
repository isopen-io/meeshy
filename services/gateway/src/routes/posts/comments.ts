import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostCommentService } from '../../services/PostCommentService';
import { CreateCommentSchema, FeedQuerySchema, PostParams, CommentParams } from './types';

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

      return reply.send({
        success: true,
        data: result.items,
        pagination: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit,
        },
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

      return reply.send({
        success: true,
        data: result.items,
        pagination: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit,
        },
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
        parsed.data.parentId
      );

      if (!comment) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.status(201).send({ success: true, data: comment });
    } catch (error) {
      if (error instanceof Error && error.message === 'PARENT_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Parent comment not found' });
      }
      fastify.log.error(`[POST /posts/:postId/comments] Error: ${error}`);
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
      const result = await commentService.deleteComment(commentId, authContext.registeredUser.id);
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Comment not found' });
      }

      return reply.send({ success: true, data: { deleted: true } });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Not authorized to delete this comment' });
      }
      fastify.log.error(`[DELETE comments/:commentId] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
