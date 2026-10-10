/**
 * « N (M) 🔥 » — ce qu'une conversation a rapporté à son LECTEUR (#8906).
 *
 * Deux surfaces :
 * - `GET /conversations/:id/engagement` — l'instantané du lecteur, zéros
 *   quand il n'a encore rien crédité ici ; réservé aux participants ;
 * - `viewerEngagement` projeté sur chaque ligne de `GET /conversations` et sur
 *   `GET /conversations/:id` — UNE requête groupée par page, jamais par ligne.
 *
 * L'instantané est résolu au jour civil du LECTEUR : points du jour à 0 dès
 * que son dernier geste date d'hier, série à 0 quand il date d'avant-hier.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';
import {
  conversationListResponseSchema,
  conversationResponseSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { refuserCommeIntrouvable, resolveCallerParticipant } from './utils/access-control';
import { civilDayInTimezone } from '../../services/engagement/civilDay';
import {
  CONVERSATION_ENGAGEMENT_SELECT,
  viewerSnapshot,
} from '../../services/engagement/ConversationEngagementRecorder';
import type { ConversationParams } from './types';

const logger = enhancedLogger.child({ module: 'conversations/engagement' });

/** La forme de fil de `ConversationEngagementSnapshot`. */
export const conversationEngagementSnapshotSchema = {
  type: 'object',
  description: "Ce que cette conversation a rapporté au LECTEUR (#8906) — « N (M) 🔥 », résolu à son jour civil.",
  properties: {
    conversationId: { type: 'string' },
    totalPoints: { type: 'integer', description: 'N — points rapportés par cette conversation, depuis toujours' },
    todayPoints: { type: 'integer', description: "M — points rapportés aujourd'hui" },
    streakDays: { type: 'integer', description: 'Jours civils consécutifs avec au moins un geste crédité ici' },
    day: { type: 'string', nullable: true, description: 'Jour civil (YYYY-MM-DD) du dernier geste crédité ; null si jamais' },
  },
  required: ['conversationId', 'totalPoints', 'todayPoints', 'streakDays', 'day'],
} as const;

/**
 * Les contrats partagés de la liste et du détail, élargis de `viewerEngagement`.
 * `fast-json-stringify` retire toute clé non déclarée : sans cet élargissement,
 * le champ serait calculé puis jeté avant le fil. Les accès sont optionnels :
 * plusieurs suites doublent ces contrats par un `{ type: 'object' }` nu, et
 * l'élargissement ne doit pas faire tomber leur chargement.
 */
export const conversationListWithEngagementResponseSchema = {
  ...conversationListResponseSchema,
  properties: {
    ...conversationListResponseSchema.properties,
    data: {
      ...conversationListResponseSchema.properties?.data,
      items: {
        ...conversationListResponseSchema.properties?.data?.items,
        properties: {
          ...conversationListResponseSchema.properties?.data?.items?.properties,
          viewerEngagement: conversationEngagementSnapshotSchema,
        },
      },
    },
  },
} as const;

export const conversationDetailWithEngagementResponseSchema = {
  ...conversationResponseSchema,
  properties: {
    ...conversationResponseSchema.properties,
    data: {
      ...conversationResponseSchema.properties?.data,
      properties: {
        ...conversationResponseSchema.properties?.data?.properties,
        viewerEngagement: conversationEngagementSnapshotSchema,
      },
    },
  },
} as const;

type EngagementReader = Pick<PrismaClient, 'conversationEngagement' | 'user'>;

async function viewerToday(prisma: EngagementReader, userId: string): Promise<Date> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return civilDayInTimezone(new Date(), user?.timezone ?? null);
}

/**
 * Les instantanés du lecteur pour une PAGE de conversations — une lecture
 * groupée, plus celle de son fuseau quand au moins une ligne existe. Une
 * conversation sans ligne est ABSENTE de la carte : le client n'affiche rien.
 */
export async function loadViewerEngagements(
  prisma: EngagementReader,
  userId: string,
  conversationIds: readonly string[],
): Promise<Map<string, ConversationEngagementSnapshot>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await prisma.conversationEngagement.findMany({
    where: { userId, conversationId: { in: [...conversationIds] } },
    take: conversationIds.length,
    select: { conversationId: true, ...CONVERSATION_ENGAGEMENT_SELECT },
  });
  if (rows.length === 0) return new Map();
  const today = await viewerToday(prisma, userId);
  return new Map(rows.map((row) => [row.conversationId, viewerSnapshot(row.conversationId, row, today)] as const));
}

/**
 * La même projection, tolérante : un état d'engagement qui ne se lit pas ne
 * fait pas tomber une liste ou un fil — il n'est simplement pas servi.
 */
export async function loadViewerEngagementsOrEmpty(
  prisma: EngagementReader,
  userId: string | undefined,
  conversationIds: readonly string[],
): Promise<Map<string, ConversationEngagementSnapshot>> {
  if (!userId) return new Map();
  try {
    return await loadViewerEngagements(prisma, userId, conversationIds);
  } catch (error) {
    logger.warn('viewerEngagement not served', { error });
    return new Map();
  }
}

/** `GET /conversations/:id/engagement` — l'instantané du lecteur, participants seulement. */
export function registerConversationEngagementRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: unknown,
): void {
  fastify.get<{ Params: ConversationParams }>('/conversations/:id/engagement', {
    schema: {
      description: "Points que cette conversation a rapportés au lecteur — « N (M) 🔥 » (#8906). Zéros quand il n'a encore rien crédité ici.",
      tags: ['conversations', 'engagement'],
      summary: 'Get the viewer engagement state of a conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Conversation ID or identifier' } },
      },
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean', example: true }, data: conversationEngagementSnapshotSchema },
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [requiredAuth as never],
  }, async (request, reply) => {
    try {
      const { authContext } = request as UnifiedAuthRequest;
      const userId = authContext?.userId;
      if (!authContext?.isAuthenticated || authContext.isAnonymous || !userId) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const conversationId = await resolveConversationId(prisma, request.params.id);
      if (!conversationId) return refuserCommeIntrouvable(reply);
      const participant = await resolveCallerParticipant(prisma, authContext, conversationId);
      if (!participant) return refuserCommeIntrouvable(reply);

      const snapshots = await loadViewerEngagements(prisma, userId, [conversationId]);
      const snapshot = snapshots.get(conversationId) ?? viewerSnapshot(conversationId, null, new Date());
      return sendSuccess(reply, snapshot);
    } catch (error) {
      logger.error('error fetching conversation engagement', { error });
      return sendInternalError(reply, 'Error retrieving conversation engagement');
    }
  });
}
