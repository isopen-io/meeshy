/**
 * communities-members-routes.test.ts
 *
 * Unit tests for src/routes/communities/members.ts
 * Covers:
 *   - GET    /communities/:id/members
 *   - POST   /communities/:id/members
 *   - PATCH  /communities/:id/members/:memberId/role
 *   - DELETE /communities/:id/members/:memberId
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communityMemberSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema:   { type: 'object', additionalProperties: true },
}));

jest.mock('../../../middleware/auth', () => ({ UnifiedAuthRequest: {} }));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info:  jest.fn(),
      warn:  jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../routes/communities/types', () => ({
  AddMemberSchema: {
    parse: (body: any) => ({ userId: body?.userId, role: body?.role ?? 'member' }),
  },
  UpdateMemberRoleSchema: {
    parse: (body: any) => ({ role: body?.role }),
  },
  CommunityRole: { ADMIN: 'admin', MODERATOR: 'moderator', MEMBER: 'member' },
  generateIdentifier: (_name: string, identifier?: string) =>
    identifier ?? `mshy_${_name.toLowerCase().replace(/\s+/g, '_')}`,
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import { registerMemberRoutes } from '../../../routes/communities/members';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID      = '507f1f77bcf86cd799439011';
const COMMUNITY_ID = '507f1f77bcf86cd799439022';
const MEMBER_ID    = '507f1f77bcf86cd799439033';
const TARGET_USER  = '507f1f77bcf86cd799439044';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockCommunityFindFirst     = jest.fn<any>();
const mockCommunityMemberFindMany = jest.fn<any>();
const mockCommunityMemberCount   = jest.fn<any>();
const mockCommunityMemberCreate  = jest.fn<any>();
const mockCommunityMemberUpdate  = jest.fn<any>();
const mockCommunityMemberDeleteMany = jest.fn<any>();
const mockCommunityMemberFindFirst = jest.fn<any>();
const mockUserFindFirst          = jest.fn<any>();

const mockPrisma: any = {
  community: {
    findFirst: (...args: any[]) => mockCommunityFindFirst(...args),
  },
  communityMember: {
    findMany:    (...args: any[]) => mockCommunityMemberFindMany(...args),
    count:       (...args: any[]) => mockCommunityMemberCount(...args),
    create:      (...args: any[]) => mockCommunityMemberCreate(...args),
    update:      (...args: any[]) => mockCommunityMemberUpdate(...args),
    deleteMany:  (...args: any[]) => mockCommunityMemberDeleteMany(...args),
    findFirst:   (...args: any[]) => mockCommunityMemberFindFirst(...args),
  },
  user: {
    findFirst: (...args: any[]) => mockUserFindFirst(...args),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuthOverrides = {
  isAuthenticated?: boolean;
  userId?: string;
  registeredUser?: any;
};

function buildApp(overrides: AuthOverrides = {}): FastifyInstance {
  const authContext = {
    isAuthenticated: overrides.isAuthenticated ?? true,
    userId: overrides.userId ?? USER_ID,
    registeredUser: overrides.registeredUser !== undefined
      ? overrides.registeredUser
      : { id: overrides.userId ?? USER_ID },
  };

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });

  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContext;
  });
  app.decorate('prisma', mockPrisma);
  app.register(registerMemberRoutes);
  return app;
}

function makeMember(overrides: any = {}): any {
  return {
    id: MEMBER_ID,
    communityId: COMMUNITY_ID,
    userId: USER_ID,
    role: 'member',
    joinedAt: new Date('2024-01-01T00:00:00Z'),
    user: { id: USER_ID, username: 'testuser', displayName: 'Test User', avatar: null, isOnline: false },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /communities/:id/members
// ---------------------------------------------------------------------------

describe('GET /communities/:id/members', () => {
  let app: FastifyInstance;

  const mockCommunity = {
    createdBy: USER_ID,
    isPrivate: false,
    members: [{ userId: USER_ID }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindFirst.mockReset();
    mockCommunityMemberFindMany.mockReset();
    mockCommunityMemberCount.mockReset();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(mockCommunity);
    mockCommunityMemberFindMany.mockResolvedValue([makeMember()]);
    mockCommunityMemberCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with members list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user has no access to private community', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: 'other-user',
      isPrivate: true,
      members: [],
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(403);
  });

  it('supports pagination with offset and limit', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members?offset=5&limit=10` });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 10 })
    );
  });

  it('returns 500 on DB error', async () => {
    mockCommunityMemberFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /communities/:id/members
// ---------------------------------------------------------------------------

describe('POST /communities/:id/members', () => {
  let app: FastifyInstance;

  const adminCommunity = {
    createdBy: 'other-user',
    members: [{ role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindFirst.mockReset();
    mockUserFindFirst.mockReset();
    mockCommunityMemberFindFirst.mockReset();
    mockCommunityMemberCreate.mockReset();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(adminCommunity);
    mockUserFindFirst.mockResolvedValue({ id: TARGET_USER });
    mockCommunityMemberFindFirst.mockResolvedValue(null);
    mockCommunityMemberCreate.mockResolvedValue(makeMember({ userId: TARGET_USER }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful member add', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER, role: 'member' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns existing member if already a member', async () => {
    const existing = makeMember({ userId: TARGET_USER });
    mockCommunityMemberFindFirst.mockResolvedValue(existing);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityMemberCreate).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not admin', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: 'other-user',
      members: [{ role: 'member' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when target user not found', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockCommunityMemberCreate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /communities/:id/members/:memberId/role
// ---------------------------------------------------------------------------

describe('PATCH /communities/:id/members/:memberId/role', () => {
  let app: FastifyInstance;

  const adminCommunity = {
    createdBy: 'other-user',
    members: [{ role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindFirst.mockReset();
    mockCommunityMemberUpdate.mockReset();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(adminCommunity);
    mockCommunityMemberUpdate.mockResolvedValue(makeMember({ role: 'moderator' }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful role update', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls communityMember.update with correct data', async () => {
    await app.ready();
    await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(mockCommunityMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID },
        data: { role: 'moderator' },
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not admin', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: 'other-user',
      members: [{ role: 'member' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    mockCommunityMemberUpdate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /communities/:id/members/:memberId
// ---------------------------------------------------------------------------

describe('DELETE /communities/:id/members/:memberId', () => {
  let app: FastifyInstance;

  const adminCommunity = {
    createdBy: 'other-user',
    members: [{ role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindFirst.mockReset();
    mockCommunityMemberDeleteMany.mockReset();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(adminCommunity);
    mockCommunityMemberDeleteMany.mockResolvedValue({ count: 1 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful member removal', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Member removed successfully');
  });

  it('calls communityMember.deleteMany with correct args', async () => {
    await app.ready();
    await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(mockCommunityMemberDeleteMany).toHaveBeenCalledWith({
      where: { communityId: COMMUNITY_ID, userId: MEMBER_ID },
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not admin', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: 'other-user',
      members: [{ role: 'member' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    mockCommunityMemberDeleteMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});
