import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendInternalError } from '../../utils/response';
import { postInclude, NOT_DELETED } from '../../services/posts/postIncludes';
import { withMentions } from '../../services/posts/postReferences';
import { wireReaderFromRequest } from '../../services/posts/storyEffectsV3';
import { hoistLocationDeep } from '../../services/location/sharedPlace';
import { resolveDensityGridStepDegrees } from '../../services/location/geoDiscoverability';
import { createSocialDiscoveryRateLimitConfig } from './socialRateLimit';

/**
 * GET /posts/nearby + GET /posts/nearby/density — recherche géospatiale de
 * posts/reels/stories/status découvrables (`Post.geoPoint`/`geoPrecision`,
 * écrits par `PostService.createPost` via `quantizeCoordinate`).
 *
 * Design : docs/superpowers/specs/2026-08-02-post-geolocation-nearby-search-design.md §3
 *
 * INDÉPENDANT de `metadata.location` (badge d'affichage) : ces deux routes ne
 * lisent QUE `geoPoint`/`geoPrecision`, jamais `metadata`. Un post sans
 * découvrabilité activée (`geoPoint: null`) n'apparaît jamais ici, même s'il
 * porte un badge de lieu affiché.
 */

const METERS_PER_KM = 1000;
// Antipode terrestre (~20 015 km) : au-delà, "à proximité" n'a plus de sens —
// borne haute pour éviter un $geoNear sans limite pratique de rayon.
const MAX_RADIUS_KM = 20000;
// #4147 critere 5 -- un cellSizeKm tres fin sur un grand rayon produit un nombre
// COMBINATOIRE de cellules : la reponse degrade le client (parsing, memoire,
// rendu) sans qu'aucun besoin produit ne le demande. La borne est posee sur ce
// qui est SERVI, la ou le cout devient celui du lecteur.
const MAX_DENSITY_CELLS = 2000;

const NearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(MAX_RADIUS_KM),
  // Offset numérique simple (pas le cursor opaque createdAt+id du feed) : un
  // tri par distance n'a pas de frontière naturelle autre que "combien déjà vus".
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const NearbyDensityQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(MAX_RADIUS_KM),
  cellSizeKm: z.coerce.number().positive(),
});

type RawObjectId = string | { $oid: string };

function extractObjectId(value: RawObjectId): string {
  return typeof value === 'string' ? value : value.$oid;
}

/**
 * Filtre `$geoNear.query` (commande Mongo brute, Extended JSON) : PUBLIC
 * uniquement — une recherche par proximité n'étend jamais l'audience au-delà
 * de ce qu'un post PUBLIC autorise déjà, quel que soit le rayon demandé ni la
 * précision de découvrabilité du post. Exclut aussi le contenu éphémère expiré
 * (STORY/STATUS) et les posts soft-supprimés.
 */
function buildPublicDiscoverableRawQuery(now: Date): Record<string, unknown> {
  return {
    visibility: 'PUBLIC',
    deletedAt: { $exists: false },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: { $date: now.toISOString() } } },
    ],
  };
}

/** Même filtre que `buildPublicDiscoverableRawQuery`, forme Prisma standard —
 * réappliqué à la relecture (étape 2) en défense en profondeur : la
 * visibilité d'un post pourrait changer entre l'agrégation et la relecture. */
function buildPublicDiscoverablePrismaWhere(now: Date) {
  return {
    visibility: 'PUBLIC' as const,
    deletedAt: NOT_DELETED,
    OR: [
      { expiresAt: { isSet: false } },
      { expiresAt: { equals: null } },
      { expiresAt: { gt: now } },
    ],
  };
}

function geoNearStage(lat: number, lng: number, radiusKm: number, now: Date) {
  return {
    $geoNear: {
      near: { type: 'Point', coordinates: [lng, lat] },
      distanceField: 'distanceMeters',
      maxDistance: radiusKm * METERS_PER_KM,
      spherical: true,
      query: buildPublicDiscoverableRawQuery(now),
    },
  };
}

/** `round(coord / step) * step` — même grille déterministe que
 * `quantizeCoordinate` (services/location/geoDiscoverability.ts). */
function gridCellExpr(coordIndex: 0 | 1, step: number) {
  return {
    $multiply: [
      { $round: [{ $divide: [{ $arrayElemAt: ['$geoPoint.coordinates', coordIndex] }, step] }, 0] },
      step,
    ],
  };
}

type GeoNearRow = { _id: RawObjectId; distanceMeters: number };
type GeoNearAggregateResult = { cursor?: { firstBatch?: GeoNearRow[] } };

type DensityRow = { cellLat: number; cellLng: number; count: number };
type DensityAggregateResult = { cursor?: { firstBatch?: DensityRow[] } };

export function registerNearbyRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // GET /posts/nearby — pins triés par distance, contenu complet.
  fastify.get('/posts/nearby', {
    preValidation: [requiredAuth],
    config: { rateLimit: createSocialDiscoveryRateLimitConfig() },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = NearbyQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { lat, lng, radiusKm, cursor, limit } = parsed.data;
      const now = new Date();

      const command = {
        aggregate: 'Post',
        pipeline: [
          geoNearStage(lat, lng, radiusKm, now),
          { $skip: cursor },
          { $limit: limit + 1 },
          { $project: { _id: 1, distanceMeters: 1 } },
        ],
        cursor: {},
      };

      const raw = (await prisma.$runCommandRaw(
        command as unknown as Prisma.InputJsonObject
      )) as unknown as GeoNearAggregateResult;
      const rows = raw.cursor?.firstBatch ?? [];
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const orderedIds = pageRows.map((row) => extractObjectId(row._id));
      const distanceById = new Map(pageRows.map((row) => [extractObjectId(row._id), row.distanceMeters]));
      const nextCursor = hasMore ? String(cursor + limit) : null;

      if (orderedIds.length === 0) {
        return sendSuccess(reply, [], { pagination: { limit, hasMore: false, nextCursor: null } });
      }

      // Relecture Prisma standard, même enrichissement que le feed
      // (postInclude + hoistLocationDeep — voir PostFeedService), réordonnée
      // selon la distance : `id: { in }` ne garantit AUCUN ordre sur MongoDB.
      const posts = await prisma.post.findMany({
        where: {
          id: { in: orderedIds },
          ...buildPublicDiscoverablePrismaWhere(now),
        },
        include: postInclude,
      });
      const postsById = new Map(posts.map((post) => [post.id, post]));

      const data = orderedIds
        .map((id) => postsById.get(id))
        .filter((post): post is NonNullable<typeof post> => post !== undefined)
        .map((post) => ({
          ...withMentions(hoistLocationDeep(post), wireReaderFromRequest(request as UnifiedAuthRequest)),
          distanceMeters: distanceById.get(post.id) ?? null,
        }));

      return sendSuccess(reply, data, { pagination: { limit, hasMore, nextCursor } });
    } catch (error) {
      fastify.log.error(`[GET /posts/nearby] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/nearby/density — carte de densité (comptage par cellule de
  // grille), volontairement plus léger : jamais de contenu complet, aucune
  // relecture Prisma.
  fastify.get('/posts/nearby/density', {
    preValidation: [requiredAuth],
    config: { rateLimit: createSocialDiscoveryRateLimitConfig() },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = NearbyDensityQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { lat, lng, radiusKm, cellSizeKm } = parsed.data;
      const step = resolveDensityGridStepDegrees(cellSizeKm);
      if (step === null) {
        return sendBadRequest(reply, 'Invalid cellSizeKm', { code: 'VALIDATION_ERROR' });
      }
      const now = new Date();

      const command = {
        aggregate: 'Post',
        pipeline: [
          geoNearStage(lat, lng, radiusKm, now),
          {
            $group: {
              _id: {
                cellLat: gridCellExpr(1, step),
                cellLng: gridCellExpr(0, step),
              },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, cellLat: '$_id.cellLat', cellLng: '$_id.cellLng', count: 1 } },
        ],
        cursor: {},
      };

      const raw = (await prisma.$runCommandRaw(
        command as unknown as Prisma.InputJsonObject
      )) as unknown as DensityAggregateResult;
      const rows = raw.cursor?.firstBatch ?? [];
      const data = rows.slice(0, MAX_DENSITY_CELLS).map((row) => ({ cellLat: row.cellLat, cellLng: row.cellLng, count: row.count }));

      return sendSuccess(reply, data);
    } catch (error) {
      fastify.log.error(`[GET /posts/nearby/density] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
