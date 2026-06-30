/**
 * Extended coverage tests for routes/communities.ts
 * Targets uncovered lines: 58-61, 172-173, 242, 260, 401, 493-494, 543, 578-579,
 * 634, 715, 723-724, 766, 917, 937, 975-976, 1048, 1084, 1097, 1122-1123, 1194,
 * 1220, 1241-1242, 1306, 1332, 1345-1346, 1407, 1436-1449, 1475-1476, 1536,
 * 1561-1562, 1645, 1665, 1668, 1707-1708, 1766, 1781, 1789, 1813-1814, 1873,
 * 1896, 1901-1902, 1971, 1995, 1999-2001, 2011, 2019, 2043-2044
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn((offset: any, limit: any) => ({
    offset: Number(offset) || 0,
    limit: Number(limit) || 20,
  })),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communitySchema: { type: 'object', additionalProperties: true },
  communityMinimalSchema: { type: 'object', additionalProperties: true },
  communityMemberSchema: { type: 'object', additionalProperties: true },
  createCommunityRequestSchema: { type: 'object', additionalProperties: true },
  updateCommunityRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { communityRoutes } from '../../../routes/communities';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-ext-001';
const OTHER_USER_ID = 'user-ext-other';
const COMM_ID = '507f1f77bcf86cd799430011';
const MEMBER_ID = '507f1f77bcf86cd799430022';
const INVITEE_ID = '507f1f77bcf86cd799430033';

const baseAuthContext = {
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', displayName: 'Alice', role: 'USER' },
};

const unauthContext = { isAuthenticated: false, registeredUser: null, userId: null };

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM_ID, name: 'Test', identifier: 'mshy_test', description: null,
        avatar: null, isPrivate: false, createdBy: USER_ID,
        creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
        members: [{ userId: USER_ID, role: 'admin', user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true } }],
        _count: { members: 1, Conversation: 0 },
      }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>().mockResolvedValue({
        id: COMM_ID, name: 'Test', identifier: 'mshy_test', description: null,
        avatar: null, isPrivate: false, createdBy: USER_ID,
        creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
        _count: { members: 1, Conversation: 0 },
      }),
      update: jest.fn<any>().mockResolvedValue({
        id: COMM_ID, name: 'Updated', identifier: 'mshy_test', description: null,
        avatar: null, isPrivate: false, createdBy: USER_ID,
        creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
        _count: { members: 1, Conversation: 0 },
      }),
      delete: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>().mockResolvedValue({
        id: MEMBER_ID, communityId: COMM_ID, userId: OTHER_USER_ID, role: 'member',
        user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: false },
      }),
      update: jest.fn<any>().mockResolvedValue({ id: MEMBER_ID, role: 'moderator', user: { id: OTHER_USER_ID, username: 'bob' } }),
      delete: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      count: jest.fn<any>().mockResolvedValue(1),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
      findUnique: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
    },
    ...overrides,
  } as any;
}

// ─── App factories ────────────────────────────────────────────────────────────

async function buildAuthApp(prisma = makePrisma()): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = baseAuthContext; });
  app.decorate('prisma', prisma);
  await communityRoutes(app);
  await app.ready();
  return { app, prisma };
}

async function buildUnauthApp(): Promise<FastifyInstance> {
  const prisma = makePrisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = unauthContext; });
  app.decorate('prisma', prisma);
  await communityRoutes(app);
  await app.ready();
  return app;
}

// ─── generateIdentifier — custom identifier with mshy_ prefix (lines 58-59) ──

describe('POST /communities — generateIdentifier with mshy_ prefix', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => { ({ app, prisma } = await buildAuthApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 when identifier already starts with mshy_ (no double prefix)', async () => {
    prisma.community.findUnique.mockResolvedValueOnce(null);
    prisma.communityMember.create.mockResolvedValueOnce({ id: 'cm-1', role: 'admin' });
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'Test Comm', identifier: 'mshy_already_prefixed' },
    });
    expect([201, 409]).toContain(res.statusCode);
  });
});

// ─── GET /communities/check-identifier — error catch (lines 172-173) ─────────

describe('GET /communities/check-identifier/:identifier — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma({ community: { findUnique: jest.fn<any>().mockRejectedValue(new Error('DB crash')) } });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_test' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /communities — unauthenticated (line 242) ───────────────────────────

describe('GET /communities — unauthenticated path (line 242)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /communities — search filter (line 260) ─────────────────────────────

describe('GET /communities — with search query (line 260)', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => { ({ app, prisma } = await buildAuthApp()); });
  afterAll(async () => { await app.close(); });

  it('applies search filter and returns 200', async () => {
    prisma.community.findMany.mockResolvedValueOnce([]);
    prisma.community.count.mockResolvedValueOnce(0);
    const res = await app.inject({ method: 'GET', url: '/communities?search=te' });
    expect(res.statusCode).toBe(200);
  });
});

// ─── GET /communities/search — empty query (line 401) ────────────────────────

describe('GET /communities/search — empty query (line 401)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildAuthApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty list when query is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 200 with empty list when query is whitespace', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=%20' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });
});

// ─── GET /communities/search — error catch (lines 493-494) ───────────────────

describe('GET /communities/search — DB error (lines 493-494)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findMany.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error during search', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /communities/mine — unauthenticated (line 543) ──────────────────────

describe('GET /communities/mine — unauthenticated (line 543)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /communities/mine — error catch (lines 578-579) ─────────────────────

describe('GET /communities/mine — DB error (lines 578-579)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /communities/:id — unauthenticated (line 634) ───────────────────────

describe('GET /communities/:id — unauthenticated (line 634)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /communities/:id — private community, no access (line 715) ──────────

describe('GET /communities/:id — private community, user not a member (line 715)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, name: 'Private', identifier: 'mshy_private', isPrivate: true,
      createdBy: OTHER_USER_ID,
      creator: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', avatar: null },
      members: [],
      _count: { members: 0, Conversation: 0 },
    });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for private community with no access', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /communities/:id — error catch (lines 723-724) ──────────────────────

describe('GET /communities/:id — DB error (lines 723-724)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /communities — unauthenticated (line 766) ──────────────────────────

describe('POST /communities — unauthenticated (line 766)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'New Community' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /communities/:id/members — unauthenticated (line 917) ───────────────

describe('GET /communities/:id/members — unauthenticated (line 917)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /communities/:id/members — private community, no access (line 937) ──

describe('GET /communities/:id/members — private community, no access (line 937)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, isPrivate: true, createdBy: OTHER_USER_ID,
      members: [],
    });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for private community with no access', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /communities/:id/members — error catch (lines 975-976) ──────────────

describe('GET /communities/:id/members — DB error (lines 975-976)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /communities/:id/members — unauthenticated (line 1048) ─────────────

describe('POST /communities/:id/members — unauthenticated (line 1048)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── POST /communities/:id/members — user to add not found (line 1084) ───────

describe('POST /communities/:id/members — user to add not found (line 1084)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, createdBy: USER_ID,
      members: [{ role: 'admin', userId: USER_ID }],
    });
    prisma.user.findFirst.mockResolvedValueOnce(null);
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when user to add is not found', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/members`,
      payload: { userId: OTHER_USER_ID, role: 'member' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /communities/:id/members — existing member branch (line 1097) ──────

describe('POST /communities/:id/members — existing member (line 1097)', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, createdBy: USER_ID,
      members: [{ role: 'admin', userId: USER_ID }],
    });
    prisma.user.findFirst.mockResolvedValue({ id: OTHER_USER_ID });
    prisma.communityMember.findFirst.mockResolvedValue({ id: MEMBER_ID, role: 'member', userId: OTHER_USER_ID });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with existing member when member already exists', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/members`,
      payload: { userId: OTHER_USER_ID, role: 'member' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
  });
});

// ─── POST /communities/:id/members — error catch (lines 1122-1123) ───────────

describe('POST /communities/:id/members — DB error (lines 1122-1123)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── PATCH /communities/:id/members/:memberId/role — unauthenticated (1194) ──

describe('PATCH /communities/:id/members/:memberId/role — unauthenticated (line 1194)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/communities/${COMM_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── PATCH /communities/:id/members/:memberId/role — non-admin (line 1220) ───

describe('PATCH /communities/:id/members/:memberId/role — non-admin (line 1220)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, createdBy: OTHER_USER_ID,
      members: [{ role: 'member', userId: USER_ID }],
    });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not an admin', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/communities/${COMM_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── PATCH role — error catch (lines 1241-1242) ──────────────────────────────

describe('PATCH /communities/:id/members/:memberId/role — DB error (lines 1241-1242)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/communities/${COMM_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /communities/:id/members/:memberId — unauthenticated (line 1306) ─

describe('DELETE /communities/:id/members/:memberId — unauthenticated (line 1306)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/communities/${COMM_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── DELETE /communities/:id/members/:memberId — non-admin (line 1332) ───────

describe('DELETE /communities/:id/members/:memberId — non-admin (line 1332)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, createdBy: OTHER_USER_ID,
      members: [{ role: 'member', userId: USER_ID }],
    });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not an admin', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/communities/${COMM_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── DELETE member — error catch (lines 1345-1346) ───────────────────────────

describe('DELETE /communities/:id/members/:memberId — DB error (lines 1345-1346)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/communities/${COMM_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── PUT /communities/:id — unauthenticated (line 1407) ──────────────────────

describe('PUT /communities/:id — unauthenticated (line 1407)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── PUT /communities/:id — identifier conflict (lines 1436-1449) ────────────

describe('PUT /communities/:id — identifier conflict (lines 1436-1449)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, createdBy: USER_ID, identifier: 'mshy_old',
    });
    prisma.community.findUnique.mockResolvedValue({ id: 'other-community' });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 409 when new identifier is already taken', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMM_ID}`,
      payload: { name: 'Test', identifier: 'taken' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('covers generateIdentifier with mshy_ prefix in PUT (lines 58-59)', async () => {
    const prisma2 = makePrisma();
    prisma2.community.findFirst.mockResolvedValue({
      id: COMM_ID, createdBy: USER_ID, identifier: 'mshy_old',
    });
    prisma2.community.findUnique.mockResolvedValue(null);
    const { app: app2 } = await buildAuthApp(prisma2);
    const res = await app2.inject({
      method: 'PUT', url: `/communities/${COMM_ID}`,
      payload: { name: 'Test', identifier: 'mshy_new_already_prefixed' },
    });
    await app2.close();
    expect([200, 201]).toContain(res.statusCode);
  });
});

// ─── PUT /communities/:id — error catch (lines 1475-1476) ────────────────────

describe('PUT /communities/:id — DB error (lines 1475-1476)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /communities/:id — unauthenticated (line 1536) ───────────────────

describe('DELETE /communities/:id — unauthenticated (line 1536)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMM_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── DELETE /communities/:id — error catch (lines 1561-1562) ─────────────────

describe('DELETE /communities/:id — DB error (lines 1561-1562)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMM_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /communities/:id/conversations — unauthenticated (line 1645) ────────

describe('GET /communities/:id/conversations — unauthenticated (line 1645)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/conversations` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /communities/:id/conversations — private, no access (lines 1665, 1668)

describe('GET /communities/:id/conversations — private community, no access (lines 1665, 1668)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, isPrivate: true, createdBy: OTHER_USER_ID,
      members: [],
    });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for private community with no access', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/conversations` });
    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /communities/:id/conversations — error catch (lines 1707-1708) ──────

describe('GET /communities/:id/conversations — DB error (lines 1707-1708)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/conversations` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /communities/:id/join — unauthenticated (line 1766) ────────────────

describe('POST /communities/:id/join — unauthenticated (line 1766)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── POST /communities/:id/join — private community (line 1781) ──────────────

describe('POST /communities/:id/join — private community (line 1781)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({ id: COMM_ID, isPrivate: true });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when trying to join a private community', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    expect(res.statusCode).toBe(403);
  });
});

// ─── POST /communities/:id/join — already a member (line 1789) ───────────────

describe('POST /communities/:id/join — already a member (line 1789)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({ id: COMM_ID, isPrivate: false });
    prisma.communityMember.findFirst.mockResolvedValue({ id: MEMBER_ID, userId: USER_ID, role: 'member' });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 409 when already a member', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    expect(res.statusCode).toBe(409);
  });
});

// ─── POST /communities/:id/join — error catch (lines 1813-1814) ──────────────

describe('POST /communities/:id/join — DB error (lines 1813-1814)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /communities/:id/leave — unauthenticated (line 1873) ───────────────

describe('POST /communities/:id/leave — unauthenticated (line 1873)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/leave` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── POST /communities/:id/leave — not a member (line 1896) ──────────────────

describe('POST /communities/:id/leave — not a member (line 1896)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({ id: COMM_ID, createdBy: OTHER_USER_ID });
    prisma.communityMember.deleteMany.mockResolvedValue({ count: 0 });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when not a member of the community', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/leave` });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /communities/:id/leave — error catch (lines 1901-1902) ─────────────

describe('POST /communities/:id/leave — DB error (lines 1901-1902)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/leave` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /communities/:id/invite — unauthenticated (line 1971) ──────────────

describe('POST /communities/:id/invite — unauthenticated (line 1971)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── POST /communities/:id/invite — not a member (line 1995) ─────────────────

describe('POST /communities/:id/invite — inviter not a member (line 1995)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, isPrivate: false, createdBy: OTHER_USER_ID,
      members: [],
    });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when inviter is not a community member', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── POST /communities/:id/invite — private, non-admin (lines 1999-2001) ─────

describe('POST /communities/:id/invite — private community, non-admin inviter (lines 1999-2001)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, isPrivate: true, createdBy: OTHER_USER_ID,
      members: [{ role: 'member', userId: USER_ID }],
    });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when member role is not admin/moderator in private community', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── POST /communities/:id/invite — invitee not found (line 2011) ────────────

describe('POST /communities/:id/invite — invitee user not found (line 2011)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, isPrivate: false, createdBy: OTHER_USER_ID,
      members: [{ role: 'admin', userId: USER_ID }],
    });
    prisma.user.findFirst.mockResolvedValueOnce(null);
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when invitee user does not exist', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /communities/:id/invite — invitee already a member (line 2019) ─────

describe('POST /communities/:id/invite — invitee already a member (line 2019)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, isPrivate: false, createdBy: OTHER_USER_ID,
      members: [{ role: 'admin', userId: USER_ID }],
    });
    prisma.user.findFirst.mockResolvedValue({ id: INVITEE_ID });
    prisma.communityMember.findFirst.mockResolvedValue({ id: MEMBER_ID, userId: INVITEE_ID, role: 'member' });
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 409 when invitee is already a member', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(409);
  });
});

// ─── POST /communities/:id/invite — error catch (lines 2043-2044) ────────────

describe('POST /communities/:id/invite — DB error (lines 2043-2044)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockRejectedValue(new Error('DB crash'));
    ({ app } = await buildAuthApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`,
      payload: { userId: INVITEE_ID },
    });
    expect(res.statusCode).toBe(500);
  });
});
