import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

export function registerStatsRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
) {
  fastify.get<{ Params: { id: string } }>('/conversations/:id/stats', {
    schema: {
      description: 'Get pre-aggregated message statistics for a conversation',
      tags: ['conversations', 'analytics'],
      summary: 'Get conversation message stats',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const authContext = authRequest.authContext;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'You do not have access to this conversation');
      }

      const stats = await conversationMessageStatsService.getStats(prisma, conversationId);

      const participantStats = (stats.participantStats ?? {}) as Record<string, unknown>;
      const participantIds = Object.keys(participantStats);

      let enrichedParticipants: Array<Record<string, unknown>> = [];
      if (participantIds.length > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, username: true, displayName: true, avatar: true }
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        for (const [userId, stat] of Object.entries(participantStats)) {
          const user = userMap.get(userId);
          enrichedParticipants.push({
            userId,
            ...(stat as Record<string, unknown>),
            username: user?.username ?? null,
            displayName: user?.displayName ?? null,
            avatar: user?.avatar ?? null,
          });
        }
      }

      const dailyActivity = (stats.dailyActivity ?? {}) as Record<string, number>;
      const dailyActivityArray = Object.entries(dailyActivity)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const languageDistribution = (stats.languageDistribution ?? {}) as Record<string, number>;
      const languageDistributionArray = Object.entries(languageDistribution)
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count);

      return sendSuccess(reply, {
        ...stats,
        participantStats: enrichedParticipants,
        dailyActivity: dailyActivityArray,
        languageDistribution: languageDistributionArray,
      });

    } catch (error) {
      sendInternalError(reply, 'Error fetching conversation stats');
    }
  });
}
