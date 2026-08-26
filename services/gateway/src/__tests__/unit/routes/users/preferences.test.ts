/**
 * Unit tests for user preferences routes (preferences.ts)
 * Tests GET /users/search and GET /users/:userId/stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// Porte de présence — même contrat que la production (`resolveForTargets`
// rend UNE entrée par id), servi par la VRAIE loi partagée sur un ensemble
// d'amis que le témoin choisit. Sans amis par défaut : un viewer ordinaire ne
// voit que lui-même, un viewer absent ne voit personne.
const mockResolveForTargets = jest.fn<any>(async (viewer: PresenceViewer, ids: readonly string[]) =>
  lawFaithfulResolver()(viewer, ids));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer } from '../../../../services/PresenceVisibilityService';
import { searchUsers, getUserStats } from '../../../../routes/users/preferences';

const PRESENCE_HIDDEN = { showOnline: false, showLastSeenTimestamp: false } as const;

const lawFaithfulVisibility = (viewer: PresenceViewer, id: string, friendsOfViewer: ReadonlySet<string>) =>
  viewer
    ? resolvePresenceVisibility({
        isSelf: viewer.userId === id,
        viewerRole: viewer.role,
        areConnected: friendsOfViewer.has(id),
        targetShowOnlineStatus: true,
        targetShowLastSeen: true,
        targetIsDeactivated: false,
        isBlockedEitherWay: false,
      })
    : PRESENCE_HIDDEN;

function lawFaithfulResolver(friendsOfViewer: ReadonlySet<string> = new Set()) {
  return async (viewer: PresenceViewer, ids: readonly string[]) =>
    new Map(ids.map((id) => [id, lawFaithfulVisibility(viewer, id, friendsOfViewer)]));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID  = '507f1f77bcf86cd799439022';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany:  jest.fn<any>().mockResolvedValue([]),
      count:     jest.fn<any>().mockResolvedValue(0),
    },
    message: {
      count:   jest.fn<any>().mockResolvedValue(0),
      groupBy: jest.fn<any>().mockResolvedValue([]),
    },
    participant: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    friendRequest: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    post: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ n: 0 }),
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await searchUsers(app);
  await getUserStats(app);
  await app.ready();
  return { app, prisma };
}

// ─── GET /users/search ─────────────────────────────────────────────────────────

describe('GET /users/search — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=alice' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /users/search — short query', () => {
  it('returns 400 when q is shorter than 2 chars (schema validation)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=a' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 200 with empty results when q is missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/search' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 with empty results when q is whitespace-only', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=%20%20' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /users/search — with results', () => {
  it('returns 200 with matching users', async () => {
    const prisma = makePrisma();
    const mockUser = { id: TARGET_USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith', email: 'alice@test.com', isOnline: true, lastActiveAt: null, systemLanguage: 'en' };
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([mockUser]);
    prisma.user.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('passes offset and limit to the DB query', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/users/search?q=test&offset=10&limit=5' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
    await app.close();
  });
});

describe('GET /users/search — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=test' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/:userId/stats ──────────────────────────────────────────────────

describe('GET /users/:userId/stats — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /users/:userId/stats — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /users/:userId/stats — success by MongoId', () => {
  it('returns 200 with stats when user is found by ID', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({
      id: TARGET_USER_ID,
      createdAt: new Date('2024-01-01'),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/:userId/stats — success by username', () => {
  it('returns 200 when user is found by username string', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({
      id: TARGET_USER_ID,
      createdAt: new Date('2024-01-01'),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/alice/stats' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /users/:userId/stats — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/search — l'ORDRE obéit à la loi de la présence ────────────────
// La page était lue `orderBy: [{ isOnline: 'desc' }, …]` pour TOUT viewer, puis
// la porte masquait `isOnline` : un inconnu en ligne arrivait en tête, masqué
// `false`, et sa POSITION disait ce que le champ taisait. Seul un viewer que
// la loi sert FULL (ADMIN/BIGBOSS) peut classer par la présence brute ; les
// autres lisent une page classée par le nom, stabilisée ENSUITE sur la
// présence SERVIE — un ami en ligne remonte pour qui a le droit de le voir,
// et rien d'autre ne bouge. Un anonyme n'entre pas ici (401, voir plus haut).

describe("GET /users/search — l'ORDRE obéit à la loi de la présence", () => {
  const FRIEND_ONLINE_ID = '507f1f77bcf86cd799439101';
  const FRIEND_OFFLINE_ID = '507f1f77bcf86cd799439102';
  const STRANGER_ONLINE_ID = '507f1f77bcf86cd799439103';
  const friendsOfViewer: ReadonlySet<string> = new Set([FRIEND_ONLINE_ID, FRIEND_OFFLINE_ID]);

  const userRow = (id: string, firstName: string, isOnline: boolean) => ({
    id, username: firstName.toLowerCase(), firstName, lastName: 'X', displayName: firstName,
    email: `${firstName.toLowerCase()}@test.com`, isOnline, lastActiveAt: null, systemLanguage: 'en',
  });
  // Ce que la base rend pour un tri par NOM seul.
  const byName = () => [
    userRow(STRANGER_ONLINE_ID, 'Aaron', true),
    userRow(FRIEND_OFFLINE_ID, 'Bob', false),
    userRow(FRIEND_ONLINE_ID, 'Zoe', true),
  ];
  // Ce que la base rend pour un tri « en ligne d'abord », puis par nom.
  const byRawPresenceThenName = () => [
    userRow(STRANGER_ONLINE_ID, 'Aaron', true),
    userRow(FRIEND_ONLINE_ID, 'Zoe', true),
    userRow(FRIEND_OFFLINE_ID, 'Bob', false),
  ];

  // `type: 'user'` + rôle : la forme RÉELLE d'un inscrit, celle sur laquelle
  // `viewerFromRequest` construit le viewer. « viewerless » est la forme du
  // harnais ci-dessus (ni type ni rôle) : aucun viewer, donc rien d'ouvert.
  type ViewerSpec = { role: string } | 'viewerless';
  const authContextOf = (viewer: ViewerSpec) =>
    viewer === 'viewerless'
      ? { isAuthenticated: true, userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID } }
      : { type: 'user', isAuthenticated: true, isAnonymous: false, userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID, role: viewer.role } };

  async function search(viewer: ViewerSpec, rows: unknown[]) {
    mockResolveForTargets.mockImplementationOnce(lawFaithfulResolver(friendsOfViewer));
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockResolvedValue(rows);
    prisma.user.count = jest.fn<any>().mockResolvedValue(rows.length);
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma);
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as any).authContext = authContextOf(viewer);
    });
    await searchUsers(app);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=test' });
    await app.close();
    const query = prisma.user.findMany.mock.calls[0][0];
    return { res, orderBy: query.orderBy, select: query.select };
  }
  const servedIds = (res: { json: () => any }) => res.json().data.map((u: { id: string }) => u.id);
  const servedOnline = (res: { json: () => any }) => res.json().data.map((u: { isOnline: boolean }) => u.isOnline);
  const orderByKeys = (orderBy: unknown): string[] =>
    [orderBy ?? []].flat().flatMap((clause) => Object.keys(clause as object));

  it("USER ⇒ tri par nom seul en base ; la page servie remonte l'ami en ligne, jamais l'inconnu masqué", async () => {
    const { res, orderBy } = await search({ role: 'USER' }, byName());

    expect(res.statusCode).toBe(200);
    expect(orderBy).toEqual([{ firstName: 'asc' }, { lastName: 'asc' }]);
    expect(servedIds(res)).toEqual([FRIEND_ONLINE_ID, STRANGER_ONLINE_ID, FRIEND_OFFLINE_ID]);
    expect(servedOnline(res)).toEqual([true, false, false]);
  });

  it.each(['ADMIN', 'BIGBOSS'])('%s ⇒ tri en base INCHANGÉ (présence brute d\'abord), page servie telle que lue', async (role) => {
    const { res, orderBy } = await search({ role }, byRawPresenceThenName());

    expect(orderBy).toEqual([{ isOnline: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }]);
    expect(servedIds(res)).toEqual([STRANGER_ONLINE_ID, FRIEND_ONLINE_ID, FRIEND_OFFLINE_ID]);
    expect(servedOnline(res)).toEqual([true, true, false]);
  });

  it.each(['MODERATOR', 'AUDIT', 'ANALYST'])('%s ⇒ comme un USER : aucune clé de présence en base, seul l\'ami en ligne remonte', async (role) => {
    const { res, orderBy } = await search({ role }, byName());

    expect(orderByKeys(orderBy)).not.toContain('isOnline');
    expect(orderByKeys(orderBy)).not.toContain('lastActiveAt');
    expect(servedIds(res)).toEqual([FRIEND_ONLINE_ID, STRANGER_ONLINE_ID, FRIEND_OFFLINE_ID]);
  });

  it('viewer sans rôle (la forme du harnais) ⇒ comme un USER sans amis : personne ne remonte, tout est masqué', async () => {
    const { res, orderBy } = await search('viewerless', byName());

    expect(orderByKeys(orderBy)).not.toContain('isOnline');
    expect(servedIds(res)).toEqual([STRANGER_ONLINE_ID, FRIEND_OFFLINE_ID, FRIEND_ONLINE_ID]);
    expect(servedOnline(res)).toEqual([false, false, false]);
  });

  it('la projection `select` reste celle du schéma de réponse — le tri change, pas la charge', async () => {
    const { select } = await search({ role: 'USER' }, byName());

    expect(select).toEqual({
      id: true, username: true, firstName: true, lastName: true, displayName: true,
      email: true, isOnline: true, lastActiveAt: true, systemLanguage: true,
    });
  });
});
