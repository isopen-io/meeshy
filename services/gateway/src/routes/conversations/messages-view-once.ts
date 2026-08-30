/**
 * Surface CONSOMMATION VUE-UNIQUE (issue #4284 — découpage de `messages.ts`,
 * 2945 lignes, en fichiers frères par responsabilité). Porte la route
 * `POST /conversations/:id/messages/:messageId/consume` (incrémente le
 * compteur de vues d'un message à vue unique et programme sa destruction une
 * fois le budget épuisé). Voir `messages.ts` pour le composeur
 * (`registerMessagesRoutes`), qui appelle `registerMessageViewOnceRoutes`.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { recordViewOnceConsumption } from '../../services/messaging/recordViewOnceConsumption';
import { scheduleViewOnceBurn } from '../../services/messaging/scheduleViewOnceBurn';
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
      description: 'Consume a view-once message (increment view count)',
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
                isFullyConsumed: { type: 'boolean' }
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

      // Une unité par SPECTATEUR, pas par ouverture. Le compteur était
      // incrémenté à chaque appel : un rejeu de la requête, ou un destinataire
      // qui rouvre la photo, épuisait le budget des autres membres du groupe.
      const { viewOnceCount: newViewOnceCount, firstConsumption } = await recordViewOnceConsumption(prisma, {
        messageId,
        conversationId: message.conversationId,
        participantId: viewParticipant.id,
        currentViewOnceCount: message.viewOnceCount ?? 0,
        at: now
      });

      const maxViewOnceCount = message.maxViewOnceCount ?? 1;
      const isFullyConsumed = newViewOnceCount >= maxViewOnceCount;

      logger.info(`[CONSUME] User ${userId} consumed view-once message ${messageId} (${newViewOnceCount}/${maxViewOnceCount})`);

      // Le budget épuisé programme la destruction, il ne l'exécute pas : le
      // spectateur qui vient de payer sa vue n'a pas encore fini de regarder.
      // Le balayage éphémère détruira — c'est déjà son métier, fichiers et
      // annonce `message:deleted` comprises. Sans cette ligne, `isFullyConsumed`
      // ne masquait le média que dans l'UI des clients qui l'implémentent, et le
      // clair restait servi indéfiniment à tous les autres.
      //
      // Non gardé par `firstConsumption` : la programmation est idempotente, et
      // la rejouer répare aussi bien un échec d'écriture qu'un message épuisé
      // AVANT la mise en service de ce chemin.
      if (isFullyConsumed) {
        // Best-effort. Échouer ici retirerait au spectateur le média dont la
        // revendication est déjà dépensée — sans rendre pour autant le contenu
        // plus sûr. La tentative suivante repose l'échéance.
        await scheduleViewOnceBurn(prisma, { messageId, at: now }).catch((error) =>
          logger.warn(`[CONSUME] view-once burn scheduling failed for ${messageId}`, error)
        );
      }

      // Annoncé seulement quand l'état a CHANGÉ. Rediffuser un compte identique
      // à toute la room n'apprend rien à personne et, sur un rejeu, ferait
      // clignoter chez les pairs un événement qui ne correspond à aucune
      // ouverture nouvelle.
      if (socketIOHandler && firstConsumption) {
        fastify.socketIOHandler.getManager()?.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_CONSUMED, {
          messageId,
          conversationId,
          userId,
          viewOnceCount: newViewOnceCount,
          maxViewOnceCount,
          isFullyConsumed
        });
      }

      return sendSuccess(reply, { messageId, viewOnceCount: newViewOnceCount, maxViewOnceCount, isFullyConsumed });
    } catch (error) {
      logger.error('Error consuming view-once message', error);
      return sendInternalError(reply, 'Error consuming view-once message');
    }
  });
}
