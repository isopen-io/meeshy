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
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { broadcastReadStatus } from '../../socketio/broadcastReadStatus';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { MarkReadBodySchema } from '../../validation/messages-schemas';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { canAccessConversation, resolveCallerParticipant } from './utils/access-control';
import type { ConversationParams } from './types';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { logger } from './messages-shared';

// Mirrors the cursor-advance freshness guard in MessageReadStatusService. It
// orders by the message's `createdAt` (millisecond precision, stable across
// gateway processes); ObjectId hex order is only second-accurate and its next 5
// bytes are per-process random, so it can invert real recency for same-second
// messages from different nodes. The ObjectId comparison is kept only as a
// fallback for legacy cursors written before `lastReadMessageCreatedAt` existed.
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
function isStaleCursorMessageId(params: {
  candidateMessageId: string;
  candidateCreatedAt: Date;
  cursorMessageId: string | null | undefined;
  cursorMessageCreatedAt: Date | null | undefined;
}): boolean {
  const { candidateMessageId, candidateCreatedAt, cursorMessageId, cursorMessageCreatedAt } = params;
  if (!cursorMessageId) return false;
  if (cursorMessageCreatedAt) {
    return candidateCreatedAt < cursorMessageCreatedAt;
  }
  if (!OBJECT_ID_RE.test(candidateMessageId) || !OBJECT_ID_RE.test(cursorMessageId)) {
    return false;
  }
  return candidateMessageId.toLowerCase() < cursorMessageId.toLowerCase();
}

/**
 * Enregistre `POST /conversations/:id/mark-read`.
 */
export function registerMarkReadRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  participantAuth: any,
  deps: {
    socketIOHandler: any;
    privacyPreferencesService: any;
    bridgeService: any;
  }
) {
  const { socketIOHandler, privacyPreferencesService, bridgeService } = deps;
  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:id/mark-read', {
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
                markedCount: { type: 'number', description: 'Number of messages marked as read' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
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
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Resolve participant ID for this user
      const currentParticipant = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!currentParticipant) {
        return sendForbidden(reply, 'Not a participant');
      }

      // Corps absent = client déjà distribué → repli fenêtre (surtout pas un
      // lot vide, qui ne figerait rien et perdrait la lecture).
      let reportedMessageIds: readonly string[] | undefined;
      let reportedLanguage: string | undefined;
      let reportedMessageLanguages: Readonly<Record<string, string>> | undefined;
      let caughtUpToMessageId: string | undefined;
      if (request.body !== undefined && request.body !== null) {
        const bodyResult = MarkReadBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          return sendBadRequest(reply, 'Corps de requête invalide pour le marquage de lecture');
        }
        reportedMessageIds = bodyResult.data.messageIds;
        reportedLanguage = bodyResult.data.language;
        reportedMessageLanguages = bodyResult.data.messageLanguages;
        caughtUpToMessageId = bodyResult.data.caughtUpToMessageId;
      }

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      const unreadCount = await readStatusService.getUnreadCount(currentParticipant.id, conversationId);
      // Le raccourci « 0 non-lu → ne rien faire » ne vaut que SANS ids
      // rapportés : le curseur peut buter sur un trou et annoncer 0 alors que
      // le client vient d'afficher des messages situés après ce trou.
      if (unreadCount === 0 && !reportedMessageIds && !caughtUpToMessageId) {
        // Le raccourci ne doit pas sauter la cascade notifications : une
        // réaction/mention arrivée sur un message déjà lu a créé une
        // notification alors que le compteur de messages est resté à 0.
        Promise.resolve(
          fastify.notificationService?.markConversationNotificationsAsRead?.(userId, conversationId)
        ).catch(() => {});
        return sendSuccess(reply, { markedCount: 0 });
      }

      // `markedCount` compte ce qui a RÉELLEMENT été figé. Le nombre d'ids
      // rapportés sur-compterait (certains étaient déjà lus) et le compteur de
      // non-lus inclurait des messages jamais rapportés.
      const frozenCount = await readStatusService.markMessagesAsRead(
        currentParticipant.id,
        conversationId,
        undefined,
        reportedMessageIds || reportedLanguage || reportedMessageLanguages || caughtUpToMessageId
          ? {
              messageIds: reportedMessageIds,
              language: reportedLanguage,
              messageLanguages: reportedMessageLanguages,
              caughtUpToMessageId
            }
          : undefined
      );
      // La troisième copie de ce fan-out vivait ici, en fermeture, et avait
      // dérivé comme les autres. Une seule forme désormais : c'est elle qui
      // consulte la préférence d'accusés, découpe le payload des pairs de celui
      // de l'acteur, et recale le badge sur les DEUX branches de la préférence.
      try {
        await broadcastReadStatus(
          {
            io: socketIOHandler?.getManager?.()?.getIO(),
            prisma,
            readStatusService,
            privacyPreferencesService,
            bridgeService
          },
          {
            conversationId,
            participantId: currentParticipant.id,
            userId,
            isAnonymous: authRequest.authContext.type === 'anonymous',
            type: 'read'
          }
        );
      } catch (error) {
        logger.error('Error broadcasting read status:', error);
      }

      return sendSuccess(reply, { markedCount: reportedMessageIds ? frozenCount : unreadCount });

    } catch (error) {
      logger.error('Error marking conversation as read', error);
      return sendInternalError(reply, 'Erreur lors du marquage des messages comme lus');
    }
  });
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
  participantAuth: any
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
        return sendForbidden(reply, 'Participant not found in this conversation');
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

      // Guard against a race with a concurrent, fresher read: another device
      // may have read a message newer than `latestMessage` between our read
      // above and this write. Without this check the unconditional upsert
      // below would roll the cursor backward past that fresher read,
      // resurrecting already-read messages as unread (mirrors the
      // isStaleCursorMessageId guard in MessageReadStatusService.markMessagesAsRead).
      const currentCursor = await prisma.conversationReadCursor.findUnique({
        where: {
          conversation_participant_cursor: { participantId: participantForCursor.id, conversationId }
        },
        select: { lastReadMessageId: true, lastReadMessageCreatedAt: true }
      });

      if (isStaleCursorMessageId({
        candidateMessageId: latestMessage.id,
        candidateCreatedAt: latestMessage.createdAt,
        cursorMessageId: currentCursor?.lastReadMessageId,
        cursorMessageCreatedAt: currentCursor?.lastReadMessageCreatedAt
      })) {
        logger.info(
          `[MARK-UNREAD] Ignoring stale mark-unread for user ${userId} in conversation ${conversationId}: cursor already advanced past message ${latestMessage.id}`
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

      return sendSuccess(reply, { unreadCount: 1 });

    } catch (error) {
      logger.error('Error marking conversation as unread', error);
      return sendInternalError(reply, 'Error marking conversation as unread');
    }
  });
}
