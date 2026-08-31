/**
 * `GET /admin/conversations/:conversationId/messages` — le TROISIÈME geste
 * souverain que le critère 2 de #4157 réclamait (#4333 c.3).
 *
 * ## Ce que cette route servait, et pourquoi c'est grave
 *
 * Le contenu **intégral** de n'importe quelle conversation privée, sous la
 * seule garde `canViewUsers` — la même permission qu'un AUDIT porte pour
 * consulter la fiche d'un compte. `where` se réduisait à `{ conversationId }` :
 * `deletedAt` était sélectionné mais jamais filtré (un message supprimé
 * restait lisible), et rien ne gardait `isViewOnce` / `expiresAt` /
 * `encryptionMode`. Aucune ligne d'audit n'accompagnait la lecture.
 *
 * ## Le régime appliqué, exactement celui de ses deux frères
 *
 * `PUT /admin/agent/llm` et `DELETE /admin/agent/reset` (`routes/admin/agent.ts`,
 * #4157) sont les deux gestes déjà en S6 : `requireSovereign()` (BIGBOSS et
 * lui seul — aucune permission de domaine ne doit pouvoir déléguer la lecture
 * de conversations privées en série), un motif écrit **refusé au niveau du
 * schéma** (Fastify/AJV valide `querystring.reason` — `minLength: 10` — AVANT
 * que ce handler ne s'exécute ; ce n'est pas une revérification défensive),
 * et une trace `AdminAuditLog` via `withAudit`, écrite APRÈS la lecture
 * réussie (best-effort, cf. sa doc — un geste qui a eu lieu doit laisser sa
 * trace même si l'écriture du journal échoue).
 *
 * `reason` vit en QUERYSTRING et non en corps : `GET` n'a conventionnellement
 * pas de corps (le spec Fetch interdit même `body` sur un `GET`), et le
 * client web existant (`ConversationMessagesModal`) est un `apiService.get`
 * ordinaire — un `body` sur ce verbe serait invisible à la moitié de la
 * chaîne HTTP avant même d'atteindre ce handler.
 *
 * ## Le filtre de contenu, et pourquoi une ligne PROTÉGÉE reste LISTÉE
 *
 * `deletedAt: null` est au `where` : un message supprimé n'est plus servable
 * du tout, au même régime que les lectures non-admin. `isViewOnce` /
 * `isBlurred` / `effectFlags` (réutilisant `maskedAttachment`, la MÊME garde
 * que l'éventail de notifications — jamais une copie), l'expiration déjà
 * consommée et le chiffrement (`isEncrypted` / `encryptionMode`) gardent le
 * CONTENU, pas la ligne : exactement la forme que #4157 c.4 a établie pour
 * `GET /admin/users/:userId/media` (`utils/media-protection.ts`) — un
 * administrateur souverain, motif écrit et tracé, doit pouvoir CONSTATER
 * qu'un message existe (qui, quand, avec combien de pièces jointes) sans que
 * cela ouvre son contenu protégé. `content` tombe à `null` et `isProtected`
 * dit pourquoi, au lieu de laisser croire à un message vide.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requireSovereign, withAudit } from '../../middleware/authorize';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { sendPaginatedSuccess, sendNotFound, sendInternalError } from '../../utils/response';
// #4388 — le prédicat de CONTENU (et son select associé) vivait ICI, dans un
// fichier de ROUTE, alors que `content.ts` l'importait déjà en second
// appelant (#4384) : même défaut qu'un prédicat recopié, juste pas encore
// dupliqué. Il est déplacé à côté de son jumeau MÉDIA
// (`mediaAttachmentIsProtected`), dans `utils/media-protection.ts` —
// voir son doc-comment pour le détail des six colonnes.
import { messageContentIsProtected, messageContentProtectionSelect } from '../../utils/media-protection';

const REASON_MIN_LENGTH = 10;

export function registerConversationMessagesSovereignRoute(fastify: FastifyInstance): void {
  fastify.get<{
    Params: { conversationId: string };
    Querystring: { offset?: string; limit?: string; reason: string };
  }>('/admin/conversations/:conversationId/messages', {
    onRequest: [fastify.authenticate, requireSovereign()],
    schema: {
      description:
        'Lit le contenu intégral des messages d\'une conversation privée. Rang souverain (BIGBOSS), motif écrit ' +
        'obligatoire et geste tracé — #4333 c.3, troisième frère de PUT /admin/agent/llm et DELETE /admin/agent/reset.',
      tags: ['admin'],
      summary: 'Read a private conversation\'s messages (sovereign)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        required: ['reason'],
        properties: {
          offset: { type: 'string', description: 'Pagination offset' },
          limit: { type: 'string', description: 'Pagination limit (max 100)' },
          reason: {
            type: 'string',
            minLength: REASON_MIN_LENGTH,
            description: 'Motif écrit de la lecture (10 caractères minimum), consigné dans AdminAuditLog'
          }
        }
      },
      response: {
        200: {
          description: 'Messages successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string', nullable: true },
                  originalLanguage: { type: 'string', nullable: true },
                  messageType: { type: 'string', nullable: true },
                  messageSource: { type: 'string', nullable: true },
                  isEdited: { type: 'boolean', nullable: true },
                  editedAt: { type: 'string', format: 'date-time', nullable: true },
                  replyToId: { type: 'string', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  attachmentCount: { type: 'number' },
                  isProtected: { type: 'boolean' },
                  sender: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      userId: { type: 'string', nullable: true },
                      type: { type: 'string', nullable: true },
                      displayName: { type: 'string', nullable: true },
                      avatar: { type: 'string', nullable: true },
                      nickname: { type: 'string', nullable: true },
                      user: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          id: { type: 'string' },
                          username: { type: 'string', nullable: true },
                          displayName: { type: 'string', nullable: true },
                          avatar: { type: 'string', nullable: true }
                        }
                      }
                    }
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
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
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const { offset = '0', limit, reason } = request.query as { offset?: string; limit?: string; reason: string };
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 30, maxLimit: 100 });

      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true }
      });
      if (!conversation) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      // Un message SUPPRIMÉ n'est plus servable du tout — au même régime que
      // les lectures non-admin. Auparavant sélectionné (`deletedAt: true`)
      // mais jamais filtré : un message effacé restait lisible en entier.
      const where = { conversationId, deletedAt: null };
      const [messages, total] = await Promise.all([
        fastify.prisma.message.findMany({
          where,
          select: {
            id: true,
            content: true,
            originalLanguage: true,
            messageType: true,
            messageSource: true,
            isEdited: true,
            editedAt: true,
            replyToId: true,
            createdAt: true,
            // #4388 — les six colonnes que `messageContentIsProtected` exige,
            // désormais un select NOMMÉ et partagé avec `content.ts` plutôt
            // que retapées ici à la main.
            ...messageContentProtectionSelect,
            sender: {
              select: {
                id: true,
                userId: true,
                type: true,
                displayName: true,
                avatar: true,
                nickname: true,
                user: { select: { id: true, username: true, displayName: true, avatar: true } }
              }
            },
            _count: { select: { attachments: true } }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.message.count({ where })
      ]);

      const data = messages.map((message) => {
        const protege = messageContentIsProtected(message);
        return {
          id: message.id,
          content: protege ? null : message.content,
          originalLanguage: message.originalLanguage,
          messageType: message.messageType,
          messageSource: message.messageSource,
          isEdited: message.isEdited,
          editedAt: message.editedAt,
          replyToId: message.replyToId,
          createdAt: message.createdAt,
          sender: message.sender,
          attachmentCount: message._count?.attachments ?? 0,
          isProtected: protege,
        };
      });

      const authContext = (request as UnifiedAuthRequest).authContext;
      // Best-effort, écrite APRÈS le succès de la lecture (cf. doc de
      // `withAudit`) : un geste de cette sensibilité (lire une conversation
      // privée dans son intégralité) ne doit JAMAIS rester sans trace.
      await withAudit(request, {
        action: 'ADMIN_CONVERSATION_MESSAGES_VIEWED',
        entity: 'Conversation',
        entityId: conversationId,
        userId: authContext.registeredUser.id,
        reason,
      });

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + messages.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching sovereign conversation messages');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch conversation messages' });
    }
  });
}
