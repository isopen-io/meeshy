import type { FastifyInstance, FastifyReply } from 'fastify';
import { bloodLocationSettingsQuerySchema } from '@meeshy/shared/types/blood-location';
import { readBloodLocationSettings, readLocationGhost } from '../../services/bloodLocation/bloodLocationSettingsRead';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { bloodLocationGate } from '../bloodLocationGate';
import { errorResponses, relationLimiter } from '../relations/shared';

const envelope = (properties: Record<string, unknown>, required: readonly string[]) =>
  ({
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object', properties, required, additionalProperties: false },
    },
  }) as const;

const ghostResponseSchema = envelope({ ghost: { type: 'boolean' }, ghostAt: { type: 'string', nullable: true } }, ['ghost', 'ghostAt']);

const bloodSettingsResponseSchema = envelope(
  {
    userId: { type: 'string' },
    ghost: { type: 'boolean' },
    ghostFor: { type: 'boolean' },
    proximityRadiusMeters: { type: 'integer' },
  },
  ['userId', 'ghost', 'ghostFor', 'proximityRadiusMeters'],
);

const privateReply = (reply: FastifyReply): FastifyReply => reply.header('Cache-Control', 'private, no-store');

/**
 * LA RELECTURE de mes réglages de position (#19452) — le pendant en lecture de
 * `PUT /me/location/ghost` et `PUT /me/location/blood-settings`, pour que chaque appareil relise
 * l'état du compte au lieu de sa propre mémoire. Pour SOI seulement, jamais mis en cache.
 *
 * - `GET /location/ghost` : HORS drapeau Sang, comme le fantôme global qu'il relit.
 * - `GET /location/blood-settings?userId=` : derrière `bloodLocationGate`, comme le PUT voisin.
 */
export default async function locationSettingsReadMeRoutes(fastify: FastifyInstance): Promise<void> {
  const reads = relationLimiter(fastify, 'rel:loc-settings:r', 120);

  fastify.get('/location/ghost', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'My global location ghost mode, as set by PUT /me/location/ghost.',
      tags: ['me'],
      summary: 'Read my global location ghost mode',
      response: { 200: ghostResponseSchema, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(privateReply(reply), await readLocationGhost(fastify.prisma, request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Location ghost read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get('/location/blood-settings', {
    onRequest: [fastify.authenticate],
    preHandler: [bloodLocationGate, appVersionFloorPreHandler, reads.middleware()],
    schema: {
      description: 'My ghost mode (global and for one person) and my proximity radius for that person.',
      tags: ['me'],
      summary: 'Read my Blood location settings for a person',
      querystring: { type: 'object', properties: { userId: { type: 'string' } } },
      response: { 200: bloodSettingsResponseSchema, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = bloodLocationSettingsQuerySchema.safeParse(request.query);
    const ownerId = request.user!.userId;
    if (!parsed.success) return sendBadRequest(reply, 'Personne illisible');
    const otherId = parsed.data.userId.toLowerCase();
    if (otherId === ownerId.toLowerCase()) return sendBadRequest(reply, 'Réglage refusé');
    try {
      return sendSuccess(privateReply(reply), await readBloodLocationSettings(fastify.prisma, ownerId, otherId));
    } catch (error) {
      logError(fastify.log, 'Blood location settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
