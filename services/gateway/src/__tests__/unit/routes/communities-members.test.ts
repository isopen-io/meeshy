/**
 * Unit tests for communities/members.ts
 * Tests:
 *   GET    /communities/:id/members         — list members
 *   POST   /communities/:id/members         — add member
 *   PATCH  /communities/:id/members/:memberId/role — change member role
 *   DELETE /communities/:id/members/:memberId      — remove member
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communityMemberSchema: { type: 'object', properties: { id: { type: 'string' } } },
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

jest.mock('../../../routes/communities/types', () => ({
  AddMemberSchema: { parse: (data: any) => data },
  UpdateMemberRoleSchema: { parse: (data: any) => data },
  CommunityRole: { ADMIN: 'admin', MODERATOR: 'moderator', MEMBER: 'member' },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn<any>().mockReturnValue({ offset: 0, limit: 20 }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMemberRoutes } from '../../../routes/communities/members';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const COMMUNITY_ID = 'comm-aabbcc001122';
const MEMBER_ID = 'member-112233445566';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockMember = {
  id: MEMBER_ID,
  communityId: COMMUNITY_ID,
  userId: OTHER_USER_ID,
  role: 'member',
  joinedAt: new Date('2025-01-01'),
  user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: false, lastActiveAt: null },
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: USER_ID,
        isPrivate: true,
        members: [{ userId: USER_ID, role: 'admin' }],
      }),
      ...overrides.community,
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([mockMember]),
      count: jest.fn<any>().mockResolvedValue(1),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue(mockMember),
      update: jest.fn<any>().mockResolvedValue({ ...mockMember, role: 'moderator' }),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      ...overrides.communityMember,
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
      ...overrides.user,
    },
    ...overrides,
  };
}

// ─── App builder ─────────────────────────────────────────────────────────────

async function buildApp(role = 'USER', prismaOverrides: any = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);
  await app.register(registerMemberRoutes);
  await app.ready();
  return app;
}

async function buildUnauthenticatedApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (_req: any, reply: any) => {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
  });
  app.decorate('prisma', makePrisma() as any);
  await app.register(registerMemberRoutes);
  await app.ready();
  return app;
}

async function buildNoRegisteredUserApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = { isAuthenticated: false };
  });
  app.decorate('prisma', makePrisma() as any);
  await app.register(registerMemberRoutes);
  await app.ready();
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /communities/:id/members
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /communities/:id/members — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id/members — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /communities/:id/members — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id/members — private community, user not member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: OTHER_USER_ID,
          isPrivate: true,
          members: [],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id/members — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with members list', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /communities/:id/members — public community, non-member can access', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: OTHER_USER_ID,
          isPrivate: false,
          members: [],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for public community even if user is not a member', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /communities/:id/members — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /communities/:id/members
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /communities/:id/members — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/members — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /communities/:id/members — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/members — caller is not admin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: OTHER_USER_ID,
          members: [{ userId: USER_ID, role: 'member' }],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/members — user to add not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      user: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when user to add does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: 'nonexistent-user' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/members — success (new member)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when member is successfully added', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID, role: 'member' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /communities/:id/members — already existing member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      communityMember: {
        findFirst: jest.fn<any>().mockResolvedValue(mockMember),
        create: jest.fn<any>().mockResolvedValue(mockMember),
        count: jest.fn<any>().mockResolvedValue(1),
        findMany: jest.fn<any>().mockResolvedValue([mockMember]),
        update: jest.fn<any>().mockResolvedValue(mockMember),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 (idempotent) when member already exists', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /communities/:id/members — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /communities/:id/members/:memberId/role
// ═══════════════════════════════════════════════════════════════════════════════

describe('PATCH /communities/:id/members/:memberId/role — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('PATCH /communities/:id/members/:memberId/role — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /communities/:id/members/:memberId/role — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('PATCH /communities/:id/members/:memberId/role — caller is not admin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: OTHER_USER_ID,
          members: [{ userId: USER_ID, role: 'member' }],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not admin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('PATCH /communities/:id/members/:memberId/role — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with updated member', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('PATCH /communities/:id/members/:memberId/role — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /communities/:id/members/:memberId
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /communities/:id/members/:memberId — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /communities/:id/members/:memberId — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /communities/:id/members/:memberId — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /communities/:id/members/:memberId — caller is not admin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: OTHER_USER_ID,
          members: [{ userId: USER_ID, role: 'member' }],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not admin', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /communities/:id/members/:memberId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful removal', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /communities/:id/members/:memberId — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});
