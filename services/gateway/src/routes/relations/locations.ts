import type { FastifyInstance } from 'fastify';
import { SHARED_LOCATION_CIRCLES } from '@meeshy/shared/types/shared-location';
import { sharedLocationRelayDepsOf } from '../../services/sharedLocation/sharedLocationDeps';
import { sharedLocationSnapshotFor, type SharedLocationBbox } from '../../services/sharedLocation/sharedLocationRelay';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from './shared';

/**
 * Une position servie, déclarée CHAMP PAR CHAMP : le sérialiseur retire tout champ non
 * déclaré, et rien de plus riche que la précision du lecteur ne peut partir à côté.
 * `circle` est le cercle d'où vient l'émetteur pour CE lecteur (#17966).
 */
export const sharedLocationItemSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    precision: { type: 'string' },
    radiusMeters: { type: 'number' },
    circle: { type: 'string', enum: [...SHARED_LOCATION_CIRCLES] },
    updatedAt: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

/** `minLongitude,minLatitude,maxLongitude,maxLatitude` ; absent = toute la carte ; illisible = `null`. */
export function parseBbox(raw: unknown): SharedLocationBbox | undefined | null {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = parts as [number, number, number, number];
  const inBounds = Math.abs(minLatitude) <= 90 && Math.abs(maxLatitude) <= 90 && Math.abs(minLongitude) <= 180 && Math.abs(maxLongitude) <= 180;
  if (!inBounds || minLatitude > maxLatitude || minLongitude > maxLongitude) return null;
  return { minLongitude, minLatitude, maxLongitude, maxLatitude };
}

/**
 * Le RATTRAPAGE du partage temporaire de position (#14109, #16980) :
 * `GET /relations/locations?bbox=` rend les partages en cours qui me sont destinés,
 * chacun à la précision que son émetteur m'a donnée, filtrés par l'emprise de la carte
 * sur la position SERVIE. Le direct passe ensuite par `location:share-changed`.
 */
export function registerRelationLocations(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:locations:u', 120);

  fastify.get('/locations', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'Locations my links are sharing with me right now, each at the precision they gave me, within the visible map area.',
      tags: ['relations'],
      summary: 'Shared locations of my links',
      querystring: { type: 'object', properties: { bbox: { type: 'string' } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: sharedLocationItemSchema } } } } },
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const bbox = parseBbox((request.query as { bbox?: unknown } | undefined)?.bbox);
      if (bbox === null) return sendBadRequest(reply, 'Emprise illisible');
      const snapshot = await sharedLocationSnapshotFor(sharedLocationRelayDepsOf({ prisma: fastify.prisma, io: undefined }), request.user!.userId, { bbox });
      return sendSuccess(reply, snapshot);
    } catch (error) {
      logError(fastify.log, 'Shared locations snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
