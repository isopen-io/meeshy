/**
 * Unit tests for communities/search.ts
 * Tests GET /communities/search
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));

// Les schémas partagés ne sont PAS doublés : `creator` et `members` sont
// sérialisés par `userMinimalSchema` / `communityMemberSchema`, et un double
// masquerait précisément ce que ces témoins doivent traverser.

const mockValidatePagination = jest.fn<any>().mockReturnValue({ offset: 0, limit: 20 });

jest.mock('../../../utils/pagination', () => ({
  validatePagination: (...a: any[]) => mockValidatePagination(...a),
}));

const mockResolveForTargets = jest.fn<any>().mockResolvedValue(new Map());

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...a: any[]) => mockResolveForTargets(...a),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerSearchRoutes } from '../../../routes/communities/search';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const MEMBER_A = '507f1f77bcf86cd799439021';
const MEMBER_B = '507f1f77bcf86cd799439022';

const mockCommunity = {
  id: 'comm-1',
  name: 'Tech Enthusiasts',
  identifier: 'tech',
  description: 'A community for tech lovers',
  avatar: null,
  isPrivate: false,
  createdAt: new Date('2025-01-01'),
  creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  members: [],
  _count: { members: 5, Conversation: 2 },
};

const VISIBLE = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMember(userId: string, overrides: any = {}) {
  return {
    id: `member-${userId}`,
    communityId: 'comm-1',
    userId,
    role: 'member',
    joinedAt: new Date('2025-02-01'),
    user: {
      id: userId,
      username: `user-${userId}`,
      displayName: `User ${userId}`,
      avatar: null,
      isOnline: true,
      lastActiveAt: new Date('2025-03-01'),
    },
    ...overrides,
  };
}

function makeCommunity(overrides: any = {}) {
  return { ...mockCommunity, ...overrides };
}

function makePrisma(overrides: any = {}) {
  return {
    community: {
      findMany: jest.fn<any>().mockResolvedValue([mockCommunity]),
      count: jest.fn<any>().mockResolvedValue(1),
      ...overrides.community,
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.communityMember,
    },
    ...overrides,
  };
}

async function buildApp(prismaOverrides: any = {}, authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    // Forme RÉELLE de l'authContext d'un compte enregistré : `viewerFromRequest`
    // exige `type: 'user'` ET un rôle, faute de quoi le viewer est `null` — ce
    // que le double d'origine produisait sans qu'aucun témoin ne le remarque.
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);

  await registerSearchRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /communities/search — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({}, false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /communities/search — missing or empty q', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array when q is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    expect(res.json().pagination.total).toBe(0);
  });

  it('returns 200 with empty array when q is whitespace', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=%20' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});

describe('GET /communities/search — with results', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with community list when query matches', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Tech Enthusiasts');
    expect(body.data[0].memberCount).toBe(5);
    expect(body.data[0].conversationCount).toBe(2);
  });

  it('includes pagination metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech&limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
    expect(res.json().pagination).toBeDefined();
    expect(res.json().pagination.total).toBe(1);
  });
});

describe('GET /communities/search — empty results', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      community: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array when no communities match', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=nonexistent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    expect(res.json().pagination.total).toBe(0);
  });
});

describe('GET /communities/search — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      community: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sérialisation — `{ type: 'object' }` sans `properties` ne décrit AUCUN champ
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /communities/search — creator and members reach the wire', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    jest.clearAllMocks();
    mockResolveForTargets.mockResolvedValue(new Map([[MEMBER_A, VISIBLE]]));
    app = await buildApp({
      community: {
        findMany: jest.fn<any>().mockResolvedValue([makeCommunity({ members: [makeMember(MEMBER_A)] })]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('serialises the creator with its identity fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    expect(res.json().data[0].creator).toMatchObject({ id: USER_ID, username: 'alice', displayName: 'Alice' });
  });

  it('serialises each member with its membership and user fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    const member = res.json().data[0].members[0];
    expect(member).toMatchObject({ id: `member-${MEMBER_A}`, communityId: 'comm-1', userId: MEMBER_A, role: 'member' });
    expect(member.user).toMatchObject({ id: MEMBER_A, username: `user-${MEMBER_A}` });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Présence des membres — critère STRICT sans condition (directive produit
// 2026-08-25). Avant cette directive, une communauté dont le lecteur était
// LUI-MÊME membre bifurquait vers un régime préférences-seules — la
// co-appartenance valait alors un accès. Ce régime a disparu : un seul appel
// au résolveur strict, avec le viewer réel, tranche toute la page.
// ─────────────────────────────────────────────────────────────────────────────

async function searchWith(options: {
  communities: any[];
  strict?: Map<string, unknown>;
  authenticated?: boolean;
}) {
  jest.clearAllMocks();
  mockResolveForTargets.mockResolvedValue(options.strict ?? new Map());
  const app = await buildApp({
    community: {
      findMany: jest.fn<any>().mockResolvedValue(options.communities),
      count: jest.fn<any>().mockResolvedValue(options.communities.length),
    },
  }, options.authenticated ?? true);
  const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
  await app.close();
  return res;
}

describe('GET /communities/search — member presence gate', () => {
  it('masks a member the strict resolver does not clear', async () => {
    const res = await searchWith({
      communities: [makeCommunity({ members: [makeMember(MEMBER_A)] })],
      strict: new Map([[MEMBER_A, HIDDEN]]),
    });
    expect(res.json().data[0].members[0].user.isOnline).toBe(false);
  });

  it('keeps the presence the strict resolver allows', async () => {
    const res = await searchWith({
      communities: [makeCommunity({ members: [makeMember(MEMBER_A)] })],
      strict: new Map([[MEMBER_A, VISIBLE]]),
    });
    expect(res.json().data[0].members[0].user.isOnline).toBe(true);
  });

  it('routes every member of the page through the strict resolver, with the real viewer', async () => {
    await searchWith({ communities: [makeCommunity({ members: [makeMember(MEMBER_A)] })] });
    expect(mockResolveForTargets).toHaveBeenCalledWith(
      { userId: USER_ID, role: 'USER' },
      [MEMBER_A],
    );
  });

  // Directive produit 2026-08-25 : la co-appartenance ne bifurque plus rien.
  // Un membre croisé dans une communauté dont le lecteur est LUI-MÊME membre
  // part au MÊME résolveur strict que n'importe quel autre.
  it('stays on the strict resolver, deduplicated, even across a community the viewer belongs to', async () => {
    await searchWith({
      communities: [
        makeCommunity({ id: 'comm-1', members: [makeMember(MEMBER_A)] }),
        makeCommunity({ id: 'comm-2', members: [makeMember(MEMBER_A), makeMember(MEMBER_B)] }),
      ],
    });
    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'USER' }, [MEMBER_A, MEMBER_B]);
  });

  it('masks a member the resolver did not answer for', async () => {
    const res = await searchWith({
      communities: [makeCommunity({ members: [makeMember(MEMBER_A)] })],
      strict: new Map(),
    });
    expect(res.json().data[0].members[0].user.isOnline).toBe(false);
  });

  it('opens no presence resolution when the page carries no member', async () => {
    await searchWith({ communities: [makeCommunity({ members: [] })] });
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });

  it('never leaks lastActiveAt through the member payload', async () => {
    const res = await searchWith({
      communities: [makeCommunity({ members: [makeMember(MEMBER_A)] })],
      strict: new Map([[MEMBER_A, VISIBLE]]),
    });
    expect(res.json().data[0].members[0].user.lastActiveAt).toBeUndefined();
  });
});

describe('GET /communities/search — member preview freshness', () => {
  it('previews only active memberships', async () => {
    jest.clearAllMocks();
    const findMany = jest.fn<any>().mockResolvedValue([mockCommunity]);
    const app = await buildApp({ community: { findMany, count: jest.fn<any>().mockResolvedValue(1) } });
    await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    await app.close();
    expect(findMany.mock.calls[0][0].include.members.where).toEqual({ isActive: true });
  });
});
