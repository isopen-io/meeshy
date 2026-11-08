import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
import { canAccessConversation, refuserCommeIntrouvable } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { historyReaderFromAuthContext, loadReaderHistoryFloor } from '../../services/historyFloor';
import { loadPersonalHistoryHiding, NO_PERSONAL_HIDING } from '../../services/personalHistoryFilter';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

/**
 * Charge utile de `GET /conversations/:id/stats`.
 *
 * Elle était déclarée `data: { type: 'object' }` — sans `properties`, et
 * fast-json-stringify applique `additionalProperties: false` par défaut : la
 * réponse ENTIÈRE sortait en `{}`. Les deux clients qui l'appellent typent tous
 * leurs champs comme NON-optionnels (`ConversationMessageStatsResponse`, iOS et
 * Android), donc le `{}` faisait échouer le décodage : `fetchStats()` ne pouvait
 * rendre qu'une erreur, jamais une statistique vide.
 *
 * Les trois formes de cette charge utile sont volontairement différentes, et la
 * distinction est celle que `{ type: 'object' }` efface :
 *   - `contentTypes` est un objet FERMÉ (six compteurs nommés) ⇒ `properties` ;
 *   - `hourlyDistribution` est une vraie CARTE (`[String: Int]` côté iOS), dont
 *     les clés sont des données ⇒ `additionalProperties`, la seule déclaration
 *     qui laisse passer un objet aux clés inconnues ;
 *   - `participantStats` / `dailyActivity` / `languageDistribution` sont des
 *     TABLEAUX, aplatis par le handler depuis les cartes stockées en base.
 *
 * Source de vérité de la forme : `ConversationMessageStatsService.shapeResponse`
 * plus l'aplatissement du handler ci-dessous. Les noms suivent les décodeurs
 * clients (`ParticipantStatEntry`, `DailyActivityEntry`, `LanguageEntry`).
 */
const conversationStatsDataSchema = {
  type: 'object',
  properties: {
    conversationId: { type: 'string' },
    totalMessages: { type: 'number' },
    totalWords: { type: 'number' },
    totalCharacters: { type: 'number' },
    contentTypes: {
      type: 'object',
      properties: {
        text: { type: 'number' },
        image: { type: 'number' },
        audio: { type: 'number' },
        video: { type: 'number' },
        file: { type: 'number' },
        location: { type: 'number' }
      }
    },
    participantStats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          name: { type: 'string', nullable: true },
          username: { type: 'string', nullable: true },
          displayName: { type: 'string', nullable: true },
          avatar: { type: 'string', nullable: true },
          messageCount: { type: 'number' },
          wordCount: { type: 'number' },
          characterCount: { type: 'number' },
          imageCount: { type: 'number' },
          audioCount: { type: 'number' },
          videoCount: { type: 'number' },
          firstMessageAt: { type: 'string', nullable: true },
          lastMessageAt: { type: 'string', nullable: true }
        }
      }
    },
    dailyActivity: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          count: { type: 'number' }
        }
      }
    },
    hourlyDistribution: {
      type: 'object',
      additionalProperties: { type: 'number' },
      description: 'Carte heure → nombre de messages ; les clés sont des données'
    },
    languageDistribution: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          count: { type: 'number' }
        }
      }
    },
    updatedAt: { type: 'string', nullable: true }
  }
} as const;

export function registerStatsRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
) {
  fastify.get<{ Params: { id: string } }>('/conversations/:id/stats', {
    schema: {
      description: 'Get pre-aggregated message statistics for a conversation',
      tags: ['conversations', 'analytics'],
      summary: 'Get conversation message stats',
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
            data: conversationStatsDataSchema
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
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const authContext = authRequest.authContext;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return refuserCommeIntrouvable(reply);
      }

      const hasAccess = await canAccessConversation(prisma, authContext, conversationId, id);
      if (!hasAccess) {
        return refuserCommeIntrouvable(reply);
      }

      // #17076 — le plancher du LECTEUR, la même loi que le fil, la recherche,
      // les fils de réponses et les traductions partagées appliquent déjà.
      //
      // Cette porte n'avait que ses deux gardes d'ACCÈS, et ce qu'elle sert
      // décrit l'historique message par message : `dailyActivity` (une ligne par
      // jour depuis la création) et `participantStats`, NOMMÉ, DATÉ et ATTRIBUÉ.
      // Un inscrit entré par un lien `allowViewHistory: false` y lisait quand la
      // conversation a commencé, qui a écrit combien, et le volume de chaque
      // journée passée.
      //
      // `loadReaderHistoryFloor` PROPAGE ses erreurs, et c'est voulu : « un
      // plancher illisible est un CONTRÔLE D'ACCÈS illisible, et la seule
      // dégradation sûre est de ne rien servir » (`services/historyFloor.ts`). Le
      // `catch` de cette route rend donc 500 — jamais l'agrégat complet, qui
      // ferait de la panne la porte la plus ouverte du dépôt.
      const historyFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authContext),
      });

      // Le masquage PERSONNEL n'est chargé que si un plancher borne déjà ce
      // lecteur, et l'asymétrie est voulue : sans plancher, la réponse est la
      // ligne PARTAGÉE — « une valeur stockée une fois et lue par tout le
      // monde », que le masquage d'un lecteur n'a pas à déplacer, et dont le
      // seau de cache sert tout le monde. Sous plancher, la passe est déjà POUR
      // UN LECTEUR : un compte qui ne correspond pas au fil qu'il peut dérouler
      // serait un compte faux pour lui. Deux lectures de plus sur un chemin qui
      // agrège déjà sa fenêtre entière.
      const hiding = historyFloor
        ? await loadPersonalHistoryHiding(prisma, {
            userId: authContext.type === 'anonymous' ? null : authContext.userId,
            conversationId,
          })
        : NO_PERSONAL_HIDING;

      const stats = await conversationMessageStatsService.getStats(prisma, conversationId, {
        historyFloor,
        hiding,
      });

      const participantStats = (stats.participantStats ?? {}) as Record<string, unknown>;
      const participantIds = Object.keys(participantStats);

      let enrichedParticipants: Array<Record<string, unknown>> = [];
      if (participantIds.length > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, username: true, displayName: true, avatar: true }
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        for (const [userId, stat] of Object.entries(participantStats)) {
          const user = userMap.get(userId);
          enrichedParticipants.push({
            userId,
            ...(stat as Record<string, unknown>),
            username: user?.username ?? null,
            displayName: user?.displayName ?? null,
            avatar: user?.avatar ?? null,
          });
        }
      }

      const dailyActivity = (stats.dailyActivity ?? {}) as Record<string, number>;
      const dailyActivityArray = Object.entries(dailyActivity)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const languageDistribution = (stats.languageDistribution ?? {}) as Record<string, number>;
      const languageDistributionArray = Object.entries(languageDistribution)
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count);

      return sendSuccess(reply, {
        ...stats,
        participantStats: enrichedParticipants,
        dailyActivity: dailyActivityArray,
        languageDistribution: languageDistributionArray,
      });

    } catch (error) {
      sendInternalError(reply, 'Error fetching conversation stats');
    }
  });
}
