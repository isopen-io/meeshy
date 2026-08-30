/**
 * Lectures de messages d'une conversation — réactions paginées
 * (`GET /conversations/:id/reactions`) et statuts de lecture/livraison
 * (`GET /conversations/:id/status`).
 *
 * Fichier extrait de `messages-advanced.ts` (issue #4284, découpage par
 * responsabilité — aucun changement de comportement). Point d'entrée :
 * `messages-advanced.ts`.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { canAccessConversation } from './utils/access-control';
import {
  applyHistoryFloor,
  historyReaderFromAuthContext,
  loadReaderHistoryFloor,
} from '../../services/historyFloor';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { validatePagination } from '../../utils/pagination';
import type { ConversationParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendForbidden, sendInternalError } from '../../utils/response';

// Logger dédié pour messages-advanced
const logger = enhancedLogger.child({ module: 'messages-advanced' });

/**
 * Plafond de `GET /conversations/:id/status` : les N messages les plus récents.
 *
 * Cet endpoint charge, PAR message, ses entrées de statut et le participant
 * joint sur chacune — il ne peut pas rester non borné. Le détail exhaustif
 * d'un message précis vit derrière `GET /messages/:messageId/status-details`,
 * qui est paginé ; ce plafond n'y retire donc aucune information.
 */
const CONVERSATION_STATUS_PAGE_SIZE = 50;


/**
 * `GET /conversations/:id/reactions` et `GET /conversations/:id/status`.
 * Regroupées dans un seul registrar : même paire de gardes d'accès
 * (`resolveConversationId` + `canAccessConversation`), même plancher
 * d'historique, aucune dépendance à `socketIOHandler` / aux services
 * d'attachments ou de tracking links que portent les routes d'écriture.
 */
export function registerMessagesAdvancedReadRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  fastify.get<{
    Params: ConversationParams;
    Querystring: { offset?: string; limit?: string };
  }>('/conversations/:id/reactions', {
    schema: {
      description: 'Get reactions from messages in a conversation, one page of the most recent reaction rows at a time (grouped by message ID, with emoji counts and user information).',
      tags: ['conversations', 'reactions'],
      summary: 'Get conversation reactions (paginated)',
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
          offset: { type: 'string', description: 'Number of reaction rows to skip (default: 0)' },
          limit: { type: 'string', description: 'Maximum number of reaction rows to scan for this page (default: 100, max: 100)' }
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
                reactions: {
                  type: 'array',
                  description: 'This page of reactions, grouped by message'
                },
                total: { type: 'number', description: 'Total reaction rows across the conversation (not just this page)' },
                // #4165 critère 2 : de quoi demander la suite, maintenant que
                // cette route rend une PAGE plutôt que la conversation entière.
                hasMore: { type: 'boolean', description: 'Whether more reaction rows exist beyond this page' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
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

      // Une réaction NOMME un message et l'identité de qui l'a posée : sur un
      // message d'AVANT l'arrivée du lecteur, elle révèle l'existence de ce
      // message, son id et qui était là. Le plancher borne donc le PRÉDICAT qui
      // sélectionne les messages réagis, au même titre que leur contenu.
      const reactionsFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      const reactionsWhere = {
        message: applyHistoryFloor({ conversationId: conversationId, deletedAt: null }, reactionsFloor)
      };

      // BORNÉ (#4165) — c'était le PIRE cas nommé par l'audit : `findMany` sur
      // TOUTE la conversation, sans `take` ni pagination, une jointure
      // participant par ligne. Un fil actif de plusieurs dizaines de milliers
      // de réactions payait cette charge à CHAQUE ouverture de l'écran de
      // détail. `take`/`skip` posent la borne DANS la requête Prisma (pas un
      // slice après coup) ; `total` reste le VRAI compte (via `.count()`, sur
      // le MÊME `where` — un aller-retour indexé, sans commune mesure avec le
      // `findMany` qu'il remplace) pour que `hasMore` et l'affichage d'un
      // total exact restent corrects malgré la troncature de la page.
      const { offset, limit } = validatePagination(
        request.query.offset,
        request.query.limit,
        { defaultLimit: 100, maxLimit: 100 }
      );

      const [reactions, total] = await Promise.all([
        prisma.reaction.findMany({
          where: reactionsWhere,
          include: {
            participant: {
              select: {
                id: true,
                displayName: true,
                avatar: true,
                type: true,
                user: { select: { username: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit
        }),
        prisma.reaction.count({ where: reactionsWhere })
      ]);

      // Grouper les réactions par messageId et emoji
      const reactionsByMessage = new Map<string, any>();

      for (const reaction of reactions) {
        if (!reactionsByMessage.has(reaction.messageId)) {
          reactionsByMessage.set(reaction.messageId, {});
        }

        const messageReactions = reactionsByMessage.get(reaction.messageId);
        if (!messageReactions[reaction.emoji]) {
          messageReactions[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: []
          };
        }

        messageReactions[reaction.emoji].count++;
        messageReactions[reaction.emoji].users.push({
          participantId: reaction.participantId,
          isAnonymous: reaction.participant.type === 'anonymous',
          user: { ...reaction.participant, username: reaction.participant.user?.username }
        });
      }

      // Convertir en tableau
      const reactionsArray = Array.from(reactionsByMessage.entries()).map(([messageId, emojis]) => ({
        messageId,
        reactions: Object.values(emojis)
      }));

      return sendSuccess(reply, {
        reactions: reactionsArray,
        total,
        hasMore: offset + reactions.length < total
      });

    } catch (error) {
      logger.error('Error fetching conversation reactions', error);
      return sendInternalError(reply, 'Error retrieving reactions');
    }
  });

  // #4188 — `POST` et `DELETE /conversations/:id/messages/:messageId/reactions`
  // ont été RETIRÉES : aucun appelant sur les trois clients. iOS passe par
  // `ReactionService.swift` → `POST /reactions` (forme plate), Android par
  // `ReactionApi.kt` → `POST /reactions`, le web par le socket `reaction:add`
  // (`websocket.service.ts`). La porte VIVANTE est la forme plate ; ces deux
  // jumelles imbriquées n'étaient qu'un second chemin vers la même règle.

  /**
   * GET /conversations/:id/status
   * Récupère les statuts de lecture de tous les messages d'une conversation
   */
  fastify.get<{
    Params: ConversationParams;
  }>('/conversations/:id/status', {
    schema: {
      description: 'Get read/delivery status for all messages in a conversation. Returns aggregated counts and detailed per-user status for each message. Useful for displaying message receipts and read indicators.',
      tags: ['conversations', 'status'],
      summary: 'Get all conversation message statuses',
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
                statuses: {
                  type: 'array',
                  description: 'Status information for all messages'
                },
                // Idem : `total` était servi et supprimé.
                total: { type: 'number', description: 'Number of messages covered by this status page' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
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

      // Le plancher d'historique du lecteur borne cette page comme il borne
      // `GET …/messages` : `id`, `senderId`, `createdAt` et les accusés
      // NOMINATIFS d'un message d'avant l'arrivée SONT l'historique, moins le
      // texte. Une métadonnée fuit ce que le contenu tait.
      const statusFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      // BORNÉE. Sans `take`, ce handler chargeait CHAQUE message non supprimé
      // de la conversation, chacun avec ses entrées de statut et le participant
      // joint sur chacune — sur un fil de plusieurs dizaines de milliers de
      // messages, un déni de service qu'un simple participant déclenchait.
      const messages = await prisma.message.findMany({
        where: applyHistoryFloor({ conversationId: conversationId, deletedAt: null }, statusFloor),
        select: {
          id: true,
          senderId: true,
          createdAt: true,
          statusEntries: {
            select: {
              participantId: true,
              deliveredAt: true,
              readAt: true,
              participant: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  user: { select: { username: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: CONVERSATION_STATUS_PAGE_SIZE
      });

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      // Le résumé se CALCULE. Les colonnes `deliveredCount`/`readCount`/
      // `deliveredToAllAt`/`readByAllAt` de la ligne Message n'ont aucun
      // écrivain : les lire revenait à servir `{0, 0, null, null}` à côté
      // d'`entries` qui, elles, portaient les vraies dates — une charge utile
      // qui se contredisait elle-même.
      const summaries = await readStatusService.getConversationReadStatuses(
        conversationId,
        messages.map(message => message.id)
      );

      // Ces `entries` exposent des accusés NOMINATIFS — identité et horodatage
      // de lecture. Le gate `showReadReceipts` s'y applique donc au même titre
      // qu'au résumé ; il y manquait entièrement.
      const visibleParticipantIds = new Set(
        (await readStatusService.filterReadReceiptVisible(
          messages.flatMap(message => message.statusEntries.map(entry => entry.participant))
        )).map(participant => participant.id)
      );

      const statuses = messages.map(message => {
        const summary = summaries.get(message.id);
        return {
          messageId: message.id,
          senderId: message.senderId,
          summary: {
            deliveredCount: summary?.receivedCount ?? 0,
            readCount: summary?.readCount ?? 0,
            recipientCount: summary?.totalMembers ?? 0
          },
          entries: message.statusEntries
            .filter(entry => visibleParticipantIds.has(entry.participantId))
            .map(entry => ({
              participantId: entry.participantId,
              isAnonymous: entry.participant.type === 'anonymous',
              deliveredAt: entry.deliveredAt,
              readAt: entry.readAt,
              user: { ...entry.participant, username: entry.participant.user?.username }
            }))
        };
      });

      return sendSuccess(reply, {
        statuses,
        total: messages.length
      });

    } catch (error) {
      logger.error('Error fetching conversation statuses', error);
      return sendInternalError(reply, 'Error retrieving statuses');
    }
  });


}
