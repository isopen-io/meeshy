/**
 * Les compteurs de contenu d'une fiche (#19368) : lus pour le LECTEUR inscrit,
 * avec le cache de l'audience du fil — jamais pour l'identifiant d'un invité
 * de lien partagé (un `Participant.id`, pas un `User.id`), qui ne lit aucun
 * profil (#10205).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logWarn: jest.fn() }));

const SHARED_CACHE = { marker: 'shared-cache' };
jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: () => SHARED_CACHE }));

const countCalls: unknown[][] = [];
jest.mock('../../../../services/posts/authorContentCounts', () => {
  const actual = jest.requireActual('../../../../services/posts/authorContentCounts') as Record<string, unknown>;
  return {
    ...actual,
    countAuthorContent: jest.fn(async (...args: unknown[]) => {
      countCalls.push(args);
      return { postsCount: 0, reelsCount: 0, storiesCount: 0, statusesCount: 0 };
    }),
  };
});

import { getUserStats } from '../../../../routes/users/preferences';

const VIEWER = '507f1f77bcf86cd799439011';
const TARGET = '507f1f77bcf86cd799439022';
const PARTICIPANT = '507f1f77bcf86cd799439033';

type World = { blockedByTarget?: string[]; targetState?: Record<string, unknown> };
let world: World = {};

const prisma = () => ({
  userPreferences: { findMany: jest.fn<any>(async () => []) },
  userPreference: { findMany: jest.fn<any>(async () => []) },
  user: {
    findFirst: jest.fn<any>(async ({ where }: any) => {
      if (where?.blockedUserIds) return where.id === TARGET && (world.blockedByTarget ?? []).includes(where.blockedUserIds.has) ? { id: TARGET } : null;
      return { id: TARGET, createdAt: new Date('2024-01-01') };
    }),
    findUnique: jest.fn<any>(async () => ({ createdAt: new Date('2020-01-01'), isActive: true, deletedAt: null, deactivatedAt: null, ...world.targetState })),
    findMany: jest.fn<any>().mockResolvedValue([]),
    count: jest.fn<any>().mockResolvedValue(0),
  },
  message: { count: jest.fn<any>().mockResolvedValue(0), groupBy: jest.fn<any>().mockResolvedValue([]) },
  participant: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
  friendRequest: { count: jest.fn<any>().mockResolvedValue(0) },
  userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  post: { count: jest.fn<any>().mockResolvedValue(0) },
});

async function app(authContext: Record<string, unknown>) {
  const instance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  instance.decorate('prisma', prisma() as never);
  instance.decorate('authenticate', async (req: FastifyRequest) => { (req as any).authContext = authContext; });
  await getUserStats(instance);
  await instance.ready();
  return instance;
}

beforeEach(() => { countCalls.splice(0); world = {}; });

describe('GET /users/:userId/stats — le lecteur des compteurs', () => {
  it('un invité de lien partagé (identifiant de Participant) ne lit aucun profil : 403 ACCOUNT_REQUIRED, rien n\'est compté', async () => {
    const instance = await app({ isAuthenticated: true, isAnonymous: true, type: 'anonymous', userId: PARTICIPANT, registeredUser: null });
    const res = await instance.inject({ method: 'GET', url: `/users/${TARGET}/stats` });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ACCOUNT_REQUIRED');
    expect(countCalls).toEqual([]);
    await instance.close();
  });

  it('un lecteur inscrit compte avec SON id et le cache partagé du fil', async () => {
    const instance = await app({ isAuthenticated: true, type: 'user', userId: VIEWER, registeredUser: { id: VIEWER, role: 'USER' } });
    const res = await instance.inject({ method: 'GET', url: `/users/${TARGET}/stats` });
    expect(res.statusCode).toBe(200);
    expect(countCalls).toHaveLength(1);
    const [, authorId, reader, , cache] = countCalls[0] as [unknown, string, { kind: string; viewerId?: string }, unknown, unknown];
    expect(authorId).toBe(TARGET);
    expect(reader).toEqual({ kind: 'viewer', viewerId: VIEWER });
    expect(cache).toBe(SHARED_CACHE);
    await instance.close();
  });
});

describe('GET /users/:userId/stats — la même porte que la fiche', () => {
  const asViewer = { isAuthenticated: true, type: 'user', userId: VIEWER, registeredUser: { id: VIEWER, role: 'USER' } };

  it('la charge d\'un autre lecteur dépend de la relation : no-cache et ETag, jamais un max-age qui survivrait à un blocage ; un If-None-Match juste rend 304', async () => {
    const instance = await app(asViewer);
    const res = await instance.inject({ method: 'GET', url: `/users/${TARGET}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.headers['cache-control']).not.toContain('max-age');
    expect(res.headers.etag).toBeTruthy();
    const again = await instance.inject({ method: 'GET', url: `/users/${TARGET}/stats`, headers: { 'if-none-match': String(res.headers.etag) } });
    expect(again.statusCode).toBe(304);
    await instance.close();
  });

  it('une cible qui a BLOQUÉ le lecteur rend le 404 de la fiche, sans rien compter ni servir', async () => {
    world.blockedByTarget = [VIEWER];
    const instance = await app(asViewer);
    const res = await instance.inject({ method: 'GET', url: `/users/${TARGET}/stats` });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('languages');
    expect(res.body).not.toContain('memberDays');
    expect(countCalls).toEqual([]);
    await instance.close();
  });

  it('un compte DÉSACTIVÉ ne sert plus ses chiffres à un autre : 404 ; à lui-même, si', async () => {
    world.targetState = { deactivatedAt: new Date('2026-11-01') };
    const other = await app(asViewer);
    expect((await other.inject({ method: 'GET', url: `/users/${TARGET}/stats` })).statusCode).toBe(404);
    await other.close();
    const self = await app({ isAuthenticated: true, type: 'user', userId: TARGET, registeredUser: { id: TARGET, role: 'USER' } });
    expect((await self.inject({ method: 'GET', url: `/users/${TARGET}/stats` })).statusCode).toBe(200);
    await self.close();
  });
});
