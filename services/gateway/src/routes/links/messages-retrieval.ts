import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createLegacyHybridRequest } from './utils/link-helpers';
import { getConversationMessagesWithDetails, countConversationMessages } from './utils/prisma-queries';
import { formatMessageWithSeparateSenders } from './utils/message-formatters';
import {
  conversationSummarySchema,
  messageSchema
} from './types';

export async function registerMessagesRetrievalRoutes(fastify: FastifyInstance) {
  const authOptional = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Récupérer les messages d'un lien
  fastify.get('/links/:identifier/messages', {
    onRequest: [authOptional],
    schema: {
      description: 'Get messages from a conversation via share link with pagination. Returns messages with full sender information (registered users have sender field, anonymous users have anonymousSender field), attachments, reactions, and translations. Supports both authenticated and anonymous users with appropriate access control.',
      tags: ['links', 'messages'],
      summary: 'Get link messages',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier (linkId starting with mshy_ or database ID)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', default: '50', description: 'Maximum number of messages', example: '50' },
          offset: { type: 'string', default: '0', description: 'Number of messages to skip', example: '0' }
        }
      },
      response: {
        200: {
          description: 'Messages retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                messages: { type: 'array', items: messageSchema },
                conversation: conversationSummarySchema,
                hasMore: { type: 'boolean', description: 'Whether more messages are available' },
                total: { type: 'number', description: 'Total number of messages' }
              }
            }
          }
        },
        403: {
          description: 'Access denied to this conversation',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const { identifier } = request.params as { identifier: string };
      const { limit = '50', offset = '0' } = request.query as { limit?: string; offset?: string };
      const hybridRequest = createLegacyHybridRequest(request);

      const isLinkId = identifier.startsWith('mshy_');

      let shareLink;
      if (isLinkId) {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { linkId: identifier },
          include: {
            conversation: {
              select: { id: true, title: true, type: true }
            }
          }
        });
      } else {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { id: identifier },
          include: {
            conversation: {
              select: { id: true, title: true, type: true }
            }
          }
        });
      }

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de partage non trouvé'
        });
      }

      let hasAccess = false;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        const member = await fastify.prisma.conversationMember.findFirst({
          where: {
            conversationId: shareLink.conversationId,
            userId: hybridRequest.user.id,
            isActive: true
          }
        });
        hasAccess = !!member;
      }

      if (hybridRequest.isAnonymous && hybridRequest.anonymousParticipant) {
        hasAccess = hybridRequest.anonymousParticipant.shareLinkId === shareLink.id;
      }

      if (!hasAccess) {
        return reply.status(403).send({
          success: false,
          message: 'Accès non autorisé à cette conversation'
        });
      }

      const messages = await getConversationMessagesWithDetails(
        fastify.prisma,
        shareLink.conversationId,
        parseInt(limit),
        parseInt(offset)
      );

      const totalMessages = await countConversationMessages(fastify.prisma, shareLink.conversationId);

      const formattedMessages = messages.map(formatMessageWithSeparateSenders);

      return reply.send({
        success: true,
        data: {
          messages: formattedMessages.reverse(),
          conversation: shareLink.conversation,
          hasMore: totalMessages > parseInt(offset.toString()) + messages.length,
          total: totalMessages
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get link messages error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
