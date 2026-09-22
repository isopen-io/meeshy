/**
 * Surface SUIVI DE LECTURE (issue #4284 — découpage de `messages.ts`, 2945
 * lignes, en fichiers frères par responsabilité). Porte les deux routes de
 * curseur de lecture :
 *   - `POST /conversations/:id/mark-read`  (`registerMarkReadRoute`)
 *   - `POST /conversations/:id/mark-unread` (`registerMarkUnreadRoute`)
 * Deux registrars distincts, pas un seul : dans `messages.ts` original,
 * `POST /conversations/:id/messages` (envoi) s'enregistrait ENTRE ces deux
 * routes — le composeur les appelle donc séparément pour garder l'ordre
 * d'enregistrement Fastify original (`route-manifest.json` en dépend). Voir
 * `messages.ts` pour le composeur (`registerMessagesRoutes`).
 */
import { FastifyInstance } from 'fastify';
import { apiPath } from '@meeshy/shared/api/prefix';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveConversationId } from '../../utils/conversation-id-cache';
// #4349 — le dimensionnement de debit de l'accuse vient de la collection
// unique, jamais d'une copie locale.
import { createReceiptWriteRateLimitConfig, type ReceiptHandlers } from './receipts';
// #4423 — cette porte est un ALIAS DÉPRÉCIÉ (adaptateur, #4349) : elle le dit
// désormais au client, comme les autres alias du dépôt (#4274).
import { depreciee } from '../../utils/deprecation';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { canAccessConversation, resolveCallerParticipant } from './utils/access-control';
import type { ConversationParams } from './types';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { logger } from './messages-shared';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { MeeshySocketIOHandler } from '../../socketio/MeeshySocketIOHandler';
import { bridgeNotComputed } from '../../socketio/unreadBridgeField';

/**
 * Enregistre `POST /conversations/:id/mark-read` — ADAPTATEUR de la collection
 * unique d'accusés (#4349, suivi de #4179).
 *
 * Le gestionnaire est `receiptHandlers(...).markReadAlias`, IMPORTÉ de
 * `routes/conversations/receipts.ts` : la MÊME référence de fonction que celle
 * servie à `POST /conversations/:conversationId/mark-as-read`
 * (`routes/message-read-status.ts`). Les deux adresses portaient jusqu'ici deux
 * copies du même geste — « mêmes `MarkReadBodySchema`, `markMessagesAsRead` et
 * `broadcastReadStatus`, vérifié » (#4179) — et avaient déjà divergé : seule
 * celle-ci portait le raccourci « aucun non-lu → ne rien figer » et sa cascade
 * de notifications. Elles ne peuvent plus diverger : il n'y a plus qu'un seul
 * calcul.
 *
 * Ce qui CHANGE pour l'appelant : `markedCount` est désormais le nombre
 * d'entrées RÉELLEMENT FIGÉES, y compris en mode fenêtre où cette porte servait
 * sous ce nom le compte de NON-LUS d'AVANT marquage. Voir le doc-comment de
 * `receipts.ts` § « `markedCount` a UNE définition ».
 *
 * Le débit — 120/min par COMPTE, `hook: 'preHandler'` — arrive avec
 * l'adaptateur : cette porte n'en portait AUCUN, alors que sa jumelle
 * `mark-as-read` en portait un depuis toujours.
 *
 * #4284 — ce fichier est la surface « statut de lecture » extraite de
 * `messages.ts`. Les collaborateurs de l'accusé (diffusion `read-status:updated`,
 * préférence `showReadReceipts`, pont ✦ G-123) ne sont plus instanciés ici :
 * le compositeur les construit UNE fois et les passe en `receipts`.
 */
export function registerMarkReadRoute(
  fastify: FastifyInstance,
  participantAuth: any,
  receipts: ReceiptHandlers
) {
  // ALIAS de `POST /conversations/:conversationId/receipts` (#4349) : ADAPTATEUR
  // MINCE vers la collection unique — `receipts.markReadAlias` est la MÊME
  // référence de gestionnaire, aucun corps dupliqué. Son annonce est posée
  // ci-dessous (#4423).
  //
  // La déclaration est ADJACENTE à l'enregistrement, jamais portée par le
  // doc-comment du registrar : `alias-deprecation-guard` lit le commentaire qui
  // précède l'appel `fastify.post`, pas celui de la fonction qui l'enveloppe.
  // Le découpage #4284 ayant mis cet appel dans un registrar, la déclaration
  // est descendue avec lui.
  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:id/mark-read', {
    config: { rateLimit: createReceiptWriteRateLimitConfig() },
    // #4423 — annonce de dépréciation : `type: 'read'` voyage dans le CORPS
    // du successeur, jamais dans son URL (comme `ANNONCE_ALIAS_FRIENDS.agir`,
    // `routes/friends.ts`, pour accepter/refuser une demande d'ami).
    onRequest: depreciee({
      depuis: '2026-08-30',
      successeur: (request) =>
        `${apiPath('/conversations')}/${encodeURIComponent((request.params as ConversationParams).id)}/receipts`,
    }),
    schema: {
      description: 'Mark all messages in a conversation as read for the authenticated user',
      tags: ['conversations', 'messages'],
      summary: 'Mark conversation as read',
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
            data: {
              type: 'object',
              properties: {
                markedCount: { type: 'number', description: 'Entrées de statut RÉELLEMENT figées par cet appel' }
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
    preValidation: [participantAuth]
  }, receipts.markReadAlias);
}


// #4188 — `POST /conversations/:id/read` a été RETIRÉE. Son propre schéma
// Fastify se déclarait « alias for mark-read endpoint » : son corps n'était
// jamais lu et son `{ markedCount }` était supprimé à la sérialisation par le
// schéma 200. La porte VIVANTE est `POST /conversations/:id/mark-read`
// (`registerMarkReadRoute` ci-dessus), qui fait le même geste en le disant.
// `POST /conversations/:id/mark-unread` ci-dessous n'est PAS concernée.

/**
 * Enregistre `POST /conversations/:id/mark-unread`.
 *
 * POST /conversations/:id/mark-unread
 * Mark a conversation as unread by moving the read cursor back before the latest message.
 * This makes the conversation appear with 1 unread message in the conversation list.
 */
export function registerMarkUnreadRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  participantAuth: any,
  socketIOHandler?: Pick<MeeshySocketIOHandler, 'getManager'>
) {
  fastify.post<{ Params: ConversationParams }>('/conversations/:id/mark-unread', {
    schema: {
      description: 'Mark a conversation as unread by setting the read cursor before the latest message, making it appear as 1 unread message.',
      tags: ['conversations', 'messages'],
      summary: 'Mark conversation as unread',
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
            data: {
              type: 'object',
              properties: {
                unreadCount: { type: 'number', description: 'Number of unread messages after marking as unread' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [participantAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Resolve participant ID for this user
      const currentParticipant = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!currentParticipant) {
        // #4856 — un 403 sous ce texte annulait la protection qu'il visait :
        // l'appelant a déjà PROUVÉ son accès à la conversation via
        // `canAccessConversation` deux lignes plus haut, donc distinguer
        // « absent » d'« interdit » ici ne renseigne aucun attaquant qui ne
        // le saurait déjà. C'est un « je ne trouve pas », comme les autres
        // sites qui protègent la même incohérence (participant introuvable
        // pour un accès pourtant accordé).
        return sendNotFound(reply, 'Participant not found in this conversation');
      }

      // Find the latest message in the conversation (not sent by the user)
      const latestMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          deletedAt: null,
          senderId: { not: currentParticipant.id }
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true }
      });

      if (!latestMessage) {
        // No messages from other users to mark as unread
        return sendSuccess(reply, { unreadCount: 0 });
      }

      // Move the read cursor to 1ms before the latest message's createdAt.
      // This ensures the latest message appears as unread (createdAt > lastReadAt).
      const lastReadAt = new Date(latestMessage.createdAt.getTime() - 1);

      // Find the message just before the latest (to use as lastReadMessageId)
      const previousMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          deletedAt: null,
          createdAt: { lt: latestMessage.createdAt }
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true }
      });

      // Le participant a déjà été résolu en tête de ce handler — la seconde
      // requête ne faisait que reposer la même question à la même base, avec la
      // copie de la règle d'identité qui oubliait les invités de lien partagé.
      const participantForCursor = currentParticipant;

      // Guard against a GENUINE race: has a message from someone ELSE, newer
      // than `latestMessage`, appeared since we read it above? (#7346).
      //
      // The previous guard compared `latestMessage` to the caller's PERSISTED
      // cursor (`ConversationReadCursor.lastReadMessageId`) — but that cursor
      // also advances every time this SAME participant sends a message
      // (`MessagingService.runPostSaveSideEffects` →
      // `markMessagesAsRead(senderParticipantId, …, message.id)`,
      // `services/messaging/MessagingService.ts`). Replying to a conversation
      // therefore left the cursor pointing at the participant's OWN message —
      // always newer than `latestMessage`, which excludes their own messages
      // by construction — and the old guard read that as "someone already
      // read further", silently turning every mark-unread called after a
      // reply into a no-op that still answered `200 {unreadCount:0}`.
      //
      // Re-querying for a fresher OTHER's message instead of re-reading the
      // cursor answers the actual question this guard exists for — "did the
      // world change since I captured `latestMessage`?" — without caring
      // whether that message has been read yet: a message that showed up
      // meanwhile from someone else means the rewind target below (computed
      // from the now-stale `latestMessage`/`previousMessage` pair) is no
      // longer the right one, whether or not anyone has read it.
      const fresherOtherMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          deletedAt: null,
          senderId: { not: currentParticipant.id },
          createdAt: { gt: latestMessage.createdAt }
        },
        select: { id: true }
      });

      if (fresherOtherMessage) {
        logger.info(
          `[MARK-UNREAD] Ignoring stale mark-unread for user ${userId} in conversation ${conversationId}: a newer message from another participant appeared since latestMessage was captured`
        );
        return sendSuccess(reply, { unreadCount: 0 });
      }

      await prisma.conversationReadCursor.upsert({
        where: {
          conversation_participant_cursor: { participantId: participantForCursor.id, conversationId }
        },
        create: {
          participantId: participantForCursor.id,
          conversationId,
          lastReadMessageId: previousMessage?.id || null,
          // Keep the (id, createdAt) pair consistent so the cursor-advance
          // freshness guard in MessageReadStatusService stays correct — a stale
          // createdAt left pointing at a newer message would wrongly reject
          // later legitimate read advances.
          lastReadMessageCreatedAt: previousMessage?.createdAt ?? null,
          lastReadAt: lastReadAt,
          unreadCount: 1,
          version: 0
        },
        update: {
          lastReadMessageId: previousMessage?.id || null,
          lastReadMessageCreatedAt: previousMessage?.createdAt ?? null,
          lastReadAt: lastReadAt,
          unreadCount: 1,
          version: { increment: 1 }
        }
      });

      logger.info(`[MARK-UNREAD] User ${userId} marked conversation ${conversationId} as unread (cursor moved before message ${latestMessage.id})`);

      // Push the fresh badge to the READER'S OWN other devices (#7346, D-L1
      // territory) — the mirror of what `broadcastReadStatus` already does for
      // mark-read/receipts (`socketio/broadcastReadStatus.ts`). `userId` is
      // already the right room key on BOTH branches: the anonymous branch of
      // `UnifiedAuthService` sets `authContext.userId` to the caller's OWN
      // `Participant.id` (see `utils/access-control.ts`'s doc-comment), so a
      // shared-link guest's personal room is already named by it — no
      // `isAnonymous` branch needed here, unlike `broadcastReadStatus` which
      // also computes a CONTRACT field (`actorUserId`) this response doesn't
      // carry. No `bridge` field: this route has no `ConversationBridgeService`
      // wired in, so it DECLARES "I did not compute" (`unreadBridgeField.ts`)
      // rather than guessing — the client keeps whatever bridge it already has.
      const io = socketIOHandler?.getManager()?.getIO();
      if (io) {
        io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
          conversationId,
          unreadCount: 1,
          ...bridgeNotComputed()
        });
      }

      return sendSuccess(reply, { unreadCount: 1 });

    } catch (error) {
      logger.error('Error marking conversation as unread', error);
      return sendInternalError(reply, 'Error marking conversation as unread');
    }
  });
}
