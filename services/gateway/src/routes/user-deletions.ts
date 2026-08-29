/**
 * User Deletions Routes
 *
 * Handles per-user "delete for me" functionality:
 * - Delete conversation from user's view (other participants still see it)
 * - Delete message from user's view (other participants still see it)
 * - Clear conversation history before a certain date
 * - Restore deleted conversations/messages
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { sendSuccess, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest } from '../utils/response';
import { writeConversationPreferences } from '../services/conversationPreferencesSync';
import { retractNotificationsForClearedHistory } from '../services/messaging/retractHiddenMessageNotifications';
import {
  hideMessagesForUser,
  restoreMessageForUser,
} from '../services/personalMessageVisibilitySync';
import { refreshPersonalConversationPreview } from '../services/messaging/personalPreviewRefresh';
import { invalidateParticipantLookup } from '../utils/participant-lookup-cache';
import { depreciee } from '../utils/deprecation';
// #4332 — la corbeille de conversations (delete-for-me / restore-for-me /
// deleted-conversations) est réalignée sur le geste que la route CANONIQUE
// (`/api/v1/conversations/:id/delete-for-me`, ci-dessous importée) écrit
// réellement. `performConversationDeleteForMe` est le corps du geste
// (extrait de ce fichier canonique pour ce lot) ; l'erreur typée laisse
// chaque adresse traduire le cas « pas membre » dans SON PROPRE vocabulaire
// HTTP plutôt que de coller celui de l'autre.
import {
  performConversationDeleteForMe,
  ConversationDeleteForMeNotAParticipantError,
} from './conversations/delete-for-me';

const logger = enhancedLogger.child({ module: 'UserDeletionsRoutes' });

interface ConversationIdParams {
  conversationId: string;
}

interface MessageIdParams {
  messageId: string;
}

interface ClearHistoryBody {
  beforeDate: string; // ISO date string
}

/**
 * Options du plugin. `basePath` — jamais `prefix` — pour la même raison que
 * `routes/uploads/tus-handler.ts` (#4277) : ce module construit lui-même des
 * URLs ABSOLUES (`${basePath}/conversations/…`) ; les combiner avec le
 * mécanisme de préfixage NATIF de Fastify (déclenché par la clé réservée
 * `prefix` sur `server.register()`) additionnerait les deux — vérifié :
 * `server.register(userDeletionsRoutes, { prefix: '/api/v1' })` avec des
 * routes internes déjà absolues sert `/api/v1/api/v1/user/deleted-conversations`,
 * jamais `/api/v1/user/deleted-conversations`.
 */
export type UserDeletionsRoutesOptions = {
  readonly basePath?: string;
};

/**
 * Base absolue des sept routes ci-dessous (#4277, critère 3). AVANT ce lot,
 * le module était monté via `server.register(userDeletionsRoutes, { prefix: '' })`
 * ET portait le chemin COMPLET codé en dur dans chaque route
 * (`/api/conversations/…`) — une troisième convention d'adressage dans le
 * même fichier de `route-registration.ts`, aux côtés de `${API_PREFIX}` seul
 * et de `${API_PREFIX}/sous-chemin`. `opts.basePath` est désormais la SEULE
 * source ; le repli `/api` ne sert que si l'appelant n'en fournit AUCUNE —
 * l'appel actuel de `route-registration.ts` (`prefix: ''`, sans `basePath`)
 * ou les harnais de test existants (`app.register(userDeletionsRoutes)`,
 * sans options), ce qui préserve EXACTEMENT l'adresse d'aujourd'hui tant que
 * l'édit d'enregistrement de #4277 n'est pas appliqué.
 *
 * PAS `/api/v1` : `DELETE …/conversations/:conversationId/delete-for-me`
 * PARTAGE son adresse finale sous `/api/v1` avec un DOUBLON déjà vivant —
 * `routes/conversations/delete-for-me.ts` (`registerDeleteForMeRoutes`,
 * monté dans `conversationRoutes` sous `${API_PREFIX}`), une implémentation
 * plus récente et plus complète (transfert de propriété, clôture,
 * diffusion Socket.IO) que celle-ci n'a jamais reçue. Faire remonter CETTE
 * route à `/api/v1` ferait lever Fastify au démarrage
 * (`FST_ERR_DUPLICATED_ROUTE`) — mesuré sur le manifeste (#4276) :
 * `DELETE /api/v1/conversations/:id/delete-for-me` y figure déjà. Les six
 * AUTRES routes de ce fichier n'ont AUCUN doublon (vérifié :
 * `grep -rn` sur `services/gateway/src/routes` ne rend qu'un hit HORS
 * commentaire, celui-ci) et pourraient migrer sans risque — mais un fichier
 * scindé en deux conventions d'adressage reproduirait exactement le défaut
 * que ce critère referme. Suivi à part : quelle implémentation du
 * « delete-for-me » de conversation doit rester ?
 */
export default async function userDeletionsRoutes(
  fastify: FastifyInstance,
  opts: UserDeletionsRoutesOptions = {}
) {
  const prisma = fastify.prisma;
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });
  const basePath = opts.basePath || '/api';

  /**
   * DELETE /api/conversations/:conversationId/delete-for-me
   *
   * ALIAS DÉPRÉCIÉ (#4332) de la route CANONIQUE
   * `DELETE /api/v1/conversations/:id/delete-for-me`
   * (`routes/conversations/delete-for-me.ts`). Avant ce lot, cette route
   * portait sa PROPRE logique — un simple upsert sur
   * `UserConversationPreferences.deletedForUserAt` — sans transfert de
   * propriété ni clôture, et écrivant une colonne que RIEN d'autre ne relit
   * pour ce geste : la corbeille (`restore-for-me`,
   * `GET .../deleted-conversations`, plus bas dans ce fichier) lit
   * `Participant.deletedForMe` — la colonne que la route canonique écrit.
   * Deux implémentations, deux vérités, et seule la canonique avait un
   * appelant réel (iOS `ConversationService.swift`, Android
   * `ConversationApi.kt`) — #4317 a tranché en sa faveur. Cette route
   * délègue désormais intégralement à `performConversationDeleteForMe`, si
   * bien que les DEUX adresses écrivent la MÊME colonne et que la corbeille
   * peut enfin contenir ce que l'utilisateur supprime réellement — c'était
   * le défaut nommé par #4332 : « la corbeille lit une colonne que plus
   * rien n'écrit ».
   *
   * `onRequest: [depreciee(...)]` plutôt qu'un appel dans le handler : une
   * adresse dépréciée s'annonce quel que soit le verdict (401 compris), et
   * `onRequest` court avant toute garde — voir le doc-comment de
   * `utils/deprecation.ts`. Pas de `Sunset` : le retrait est gouverné par le
   * compteur d'accès (#4275, `services/route-usage.service.ts`), jamais par
   * une date posée à la main sur une route dont le trafic réel n'a encore
   * jamais été mesuré (l'ajouter à `ROUTES_SURVEILLEES` est un suivi
   * séparé — ce fichier n'est pas le territoire de ce compteur).
   */
  fastify.delete<{ Params: ConversationIdParams }>(
    `${basePath}/conversations/:conversationId/delete-for-me`,
    {
      onRequest: [
        depreciee({
          depuis: '2026-08-29',
          successeur: (req) =>
            `/api/v1/conversations/${(req.params as ConversationIdParams).conversationId}/delete-for-me`,
        }),
      ],
      preValidation: [authMiddleware],
      schema: {
        description: 'Deprecated alias of DELETE /api/v1/conversations/:id/delete-for-me. Soft-deletes a conversation from the authenticated user\'s view — transferring ownership or closing the conversation when the caller was its sole/creating member. The conversation can be restored later via restore-for-me, unless it was closed.',
        tags: ['users', 'conversations'],
        summary: 'Delete conversation for current user (deprecated alias)',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID to delete from user view' }
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
                  conversationId: { type: 'string' },
                  deletedAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          },
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { conversationId: rawConversationId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        const result = await performConversationDeleteForMe(fastify, prisma, {
          userId,
          rawConversationId,
        });

        logger.info('Conversation deleted', { conversationId: result.conversationId });

        return sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof ConversationDeleteForMeNotAParticipantError) {
          return sendNotFound(reply, 'Vous ne participez pas a cette conversation');
        }
        logger.error('Error deleting conversation for user', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * POST /api/conversations/:conversationId/restore-for-me
   * Restore a previously deleted conversation for the user.
   *
   * #4332 — lisait AUPARAVANT `UserConversationPreferences.deletedForUserAt`,
   * une colonne qu'AUCUN appelant réel n'écrivait (le seul écrivain était le
   * DELETE ci-dessus, avant qu'il ne délègue lui aussi à
   * `performConversationDeleteForMe`) : cette route répondait donc TOUJOURS
   * 400 « Conversation is not deleted », y compris pour une conversation que
   * l'utilisateur venait réellement de supprimer via la route canonique, qui
   * écrit `Participant.deletedForMe`. Elle lit désormais CETTE colonne — la
   * même que le DELETE ci-dessus écrit, canonique comme alias.
   *
   * Pas de filtre `isActive` sur le `findFirst` : c'est justement l'inverse
   * qu'on cherche — un participant que « supprimer pour moi » a désactivé.
   */
  fastify.post<{ Params: ConversationIdParams }>(
    `${basePath}/conversations/:conversationId/restore-for-me`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Restore a previously deleted conversation to the authenticated user\'s view. Only works if the conversation was previously deleted by the user AND the conversation itself was not closed for everyone in the process.',
        tags: ['users', 'conversations'],
        summary: 'Restore deleted conversation',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID to restore' }
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
                  message: { type: 'string', example: 'Conversation restored' }
                }
              }
            }
          },
          400: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        const participant = await prisma.participant.findFirst({
          where: { conversationId, userId },
          select: {
            id: true,
            deletedForMe: true,
            conversation: { select: { isActive: true } },
          },
        });

        if (!participant || !participant.deletedForMe) {
          return sendBadRequest(reply, 'Conversation is not deleted');
        }

        // Restaurer un participant dont la conversation a été CLOSE (dernier
        // membre parti, ou DM vide clos — les deux branches de
        // `performConversationDeleteForMe`) rouvrirait pour tout le monde un
        // fil que la route canonique a fermé délibérément : un geste
        // personnel ne doit jamais avoir un effet collectif. La conversation
        // reste irrécupérable par ce chemin — seule une action
        // d'administration distincte peut rouvrir une conversation fermée.
        if (!participant.conversation.isActive) {
          return sendBadRequest(reply, 'Conversation is closed and cannot be restored');
        }

        await prisma.participant.update({
          where: { id: participant.id },
          data: { deletedForMe: null, isActive: true },
        });
        // Miroir exact du DELETE ci-dessus : sans cette invalidation, le
        // cache de lookup continuerait de répondre "inactif" pour CE
        // participant jusqu'à l'expiration de son TTL, alors que la ligne
        // vient d'être réactivée.
        invalidateParticipantLookup(participant.id, conversationId);

        logger.info('Conversation restored', { conversationId });

        return sendSuccess(reply, { message: 'Conversation restored' });
      } catch (error) {
        logger.error('Error restoring conversation for user', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * POST /api/conversations/:conversationId/clear-history
   * Clear all messages before a certain date (delete for user only)
   */
  fastify.post<{ Params: ConversationIdParams; Body: ClearHistoryBody }>(
    `${basePath}/conversations/:conversationId/clear-history`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Clear conversation history before a specific date for the authenticated user only. Messages before the specified date will be hidden from the user\'s view. Other participants are not affected.',
        tags: ['users', 'conversations'],
        summary: 'Clear conversation history',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID to clear history for' }
          }
        },
        body: {
          type: 'object',
          required: ['beforeDate'],
          properties: {
            beforeDate: { type: 'string', format: 'date-time', description: 'ISO 8601 date string - messages before this date will be hidden' }
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
                  message: { type: 'string', example: 'Chat history cleared before 2024-01-15T10:30:00.000Z' },
                  clearHistoryBefore: { type: 'string', format: 'date-time', description: 'The date before which messages are hidden' }
                }
              }
            }
          },
          400: errorResponseSchema,
          403: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const { beforeDate } = request.body;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        if (!beforeDate) {
          return sendBadRequest(reply, 'beforeDate is required');
        }

        const clearDate = new Date(beforeDate);
        if (isNaN(clearDate.getTime())) {
          return sendBadRequest(reply, 'Invalid date format');
        }

        // Verify user is a member
        const membership = await prisma.participant.findFirst({
          where: {
            conversationId,
            userId,
            isActive: true,
          },
        });

        if (!membership) {
          return sendForbidden(reply, 'Not a member of this conversation');
        }

        // The cutoff hides history on every device the user is signed in on,
        // so it travels the same versioned+broadcast path.
        await writeConversationPreferences(fastify, {
          userId,
          conversationId,
          data: { clearHistoryBefore: clearDate },
        });

        // Idem : les notifications des messages désormais masqués détiennent
        // leur extrait. La coupure est strictement antérieure, miroir de la
        // borne inclusive appliquée à la lecture.
        await retractNotificationsForClearedHistory(prisma, {
          userId,
          conversationId,
          before: clearDate,
        });

        // Troisième écrivain du masquage personnel, même dette : effacer
        // l'historique laissait la ligne de liste afficher le dernier message
        // d'avant la coupure. `clearHistoryBefore` est l'une des deux tables que
        // `resolvePersonalPreviewOverrides` lit — il ne lui manquait, ici aussi,
        // que le déclencheur.
        await refreshPersonalConversationPreview(fastify, {
          userId,
          conversationIds: [conversationId],
        });

        logger.info('History cleared', { conversationId });

        return sendSuccess(reply, {
          message: `Chat history cleared before ${clearDate.toISOString()}`,
          clearHistoryBefore: clearDate,
        });
      } catch (error) {
        logger.error('Error clearing history', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * DELETE /api/messages/:messageId/delete-for-me
   * Soft-delete a message from the user's view only
   */
  fastify.delete<{ Params: MessageIdParams }>(
    `${basePath}/messages/:messageId/delete-for-me`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Soft-delete a specific message from the authenticated user\'s view. Other participants will still see the message. The message can be restored later.',
        tags: ['users', 'messages'],
        summary: 'Delete message for current user',
        params: {
          type: 'object',
          required: ['messageId'],
          properties: {
            messageId: { type: 'string', description: 'Message ID to delete from user view' }
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
                  message: { type: 'string', example: 'Message deleted from your view' }
                }
              }
            }
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Get message and verify user can access it
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          include: {
            conversation: {
              include: {
                participants: {
                  where: { userId, isActive: true },
                },
              },
            },
          },
        });

        if (!message) {
          return sendNotFound(reply, 'Message not found');
        }

        if (message.conversation.participants.length === 0) {
          return sendForbidden(reply, 'Not a member of this conversation');
        }

        // Persiste la ligne, rétracte la notification qui garde une COPIE de
        // l'extrait, et DIFFUSE à `user:{id}` — les trois d'un seul geste. Le
        // troisième manquait : le masquage n'atteignait que l'appareil qui
        // l'avait demandé (cf. `personalMessageVisibilitySync`).
        await hideMessagesForUser(fastify, {
          userId,
          messages: [{ messageId, conversationId: message.conversationId }],
        });

        logger.info('Message deleted');

        return sendSuccess(reply, { message: 'Message deleted from your view' });
      } catch (error) {
        logger.error('Error deleting message for user', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * POST /api/messages/:messageId/restore-for-me
   * Restore a previously deleted message for the user
   */
  fastify.post<{ Params: MessageIdParams }>(
    `${basePath}/messages/:messageId/restore-for-me`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Restore a previously deleted message to the authenticated user\'s view. Only works if the message was previously deleted by the user.',
        tags: ['users', 'messages'],
        summary: 'Restore deleted message',
        params: {
          type: 'object',
          required: ['messageId'],
          properties: {
            messageId: { type: 'string', description: 'Message ID to restore' }
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
                  message: { type: 'string', example: 'Message restored' }
                }
              }
            }
          },
          400: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // La conversation du message est chargée ICI et pas après coup : la
        // diffusion du retour en vue en a besoin (les caches clients sont
        // indexés par conversation), et cette lecture est la seule qui touche
        // encore la ligne avant sa suppression.
        const deletion = await prisma.userMessageDeletion.findUnique({
          where: {
            userId_messageId: { userId, messageId },
          },
          select: { message: { select: { conversationId: true } } },
        });

        if (!deletion) {
          return sendBadRequest(reply, 'Message is not deleted');
        }

        await restoreMessageForUser(fastify, {
          userId,
          message: { messageId, conversationId: deletion.message.conversationId },
        });

        logger.info('Message restored');

        return sendSuccess(reply, { message: 'Message restored' });
      } catch (error) {
        logger.error('Error restoring message for user', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * DELETE /api/messages/bulk/delete-for-me
   * Bulk delete multiple messages from the user's view
   */
  fastify.delete<{ Body: { messageIds: string[] } }>(
    `${basePath}/messages/bulk/delete-for-me`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Bulk delete multiple messages from the authenticated user\'s view in a single request. Maximum 100 messages per request. Other participants are not affected. Only messages from conversations where the user is a member can be deleted.',
        tags: ['users', 'messages'],
        summary: 'Bulk delete messages for current user',
        body: {
          type: 'object',
          required: ['messageIds'],
          properties: {
            messageIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 100,
              description: 'Array of message IDs to delete (max 100)'
            }
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
                  message: { type: 'string', example: '15 messages deleted from your view' },
                  deletedCount: { type: 'number', description: 'Number of messages actually deleted' },
                  requestedCount: { type: 'number', description: 'Number of message IDs requested' }
                }
              }
            }
          },
          400: errorResponseSchema,
          403: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { messageIds } = request.body;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
          return sendBadRequest(reply, 'messageIds array is required');
        }

        if (messageIds.length > 100) {
          return sendBadRequest(reply, 'Maximum 100 messages can be deleted at once');
        }

        // Verify user can access these messages (they belong to conversations user is member of)
        const messages = await prisma.message.findMany({
          where: {
            id: { in: messageIds },
            conversation: {
              participants: {
                some: { userId, isActive: true },
              },
            },
          },
          select: { id: true, conversationId: true },
        });

        const validMessageIds = messages.map((m) => m.id);

        if (validMessageIds.length === 0) {
          return sendForbidden(reply, 'No accessible messages found');
        }

        // UNE diffusion pour tout le lot, jamais une par message : le lot va
        // jusqu'à 100 ids, et un fanout par message ferait payer 100 événements
        // à un seul geste.
        await hideMessagesForUser(fastify, {
          userId,
          messages: messages.map((m) => ({
            messageId: m.id,
            conversationId: m.conversationId,
          })),
        });

        logger.info('Messages bulk deleted', { count: validMessageIds.length });

        return sendSuccess(reply, {
          message: `${validMessageIds.length} messages deleted from your view`,
          deletedCount: validMessageIds.length,
          requestedCount: messageIds.length,
        });
      } catch (error) {
        logger.error('Error bulk deleting messages', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * GET /api/user/deleted-conversations
   * Get list of conversations the user has deleted (for potential restoration)
   */
  fastify.get(
    `${basePath}/user/deleted-conversations`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Get a list of all conversations the authenticated user has deleted from their view. Returns conversation details and deletion timestamps. These conversations can be restored.',
        tags: ['users', 'conversations'],
        summary: 'Get user deleted conversations',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    conversationId: { type: 'string', description: 'Conversation ID' },
                    conversation: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        identifier: { type: 'string' },
                        title: { type: 'string', nullable: true },
                        type: { type: 'string', enum: ['direct', 'group'] },
                        avatar: { type: 'string', nullable: true },
                        lastMessageAt: { type: 'string', format: 'date-time', nullable: true }
                      }
                    },
                    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the user deleted this conversation' }
                  }
                }
              }
            }
          },
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;
        const userId = authContext.userId;

        // #4332 — lisait AUPARAVANT `UserConversationPreferences`, une table
        // qu'aucun appelant réel n'écrit pour ce geste (voir le DELETE en
        // tête de fichier) : cette liste était donc TOUJOURS vide, par
        // construction. `Participant.deletedForMe` est la colonne que la
        // route canonique de suppression écrit — c'est elle qui porte la
        // vérité. Le `select` reste IDENTIQUEMENT celui d'avant sur
        // `conversation` (mêmes six champs, rien de plus) : élargir la
        // charge de cette liste est un choix à part, pas un effet de bord
        // de ce correctif.
        const deletedParticipants = await prisma.participant.findMany({
          where: {
            userId,
            deletedForMe: { not: null },
          },
          select: {
            conversationId: true,
            deletedForMe: true,
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                lastMessageAt: true,
              },
            },
          },
          orderBy: { deletedForMe: 'desc' },
        });

        return sendSuccess(reply, deletedParticipants.map((p) => ({
          conversationId: p.conversationId,
          conversation: p.conversation,
          deletedAt: p.deletedForMe,
        })));
      } catch (error) {
        logger.error('Error fetching deleted conversations', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );
}
