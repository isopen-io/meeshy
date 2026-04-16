import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { MessageReadStatusService } from '../services/MessageReadStatusService.js';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService.js';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateParams, validateQuery } from '../validation/helpers.js';
import { MessageIdParamSchema, ConversationIdParamSchema, ReadStatusesQuerySchema } from '../validation/message-read-status-schemas.js';

interface MessageParams {
  messageId: string;
}

interface ConversationParams {
  conversationId: string;
}

interface MessageIdsQuery {
  messageIds?: string;
}

export default async function messageReadStatusRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const readStatusService = new MessageReadStatusService(prisma);
  const privacyPreferencesService = new PrivacyPreferencesService(prisma);

  // Middleware d'authentification
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /messages/:messageId/read-status
   * Récupère le statut de lecture d'un message spécifique
   */
  fastify.get<{
    Params: MessageParams;
  }>('/messages/:messageId/read-status', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageIdParamSchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          conversationId: true,
          conversation: {
            include: {
              participants: {
                where: { userId: userId },
                select: { userId: true }
              }
            }
          }
        }
      });

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé'
        });
      }

      // Vérifier que l'utilisateur a accès à cette conversation
      if (!message.conversation.participants.length) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à ce message'
        });
      }

      // Récupérer le statut de lecture
      const status = await readStatusService.getMessageReadStatus(
        messageId,
        message.conversationId
      );

      return reply.send({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('[MessageReadStatus] Error fetching message read status:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération du statut de lecture'
      });
    }
  });

  /**
   * GET /conversations/:conversationId/read-statuses
   * Récupère les statuts de lecture pour plusieurs messages d'une conversation
   * Query params: messageIds (comma-separated)
   */
  fastify.get<{
    Params: ConversationParams;
    Querystring: MessageIdsQuery;
  }>('/conversations/:conversationId/read-statuses', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(ConversationIdParamSchema), validateQuery(ReadStatusesQuerySchema)]
  }, async (request, reply) => {
    try {
      const { conversationId } = request.params;
      const { messageIds } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier l'accès à la conversation
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId,
          userId: userId,
          isActive: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Parser les messageIds
      const messageIdArray = messageIds ? messageIds.split(',') : [];

      if (messageIdArray.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Au moins un messageId requis'
        });
      }

      // Récupérer les statuts
      const statusMap = await readStatusService.getConversationReadStatuses(
        conversationId,
        messageIdArray
      );

      // Convertir Map en objet pour JSON
      const statusObject = Object.fromEntries(statusMap);

      return reply.send({
        success: true,
        data: statusObject
      });

    } catch (error) {
      console.error('[MessageReadStatus] Error fetching conversation read statuses:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des statuts de lecture'
      });
    }
  });

  /**
   * POST /conversations/:conversationId/mark-as-read
   * Marque tous les messages d'une conversation comme lus
   * (L'utilisateur a ouvert la conversation et scrollé jusqu'au dernier message)
   */
  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:conversationId/mark-as-read', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(ConversationIdParamSchema)]
  }, async (request, reply) => {
    try {
      const { conversationId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier l'accès à la conversation
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId,
          userId: userId,
          isActive: true
        },
        select: { id: true }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Marquer comme lu (participantId, pas userId)
      await readStatusService.markMessagesAsRead(membership.id, conversationId);

      // PRIVACY: Vérifier si l'utilisateur a activé showReadReceipts avant de broadcaster
      const shouldShowReadReceipts = await privacyPreferencesService.shouldShowReadReceipts(
        userId,
        false // Les utilisateurs authentifiés ne sont pas anonymes ici
      );

      // Émettre événement Socket.IO seulement si l'utilisateur permet les read receipts
      if (shouldShowReadReceipts) {
        try {
          await broadcastReadStatusUpdate(fastify, prisma, readStatusService, {
            conversationId,
            participantId: membership.id,
            userId,
            type: 'read'
          });
        } catch (socketError) {
          console.error('[MessageReadStatus] Erreur lors de la diffusion Socket.IO:', socketError);
          // Ne pas faire échouer la requête si Socket.IO échoue
        }
      }

      return reply.send({
        success: true,
        data: { message: 'Messages marqués comme lus' }
      });

    } catch (error) {
      console.error('[MessageReadStatus] Error marking messages as read:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la mise à jour du statut de lecture'
      });
    }
  });

  /**
   * POST /conversations/:conversationId/mark-as-received
   * Marque tous les messages d'une conversation comme reçus
   * (L'utilisateur s'est connecté mais n'a pas encore ouvert la conversation)
   */
  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:conversationId/mark-as-received', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(ConversationIdParamSchema)]
  }, async (request, reply) => {
    try {
      const { conversationId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier l'accès à la conversation
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId,
          userId: userId,
          isActive: true
        },
        select: { id: true }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Marquer comme reçu (participantId, pas userId)
      await readStatusService.markMessagesAsReceived(membership.id, conversationId);

      // PRIVACY: Vérifier si l'utilisateur a activé showReadReceipts avant de broadcaster
      // Note: Les "received" (delivery receipts) suivent aussi la préférence showReadReceipts
      const shouldShowReadReceipts = await privacyPreferencesService.shouldShowReadReceipts(
        userId,
        false // Les utilisateurs authentifiés ne sont pas anonymes ici
      );

      // Émettre événement Socket.IO seulement si l'utilisateur permet les read receipts
      if (shouldShowReadReceipts) {
        try {
          await broadcastReadStatusUpdate(fastify, prisma, readStatusService, {
            conversationId,
            participantId: membership.id,
            userId,
            type: 'received'
          });
        } catch (socketError) {
          console.error('[MessageReadStatus] Erreur lors de la diffusion Socket.IO:', socketError);
        }
      }

      return reply.send({
        success: true,
        data: { message: 'Messages marqués comme reçus' }
      });

    } catch (error) {
      console.error('[MessageReadStatus] Error marking messages as received:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la mise à jour du statut de réception'
      });
    }
  });
}

/**
 * Broadcast a `read-status:updated` event to the conversation room AND every
 * active participant's user room.
 *
 * Historically, this event was only sent to the conversation room. That caused
 * message authors to miss delivery/read receipts whenever they were not
 * actively viewing the conversation (e.g. returned to the conversation list
 * after sending). Since the iOS/web clients leave the conversation room on
 * view dismiss, their own sent messages' checkmarks would remain stuck on
 * "sent" until they reopened the conversation.
 *
 * Emitting to the union of rooms via a single chained `.to(...).to(...).emit(...)`
 * call ensures Socket.IO deduplicates delivery per socket, so clients in both
 * rooms still receive the event exactly once.
 */
async function broadcastReadStatusUpdate(
  fastify: FastifyInstance,
  prisma: FastifyInstance['prisma'],
  readStatusService: MessageReadStatusService,
  args: {
    conversationId: string;
    participantId: string;
    userId: string;
    type: 'read' | 'received';
  }
): Promise<void> {
  const socketIOHandler = fastify.socketIOHandler;
  const socketIOManager = socketIOHandler?.getManager?.();
  if (!socketIOManager) return;

  const [summary, activeParticipants] = await Promise.all([
    readStatusService.getLatestMessageSummary(args.conversationId),
    prisma.participant.findMany({
      where: { conversationId: args.conversationId, isActive: true },
      select: { userId: true }
    })
  ]);

  const payload = {
    conversationId: args.conversationId,
    participantId: args.participantId,
    userId: args.userId,
    type: args.type,
    updatedAt: new Date(),
    summary
  };

  const io = (socketIOManager as any).io;
  const convRoom = ROOMS.conversation(args.conversationId);

  // Chain rooms so Socket.IO delivers the event at most once per socket,
  // even if a socket belongs to both the conversation room and a user room.
  let emitter: any = io.to(convRoom);
  const seenRooms = new Set<string>([convRoom]);
  for (const p of activeParticipants) {
    if (!p.userId) continue;
    const userRoom = ROOMS.user(p.userId);
    if (seenRooms.has(userRoom)) continue;
    seenRooms.add(userRoom);
    emitter = emitter.to(userRoom);
  }

  emitter.emit(SERVER_EVENTS.READ_STATUS_UPDATED, payload);
}
