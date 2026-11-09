import type { FastifyInstance } from 'fastify';
import { bloodLocationPayloadSchema, bloodLocationSettingsPayloadSchema } from '@meeshy/shared/types/blood-location';
import {
  eraseBloodLocationHistory,
  listBloodLocationConsultations,
  recordBloodLocation,
  updateBloodLocationSettings,
} from '../../services/bloodLocation/bloodLocationService';
import { bloodLocationDepsOf } from '../../services/bloodLocation/bloodLocationDeps';
import { bloodLocationEnabledFor } from '../../services/bloodLocation/bloodLocationFlag';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { bloodLocationGate } from '../bloodLocationGate';
import { errorResponses, relationLimiter } from '../relations/shared';

/**
 * La position du Sang côté COMPTE (#13937) : enregistrer un point, effacer son historique, lire son
 * journal de consultations, régler fantôme et rayon — et `GET /me/features`, qui dit au client si la
 * fonction lui est ouverte (drapeau serveur ET liste blanche). Hors drapeau, tout sauf `features`
 * répond 404 comme une route inconnue.
 *
 * Le point arrive par REST et non par socket : les changements significatifs d'iOS réveillent l'app
 * quelques secondes, sans socket ouverte (`location:live-*` suppose une conversation connectée).
 */
export default async function bloodLocationMeRoutes(fastify: FastifyInstance): Promise<void> {
  const writes = relationLimiter(fastify, 'rel:blood-loc:w', 120);
  const reads = relationLimiter(fastify, 'rel:blood-loc:r', 60);
  const depsOf = () => bloodLocationDepsOf({ prisma: fastify.prisma, io: fastify.socketIOHandler?.getManager?.()?.getIO() as never, report: (error) => logError(fastify.log, 'Blood location side effect:', error) });
  const sink = { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', additionalProperties: true } } } as const;

  fastify.get('/features', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: { description: 'Which gated features are open to the caller.', tags: ['me'], summary: 'Server feature flags', response: { 200: sink, ...errorResponses }, security: [{ bearerAuth: [] }] },
  }, async (request, reply) => sendSuccess(reply, { bloodLocation: bloodLocationEnabledFor(request.user!.userId) }));

  fastify.post('/location/blood', {
    onRequest: [fastify.authenticate],
    preHandler: [bloodLocationGate, appVersionFloorPreHandler, writes.middleware()],
    schema: { description: 'Record a point of my Blood location history (sealed, 30 days).', tags: ['me'], summary: 'Record a Blood location point', response: { 200: sink, ...errorResponses }, security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const parsed = bloodLocationPayloadSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Position illisible');
    try {
      return sendSuccess(reply, await recordBloodLocation(depsOf(), request.user!.userId, parsed.data));
    } catch (error) {
      logError(fastify.log, 'Blood location record error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.delete('/location/history', {
    onRequest: [fastify.authenticate],
    preHandler: [bloodLocationGate, appVersionFloorPreHandler, writes.middleware()],
    schema: { description: 'Erase my whole Blood location history.', tags: ['me'], summary: 'Erase my location history', response: { 200: sink, ...errorResponses }, security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await eraseBloodLocationHistory(depsOf(), request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Blood location erase error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get('/location/consultations', {
    onRequest: [fastify.authenticate],
    preHandler: [bloodLocationGate, appVersionFloorPreHandler, reads.middleware()],
    schema: { description: 'Who read my Blood location history (visible to me only).', tags: ['me'], summary: 'My location consultations', response: { 200: sink, ...errorResponses }, security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await listBloodLocationConsultations(depsOf(), request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Blood location journal error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put('/location/blood-settings', {
    onRequest: [fastify.authenticate],
    preHandler: [bloodLocationGate, appVersionFloorPreHandler, writes.middleware()],
    schema: { description: 'Ghost mode (global or per person) and proximity radius (per person).', tags: ['me'], summary: 'Blood location settings', response: { 200: sink, ...errorResponses }, security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const parsed = bloodLocationSettingsPayloadSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const result = await updateBloodLocationSettings(depsOf(), request.user!.userId, { ...parsed.data, ...(parsed.data.userId ? { userId: parsed.data.userId.toLowerCase() } : {}) });
      return result.ok ? sendSuccess(reply, result) : sendBadRequest(reply, 'Réglage refusé');
    } catch (error) {
      logError(fastify.log, 'Blood location settings error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
