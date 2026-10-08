/**
 * `GET /me/security-events` — le membre lit SES événements de sécurité
 * (audit L2-4, #9613) : une fermeture par « l'équipe Meeshy », une connexion
 * par lien magique, une réinitialisation… Sans cette porte, « toujours
 * informé » ne valait que pour l'appareil coupé et l'e-mail.
 *
 * Mêmes colonnes que l'export RGPD (`export-security.ts`) : jamais `metadata`
 * (forme libre, écrite par chaque producteur pour son propre usage) ni
 * `deviceFingerprint` ; jamais la trace d'un TIERS (`withoutThirdPartyTrace`).
 */
import type { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { withoutThirdPartyTrace } from '../../services/auth/security-event-view';
import { validatePagination } from '../../utils/pagination';
import { sendError, sendInternalError, sendPaginatedSuccess } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { SECURITY_EVENT_EXPORT_SELECT, securityEventExportItemSchema } from './export-security';

const logger = enhancedLogger.child({ module: 'MeSecurityEvents' });

export async function securityEventsRoutes(fastify: FastifyInstance) {
  fastify.get('/security-events', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'The security events of the signed-in account (closures by the Meeshy team, sign-ins, resets)',
      tags: ['me', 'security'],
      querystring: {
        type: 'object',
        properties: { offset: { type: 'string' }, limit: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: securityEventExportItemSchema },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                offset: { type: 'integer' },
                limit: { type: 'integer' },
                hasMore: { type: 'boolean' },
              },
            },
          },
        },
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const authContext = (request as unknown as UnifiedAuthRequest).authContext;
    if (!authContext?.isAuthenticated || !authContext.registeredUser) {
      return sendError(reply, 401, 'Authentication required', { code: 'UNAUTHORIZED' });
    }
    try {
      const userId = authContext.registeredUser.id;
      const query = request.query as { offset?: string; limit?: string };
      const { offset, limit } = validatePagination(query.offset ?? '0', query.limit, { defaultLimit: 20, maxLimit: 100 });
      const where = { userId };
      const [rows, total] = await Promise.all([
        fastify.prisma.securityEvent.findMany({
          where,
          select: SECURITY_EVENT_EXPORT_SELECT,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        fastify.prisma.securityEvent.count({ where }),
      ]);
      return sendPaginatedSuccess(reply, rows.map(withoutThirdPartyTrace), {
        total,
        offset,
        limit,
        hasMore: offset + rows.length < total,
      });
    } catch (error) {
      logger.error('security events read failed', error);
      return sendInternalError(reply, 'Failed to read security events');
    }
  });
}
