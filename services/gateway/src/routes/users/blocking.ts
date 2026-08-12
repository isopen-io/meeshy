import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendConflict, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import type { AuthenticatedRequest } from './types';
import { withMutationLog } from '../../utils/withMutationLog';
import { getCacheStore } from '../../services/CacheStore';
import { blockCacheKey } from '../../utils/block-cache';

export async function blockUser(fastify: FastifyInstance) {
  fastify.post<{ Params: { userId: string } }>('/users/:userId/block', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Block a user. Adds the target user to the authenticated user\'s blocked list. Cannot block yourself.',
      tags: ['users'],
      summary: 'Block a user',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'ID of the user to block (MongoDB ObjectId)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'User blocked' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const currentUserId = authContext.userId;
      const targetUserId = request.params.userId;

      if (!isValidMongoId(targetUserId)) {
        return sendBadRequest(reply, 'Invalid user ID format');
      }

      if (currentUserId === targetUserId) {
        return sendBadRequest(reply, 'You cannot block yourself');
      }

      const targetUser = await fastify.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true }
      });

      if (!targetUser) {
        return sendNotFound(reply, 'User not found');
      }

      const currentUser = await fastify.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { blockedUserIds: true }
      });

      if (currentUser?.blockedUserIds.includes(targetUserId)) {
        return sendConflict(reply, 'User is already blocked');
      }

      // Idempotent via clientMutationId. The `id` recorded in the
      // MutationLog row is the target user's id — there is no single
      // canonical record produced by a block, but using the target id
      // lets a replay confirm the same action was previously applied.
      await withMutationLog({
        request,
        fastify,
        userId: currentUserId!,
        kind: 'blockUser',
        op: async () => {
          await fastify.prisma.user.update({
            where: { id: currentUserId },
            data: {
              blockedUserIds: { push: targetUserId }
            }
          });
          return { id: targetUserId };
        },
        onDuplicate: async () => ({ id: targetUserId }),
      });

      // Invalidate the symmetric DM send-gate cache so the block takes effect
      // immediately. Without this, the up-to-300s `blocks:` entry warmed by an
      // earlier send keeps letting the just-blocked user's messages through.
      try { await getCacheStore().del(blockCacheKey(currentUserId!, targetUserId)); } catch { /* best-effort */ }

      return sendSuccess(reply, { message: 'User blocked' });
    } catch (error) {
      logError(fastify.log, '[BLOCKING] Error blocking user', error);
      return sendInternalError(reply, 'Failed to block user');
    }
  });
}

export async function unblockUser(fastify: FastifyInstance) {
  fastify.delete<{ Params: { userId: string } }>('/users/:userId/block', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Unblock a user. Removes the target user from the authenticated user\'s blocked list.',
      tags: ['users'],
      summary: 'Unblock a user',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'ID of the user to unblock (MongoDB ObjectId)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'User unblocked' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const currentUserId = authContext.userId;
      const targetUserId = request.params.userId;

      if (!isValidMongoId(targetUserId)) {
        return sendBadRequest(reply, 'Invalid user ID format');
      }

      const currentUser = await fastify.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { blockedUserIds: true }
      });

      if (!currentUser?.blockedUserIds.includes(targetUserId)) {
        return sendNotFound(reply, 'User is not in your blocked list');
      }

      // Idempotent via clientMutationId. The MutationLog row records
      // the target user id so replays are observably no-ops.
      await withMutationLog({
        request,
        fastify,
        userId: currentUserId!,
        kind: 'unblockUser',
        op: async () => {
          await fastify.prisma.user.update({
            where: { id: currentUserId },
            data: {
              blockedUserIds: {
                set: currentUser.blockedUserIds.filter(id => id !== targetUserId)
              }
            }
          });
          return { id: targetUserId };
        },
        onDuplicate: async () => ({ id: targetUserId }),
      });

      // Invalidate the symmetric DM send-gate cache so the unblock takes effect
      // immediately. Without this, the up-to-300s `blocks:` entry keeps
      // rejecting the just-unblocked user's messages with USER_BLOCKED.
      try { await getCacheStore().del(blockCacheKey(currentUserId!, targetUserId)); } catch { /* best-effort */ }

      return sendSuccess(reply, { message: 'User unblocked' });
    } catch (error) {
      logError(fastify.log, '[BLOCKING] Error unblocking user', error);
      return sendInternalError(reply, 'Failed to unblock user');
    }
  });
}

export async function getBlockedUsers(fastify: FastifyInstance) {
  fastify.get('/users/me/blocked-users', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get the list of users blocked by the authenticated user. Returns user details (username, displayName, avatar) for each blocked user.',
      tags: ['users'],
      summary: 'Get blocked users list',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  displayName: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const currentUserId = authContext.userId;

      const currentUser = await fastify.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { blockedUserIds: true }
      });

      if (!currentUser || currentUser.blockedUserIds.length === 0) {
        return sendSuccess(reply, []);
      }

      const blockedUsers = await fastify.prisma.user.findMany({
        where: { id: { in: currentUser.blockedUserIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true
        }
      });

      return sendSuccess(reply, blockedUsers);
    } catch (error) {
      logError(fastify.log, '[BLOCKING] Error fetching blocked users', error);
      return sendInternalError(reply, 'Failed to fetch blocked users');
    }
  });
}
