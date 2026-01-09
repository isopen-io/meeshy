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
  SERVER_EVENTS
} from '@meeshy/shared/types';

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
    preValidation: [requiredAuth]
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
          (socketIOHandler as any).io?.to(message.conversationId).emit(
            'reaction:added',
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
    preValidation: [requiredAuth]
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
          (socketIOHandler as any).io?.to(message.conversationId).emit(
            'reaction:removed',
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
    preValidation: [requiredAuth]
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
    preValidation: [requiredAuth]
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
