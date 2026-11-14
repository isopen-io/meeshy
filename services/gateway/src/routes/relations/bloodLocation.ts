import type { FastifyInstance } from 'fastify';
import { readBloodLocationHistory } from '../../services/bloodLocation/bloodLocationService';
import { bloodLocationDepsOf } from '../../services/bloodLocation/bloodLocationDeps';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendForbidden, sendInternalError, sendSuccess } from '../../utils/response';
import { bloodLocationGate } from '../bloodLocationGate';
import { errorResponses, relationLimiter, userIdParams } from './shared';

const itemSchema = {
  type: 'object',
  properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, accuracy: { type: 'number' }, recordedAt: { type: 'string' } },
} as const;

/**
 * `GET /relations/:userId/location/history` (#13937) : l'historique de position de l'ÉMETTEUR, lisible
 * d'un Sang qui m'a consenti « historique » au rituel (ou de moi-même). Déclaré champ par champ ;
 * `limit` et `since` bornent la fenêtre. Hors drapeau : 404 comme une route inconnue.
 */
export function registerRelationBloodLocation(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:blood-history:u', 60);

  fastify.get('/:userId/location/history', {
    onRequest: [fastify.authenticate],
    preHandler: [bloodLocationGate, appVersionFloorPreHandler, reads.middleware()],
    schema: {
      description: 'The 30-day location history a Blood shared with me.',
      tags: ['relations'],
      summary: 'Blood location history',
      params: userIdParams,
      querystring: { type: 'object', properties: { since: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 500 } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: itemSchema } } } } },
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const query = request.query as { since?: string; limit?: number };
    if (query.since !== undefined && !Number.isFinite(Date.parse(query.since))) return sendBadRequest(reply, 'Date illisible');
    try {
      const deps = bloodLocationDepsOf({ prisma: fastify.prisma, io: undefined });
      const verdict = await readBloodLocationHistory(deps, request.user!.userId, userId.toLowerCase(), query);
      if (verdict.kind === 'forbidden') return sendForbidden(reply, 'Accès refusé', { code: verdict.code });
      return sendSuccess(reply, { items: verdict.items });
    } catch (error) {
      logError(fastify.log, 'Blood location history error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
