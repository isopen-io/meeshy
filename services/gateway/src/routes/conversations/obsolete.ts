/**
 * #14643 — `DELETE /conversations/:id/obsolete` : rendre une conversation
 * OBSOLÈTE. Même permission que `DELETE /conversations/:id` (administrateur de
 * la conversation, ou rôle de plateforme équivalent) ; l'effet vit dans
 * `services/conversations/obsoleteConversation.ts`.
 *
 * Rétrocompatible : la conversation est AUSSI fermée (`isActive: false`,
 * `closedAt`, `conversation:closed`), donc un ancien client qui ne connaît ni
 * cette route ni `conversation:obsoleted` la retire de sa liste comme avant.
 */
import type { FastifyInstance, preValidationHookHandler } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendForbidden, sendInternalError } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { obsoleteConversation } from '../../services/conversations/obsoleteConversation';
import { getSharedNotificationService } from '../../services/notifications/notification-service-registry';

const logger = enhancedLogger.child({ module: 'ConversationObsoleteRoute' });

type ObsoleteParams = { readonly id: string };

export function registerObsoleteConversationRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: preValidationHookHandler,
): void {
  fastify.delete<{ Params: ObsoleteParams }>('/conversations/:id/obsolete', {
    schema: {
      description: 'Make a conversation obsolete (#14643): its content becomes unreadable at once, it leaves every member\'s list (also closed, as DELETE /conversations/:id does), and its data is erased after purgeAfter (48 h). Requires the conversation admin role. Idempotent: a second call returns the first dates.',
      tags: ['conversations'],
      summary: 'Make conversation obsolete',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Conversation ID or identifier' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                conversationId: { type: 'string' },
                obsoletedAt: { type: 'string', format: 'date-time' },
                purgeAfter: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [requiredAuth],
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const { id } = request.params;

      if (id === 'meeshy') {
        return sendForbidden(reply, 'The global conversation cannot be made obsolete');
      }

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const membership = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
        select: { role: true },
      });
      const allowed = actorHasMinimumRole(
        { conversationRole: membership?.role, platformRole: authRequest.authContext.registeredUser?.role },
        MemberRole.ADMIN,
      );
      if (!allowed) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à rendre cette conversation obsolète');
      }

      const manager = fastify.socketIOHandler?.getManager();
      const outcome = await obsoleteConversation(
        { prisma, io: manager?.getIO(), manager, announcer: getSharedNotificationService() },
        { conversationId, actorId: userId },
      );
      if (outcome.kind === 'not-found') {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }
      if (outcome.kind === 'protected') {
        return sendForbidden(reply, 'The global conversation cannot be made obsolete');
      }

      return sendSuccess(reply, {
        conversationId: outcome.conversationId,
        obsoletedAt: outcome.obsoletedAt.toISOString(),
        purgeAfter: outcome.purgeAfter.toISOString(),
      });
    } catch (error) {
      logger.error('error making conversation obsolete', { error });
      return sendInternalError(reply, 'Error making conversation obsolete');
    }
  });
}
