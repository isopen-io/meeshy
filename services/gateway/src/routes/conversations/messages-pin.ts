/**
 * Surface ÉPINGLAGE DE MESSAGES (issue #4284 — découpage de `messages.ts`,
 * 2945 lignes, en fichiers frères par responsabilité). Porte les trois routes
 * PIN / UNPIN / LISTE DES ÉPINGLÉS :
 *   - `PUT    /conversations/:id/messages/:messageId/pin`
 *   - `DELETE /conversations/:id/messages/:messageId/pin`
 *   - `GET    /conversations/:id/pinned-messages`
 * Voir `messages.ts` pour le composeur (`registerMessagesRoutes`), qui
 * appelle `registerMessagePinRoutes`.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { broadcastMessageMutation } from '../../socketio/broadcastMessageMutation';
import { sharedPlaceFromMetadata } from '../../services/location/sharedPlace';
import {
  applyHistoryFloor,
  historyReaderFromAuthContext,
  loadReaderHistoryFloor
} from '../../services/historyFloor';
import { resolveParticipantAvatar, resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import {
  loadPersonalHistoryHiding,
  applyPersonalHistoryHiding
} from '../../services/personalHistoryFilter';
import { validatePagination } from '../../utils/pagination';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceMissingEntryPolicy, viewerFromRequest } from '../users/presence-gate';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../utils/translation-transformer';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { logger } from './messages-shared';

/**
 * Enregistre les routes d'épinglage : pin, unpin, liste des messages épinglés.
 */
export function registerMessagePinRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  socketIOHandler: any
) {
  // ============================================================================
  // PIN / UNPIN MESSAGE
  // ============================================================================

  fastify.put<{
    Params: { id: string; messageId: string };
  }>('/conversations/:id/messages/:messageId/pin', {
    schema: {
      description: 'Pin a message in a conversation',
      tags: ['conversations', 'messages'],
      summary: 'Pin message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to pin' }
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
                pinnedAt: { type: 'string', format: 'date-time' },
                pinnedBy: { type: 'string' }
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

      // `deletedAt: null` — un message supprimé pour tout le monde n'est plus
      // un objet épinglable, et c'est ce que TOUTES les lectures de ce fichier
      // disent déjà : la liste des messages, la recherche, et la liste des
      // messages épinglés cent lignes plus bas (`{ pinnedAt: { not: null },
      // deletedAt: null }`). Les deux écritures de l'épingle étaient les seules
      // à ne pas le dire. Sans la garde, l'appel répond 200, écrit sur un
      // tombstone, et diffuse `message:pinned` — dans la room ET dans la file
      // hors-ligne — pour un message que tous les clients ont déjà retiré. Le
      // web l'applique à son cache, iOS à sa persistance, et rien ne les
      // détrompe : la liste des épinglés filtre ce message, donc aucun
      // rechargement ne corrige l'état.
      //
      // `select: { id: true }` : seule l'existence est en question ici. La
      // requête chargeait le document entier — contenu, traductions, metadata —
      // pour un `if (!message)`. Le jumeau qui dépingle sélectionnait déjà `id`
      // seul ; c'est l'asymétrie que le correctif précédent avait laissée.
      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        select: { id: true }
      });
      if (!message) {
        return sendNotFound(reply, 'Message not found');
      }

      const now = new Date();
      await prisma.message.update({
        where: { id: messageId },
        data: { pinnedAt: now, pinnedBy: userId }
      });

      logger.info(`[PIN] User ${userId} pinned message ${messageId} in conversation ${conversationId}`);

      // Broadcast pin event via Socket.IO
      if (socketIOHandler) {
        const pinPayload = {
          messageId,
          conversationId,
          pinnedAt: now.toISOString(),
          pinnedBy: userId
        };
        // `broadcastMessageMutation` — le site UNIQUE de cette famille — plutôt
        // que la room et la file re-codées ici (cycle 130 bis). Il porte les deux
        // gardes que la copie manuscrite n'avait pas : l'émission de room dans
        // un `try` (une levée d'adaptateur rendait 500 sur une épingle DÉJÀ
        // commise, et sautait la mise en file au passage), et le `.catch` sur la
        // promesse détachée qu'exige la leçon 230.
        await broadcastMessageMutation({
          manager: fastify.socketIOHandler.getManager(),
          conversationId,
          actorUserId: userId,
          eventType: 'pinned',
          messageId,
          payload: pinPayload,
          onError: (error) => logger.warn('[PIN] broadcast side-channel failed', { messageId, error })
        });
      }

      return sendSuccess(reply, { pinnedAt: now.toISOString(), pinnedBy: userId });
    } catch (error) {
      logger.error('Error pinning message', error);
      return sendInternalError(reply, 'Error pinning message');
    }
  });

  fastify.delete<{
    Params: { id: string; messageId: string };
  }>('/conversations/:id/messages/:messageId/pin', {
    schema: {
      description: 'Unpin a message in a conversation',
      tags: ['conversations', 'messages'],
      summary: 'Unpin message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to unpin' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        },
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

      // Localiser le message DANS la conversation, comme le fait déjà le jumeau
      // qui épingle — et comme le font `consume`, l'édition et la suppression.
      // Cette entrée était la seule du fichier à écrire par id seul : être
      // membre actif de N'IMPORTE QUELLE conversation suffisait alors à
      // dépingler le message de N'IMPORTE QUELLE autre, pour qui en connaît
      // l'id — ce que tout ancien membre garde en cache local. La diffusion
      // partait vers la conversation de la ROUTE, jamais vers celle du message :
      // les clients réellement concernés gardaient l'épingle affichée jusqu'au
      // prochain chargement complet, sans qu'aucun événement ne les détrompe.
      // `deletedAt: null` pour la même raison que le jumeau qui épingle : les
      // deux sens du même geste portent la même garde, sinon le dépinglage
      // redevient le chemin par lequel un événement fantôme part vers une room
      // et vers la file hors-ligne. L'épingle qui SURVIT à une suppression
      // (épingler puis supprimer) reste en base sans être atteignable ici —
      // elle n'est visible nulle part (toutes les lectures filtrent
      // `deletedAt: null`) et le tombstone lui-même part au balayage.
      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        select: { id: true }
      });
      if (!message) {
        return sendNotFound(reply, 'Message not found');
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { pinnedAt: null, pinnedBy: null }
      });

      logger.info(`[UNPIN] User ${userId} unpinned message ${messageId} in conversation ${conversationId}`);

      // Broadcast unpin event via Socket.IO
      if (socketIOHandler) {
        const unpinPayload = {
          messageId,
          conversationId
        };
        // Même site unique que le jumeau qui épingle, pour les mêmes deux
        // gardes — les deux sens du même geste ne se diffusent pas autrement.
        await broadcastMessageMutation({
          manager: fastify.socketIOHandler.getManager(),
          conversationId,
          actorUserId: userId,
          eventType: 'unpinned',
          messageId,
          payload: unpinPayload,
          onError: (error) => logger.warn('[UNPIN] broadcast side-channel failed', { messageId, error })
        });
      }

      return sendSuccess(reply, null);
    } catch (error) {
      logger.error('Error unpinning message', error);
      return sendInternalError(reply, 'Error unpinning message');
    }
  });

  // ============================================================================
  // LIST PINNED MESSAGES
  // ============================================================================

  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string };
  }>('/conversations/:id/pinned-messages', {
    schema: {
      description: 'List all pinned messages in a conversation',
      tags: ['conversations', 'messages'],
      summary: 'List pinned messages',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Max number of pinned messages to return', default: '50' },
          offset: { type: 'string', description: 'Offset for pagination', default: '0' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: messageSchema },
            // #4177 — le handler calcule et ENVOIE `pagination` depuis
            // toujours (`sendSuccess(reply, formattedMessages, {
            // pagination })`) ; non déclarée ici, fast-json-stringify la
            // retirait AVANT le fil — même défaut que celui documenté sur
            // `cursorPagination` de `GET .../messages` un peu plus haut dans
            // ce fichier. Aucun client ne pouvait lire `total`/`hasMore`,
            // qu'ils soient justes ou fautifs (cf. le plancher appliqué
            // ci-dessous au calcul du total).
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                offset: { type: 'integer' },
                limit: { type: 'integer' },
                hasMore: { type: 'boolean' }
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
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const { id } = request.params;
      // SSOT guard: a malformed `?limit`/`?offset` (string schema, no AJV
      // coercion) would otherwise reach Prisma as `take: NaN` → HTTP 500.
      const { limit, offset } = validatePagination(request.query.offset, request.query.limit, { defaultLimit: 50, maxLimit: 100 });

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      // Une épingle est posée pour TOUT le monde, mais elle ne rend pas au
      // lecteur un message qu'il a retiré de sa propre vue : sans ce filtre,
      // `clear-history` laissait une porte dérobée sur l'historique effacé.
      const pinnedHiding = await loadPersonalHistoryHiding(prisma, {
        userId: authRequest.authContext.type === 'anonymous' ? null : authRequest.authContext.userId,
        conversationId
      });
      // Et pas plus qu'elle ne rend un message d'AVANT l'arrivée du lecteur :
      // une épingle est la porte la plus évidente sur l'historique interdit.
      const pinnedFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      const pinnedMessages = await prisma.message.findMany({
        where: applyPersonalHistoryHiding(
          applyHistoryFloor({ conversationId, pinnedAt: { not: null }, deletedAt: null }, pinnedFloor),
          pinnedHiding
        ),
        orderBy: { pinnedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          content: true,
          originalLanguage: true,
          messageType: true,
          editedAt: true,
          deletedAt: true,
          replyToId: true,
          forwardedFromId: true,
          forwardedFromConversationId: true,
          pinnedAt: true,
          pinnedBy: true,
          isViewOnce: true,
          isBlurred: true,
          expiresAt: true,
          effectFlags: true,
          translations: true,
          createdAt: true,
          updatedAt: true,
          // Lot 1 : un message épinglé est une bulle complète — sans
          // `metadata`, un message géolocalisé épinglé n'affiche jamais sa
          // position alors que la liste complète la restitue déjà.
          metadata: true,
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              type: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true
                }
              }
            }
          },
          attachments: true,
          _count: { select: { reactions: true, replies: true } }
        }
      });

      // #4177 — le total DOIT appliquer le même plancher que la page
      // (`pinnedFloor`, quelques lignes plus haut) : il ne l'appliquait pas,
      // seulement `applyPersonalHistoryHiding`. Un arrivant tardif (plancher
      // non nul) voyait donc un total qui COMPTE les épingles d'avant son
      // arrivée — la pagination lui promettait des pages que la page réelle,
      // elle correctement planchée, ne pouvait jamais servir.
      const total = await prisma.message.count({
        where: applyPersonalHistoryHiding(
          applyHistoryFloor(
            {
              conversationId,
              pinnedAt: { not: null },
              deletedAt: null
            },
            pinnedFloor
          ),
          pinnedHiding
        )
      });

      // Régime STRICT (2026-08-25) : self/ADMIN+/ami seuls.
      const pinnedPresenceViewer = viewerFromRequest(request);
      const pinnedMissingEntry = presenceMissingEntryPolicy(pinnedPresenceViewer);
      const pinnedPresenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        pinnedPresenceViewer,
        pinnedMessages
          .map((message: any) => message.sender?.userId)
          .filter((uid: string | null | undefined): uid is string => !!uid)
      );

      const formattedMessages = pinnedMessages.map((message: any) => {
        const sender = message.sender;
        const place = sharedPlaceFromMetadata(message.metadata);
        return {
          id: message.id,
          conversationId: message.conversationId,
          // #4177 — `Message.senderId` est en base une FK vers
          // `Participant.id`, jamais vers `User.id` : servi brut, cette
          // porte donnait au MÊME message un `senderId` différent de celui
          // de `GET .../messages`, qui résout depuis toujours vers
          // `User.id` (les clients comparent `senderId` à LEUR `userId` pour
          // décider « est-ce moi qui l'ai envoyé ? »). Même résolution ici.
          senderId: sender?.userId ?? sender?.user?.id ?? message.senderId,
          content: message.content,
          originalLanguage: message.originalLanguage,
          messageType: message.messageType,
          isEdited: !!message.editedAt,
          editedAt: message.editedAt,
          deletedAt: message.deletedAt,
          replyToId: message.replyToId,
          forwardedFromId: message.forwardedFromId,
          forwardedFromConversationId: message.forwardedFromConversationId,
          pinnedAt: message.pinnedAt,
          pinnedBy: message.pinnedBy,
          isViewOnce: message.isViewOnce,
          isBlurred: message.isBlurred,
          expiresAt: message.expiresAt,
          effectFlags: message.effectFlags,
          // `Message.translations` est une CARTE Mongo, jamais un tableau — et
          // le schéma de cette réponse déclare `translations: { type: 'array' }`
          // (`messageSchema`). `fast-json-stringify` ne coerce pas : la carte
          // faisait échouer la sérialisation, donc répondre 500 sur la route
          // ENTIÈRE dès qu'une épingle portait une traduction, c'est-à-dire dès
          // que le Prisme avait tourné. Même sérialiseur que toutes les autres
          // routes de messages — source unique de vérité.
          translations: transformTranslationsToArray(
            message.id,
            message.translations as Record<string, MessageTranslationJSON> | null
          ),
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          sender: sender ? applyPresenceVisibilityAsOffline(
            {
              id: sender.id,
              userId: sender.userId,
              displayName: resolveParticipantDisplayName(sender),
              avatar: resolveParticipantAvatar(sender),
              type: sender.type,
              username: sender.user?.username ?? null,
              firstName: sender.user?.firstName ?? null,
              lastName: sender.user?.lastName ?? null,
              isOnline: sender.user?.isOnline ?? false
            },
            sender.userId ? pinnedPresenceVis.get(sender.userId) : undefined,
            { onMissingEntry: pinnedMissingEntry },
          ) : null,
          attachments: message.attachments || [],
          reactionCount: message._count?.reactions ?? 0,
          replyCount: message._count?.replies ?? 0,
          // Lot 1 : hisser metadata.location en champ top-level `location`,
          // même miroir que la liste complète des messages.
          ...(place ? { location: place } : {})
        };
      });

      return sendSuccess(reply, formattedMessages, {
        pagination: { total, offset, limit, hasMore: offset + formattedMessages.length < total }
      });
    } catch (error) {
      logger.error('Error listing pinned messages', error);
      return sendInternalError(reply, 'Error listing pinned messages');
    }
  });
}
