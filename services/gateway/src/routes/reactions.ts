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
import {
  sendSuccess,
  sendBadRequest,
  sendForbidden,
  sendNotFound,
  sendInternalError,
} from '../utils/response.js';
import { ReactionService } from '../services/ReactionService.js';
import { notifyReactionAdded } from '../services/notifications/reactionNotify.js';
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
        return sendBadRequest(reply, 'messageId and emoji are required');
      }

      // Déterminer l'ID utilisateur (authentifié ou anonyme)
      const actualUserId = !isAnonymous ? userId : undefined;
      const actualAnonymousUserId = isAnonymous ? anonymousUserId : undefined;

      // Résoudre le participantId
      let participantId = authRequest.authContext.participantId;

      if (!participantId && !isAnonymous && userId) {
        const msg = await prisma.message.findUnique({
          where: { id: messageId },
          select: { conversationId: true },
        });
        if (msg) {
          const participant = await prisma.participant.findFirst({
            where: { userId, conversationId: msg.conversationId, isActive: true },
            select: { id: true },
          });
          participantId = participant?.id;
        }
      }

      if (!participantId) {
        return sendForbidden(reply, 'You are not a participant of this conversation');
      }

      const reaction = await reactionService.addReaction({
        messageId,
        emoji,
        participantId,
      });

      if (!reaction) {
        return sendInternalError(reply, 'Failed to add reaction');
      }

      // Récupérer la conversation pour savoir à qui broadcaster
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true }
      });

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        messageId,
        emoji,
        'add',
        participantId,
        message?.conversationId ?? messageId
      );

      // Broadcast via Socket.IO à tous les participants de la conversation
      if (socketIOHandler) {

        if (message) {
          // Broadcaster l'événement à tous les participants de la conversation
          // Note: La méthode broadcastToConversation sera ajoutée au handler Socket.IO
          fastify.socketIOHandler.getManager()?.getIO().to(ROOMS.conversation(message.conversationId)).emit(
            SERVER_EVENTS.REACTION_ADDED,
            updateEvent
          );
        }
      }

      // Notifier l'auteur du message — PARITÉ avec le handler socket `reaction:add`
      // via la source unique `notifyReactionAdded`. La route REST broadcastait
      // `REACTION_ADDED` à la room mais ne créait AUCUNE notification/push : les
      // réactions envoyées via l'outbox/REST (chemin iOS) ne déclenchaient donc
      // jamais de notif. Fire-and-forget : ne bloque pas la réponse 201.
      void notifyReactionAdded(
        { prisma, notificationService: fastify.notificationService },
        { messageId, reactorParticipantId: participantId, emoji, isAnonymous }
      ).catch((error: unknown) => {
        fastify.log.error({ error }, 'REST reaction notification creation failed');
      });

      return sendSuccess(reply, reaction, { statusCode: 201 });
    } catch (error) {
      fastify.log.error({ error }, 'Error adding reaction');

      // Gestion des erreurs spécifiques
      if (error.message === 'Invalid emoji format') {
        return sendBadRequest(reply, 'Invalid emoji format');
      }

      if (error.message === 'Message not found') {
        return sendNotFound(reply, 'Message not found');
      }

      if (error.message.includes('not a member') || error.message.includes('not a participant')) {
        return sendForbidden(reply, 'Access denied to this conversation');
      }

      return sendInternalError(reply, 'Failed to add reaction');
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

      // Résoudre le participantId
      let removeParticipantId = authRequest.authContext.participantId;

      if (!removeParticipantId && !isAnonymous && userId) {
        const msg = await prisma.message.findUnique({
          where: { id: messageId },
          select: { conversationId: true },
        });
        if (msg) {
          const participant = await prisma.participant.findFirst({
            where: { userId, conversationId: msg.conversationId, isActive: true },
            select: { id: true },
          });
          removeParticipantId = participant?.id;
        }
      }

      if (!removeParticipantId) {
        return sendForbidden(reply, 'You are not a participant of this conversation');
      }

      const removed = await reactionService.removeReaction({
        messageId,
        emoji: decodedEmoji,
        participantId: removeParticipantId,
      });

      if (!removed) {
        // Idempotent DELETE: the reaction is already absent — the caller's
        // desired end-state is achieved. Return success (nothing changed → no
        // broadcast) instead of 404, which the iOS outbox treats as a permanent
        // reject and rolls the optimistic un-react back, re-showing a reaction
        // that is gone. Mirrors the idempotent P2002 handling on the add path.
        return sendSuccess(reply, { message: 'Reaction already absent' });
      }

      // Récupérer la conversation pour broadcaster
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true }
      });

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        messageId,
        decodedEmoji,
        'remove',
        removeParticipantId,
        message?.conversationId ?? messageId
      );

      // Broadcast via Socket.IO
      if (socketIOHandler) {

        if (message) {
          fastify.socketIOHandler.getManager()?.getIO().to(ROOMS.conversation(message.conversationId)).emit(
            SERVER_EVENTS.REACTION_REMOVED,
            updateEvent
          );
        }
      }

      return sendSuccess(reply, { message: 'Reaction removed successfully' });
    } catch (error) {
      fastify.log.error({ error }, 'Error removing reaction');

      if (error.message === 'Invalid emoji format') {
        return sendBadRequest(reply, 'Invalid emoji format');
      }

      return sendInternalError(reply, 'Failed to remove reaction');
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
              participants: true
            }
          }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message not found');
      }

      // Vérifier les permissions
      if (!isAnonymous) {
        const isMember = message.conversation.participants.some(m => m.userId === userId);
        if (!isMember) {
          return sendForbidden(reply, 'Access denied to this conversation');
        }
      } else {
        const isParticipant = message.conversation.participants.some(
          p => p.id === anonymousUserId
        );
        if (!isParticipant) {
          return sendForbidden(reply, 'Access denied to this conversation');
        }
      }

      // Résoudre le participantId courant
      let currentParticipantId = authRequest.authContext.participantId;
      if (!currentParticipantId && !isAnonymous && userId) {
        const participant = await prisma.participant.findFirst({
          where: { userId, conversationId: message.conversationId, isActive: true },
          select: { id: true },
        });
        currentParticipantId = participant?.id;
      }

      // Récupérer les réactions avec agrégation
      const reactions = await reactionService.getMessageReactions({
        messageId,
        currentParticipantId,
      });

      return sendSuccess(reply, reactions);
    } catch (error) {
      fastify.log.error({ error }, 'Error getting reactions');

      return sendInternalError(reply, 'Failed to get reactions');
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
        return sendForbidden(reply, 'Anonymous users cannot access user reactions');
      }

      // Les utilisateurs ne peuvent voir que leurs propres réactions
      // (sauf admins - à implémenter si nécessaire)
      if (currentUserId !== targetUserId) {
        return sendForbidden(reply, 'You can only view your own reactions');
      }

      // Récupérer les réactions de l'utilisateur
      const reactions = await reactionService.getParticipantReactions(targetUserId);

      return sendSuccess(reply, reactions);
    } catch (error) {
      fastify.log.error({ error }, 'Error getting user reactions');

      return sendInternalError(reply, 'Failed to get user reactions');
    }
  });
}
