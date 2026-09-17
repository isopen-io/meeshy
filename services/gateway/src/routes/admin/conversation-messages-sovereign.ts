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
 * `GET /admin/users/:userId/media` (`routes/admin/media-protection.ts`) — un
 * administrateur souverain, motif écrit et tracé, doit pouvoir CONSTATER
 * qu'un message existe (qui, quand, avec combien de pièces jointes) sans que
 * cela ouvre son contenu protégé. `content` tombe à `null` et `isProtected`
 * dit pourquoi, au lieu de laisser croire à un message vide.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requireAdminRank, requirePermission, withAudit } from '../../middleware/authorize';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { sendPaginatedSuccess, sendNotFound, sendInternalError } from '../../utils/response';
// #4388 — le prédicat de CONTENU (et son select associé) vivait ICI, dans un
// fichier de ROUTE, alors que `content.ts` l'importait déjà en second
// appelant (#4384) : même défaut qu'un prédicat recopié, juste pas encore
// dupliqué. Il est déplacé à côté de son jumeau MÉDIA
// (`mediaAttachmentIsProtected`), dans `routes/admin/media-protection.ts` —
// voir son doc-comment pour le détail des six colonnes.
// #6862 — LE `select`, LE SCHÉMA ET LA PROJECTION SONT TROIS ÉNONCÉS DE LA
// MÊME FORME, et ils vivent ensemble dans `sovereign-message-projection.ts` :
// un champ chargé sans être déclaré est supprimé par fast-json-stringify sans
// qu'un témoin rougisse, un champ déclaré sans être chargé est la même dérive
// dans l'autre sens. Les deux prédicats de `media-protection.ts` y sont
// APPELÉS, jamais recopiés — ils rendent le verdict, la projection décide de la
// forme du masquage.
import {
  mapSovereignMessageRow,
  sovereignMessageSchema,
  sovereignMessageSelect,
} from './sovereign-message-projection';
import { logError } from '../../utils/logger.js';
import { withOrphanedSenderRepair } from '../../services/messaging/withOrphanedSenderRepair';

const REASON_MIN_LENGTH = 10;

export function registerConversationMessagesSovereignRoute(fastify: FastifyInstance): void {
  fastify.get<{
    Params: { conversationId: string };
    Querystring: { offset?: string; limit?: string; reason: string };
  }>('/admin/conversations/:conversationId/messages', {
    /**
     * **LE RANG A BAISSÉ, LA TRACE N'A PAS BOUGÉ** — directive porteur du
     * 2026-09-16 : « permettre aussi aux ADMIN de pouvoir accéder à ces
     * informations **pour le moment** ».
     *
     * #4157 avait monté ce geste en S6 (`requireSovereign()`, BIGBOSS seul)
     * avec un motif explicite : « aucune permission de domaine ne doit pouvoir
     * déléguer la lecture de conversations privées en série ». La directive
     * revient sur ce seuil, et le « pour le moment » qu'elle porte est repris
     * tel quel — c'est un seuil ASSUMÉ comme révisable.
     *
     * Ce qui NE change pas, et c'est ce qui compte : le motif écrit reste
     * obligatoire (refusé au schéma sous dix caractères) et `withAudit` écrit
     * toujours sa ligne. Un ADMIN lit désormais, et sa lecture laisse la MÊME
     * empreinte qu'un BIGBOSS. Abaisser le rang et effacer la trace auraient
     * été deux décisions distinctes ; une seule est demandée.
     *
     * `requireAdminRank()` plutôt que la seule permission : `canManageConversations`
     * est aussi portée par MODERATOR (matrice centrale), et l'élargissement
     * obtenu de biais par une permission de domaine est exactement ce que
     * #4157 fermait. La garde de rang dit « aussi les ADMIN », et rien de plus.
     */
    onRequest: [fastify.authenticate, requirePermission('canManageConversations'), requireAdminRank()],
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
              items: sovereignMessageSchema
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
      const [messages, total] = await withOrphanedSenderRepair({ prisma: fastify.prisma, conversationIds: [conversationId] }, () => Promise.all([
        fastify.prisma.message.findMany({
          where,
          // #6862 — LE `select` EST NOMMÉ, et il vit avec le schéma qui le
          // déclare et la projection qui le garde
          // (`sovereign-message-projection.ts`). Retapé ici, il divergeait de
          // l'un des deux au premier champ ajouté — et la divergence est
          // SILENCIEUSE dans les deux sens.
          select: sovereignMessageSelect,
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.message.count({ where })
      ]));

      /**
       * La protection se lit aux DEUX niveaux qui la DÉCLARENT — le MESSAGE et
       * la PIÈCE, dont les colonnes homonymes sont INDÉPENDANTES — et le
       * verdict est leur OU, jamais une cascade. La citation en ajoute un
       * troisième, le sien : un message parfaitement libre peut citer un
       * message à vue unique, et la citation est alors le seul endroit par où
       * son texte sort.
       *
       * Et ce qui tombe n'est pas seulement la CHAÎNE : les traductions, la
       * transcription, les pistes TTS, la vignette, le `thumbHash`, les
       * variantes d'image et `metadata` restituent le même contenu par un autre
       * médium (leçon 275). Le détail de chaque garde vit dans le doc-comment
       * de `sovereign-message-projection.ts`.
       */
      const data = messages.map(mapSovereignMessageRow);

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
      logError(fastify.log, 'Error fetching sovereign conversation messages', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch conversation messages' });
    }
  });
}
