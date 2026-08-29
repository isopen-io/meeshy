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
   * Soft-delete a conversation from the user's view only
   */
  fastify.delete<{ Params: ConversationIdParams }>(
    `${basePath}/conversations/:conversationId/delete-for-me`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Soft-delete a conversation from the authenticated user\'s view. Other participants will still see the conversation. The conversation can be restored later.',
        tags: ['users', 'conversations'],
        summary: 'Delete conversation for current user',
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
                  message: { type: 'string', example: 'Conversation deleted from your view' }
                }
              }
            }
          },
          403: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Verify user is a member of this conversation
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

        // Per-user state: the user's other devices must drop the conversation
        // too, so this goes through the versioned+broadcast writer.
        await writeConversationPreferences(fastify, {
          userId,
          conversationId,
          data: { deletedForUserAt: new Date() },
        });

        logger.info('Conversation deleted', { conversationId });

        return sendSuccess(reply, { message: 'Conversation deleted from your view' });
      } catch (error) {
        logger.error('Error deleting conversation for user', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * POST /api/conversations/:conversationId/restore-for-me
   * Restore a previously deleted conversation for the user
   */
  fastify.post<{ Params: ConversationIdParams }>(
    `${basePath}/conversations/:conversationId/restore-for-me`,
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Restore a previously deleted conversation to the authenticated user\'s view. Only works if the conversation was previously deleted by the user.',
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

        // Update preferences to restore conversation
        const prefs = await prisma.userConversationPreferences.findUnique({
          where: {
            userId_conversationId: { userId, conversationId },
          },
        });

        if (!prefs || !prefs.deletedForUserAt) {
          return sendBadRequest(reply, 'Conversation is not deleted');
        }

        // Inverse of delete-for-me, and it owes the same broadcast: without it
        // the other devices keep hiding a conversation the user just restored.
        await writeConversationPreferences(fastify, {
          userId,
          conversationId,
          data: { deletedForUserAt: null },
        });

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

        const deletedPrefs = await prisma.userConversationPreferences.findMany({
          where: {
            userId,
            deletedForUserAt: { not: null },
          },
          include: {
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
          orderBy: { deletedForUserAt: 'desc' },
        });

        return sendSuccess(reply, deletedPrefs.map((p) => ({
          conversationId: p.conversationId,
          conversation: p.conversation,
          deletedAt: p.deletedForUserAt,
        })));
      } catch (error) {
        logger.error('Error fetching deleted conversations', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );
}
