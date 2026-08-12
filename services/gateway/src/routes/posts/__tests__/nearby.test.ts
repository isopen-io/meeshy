/**
 * GET /posts/nearby + GET /posts/nearby/density — recherche géospatiale.
 *
 * Design : docs/superpowers/specs/2026-08-02-post-geolocation-nearby-search-design.md §3
 *
 * Couvre :
 *  - rejet lat/lng/radius hors bornes (jamais de $runCommandRaw sur une entrée invalide)
 *  - filtrage visibility: PUBLIC uniquement, même avec un rayon énorme
 *  - filtrage expiresAt (contenu éphémère expiré exclu)
 *  - ordre par distance préservé après la relecture Prisma (le $in ne garantit rien)
 *  - forme de pagination (racine, pas sous meta)
 *  - forme du regroupement density ({cellLat, cellLng, count})
 *  - cellSizeKm calé sur un des tiers de grille
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerNearbyRoutes } from '../nearby';

function auth(userId = 'user-abc') {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', registeredUser: { id: userId, username: 'tester' },
      userId, hasFullAccess: true,
    };
  };
}

async function buildApp(prisma: unknown, userId = 'user-abc') {
  const app = Fastify();
  registerNearbyRoutes(app, prisma as import('@meeshy/shared/prisma/client').PrismaClient, auth(userId));
  await app.ready();
  return app;
}

const oid = (hex: string) => ({ $oid: hex });

const PARIS = { lat: 48.8566, lng: 2.3522 };

describe('GET /posts/nearby', () => {
  it('test_nearby_rejectsOutOfBoundsLat_returns400', async () => {
    const runCommandRaw = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      method: 'GET', url: `/posts/nearby?lat=999&lng=${PARIS.lng}&radiusKm=5`,
    });
    expect(res.statusCode).toBe(400);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  it('test_nearby_rejectsOutOfBoundsLng_returns400', async () => {
    const runCommandRaw = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=-200&radiusKm=5`,
    });
    expect(res.statusCode).toBe(400);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  it('test_nearby_rejectsNonPositiveRadius_returns400', async () => {
    const runCommandRaw = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=0`,
    });
    expect(res.statusCode).toBe(400);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  it('test_nearby_rejectsRadiusAboveTheBound_returns400', async () => {
    const runCommandRaw = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=999999`,
    });
    expect(res.statusCode).toBe(400);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  it('test_nearby_unauthenticated_returns401', async () => {
    const app = Fastify();
    registerNearbyRoutes(app, { $runCommandRaw: jest.fn() } as unknown as import('@meeshy/shared/prisma/client').PrismaClient,
      async () => {});
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5` });
    expect(res.statusCode).toBe(401);
  });

  /**
   * Une recherche par proximité n'étend JAMAIS l'audience au-delà de ce qu'un
   * post PUBLIC autorise déjà — quel que soit le rayon demandé. On vérifie
   * ici la requête ENVOYÉE à Mongo (pas seulement la réponse) : c'est ce
   * filtre qui empêche un post COMMUNITY/PRIVATE geolocalisé d'apparaître.
   */
  it('test_nearby_queriesPublicVisibilityOnly_evenWithHugeRadius', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({ cursor: { firstBatch: [] } });
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
    await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany } })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=1000`,
    });

    expect(runCommandRaw).toHaveBeenCalledTimes(1);
    const cmd = runCommandRaw.mock.calls[0][0] as { pipeline: Array<Record<string, unknown>> };
    const geoNear = cmd.pipeline[0].$geoNear as { query: { visibility: unknown } };
    expect(geoNear.query.visibility).toBe('PUBLIC');
  });

  it('test_nearby_excludesExpiredEphemeralContent', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({ cursor: { firstBatch: [] } });
    await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany: jest.fn() } })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5`,
    });

    const cmd = runCommandRaw.mock.calls[0][0] as { pipeline: Array<Record<string, unknown>> };
    const geoNear = cmd.pipeline[0].$geoNear as { query: Record<string, unknown> };
    const serialized = JSON.stringify(geoNear.query);
    expect(serialized).toContain('expiresAt');
    expect(serialized).toContain('$gt');
  });

  /**
   * `prisma.post.findMany({ where: { id: { in } } })` ne garantit AUCUN ordre
   * sur MongoDB — le tri par distance vient exclusivement du $geoNear de
   * l'étape 1. Un post plus loin renvoyé en premier par le findMany doit
   * quand même ressortir en second dans la réponse.
   */
  it('test_nearby_preservesDistanceOrderAfterPrismaRefetch', async () => {
    const near = oid('aaaaaaaaaaaaaaaaaaaaaaaa');
    const far = oid('bbbbbbbbbbbbbbbbbbbbbbbb');
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({
      cursor: {
        firstBatch: [
          { _id: near, distanceMeters: 50 },
          { _id: far, distanceMeters: 4000 },
        ],
      },
    });
    // Prisma renvoie l'ordre INVERSE de la distance — la route doit corriger.
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', content: 'far post', type: 'POST' },
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', content: 'near post', type: 'POST' },
    ]);
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany } })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5`,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{ id: string; distanceMeters: number }>;
    expect(data.map((p) => p.id)).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb']);
    expect(data[0].distanceMeters).toBe(50);
    expect(data[1].distanceMeters).toBe(4000);
  });

  it('test_nearby_returnsRootLevelPaginationShape', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      _id: oid(i.toString().padStart(24, '0')),
      distanceMeters: i * 10,
    }));
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({ cursor: { firstBatch: rows } });
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockImplementation(async (args: unknown) => {
      const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
      return ids.map((id) => ({ id, content: 'x', type: 'POST' }));
    });
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany } })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5&limit=20`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // `sendSuccess` place la pagination À LA RACINE, pas sous `meta`.
    expect(body.pagination).toBeDefined();
    expect(body.pagination.limit).toBe(20);
    expect(body.pagination.hasMore).toBe(true);
    expect(typeof body.pagination.nextCursor).toBe('string');
    expect(body.data).toHaveLength(20);
  });

  it('test_nearby_noResults_returnsEmptyWithoutQueryingPosts', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({ cursor: { firstBatch: [] } });
    const findMany = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany } })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination.hasMore).toBe(false);
    expect(res.json().pagination.nextCursor).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  /**
   * Défense en profondeur : entre l'agrégation $geoNear (étape 1) et la
   * relecture Prisma (étape 2), la visibilité d'un post pourrait changer.
   * La relecture doit réappliquer le MÊME filtre PUBLIC/non-supprimé/non-expiré,
   * pas se fier aveuglément aux ids déjà filtrés à l'étape 1.
   */
  it('test_nearby_reappliesPublicVisibilityFilterOnPrismaRefetch', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({
      cursor: { firstBatch: [{ _id: oid('aaaaaaaaaaaaaaaaaaaaaaaa'), distanceMeters: 10 }] },
    });
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
    await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany } })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5`,
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    const where = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.visibility).toBe('PUBLIC');
    expect(where.deletedAt).toBeDefined();
    expect(JSON.stringify(where.OR ?? where.AND)).toContain('expiresAt');
  });

  it('test_nearby_cursorRoundTrips_toNextPageSkip', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({ cursor: { firstBatch: [] } });
    await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany: jest.fn() } })).inject({
      method: 'GET', url: `/posts/nearby?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5&cursor=20&limit=10`,
    });
    const cmd = runCommandRaw.mock.calls[0][0] as { pipeline: Array<Record<string, unknown>> };
    const skipStage = cmd.pipeline.find((stage) => '$skip' in stage) as { $skip: number } | undefined;
    expect(skipStage?.$skip).toBe(20);
  });
});

describe('GET /posts/nearby/density', () => {
  it('test_nearbyDensity_rejectsOutOfBoundsParams_returns400', async () => {
    const runCommandRaw = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      method: 'GET', url: `/posts/nearby/density?lat=999&lng=${PARIS.lng}&radiusKm=5&cellSizeKm=1`,
    });
    expect(res.statusCode).toBe(400);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  it('test_nearbyDensity_rejectsNonPositiveCellSize_returns400', async () => {
    const runCommandRaw = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      method: 'GET', url: `/posts/nearby/density?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5&cellSizeKm=0`,
    });
    expect(res.statusCode).toBe(400);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  /**
   * Volontairement plus léger que /nearby : jamais de contenu complet, pas de
   * second aller-retour Prisma.
   */
  it('test_nearbyDensity_returnsGroupedCellShape_withoutFetchingFullPosts', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({
      cursor: {
        firstBatch: [
          { cellLat: 48.86, cellLng: 2.35, count: 12 },
          { cellLat: 48.87, cellLng: 2.36, count: 3 },
        ],
      },
    });
    const findMany = jest.fn();
    const res = await (await buildApp({ $runCommandRaw: runCommandRaw, post: { findMany } })).inject({
      method: 'GET', url: `/posts/nearby/density?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5&cellSizeKm=1`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      { cellLat: 48.86, cellLng: 2.35, count: 12 },
      { cellLat: 48.87, cellLng: 2.36, count: 3 },
    ]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('test_nearbyDensity_queriesPublicVisibilityOnly_andExcludesExpired', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({ cursor: { firstBatch: [] } });
    await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      method: 'GET', url: `/posts/nearby/density?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5&cellSizeKm=1`,
    });

    const cmd = runCommandRaw.mock.calls[0][0] as { pipeline: Array<Record<string, unknown>> };
    const geoNear = cmd.pipeline[0].$geoNear as { query: Record<string, unknown> };
    expect(geoNear.query.visibility).toBe('PUBLIC');
    expect(JSON.stringify(geoNear.query)).toContain('expiresAt');
  });

  it('test_nearbyDensity_snapsCellSizeKmToNearestGridTier', async () => {
    const runCommandRaw = jest.fn<(cmd: unknown) => Promise<unknown>>().mockResolvedValue({ cursor: { firstBatch: [] } });
    await (await buildApp({ $runCommandRaw: runCommandRaw })).inject({
      // 5km demandé → tier CITY (0.1°), pas un pas arbitraire de 5km.
      method: 'GET', url: `/posts/nearby/density?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=50&cellSizeKm=5`,
    });

    const cmd = runCommandRaw.mock.calls[0][0] as { pipeline: Array<Record<string, unknown>> };
    const group = cmd.pipeline[1].$group as { _id: { cellLat: { $multiply: unknown[] } } };
    const stepUsed = group._id.cellLat.$multiply[1];
    expect(stepUsed).toBe(0.1);
  });

  it('test_nearbyDensity_unauthenticated_returns401', async () => {
    const app = Fastify();
    registerNearbyRoutes(app, { $runCommandRaw: jest.fn() } as unknown as import('@meeshy/shared/prisma/client').PrismaClient,
      async () => {});
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: `/posts/nearby/density?lat=${PARIS.lat}&lng=${PARIS.lng}&radiusKm=5&cellSizeKm=1`,
    });
    expect(res.statusCode).toBe(401);
  });
});
