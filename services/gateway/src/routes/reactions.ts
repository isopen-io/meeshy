/**
 * Routes API REST pour les réactions emoji sur les messages
 *
 * Routes:
 * - POST /api/reactions - Ajouter une réaction
 * - DELETE /api/reactions/:messageId/:emoji - Supprimer une réaction
 * - GET /api/reactions/:messageId - Récupérer les réactions d'un message
 * - GET /api/reactions/user/:userId - Récupérer les réactions d'un utilisateur
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { ReactionService } from '../services/ReactionService.js';
import type {
  ReactionAddData,
  ReactionRemoveData,
  ReactionUpdateEventData,
  ReactionSyncEventData,
} from '@meeshy/shared/types';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import {
  reactionSchema,
  reactionSummarySchema,
  addReactionRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

interface AddReactionBody {
  messageId: string;
  emoji: string;
}

interface RemoveReactionParams {
  messageId: string;
  emoji: string;
}

interface GetReactionsParams {
  messageId: string;
}

interface GetUserReactionsParams {
  userId: string;
}

export default async function reactionRoutes(fastify: FastifyInstance) {
  // Récupérer prisma décoré par le serveur
  const prisma = fastify.prisma;

  // Instancier le service de réactions
  const reactionService = new ReactionService(prisma);

  // Récupérer le gestionnaire Socket.IO pour broadcast
  const socketIOHandler = fastify.socketIOHandler;

  // Middleware d'authentification requis pour les réactions
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: true // Les anonymes peuvent aussi réagir
  });

  /**
   * POST /api/reactions - Ajouter une réaction
   */
  fastify.post<{
    Body: AddReactionBody;
  }>('/reactions', {
    preValidation: [requiredAuth],
    schema: {
      description: 'Add an emoji reaction to a message. Both authenticated and anonymous users can add reactions. The reaction will be broadcast to all conversation participants via Socket.IO.',
      tags: ['reactions'],
      summary: 'Add emoji reaction to message',
      body: {
        type: 'object',
        required: ['messageId', 'emoji'],
        properties: {
          messageId: { type: 'string', description: 'Message ID to react to' },
          emoji: {
            type: 'string',
            minLength: 1,
            maxLength: 10,
            description: 'Emoji character to add as reaction'
          }
        }
      },
      response: {
        201: {
          description: 'Reaction added successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: reactionSchema
          }
        },
        400: {
          description: 'Bad request - Invalid input or emoji format',
          ...errorResponseSchema
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - Access denied to conversation',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Message not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { messageId, emoji } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const anonymousUserId = authRequest.authContext.sessionToken;
      const isAnonymous = authRequest.authContext.isAnonymous;

      // Validation
      if (!messageId || !emoji) {
        return reply.status(400).send({
          success: false,
          error: 'messageId and emoji are required'
        });
      }

      // Déterminer l'ID utilisateur (authentifié ou anonyme)
      const actualUserId = !isAnonymous ? userId : undefined;
      const actualAnonymousUserId = isAnonymous ? anonymousUserId : undefined;

      // Ajouter la réaction
      const reaction = await reactionService.addReaction({
        messageId,
        emoji,
        userId: actualUserId,
        anonymousId: actualAnonymousUserId
      });

      if (!reaction) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to add reaction'
        });
      }

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        messageId,
        emoji,
        'add',
        actualUserId,
        actualAnonymousUserId
      );

      // Broadcast via Socket.IO à tous les participants de la conversation
      if (socketIOHandler) {
        // Récupérer la conversation pour savoir à qui broadcaster
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { conversationId: true }
        });

        if (message) {
          // Broadcaster l'événement à tous les participants de la conversation
          // Note: La méthode broadcastToConversation sera ajoutée au handler Socket.IO
          (socketIOHandler as any).io?.to(ROOMS.conversation(message.conversationId)).emit(
            SERVER_EVENTS.REACTION_ADDED,
            updateEvent
          );
        }
      }

      return reply.status(201).send({
        success: true,
        data: reaction
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error adding reaction');

      // Gestion des erreurs spécifiques
      if (error.message === 'Invalid emoji format') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid emoji format'
        });
      }

      if (error.message === 'Message not found') {
        return reply.status(404).send({
          success: false,
          error: 'Message not found'
        });
      }

      if (error.message.includes('not a member') || error.message.includes('not a participant')) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied to this conversation'
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'Failed to add reaction'
      });
    }
  });

  /**
   * DELETE /api/reactions/:messageId/:emoji - Supprimer une réaction
   */
  fastify.delete<{
    Params: RemoveReactionParams;
  }>('/reactions/:messageId/:emoji', {
    preValidation: [requiredAuth],
    schema: {
      description: 'Remove an emoji reaction from a message. Users can only remove their own reactions. The removal will be broadcast to all conversation participants via Socket.IO.',
      tags: ['reactions'],
      summary: 'Remove emoji reaction from message',
      params: {
        type: 'object',
        required: ['messageId', 'emoji'],
        properties: {
          messageId: { type: 'string', description: 'Message ID' },
          emoji: { type: 'string', description: 'URL-encoded emoji character to remove' }
        }
      },
      response: {
        200: {
          description: 'Reaction removed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Reaction removed successfully' }
              }
            }
          }
        },
        400: {
          description: 'Bad request - Invalid emoji format',
          ...errorResponseSchema
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Reaction not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { messageId, emoji } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const anonymousUserId = authRequest.authContext.sessionToken;
      const isAnonymous = authRequest.authContext.isAnonymous;

      // Décoder l'emoji (URL encoded)
      const decodedEmoji = decodeURIComponent(emoji);

      // Déterminer l'ID utilisateur (authentifié ou anonyme)
      const actualUserId = !isAnonymous ? userId : undefined;
      const actualAnonymousUserId = isAnonymous ? anonymousUserId : undefined;

      // Supprimer la réaction
      const removed = await reactionService.removeReaction({
        messageId,
        emoji: decodedEmoji,
        userId: actualUserId,
        anonymousId: actualAnonymousUserId
      });

      if (!removed) {
        return reply.status(404).send({
          success: false,
          error: 'Reaction not found'
        });
      }

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        messageId,
        decodedEmoji,
        'remove',
        actualUserId,
        actualAnonymousUserId
      );

      // Broadcast via Socket.IO
      if (socketIOHandler) {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { conversationId: true }
        });

        if (message) {
          (socketIOHandler as any).io?.to(ROOMS.conversation(message.conversationId)).emit(
            SERVER_EVENTS.REACTION_REMOVED,
            updateEvent
          );
        }
      }

      return reply.send({
        success: true,
        data: { message: 'Reaction removed successfully' }
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error removing reaction');

      if (error.message === 'Invalid emoji format') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid emoji format'
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'Failed to remove reaction'
      });
    }
  });

  /**
   * GET /api/reactions/:messageId - Récupérer les réactions d'un message
   */
  fastify.get<{
    Params: GetReactionsParams;
  }>('/reactions/:messageId', {
    preValidation: [requiredAuth],
    schema: {
      description: 'Get all reactions for a specific message, grouped by emoji with aggregated counts and user information. Returns whether the current user has reacted with each emoji.',
      tags: ['reactions'],
      summary: 'Get message reactions',
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'Message ID' }
        }
      },
      response: {
        200: {
          description: 'Reactions retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                messageId: { type: 'string' },
                reactions: {
                  type: 'array',
                  items: reactionSummarySchema
                },
                totalCount: { type: 'number' },
                userReactions: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - Access denied to conversation',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Message not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const anonymousUserId = authRequest.authContext.sessionToken;
      const isAnonymous = authRequest.authContext.isAnonymous;

      // Vérifier que l'utilisateur a accès au message
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              members: true,
              anonymousParticipants: true
            }
          }
        }
      });

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: 'Message not found'
        });
      }

      // Vérifier les permissions
      if (!isAnonymous) {
        const isMember = message.conversation.members.some(m => m.userId === userId);
        if (!isMember) {
          return reply.status(403).send({
            success: false,
            error: 'Access denied to this conversation'
          });
        }
      } else {
        const isParticipant = message.conversation.anonymousParticipants.some(
          p => p.id === anonymousUserId
        );
        if (!isParticipant) {
          return reply.status(403).send({
            success: false,
            error: 'Access denied to this conversation'
          });
        }
      }

      // Récupérer les réactions avec agrégation
      const reactions = await reactionService.getMessageReactions({
        messageId,
        currentUserId: !isAnonymous ? userId : undefined,
        currentAnonymousUserId: isAnonymous ? anonymousUserId : undefined
      });

      return reply.send({
        success: true,
        data: reactions
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error getting reactions');

      return reply.status(500).send({
        success: false,
        error: 'Failed to get reactions'
      });
    }
  });

  /**
   * GET /api/reactions/user/:userId - Récupérer les réactions d'un utilisateur
   * Note: Seulement pour utilisateurs authentifiés (pas anonymes)
   */
  fastify.get<{
    Params: GetUserReactionsParams;
  }>('/reactions/user/:userId', {
    preValidation: [requiredAuth],
    schema: {
      description: 'Get all reactions created by a specific user. Only authenticated users can access this endpoint, and users can only view their own reactions (unless admin).',
      tags: ['reactions'],
      summary: 'Get user reactions',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID' }
        }
      },
      response: {
        200: {
          description: 'User reactions retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: reactionSchema
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - Anonymous users cannot access or users can only view their own reactions',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { userId: targetUserId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;
      const isAnonymous = authRequest.authContext.isAnonymous;

      // Les utilisateurs anonymes ne peuvent pas accéder à cette route
      if (isAnonymous) {
        return reply.status(403).send({
          success: false,
          error: 'Anonymous users cannot access user reactions'
        });
      }

      // Les utilisateurs ne peuvent voir que leurs propres réactions
      // (sauf admins - à implémenter si nécessaire)
      if (currentUserId !== targetUserId) {
        return reply.status(403).send({
          success: false,
          error: 'You can only view your own reactions'
        });
      }

      // Récupérer les réactions de l'utilisateur
      const reactions = await reactionService.getUserReactions(targetUserId);

      return reply.send({
        success: true,
        data: reactions
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error getting user reactions');

      return reply.status(500).send({
        success: false,
        error: 'Failed to get user reactions'
      });
    }
  });
}
