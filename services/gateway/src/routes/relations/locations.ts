import type { FastifyInstance } from 'fastify';
import { parseSharedLocationIncludes, SHARED_LOCATION_CIRCLES } from '@meeshy/shared/types/shared-location';
import { readRestVersionClaim, upgradeRequirementFor } from '../../middleware/app-version-floor';
import { bloodLocationDepsOf } from '../../services/bloodLocation/bloodLocationDeps';
import { bloodLocationEnabledFor } from '../../services/bloodLocation/bloodLocationFlag';
import { bloodLocationMapFor } from '../../services/bloodLocation/bloodLocationMap';
import { composeRelativesMap } from '../../services/sharedLocation/relativesMap';
import { sharedLocationRelayDepsOf } from '../../services/sharedLocation/sharedLocationDeps';
import { ownSharedLocationFor, sharedLocationEndedFor, sharedLocationSnapshotFor, type SharedLocationBbox } from '../../services/sharedLocation/sharedLocationRelay';
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

/** Le dernier point d'un Sang (#19202), déclaré champ par champ : ni scellé, ni masque, ni marque de vraisemblance. */
export const sharedLocationBloodItemSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    accuracy: { type: 'number' },
    recordedAt: { type: 'string' },
    circle: { type: 'string', enum: [...SHARED_LOCATION_CIRCLES] },
  },
} as const;

/** Un partage terminé (#19202) : qui, quand, son cercle — aucune position ne peut partir à côté. */
export const sharedLocationEndedItemSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    endedAt: { type: 'string' },
    circle: { type: 'string', enum: [...SHARED_LOCATION_CIRCLES] },
  },
} as const;

/** La réponse de `GET /relations/locations` : `blood` et `ended` n'y figurent que si `include` les demande. */
export const relationLocationsResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        items: { type: 'array', items: sharedLocationItemSchema },
        blood: { type: 'array', items: sharedLocationBloodItemSchema },
        ended: { type: 'array', items: sharedLocationEndedItemSchema },
      },
    },
  },
} as const;

/**
 * MON partage, relu par chacun de mes appareils (#18389) : à qui, à quelle précision, jusqu'à
 * quand. Déclaré champ par champ : aucune position, aucune maille ne peut partir à côté.
 */
export const ownSharedLocationSchema = {
  type: 'object',
  properties: {
    recipients: {
      type: 'array',
      items: {
        type: 'object',
        properties: { userId: { type: 'string' }, precision: { type: 'string' }, expiresAt: { type: 'string' } },
      },
    },
    expiresAt: { type: ['string', 'null'] },
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
 *
 * `include=blood,ended` (#19202, additif) en fait la carte de tous mes proches en UN appel : le
 * dernier point de chaque Sang qui me l'a consenti (derrière le drapeau de la position du Sang et
 * le plancher de version des routes de cercles, jugé comme l'historique — sous le plancher, le
 * champ manque au lieu de refuser toute la carte) et les partages qui me visaient, terminés depuis moins d'un jour.
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
      querystring: { type: 'object', properties: { bbox: { type: 'string' }, include: { type: 'string' } } },
      response: {
        200: relationLocationsResponseSchema,
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const query = request.query as { bbox?: unknown; include?: unknown } | undefined;
      const bbox = parseBbox(query?.bbox);
      if (bbox === null) return sendBadRequest(reply, 'Emprise illisible');
      const readerId = request.user!.userId;
      const relay = sharedLocationRelayDepsOf({ prisma: fastify.prisma, io: undefined });
      const map = await composeRelativesMap(
        {
          snapshot: () => sharedLocationSnapshotFor(relay, readerId, { bbox }),
          blood: () => bloodLocationMapFor(bloodLocationDepsOf({ prisma: fastify.prisma, io: undefined }), readerId),
          ended: () => sharedLocationEndedFor(relay, readerId),
          bloodEnabled: bloodLocationEnabledFor(readerId) && upgradeRequirementFor(readRestVersionClaim(request.headers)) === null,
        },
        { bbox, include: parseSharedLocationIncludes(query?.include) },
      );
      return sendSuccess(reply, map);
    } catch (error) {
      logError(fastify.log, 'Shared locations snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  registerOwnSharedLocation(fastify);
}

/**
 * `GET /relations/locations/mine` : MON partage en cours, que chacun de mes appareils relit à la
 * connexion et à chaque `location:share-own-changed` (#18389). Le partage d'un compte est
 * unique côté passerelle : un appareil s'y recale au lieu de republier une liste périmée.
 * `private, no-store` : la liste ne survit dans aucun cache.
 */
export function registerOwnSharedLocation(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:locations-mine:u', 120);

  fastify.get('/locations/mine', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'My own shared location, as the gateway serves it: who, at which precision and until when — never a position.',
      tags: ['relations'],
      summary: 'My own shared location',
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: ownSharedLocationSchema } },
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const own = await ownSharedLocationFor(sharedLocationRelayDepsOf({ prisma: fastify.prisma, io: undefined }), request.user!.userId);
      reply.header('Cache-Control', 'private, no-store');
      return sendSuccess(reply, own);
    } catch (error) {
      logError(fastify.log, 'Own shared location error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
