/**
 * Surface CONSOMMATION VUE-UNIQUE (issue #4284 — découpage de `messages.ts`,
 * 2945 lignes, en fichiers frères par responsabilité). Porte la route
 * `POST /conversations/:id/messages/:messageId/consume`.
 *
 * #7578 — la consommation est PAR PERSONNE. Chaque participant ouvre une fois ;
 * l'ouverture de l'AUTEUR s'enregistre (il ne rouvre pas) mais ne compte jamais ;
 * la purge du CONTENU n'est programmée que lorsque TOUS les destinataires actifs
 * ont ouvert (`computeViewOnceStates`). La bulle survit chez chacun.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { recordViewOnceConsumption } from '../../services/messaging/recordViewOnceConsumption';
import { scheduleViewOnceBurn } from '../../services/messaging/scheduleViewOnceBurn';
import { computeViewOnceStates, type ViewOnceReaderState } from '../../services/messaging/viewOnceAudience';
import { emitViewOnceConsumedPreview } from '../../socketio/emitConversationPreviewUpdate';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { logger } from './messages-shared';

/**
 * Enregistre la route de consommation d'un message à vue unique.
 */
export function registerMessageViewOnceRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  socketIOHandler: any
) {
  // ============================================================================
  // CONSUME VIEW-ONCE MESSAGE
  // ============================================================================

  fastify.post<{
    Params: { id: string; messageId: string };
  }>('/conversations/:id/messages/:messageId/consume', {
    schema: {
      description: 'Open a view-once message once, for the caller only (#7578)',
      tags: ['conversations', 'messages'],
      summary: 'Consume view-once message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to consume' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                messageId: { type: 'string' },
                viewOnceCount: { type: 'number' },
                maxViewOnceCount: { type: 'number' },
                isFullyConsumed: { type: 'boolean' },
                consumedByMe: { type: 'boolean' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const { id, messageId } = request.params;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId }
      });
      if (!message) {
        return sendNotFound(reply, 'Message not found');
      }

      if (!message.isViewOnce) {
        return sendBadRequest(reply, 'Message is not view-once');
      }

      const now = new Date();

      // Le spectateur, et non l'appelant. Un anonyme porte un jeton de session
      // dans `authContext.userId` : le chercher par `userId` ne trouvait
      // jamais sa ligne, si bien qu'il dépensait le budget sans laisser la
      // moindre trace de l'avoir fait. Même ordre de résolution que
      // `canAccessConversation`, dont le succès garantit qu'une de ces deux
      // lectures aboutit.
      const viewParticipant = authRequest.authContext.participantId
        ? await prisma.participant.findFirst({
            where: { id: authRequest.authContext.participantId, conversationId: message.conversationId, isActive: true },
            select: { id: true }
          })
        : await prisma.participant.findFirst({
            where: { conversationId: message.conversationId, userId, isActive: true },
            select: { id: true }
          });

      if (!viewParticipant) {
        return sendForbidden(reply, 'Not a participant');
      }

      // Une unité par SPECTATEUR, pas par ouverture — et l'AUTEUR n'est pas un
      // spectateur de l'audience (#7578) : son ouverture s'enregistre, pour
      // qu'il ne rouvre pas, sans jamais compter pour la purge.
      const byAuthor = message.senderId === viewParticipant.id;
      const { firstConsumption } = await recordViewOnceConsumption(prisma, {
        messageId,
        conversationId: message.conversationId,
        participantId: viewParticipant.id,
        currentViewOnceCount: message.viewOnceCount ?? 0,
        at: now,
        countsTowardAudience: !byAuthor
      });

      // L'audience se RELIT (qui, parmi les destinataires ACTIFS, a ouvert) :
      // le compteur dénormalisé a pu être gonflé par une ouverture d'auteur
      // avant ce lot. Une relecture qui échoue ne programme rien — on ne purge
      // pas ce qu'on n'a pas su compter.
      let audience: ViewOnceReaderState | undefined;
      try {
        audience = (await computeViewOnceStates(prisma, [message], viewParticipant.id)).get(messageId);
      } catch (error) {
        logger.warn(`[CONSUME] view-once audience read failed for ${messageId}`, error);
      }
      const viewOnceCount = audience?.openedCount ?? message.viewOnceCount ?? 0;
      const recipientCount = audience?.recipientCount ?? 0;
      const isFullyConsumed = audience?.isFullyConsumed ?? false;

      logger.info(`[CONSUME] ${byAuthor ? 'Author' : 'Recipient'} ${userId} opened view-once message ${messageId} (${viewOnceCount}/${recipientCount} recipients)`);

      // La purge est programmée, pas exécutée : celui qui vient d'ouvrir n'a
      // pas forcément fini de télécharger. Le balayage purge le CONTENU et garde
      // la bulle. Idempotent (l'échéance ne se repousse jamais), donc rejoué
      // sans garde : une tentative échouée se répare à la suivante.
      if (isFullyConsumed) {
        await scheduleViewOnceBurn(prisma, { messageId, at: now }).catch((error) =>
          logger.warn(`[CONSUME] view-once burn scheduling failed for ${messageId}`, error)
        );
      }

      // Annoncé seulement quand l'état a CHANGÉ. L'annonce dit QUI a ouvert
      // (`userId`, `participantId`) : chaque client n'en tire « ouvert » que
      // pour lui-même, jamais un retrait pour les autres.
      if (socketIOHandler && firstConsumption) {
        const io = fastify.socketIOHandler.getManager()?.getIO();
        // La ligne de liste de CE lecteur passe à « 👁 Ouvert » (#7594) — et
        // de lui seul : ce qu'il a ouvert ne change rien chez les autres.
        await emitViewOnceConsumedPreview(
          prisma,
          io,
          { conversationId, messageId, readerParticipantId: viewParticipant.id, actorUserId: userId },
          (error) => logger.warn(`[CONSUME] view-once list preview failed for ${messageId}`, error)
        );
        io?.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_CONSUMED, {
          messageId,
          conversationId,
          userId,
          participantId: viewParticipant.id,
          byAuthor,
          viewOnceCount,
          maxViewOnceCount: recipientCount,
          isFullyConsumed
        });
      }

      return sendSuccess(reply, { messageId, viewOnceCount, maxViewOnceCount: recipientCount, isFullyConsumed, consumedByMe: true });
    } catch (error) {
      logger.error('Error consuming view-once message', error);
      return sendInternalError(reply, 'Error consuming view-once message');
    }
  });
}
