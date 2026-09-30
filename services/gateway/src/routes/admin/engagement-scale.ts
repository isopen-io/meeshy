/**
 * Le BARÈME d'engagement, réglé par l'administration (#8906).
 *
 * - `GET  /admin/engagement-scale` — le barème effectif (défauts tant que
 *   personne ne l'a réglé), qui l'a réglé et quand ;
 * - `PUT  /admin/engagement-scale` `{ scale }` — valide (`parseEngagementScale`,
 *   fail-closed : un barème à moitié lisible est un 400, jamais un barème à
 *   moitié appliqué), écrit la ligne singleton, invalide le cache du crédit et
 *   rend le document écrit.
 *
 * Réservé à ADMIN et BIGBOSS (`requireAdminRank`) : les points distribués sont
 * une politique de produit, pas un geste de modération. L'écriture laisse sa
 * trace `AdminAuditLog`, avant / après.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { parseEngagementScale } from '@meeshy/shared/types/engagement-scale';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requireAdminRank, withAudit } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { sendBadRequest, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced';
import {
  ENGAGEMENT_SCALE_KEY,
  engagementScaleServiceFor,
} from '../../services/engagement/EngagementScaleService';

const logger = enhancedLogger.child({ module: 'admin/engagement-scale' });

const operationRuleSchema = {
  type: 'object',
  properties: {
    points: { type: 'integer' },
    multiplied: { type: 'boolean' },
    dailyCapPerConversation: { type: 'integer', nullable: true },
  },
} as const;

const engagementScaleSchema = {
  type: 'object',
  properties: {
    operations: {
      type: 'object',
      properties: Object.fromEntries(ENGAGEMENT_AXES.map((axisKey) => [axisKey, operationRuleSchema])),
    },
    multiplier: {
      type: 'object',
      properties: {
        windowDays: { type: 'integer' },
        stepPerExtraFamily: { type: 'number' },
        standingBonus: { type: 'number' },
        achievementsForStanding: { type: 'integer' },
        highBadgeThreshold: { type: 'integer' },
        highBadgesForStanding: { type: 'integer' },
        maxFactor: { type: 'number' },
        levelCaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: { minLevel: { type: 'integer' }, maxFactor: { type: 'number' } },
          },
        },
      },
    },
  },
} as const;

/** La forme de fil d'`EngagementScaleDocument`. */
export const engagementScaleDocumentResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        scale: engagementScaleSchema,
        updatedAt: { type: 'string', nullable: true },
        updatedBy: { type: 'string', nullable: true },
      },
    },
  },
} as const;

const refusals = {
  401: errorResponseSchema,
  403: errorResponseSchema,
  500: errorResponseSchema,
} as const;

export async function engagementScaleAdminRoutes(fastify: FastifyInstance): Promise<void> {
  const scaleService = () => engagementScaleServiceFor(fastify.prisma);

  fastify.get('/engagement-scale', {
    schema: {
      description: "Le barème d'engagement effectif (#8906) — défauts tant qu'il n'a jamais été réglé.",
      tags: ['admin', 'engagement'],
      summary: 'Get the engagement scale',
      response: { 200: engagementScaleDocumentResponseSchema, ...refusals },
    },
    onRequest: [fastify.authenticate, requireAdminRank()],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      scaleService().invalidate();
      return sendSuccess(reply, await scaleService().document());
    } catch (error) {
      logger.error('engagement scale read failed', { error });
      return sendInternalError(reply, 'Error retrieving engagement scale');
    }
  });

  fastify.put<{ Body: { scale?: unknown } }>('/engagement-scale', {
    schema: {
      description: "Règle le barème d'engagement (#8906). Un barème invalide est refusé en entier (400).",
      tags: ['admin', 'engagement'],
      summary: 'Update the engagement scale',
      body: {
        type: 'object',
        required: ['scale'],
        properties: { scale: { type: 'object' } },
      },
      response: { 200: engagementScaleDocumentResponseSchema, 400: errorResponseSchema, ...refusals },
    },
    onRequest: [fastify.authenticate, requireAdminRank()],
  }, async (request, reply) => {
    const scale = parseEngagementScale(request.body?.scale);
    if (!scale) {
      return sendBadRequest(reply, 'Invalid engagement scale', { code: 'INVALID_ENGAGEMENT_SCALE' });
    }
    const adminId = (request as UnifiedAuthRequest).authContext?.userId;
    if (!adminId) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    try {
      const before = await scaleService().document();
      const document = await scaleService().write(scale, adminId);
      await withAudit(request, {
        action: 'UPDATE_ENGAGEMENT_SCALE',
        entity: 'EngagementScaleConfig',
        entityId: ENGAGEMENT_SCALE_KEY,
        userId: adminId,
        changes: { before: before.scale, after: document.scale },
      });
      return sendSuccess(reply, document);
    } catch (error) {
      logger.error('engagement scale write failed', { error });
      return sendInternalError(reply, 'Error updating engagement scale');
    }
  });
}
