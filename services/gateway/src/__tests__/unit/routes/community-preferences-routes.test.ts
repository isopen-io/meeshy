/**
 * Route tests — community-preferences routes
 *
 * Covers all 5 routes via Fastify inject:
 *   GET    /user-preferences/communities/:communityId  - get single (stored vs default)
 *   GET    /user-preferences/communities              - list all (paginated)
 *   PUT    /user-preferences/communities/:communityId  - upsert
 *   DELETE /user-preferences/communities/:communityId  - delete (found / P2025 / 500)
 *   POST   /user-preferences/communities/reorder       - batch reorder
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import communityPreferencesRoutes from '../../../routes/community-preferences';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const COMMUNITY_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTH = { authorization: 'Bearer token' };

const STORED_PREF = {
  id: 'pref-1',
  userId: USER_ID,
  communityId: COMMUNITY_ID,
  isPinned: true,
  isMuted: false,
  isArchived: false,
  isHidden: false,
  notificationLevel: 'all',
  customName: null,
  categoryId: null,
  orderInCategory: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  findUniqueResult?: typeof STORED_PREF | null;
  findManyResult?: typeof STORED_PREF[];
  countResult?: number;
  upsertResult?: typeof STORED_PREF;
  deleteError?: Error | null;
  findManyError?: Error | null;
  memberships?: string[];
};

function makePrisma({
  findUniqueResult = STORED_PREF,
  findManyResult = [STORED_PREF],
  countResult = 1,
  upsertResult = STORED_PREF,
  deleteError = null,
  findManyError = null,
  memberships = [COMMUNITY_ID],
}: PrismaOpts = {}) {
  return {
    userCommunityPreferences: {
      findUnique: jest.fn().mockResolvedValue(findUniqueResult),
      findMany: findManyError
        ? jest.fn().mockRejectedValue(findManyError)
        : jest.fn().mockResolvedValue(findManyResult),
      count: jest.fn().mockResolvedValue(countResult),
      upsert: jest.fn().mockResolvedValue(upsertResult),
      delete: deleteError
        ? jest.fn().mockRejectedValue(deleteError)
        : jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    communityMember: {
      findMany: jest.fn().mockResolvedValue(
        memberships.map((communityId) => ({ communityId })),
      ),
    },
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

type AuthMode = 'registered' | 'anonymous' | 'unauthenticated';

async function buildApp(prismaOpts: PrismaOpts = {}, auth: AuthMode = 'registered'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (auth === 'unauthenticated') {
        await reply.code(401).send({ success: false, error: 'Unauthorized' });
        return;
      }
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: auth === 'registered',
        isAnonymous: auth === 'anonymous',
        userId: USER_ID,
        registeredUser: auth === 'registered' ? { id: USER_ID } : null,
      };
    }
  );
  await app.register(communityPreferencesRoutes);
  await app.ready();
  return app;
}

// ─── GET /user-preferences/communities/:communityId ───────────────────────────

describe('GET /user-preferences/communities/:communityId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with stored preferences (isDefault: false)', async () => {
    const res = await app.inject({ method: 'GET', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(false);
    expect(body.data.communityId).toBe(COMMUNITY_ID);
  });

  it('returns 200 with default preferences when none stored (isDefault: true)', async () => {
    const appDef = await buildApp({ findUniqueResult: null });
    const res = await appDef.inject({ method: 'GET', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isDefault).toBe(true);
    expect(body.data.id).toBeNull();
    expect(body.data.userId).toBe(USER_ID);
    await appDef.close();
  });

  it('returns 401 when user is not registered (anonymous)', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({ method: 'GET', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  it('returns 500 on db error', async () => {
    const prisma = makePrisma();
    (prisma.userCommunityPreferences.findUnique as ReturnType<typeof jest.fn>).mockRejectedValue(new Error('db crash'));
    const appErr = Fastify({ logger: false });
    appErr.decorate('prisma', prisma as unknown);
    appErr.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID } };
    });
    await appErr.register(communityPreferencesRoutes);
    await appErr.ready();
    const res = await appErr.inject({ method: 'GET', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── GET /user-preferences/communities ───────────────────────────────────────

describe('GET /user-preferences/communities', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ findManyResult: [STORED_PREF, STORED_PREF], countResult: 2 }); });
  afterAll(() => app.close());

  it('returns 200 with paginated list', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-preferences/communities', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((p: any) => p.isDefault === false)).toBe(true);
  });

  it('accepts offset and limit query params', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-preferences/communities?offset=0&limit=10', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({ method: 'GET', url: '/user-preferences/communities', headers: AUTH });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ findManyError: new Error('timeout') });
    const res = await appErr.inject({ method: 'GET', url: '/user-preferences/communities', headers: AUTH });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── PUT /user-preferences/communities/:communityId ──────────────────────────

describe('PUT /user-preferences/communities/:communityId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with updated preferences', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${COMMUNITY_ID}`,
      headers: AUTH,
      payload: { isPinned: true, notificationLevel: 'mentions' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(false);
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${COMMUNITY_ID}`,
      headers: AUTH,
      payload: { isPinned: true },
    });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  it('returns 500 on db error', async () => {
    const prisma = makePrisma();
    (prisma.userCommunityPreferences.upsert as ReturnType<typeof jest.fn>).mockRejectedValue(new Error('db crash'));
    const appErr = Fastify({ logger: false });
    appErr.decorate('prisma', prisma as unknown);
    appErr.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID } };
    });
    await appErr.register(communityPreferencesRoutes);
    await appErr.ready();
    const res = await appErr.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${COMMUNITY_ID}`,
      headers: AUTH,
      payload: { isPinned: true },
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── DELETE /user-preferences/communities/:communityId ───────────────────────

describe('DELETE /user-preferences/communities/:communityId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 on successful deletion', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when preferences not found (Prisma P2025)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'P2025' });
    const appNF = await buildApp({ deleteError: err });
    const res = await appNF.inject({ method: 'DELETE', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    await appNF.close();
  });

  it('returns 500 on generic db error', async () => {
    const appErr = await buildApp({ deleteError: new Error('db crash') });
    const res = await appErr.inject({ method: 'DELETE', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({ method: 'DELETE', url: `/user-preferences/communities/${COMMUNITY_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });
});

// ─── POST /user-preferences/communities/reorder ──────────────────────────────

describe('POST /user-preferences/communities/reorder', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 when reorder succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      headers: AUTH,
      payload: { updates: [{ communityId: COMMUNITY_ID, orderInCategory: 0 }, { communityId: 'bbbbbbbbbbbbbbbbbbbbbbbb', orderInCategory: 1 }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      headers: AUTH,
      payload: { updates: [] },
    });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  // Le rejet porte sur `upsert` — la méthode que la route appelle depuis que
  // le réordonnancement persiste vraiment. Stubber `updateMany`, qu'elle
  // n'appelle plus, laissait ce témoin passer sur le chemin NOMINAL en croyant
  // tenir le chemin d'erreur.
  it('returns 500 on db error', async () => {
    const prisma = makePrisma();
    (prisma.userCommunityPreferences.upsert as ReturnType<typeof jest.fn>).mockRejectedValue(new Error('db crash'));
    const appErr = Fastify({ logger: false });
    appErr.decorate('prisma', prisma as unknown);
    appErr.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID } };
    });
    await appErr.register(communityPreferencesRoutes);
    await appErr.ready();
    const res = await appErr.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      headers: AUTH,
      payload: { updates: [{ communityId: COMMUNITY_ID, orderInCategory: 0 }] },
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── Le réordonnancement de communautés persistait-il seulement ? ────────────
//
// `POST /user-preferences/communities/reorder` écrivait par `updateMany`, qui
// ne touche QUE les lignes existantes. Or la ligne `UserCommunityPreferences`
// n'est créée que par le PUT : une communauté jamais épinglée / mise en
// sourdine / renommée n'en a pas. Glisser-déposer une liste fraîche rendait
// donc 200 sans rien persister, et l'ordre revenait au prochain chargement.
//
// Le jumeau conversation (`reorderConversationPreferences`) a été corrigé et
// porte la raison dans son commentaire : passer à l'`upsert` EXIGE de borner
// aux appartenances, « an unscoped batch would let any authenticated caller
// mint preference rows against arbitrary conversation ids. `updateMany` used
// to absorb that for the wrong reason: it matched nothing, for anybody. »
// Cette phrase décrivait aussi, mot pour mot, la route communauté.

describe('POST /user-preferences/communities/reorder — persistance réelle', () => {
  beforeEach(() => jest.clearAllMocks());

  function prismaOf(app: FastifyInstance) {
    return (app as unknown as { prisma: any }).prisma;
  }

  async function reorder(app: FastifyInstance, updates: Array<{ communityId: string; orderInCategory: number }>) {
    return app.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      headers: AUTH,
      payload: { updates },
    });
  }

  it('crée la ligne de préférences quand elle n existe pas encore', async () => {
    const app = await buildApp();
    const res = await reorder(app, [{ communityId: COMMUNITY_ID, orderInCategory: 3 }]);

    expect(res.statusCode).toBe(200);
    expect(prismaOf(app).userCommunityPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_communityId: { userId: USER_ID, communityId: COMMUNITY_ID } },
        create: expect.objectContaining({ userId: USER_ID, communityId: COMMUNITY_ID, orderInCategory: 3 }),
        update: { orderInCategory: 3 },
      }),
    );
    await app.close();
  });

  // Corollaire OBLIGATOIRE de l'upsert : sans ce filtre, n'importe quel appelant
  // authentifié fabriquerait des lignes contre des ids arbitraires.
  it('ignore une communauté dont l appelant n est pas membre', async () => {
    const app = await buildApp({ memberships: [COMMUNITY_ID] });
    const res = await reorder(app, [
      { communityId: COMMUNITY_ID, orderInCategory: 0 },
      { communityId: 'bbbbbbbbbbbbbbbbbbbbbbbb', orderInCategory: 1 },
    ]);

    expect(res.statusCode).toBe(200);
    const calls = prismaOf(app).userCommunityPreferences.upsert.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].where.userId_communityId.communityId).toBe(COMMUNITY_ID);
    await app.close();
  });

  it('n écrit rien quand aucune communauté du lot n est la sienne', async () => {
    const app = await buildApp({ memberships: [] });
    const res = await reorder(app, [{ communityId: COMMUNITY_ID, orderInCategory: 0 }]);

    expect(res.statusCode).toBe(200);
    expect(prismaOf(app).userCommunityPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('déduplique un même id, dernier gagnant', async () => {
    const app = await buildApp();
    await reorder(app, [
      { communityId: COMMUNITY_ID, orderInCategory: 1 },
      { communityId: COMMUNITY_ID, orderInCategory: 7 },
    ]);

    const calls = prismaOf(app).userCommunityPreferences.upsert.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].update).toEqual({ orderInCategory: 7 });
    await app.close();
  });

  it('n ouvre aucune requête sur un lot vide', async () => {
    const app = await buildApp();
    const res = await reorder(app, []);

    expect(res.statusCode).toBe(200);
    expect(prismaOf(app).communityMember.findMany).not.toHaveBeenCalled();
    expect(prismaOf(app).userCommunityPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });
});
