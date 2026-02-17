import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { generateDefaultConversationTitle } from '@meeshy/shared/utils/conversation-helpers';
import { MessageReadStatusService } from '../../services/MessageReadStatusService.js';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { SearchQuery } from './types';

/**
 * Enregistre les routes de recherche de conversations
 */
export function registerSearchRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour rechercher des conversations
  fastify.get<{ Querystring: SearchQuery }>('/conversations/search', {
    schema: {
      description: 'Search conversations by title or participant names',
      tags: ['conversations'],
      summary: 'Search conversations',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: conversationMinimalSchema
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { q } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!q || q.trim().length === 0) {
        return reply.send({ success: true, data: [] });
      }

      // Rechercher dans TOUTES les conversations publiques/globales + celles dont l'utilisateur est membre
      const conversations = await prisma.conversation.findMany({
        where: {
          isActive: true,
          AND: [
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                {
                  members: {
                    some: {
                      user: {
                        OR: [
                          { firstName: { contains: q, mode: 'insensitive' } },
                          { lastName: { contains: q, mode: 'insensitive' } },
                          { username: { contains: q, mode: 'insensitive' } },
                          { displayName: { contains: q, mode: 'insensitive' } }
                        ],
                        isActive: true
                      }
                    }
                  }
                }
              ]
            },
            {
              OR: [
                // Conversations publiques ou globales (accessibles à tous)
                { type: 'public' },
                { type: 'global' },
                // OU conversations dont l'utilisateur est membre
                { members: { some: { userId, isActive: true } } }
              ]
            }
          ]
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true,
                  lastActiveAt: true
                }
              }
            },
            take: 10 // Limiter le nombre de membres retournés pour les performances
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 }
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 50 // Limiter le nombre de résultats
      });

      // Compute unread counts for all matched conversations
      const readStatusService = new MessageReadStatusService(prisma);
      const conversationIds = conversations.map(c => c.id);
      const unreadCountMap = await readStatusService.getUnreadCountsForConversations(userId, conversationIds);

      // Transformer les conversations pour garantir qu'un titre existe toujours
      const conversationsWithTitle = conversations.map((conversation) => {
        const displayTitle = conversation.title && conversation.title.trim() !== ''
          ? conversation.title
          : generateDefaultConversationTitle(
              conversation.members.map((m: any) => ({
                id: m.userId,
                displayName: m.user?.displayName,
                username: m.user?.username,
                firstName: m.user?.firstName,
                lastName: m.user?.lastName
              })),
              userId
            );

        const unreadCount = unreadCountMap.get(conversation.id) || 0;

        return {
          ...conversation,
          title: displayTitle,
          lastMessage: conversation.messages[0] || null,
          unreadCount
        };
      });

      reply.send({ success: true, data: conversationsWithTitle });
    } catch (error) {
      console.error('Error searching conversations:', error);
      reply.status(500).send({ success: false, error: 'Erreur lors de la recherche de conversations' });
    }
  });
}
