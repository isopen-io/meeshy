import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createLegacyHybridRequest } from './utils/link-helpers';
import { findShareLinkByIdentifier, getConversationMessages, countConversationMessages } from './utils/prisma-queries';
import { formatMessageWithUnifiedSender } from './utils/message-formatters';
import {
  conversationSummarySchema,
  messageSchema
} from './types';

export async function registerRetrievalRoutes(fastify: FastifyInstance) {
  const authOptional = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Récupérer les informations d'un lien par linkId ou conversationShareLinkId
  fastify.get('/links/:identifier', {
    onRequest: [authOptional],
    schema: {
      description: 'Get detailed information about a share link including conversation details, participants, messages, and permissions. Supports both linkId (mshy_*), database ID (ObjectId), and custom identifier formats. Returns different data based on user type (member vs anonymous). Members of the conversation receive a redirectTo field pointing to the full conversation view.',
      tags: ['links'],
      summary: 'Get share link details',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier (linkId starting with mshy_, database ObjectId, or custom identifier)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            default: '50',
            description: 'Maximum number of messages to return',
            example: '50'
          },
          offset: {
            type: 'string',
            default: '0',
            description: 'Number of messages to skip for pagination',
            example: '0'
          }
        }
      },
      response: {
        200: {
          description: 'Share link details retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                conversation: conversationSummarySchema,
                link: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    linkId: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    description: { type: 'string', nullable: true },
                    allowViewHistory: { type: 'boolean' },
                    allowAnonymousMessages: { type: 'boolean' },
                    allowAnonymousFiles: { type: 'boolean' },
                    allowAnonymousImages: { type: 'boolean' },
                    requireEmail: { type: 'boolean' },
                    requireNickname: { type: 'boolean' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                    isActive: { type: 'boolean' }
                  }
                },
                userType: { type: 'string', enum: ['member', 'anonymous'], description: 'Current user relationship to conversation' },
                redirectTo: { type: 'string', description: 'Redirect URL for members (e.g., /conversations/:id)' },
                messages: { type: 'array', items: messageSchema },
                stats: {
                  type: 'object',
                  properties: {
                    totalMessages: { type: 'number' },
                    totalMembers: { type: 'number' },
                    totalAnonymousParticipants: { type: 'number' },
                    onlineAnonymousParticipants: { type: 'number' },
                    hasMore: { type: 'boolean' }
                  }
                },
                members: { type: 'array', items: { type: 'object' } },
                anonymousParticipants: { type: 'array', items: { type: 'object' } },
                currentUser: { type: 'object', nullable: true, description: 'Current user information with permissions' }
              }
            }
          }
        },
        403: {
          description: 'Access denied to this link',
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
      const hybridRequest = createLegacyHybridRequest(request);

      const shareLink = await findShareLinkByIdentifier(fastify.prisma, identifier);

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de partage non trouvé'
        });
      }

      // Vérifier les permissions d'accès
      let hasAccess = false;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        if (shareLink.conversation.identifier === "meeshy") {
          hasAccess = true;
        } else {
          const isMember = shareLink.conversation.members.some(
            member => member.userId === hybridRequest.user.id && member.isActive
          );
          hasAccess = isMember;
        }
      } else if (hybridRequest.isAnonymous && hybridRequest.anonymousParticipant) {
        hasAccess = hybridRequest.anonymousParticipant.shareLinkId === shareLink.id;
      } else {
        hasAccess = shareLink.isActive && shareLink.allowViewHistory;
      }

      if (!hasAccess) {
        return reply.status(403).send({
          success: false,
          message: 'Accès non autorisé à ce lien'
        });
      }

      const { limit = '50', offset = '0' } = request.query as { limit?: string; offset?: string };

      const messages = await getConversationMessages(
        fastify.prisma,
        shareLink.conversationId,
        parseInt(limit),
        parseInt(offset)
      );

      const totalMessages = await countConversationMessages(fastify.prisma, shareLink.conversationId);

      const formattedMessages = messages.map(formatMessageWithUnifiedSender);

      // Déterminer le type d'utilisateur et les données de l'utilisateur actuel
      let userType: 'anonymous' | 'member';
      let currentUser: any = null;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        const isMember = shareLink.conversation.members.some(
          member => member.userId === hybridRequest.user.id && member.isActive
        );
        userType = isMember ? 'member' : 'anonymous';
        currentUser = {
          id: hybridRequest.user.id,
          username: hybridRequest.user.username,
          firstName: hybridRequest.user.firstName,
          lastName: hybridRequest.user.lastName,
          displayName: hybridRequest.user.displayName,
          language: hybridRequest.user.systemLanguage,
          isMeeshyer: true,
          permissions: {
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true
          }
        };
      } else if (hybridRequest.isAnonymous && hybridRequest.anonymousParticipant) {
        userType = 'anonymous';
        const participant = hybridRequest.anonymousParticipant;
        currentUser = {
          id: participant.id,
          username: participant.username,
          firstName: participant.firstName,
          lastName: participant.lastName,
          displayName: undefined,
          language: participant.language,
          isMeeshyer: false,
          permissions: {
            canSendMessages: participant.canSendMessages,
            canSendFiles: participant.canSendFiles,
            canSendImages: participant.canSendImages
          }
        };
      }

      const stats = {
        totalMessages,
        totalMembers: shareLink.conversation.members.length,
        totalAnonymousParticipants: shareLink.conversation.anonymousParticipants.length,
        onlineAnonymousParticipants: shareLink.conversation.anonymousParticipants.filter(p => p.isOnline).length,
        hasMore: totalMessages > parseInt(offset) + messages.length
      };

      return reply.send({
        success: true,
        data: {
          conversation: {
            id: shareLink.conversation.id,
            title: shareLink.conversation.title,
            description: shareLink.conversation.description,
            type: shareLink.conversation.type,
            createdAt: shareLink.conversation.createdAt,
            updatedAt: shareLink.conversation.createdAt
          },
          link: {
            id: shareLink.id,
            linkId: shareLink.linkId,
            name: shareLink.name,
            description: shareLink.description,
            allowViewHistory: shareLink.allowViewHistory,
            allowAnonymousMessages: shareLink.allowAnonymousMessages,
            allowAnonymousFiles: shareLink.allowAnonymousFiles,
            allowAnonymousImages: shareLink.allowAnonymousImages,
            requireEmail: shareLink.requireEmail,
            requireNickname: shareLink.requireNickname,
            expiresAt: shareLink.expiresAt?.toISOString() || null,
            isActive: shareLink.isActive
          },
          userType,
          ...(userType === 'member' && {
            redirectTo: `/conversations/${shareLink.conversationId}`
          }),
          messages: formattedMessages.reverse(),
          stats,
          members: shareLink.conversation.members.map(member => ({
            id: member.id,
            role: member.role,
            joinedAt: member.joinedAt,
            user: {
              id: member.user.id,
              username: member.user.username,
              firstName: member.user.firstName,
              lastName: member.user.lastName,
              displayName: member.user.displayName,
              avatar: member.user.avatar,
              isOnline: member.user.isOnline ?? false,
              lastActiveAt: member.user.lastActiveAt ?? member.joinedAt
            }
          })),
          anonymousParticipants: shareLink.conversation.anonymousParticipants.map(participant => ({
            id: participant.id,
            username: participant.username,
            firstName: participant.firstName,
            lastName: participant.lastName,
            language: participant.language,
            isOnline: participant.isOnline,
            lastActiveAt: participant.joinedAt,
            joinedAt: participant.joinedAt,
            canSendMessages: participant.canSendMessages,
            canSendFiles: participant.canSendFiles,
            canSendImages: participant.canSendImages
          })),
          currentUser
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get link info error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
