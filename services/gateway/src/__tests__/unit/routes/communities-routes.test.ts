/**
 * communities-routes.test.ts
 *
 * Unit tests for src/routes/communities.ts (the monolith — 2047 lines, 16 routes).
 *
 * Routes covered:
 *   GET    /communities/check-identifier/:identifier
 *   GET    /communities
 *   GET    /communities/search
 *   GET    /communities/mine
 *   GET    /communities/:id
 *   POST   /communities
 *   GET    /communities/:id/members
 *   POST   /communities/:id/members
 *   PATCH  /communities/:id/members/:memberId/role
 *   DELETE /communities/:id/members/:memberId
 *   PUT    /communities/:id
 *   DELETE /communities/:id
 *   GET    /communities/:id/conversations
 *   POST   /communities/:id/join
 *   POST   /communities/:id/leave
 *   POST   /communities/:id/invite
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (must come BEFORE any imports that trigger module evaluation)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communitySchema:              { type: 'object', additionalProperties: true },
  communityMinimalSchema:       { type: 'object', additionalProperties: true },
  communityMemberSchema:        { type: 'object', additionalProperties: true },
  createCommunityRequestSchema: { type: 'object', additionalProperties: true },
  updateCommunityRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema:          { type: 'object', additionalProperties: true },
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Fastify, { FastifyInstance } from 'fastify';
// Import the monolith explicitly by specifying the .ts extension path
// (avoids resolving to communities/index.ts which is the refactored version)
import { communityRoutes } from '../../../routes/communities.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID      = '507f1f77bcf86cd799439011';
const OTHER_USER   = '507f1f77bcf86cd799439099';
const COMMUNITY_ID = '507f1f77bcf86cd799439022';
const MEMBER_ID    = '507f1f77bcf86cd799439033';
const TARGET_USER  = '507f1f77bcf86cd799439044';
const CONV_ID      = '507f1f77bcf86cd799439055';

// ---------------------------------------------------------------------------
// Prisma mock factories
// ---------------------------------------------------------------------------

const mockCommunityFindUnique     = jest.fn<any>();
const mockCommunityFindFirst      = jest.fn<any>();
const mockCommunityFindMany       = jest.fn<any>();
const mockCommunityCount          = jest.fn<any>();
const mockCommunityCreate         = jest.fn<any>();
const mockCommunityUpdate         = jest.fn<any>();
const mockCommunityDelete         = jest.fn<any>();
const mockMemberFindMany          = jest.fn<any>();
const mockMemberCount             = jest.fn<any>();
const mockMemberCreate            = jest.fn<any>();
const mockMemberUpdate            = jest.fn<any>();
const mockMemberDeleteMany        = jest.fn<any>();
const mockMemberFindFirst         = jest.fn<any>();
const mockUserFindFirst           = jest.fn<any>();
const mockConversationFindMany    = jest.fn<any>();

const mockPrisma: any = {
  community: {
    findUnique: (...a: any[]) => mockCommunityFindUnique(...a),
    findFirst:  (...a: any[]) => mockCommunityFindFirst(...a),
    findMany:   (...a: any[]) => mockCommunityFindMany(...a),
    count:      (...a: any[]) => mockCommunityCount(...a),
    create:     (...a: any[]) => mockCommunityCreate(...a),
    update:     (...a: any[]) => mockCommunityUpdate(...a),
    delete:     (...a: any[]) => mockCommunityDelete(...a),
  },
  communityMember: {
    findMany:   (...a: any[]) => mockMemberFindMany(...a),
    count:      (...a: any[]) => mockMemberCount(...a),
    create:     (...a: any[]) => mockMemberCreate(...a),
    update:     (...a: any[]) => mockMemberUpdate(...a),
    deleteMany: (...a: any[]) => mockMemberDeleteMany(...a),
    findFirst:  (...a: any[]) => mockMemberFindFirst(...a),
  },
  user: {
    findFirst: (...a: any[]) => mockUserFindFirst(...a),
  },
  conversation: {
    findMany: (...a: any[]) => mockConversationFindMany(...a),
  },
};

// ---------------------------------------------------------------------------
// App builder
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
    registeredUser:
      overrides.registeredUser !== undefined
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
  app.register(communityRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Data factories
// ---------------------------------------------------------------------------

function makeCommunity(overrides: any = {}): any {
  return {
    id: COMMUNITY_ID,
    name: 'Test Community',
    identifier: 'mshy_test_community',
    description: 'A description',
    avatar: null,
    isPrivate: false,
    createdBy: USER_ID,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
    members: [
      { userId: USER_ID, role: 'admin', user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true } }
    ],
    _count: { members: 1, Conversation: 0 },
    ...overrides,
  };
}

function makeMember(overrides: any = {}): any {
  return {
    id: MEMBER_ID,
    communityId: COMMUNITY_ID,
    userId: USER_ID,
    role: 'member',
    joinedAt: new Date('2024-01-01T00:00:00Z'),
    user: {
      id: USER_ID,
      username: 'alice',
      displayName: 'Alice',
      avatar: null,
      isOnline: false,
      lastActiveAt: null,
    },
    ...overrides,
  };
}

// ===========================================================================
// GET /communities/check-identifier/:identifier
// ===========================================================================

describe('GET /communities/check-identifier/:identifier', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with available=true when identifier is free', async () => {
    mockCommunityFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/communities/check-identifier/mshy_free_name',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(true);
    expect(body.data.identifier).toBe('mshy_free_name');
  });

  it('returns 200 with available=false when identifier is already taken', async () => {
    mockCommunityFindUnique.mockResolvedValue(makeCommunity());
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/communities/check-identifier/mshy_test_community',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.available).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    mockCommunityFindUnique.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/communities/check-identifier/anything',
    });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// GET /communities
// ===========================================================================

describe('GET /communities', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindMany.mockResolvedValue([makeCommunity()]);
    mockCommunityCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with list of communities', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toBeDefined();
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'GET', url: '/communities' });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('passes search query to Prisma AND clause when search has 2+ chars', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities?search=te' });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.any(Array) }),
      })
    );
  });

  it('does not add AND clause when no search param is provided', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    const call = mockCommunityFindMany.mock.calls[0][0];
    expect(call.where.AND).toBeUndefined();
  });

  it('respects pagination offset and limit', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities?offset=10&limit=5' });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });

  it('returns 500 on DB error', async () => {
    mockCommunityFindMany.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// GET /communities/search
// ===========================================================================

describe('GET /communities/search', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindMany.mockResolvedValue([makeCommunity({ isPrivate: false })]);
    mockCommunityCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with matching public communities for a query', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].memberCount).toBeDefined();
    expect(body.data[0].conversationCount).toBeDefined();
  });

  it('returns empty result when q param is missing', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/search' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
    expect(mockCommunityFindMany).not.toHaveBeenCalled();
  });

  it('does not query DB when q is missing', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/search' });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityFindMany).not.toHaveBeenCalled();
  });

  it('searches only non-private communities (isPrivate: false in where clause)', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/communities/search?q=dev' });
    expect(mockCommunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPrivate: false }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockCommunityFindMany.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// GET /communities/mine
// ===========================================================================

describe('GET /communities/mine', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockMemberFindMany.mockResolvedValue([
      {
        role: 'admin',
        community: {
          id: COMMUNITY_ID,
          name: 'My Community',
          identifier: 'mshy_mine',
          avatar: null,
          isPrivate: false,
        },
      },
    ]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user memberships', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].role).toBe('admin');
    expect(body.data[0].id).toBe(COMMUNITY_ID);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'GET', url: '/communities/mine' });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('filters by role when role query param is provided', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/communities/mine?role=admin' });
    expect(mockMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: { in: ['admin'] } }),
      })
    );
  });

  it('ignores invalid role values in query param', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/communities/mine?role=superuser' });
    const call = mockMemberFindMany.mock.calls[0][0];
    expect(call.where.role).toBeUndefined();
  });

  it('returns 500 on DB error', async () => {
    mockMemberFindMany.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// GET /communities/:id
// ===========================================================================

describe('GET /communities/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(makeCommunity());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with community data including flattened counts', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.memberCount).toBe(1);
    expect(body.data.conversationCount).toBe(0);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found by id or identifier', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('falls back to identifier lookup when first find returns null', async () => {
    mockCommunityFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCommunity());
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/mshy_test_community' });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityFindFirst).toHaveBeenCalledTimes(2);
  });

  it('returns 403 when private community and user is not creator or member', async () => {
    mockCommunityFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCommunity({ isPrivate: true, createdBy: OTHER_USER, members: [] }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 for public community even when user is not a member', async () => {
    mockCommunityFindFirst.mockResolvedValue(
      makeCommunity({ isPrivate: false, createdBy: OTHER_USER, members: [] })
    );
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    mockCommunityFindFirst.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// POST /communities
// ===========================================================================

describe('POST /communities', () => {
  let app: FastifyInstance;

  const validPayload = {
    name: 'My New Community',
    description: 'A great place',
    isPrivate: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindUnique.mockResolvedValue(null);
    mockCommunityCreate.mockResolvedValue(makeCommunity());
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful community creation', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.memberCount).toBeDefined();
  });

  it('creates community with auto-generated mshy_ identifier from name', async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/communities',
      payload: validPayload,
    });
    expect(mockCommunityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'My New Community',
          identifier: 'mshy_my-new-community',
          createdBy: USER_ID,
        }),
      })
    );
  });

  it('uses custom identifier prefixed with mshy_ when provided', async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/communities',
      payload: { ...validPayload, identifier: 'custom_id' },
    });
    expect(mockCommunityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ identifier: 'mshy_custom_id' }),
      })
    );
  });

  it('does not double-prefix if identifier already starts with mshy_', async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/communities',
      payload: { ...validPayload, identifier: 'mshy_already_prefixed' },
    });
    expect(mockCommunityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ identifier: 'mshy_already_prefixed' }),
      })
    );
  });

  it('automatically adds creator as ADMIN member', async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/communities',
      payload: validPayload,
    });
    expect(mockCommunityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          members: {
            create: { userId: USER_ID, role: 'admin' },
          },
        }),
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'POST',
      url: '/communities',
      payload: validPayload,
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 409 when identifier is already taken', async () => {
    mockCommunityFindUnique.mockResolvedValue(makeCommunity());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on DB error during creation', async () => {
    mockCommunityCreate.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// GET /communities/:id/members
// ===========================================================================

describe('GET /communities/:id/members', () => {
  let app: FastifyInstance;

  const accessibleCommunity = {
    createdBy: USER_ID,
    isPrivate: false,
    members: [{ userId: USER_ID }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(accessibleCommunity);
    mockMemberFindMany.mockResolvedValue([makeMember()]);
    mockMemberCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with paginated members list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toBeDefined();
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
      createdBy: OTHER_USER,
      isPrivate: true,
      members: [],
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(403);
  });

  it('respects pagination offset and limit', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/communities/${COMMUNITY_ID}/members?offset=5&limit=10`,
    });
    expect(res.statusCode).toBe(200);
    expect(mockMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 10 })
    );
  });

  it('returns 500 on DB error when fetching members', async () => {
    mockMemberFindMany.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// POST /communities/:id/members
// ===========================================================================

describe('POST /communities/:id/members', () => {
  let app: FastifyInstance;

  const adminCommunity = {
    createdBy: OTHER_USER,
    members: [{ role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(adminCommunity);
    mockUserFindFirst.mockResolvedValue({ id: TARGET_USER });
    mockMemberFindFirst.mockResolvedValue(null);
    mockMemberCreate.mockResolvedValue(makeMember({ userId: TARGET_USER }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and creates new member when user is admin', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER, role: 'member' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockMemberCreate).toHaveBeenCalled();
  });

  it('returns existing member without creating a new one if already a member', async () => {
    const existing = makeMember({ userId: TARGET_USER });
    mockMemberFindFirst.mockResolvedValue(existing);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMemberCreate).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when requesting user is not an admin', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: OTHER_USER,
      members: [{ role: 'member' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when requesting user is not in community at all', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: OTHER_USER,
      members: [],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when target user to add does not exist', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error during member creation', async () => {
    mockMemberCreate.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// PATCH /communities/:id/members/:memberId/role
// ===========================================================================

describe('PATCH /communities/:id/members/:memberId/role', () => {
  let app: FastifyInstance;

  const adminCommunity = {
    createdBy: OTHER_USER,
    members: [{ role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(adminCommunity);
    mockMemberUpdate.mockResolvedValue(makeMember({ role: 'moderator' }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and updates role when user is admin', async () => {
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

  it('calls communityMember.update with correct where and data', async () => {
    await app.ready();
    await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(mockMemberUpdate).toHaveBeenCalledWith(
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

  it('returns 403 when user is not an admin', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: OTHER_USER,
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

  it('returns 500 on DB error during role update', async () => {
    mockMemberUpdate.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}/role`,
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// DELETE /communities/:id/members/:memberId
// ===========================================================================

describe('DELETE /communities/:id/members/:memberId', () => {
  let app: FastifyInstance;

  const adminCommunity = {
    createdBy: OTHER_USER,
    members: [{ role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(adminCommunity);
    mockMemberDeleteMany.mockResolvedValue({ count: 1 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success message when member is removed', async () => {
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

  it('calls communityMember.deleteMany with communityId and userId (memberId param)', async () => {
    await app.ready();
    await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(mockMemberDeleteMany).toHaveBeenCalledWith({
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

  it('returns 403 when user is not an admin', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: OTHER_USER,
      members: [{ role: 'moderator' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    mockMemberDeleteMany.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${MEMBER_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// PUT /communities/:id
// ===========================================================================

describe('PUT /communities/:id', () => {
  let app: FastifyInstance;

  const validPayload = { name: 'Updated Name', description: 'Updated desc' };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue({ createdBy: USER_ID, identifier: 'mshy_old_name' });
    mockCommunityFindUnique.mockResolvedValue(null);
    mockCommunityUpdate.mockResolvedValue(makeCommunity({ name: 'Updated Name' }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with updated community data', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMMUNITY_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'PUT',
      url: `/communities/${COMMUNITY_ID}`,
      payload: validPayload,
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMMUNITY_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the community creator', async () => {
    mockCommunityFindFirst.mockResolvedValue({ createdBy: OTHER_USER, identifier: 'mshy_other' });
    await app.ready();
    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMMUNITY_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when new identifier is already taken', async () => {
    mockCommunityFindUnique.mockResolvedValue(makeCommunity({ identifier: 'mshy_taken' }));
    await app.ready();
    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMMUNITY_ID}`,
      payload: { ...validPayload, identifier: 'taken' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on DB error during update', async () => {
    mockCommunityUpdate.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMMUNITY_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// DELETE /communities/:id
// ===========================================================================

describe('DELETE /communities/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue({ createdBy: USER_ID });
    mockCommunityDelete.mockResolvedValue({});
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success message on deletion', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Community deleted successfully');
  });

  it('calls community.delete with the correct id', async () => {
    await app.ready();
    await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(mockCommunityDelete).toHaveBeenCalledWith({
      where: { id: COMMUNITY_ID },
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the community creator', async () => {
    mockCommunityFindFirst.mockResolvedValue({ createdBy: OTHER_USER });
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error during deletion', async () => {
    mockCommunityDelete.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// GET /communities/:id/conversations
// ===========================================================================

describe('GET /communities/:id/conversations', () => {
  let app: FastifyInstance;

  const memberCommunity = {
    createdBy: USER_ID,
    isPrivate: false,
    members: [{ userId: USER_ID }],
  };

  const mockConversation = {
    id: CONV_ID,
    communityId: COMMUNITY_ID,
    participants: [],
    _count: { messages: 5, participants: 2 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(memberCommunity);
    mockConversationFindMany.mockResolvedValue([mockConversation]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with conversations list', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/communities/${COMMUNITY_ID}/conversations`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'GET',
      url: `/communities/${COMMUNITY_ID}/conversations`,
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/communities/${COMMUNITY_ID}/conversations`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when private community and user is not member', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: OTHER_USER,
      isPrivate: true,
      members: [],
    });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/communities/${COMMUNITY_ID}/conversations`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('filters conversations by communityId and user participation', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(mockConversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          communityId: COMMUNITY_ID,
          participants: { some: { userId: USER_ID } },
        },
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockConversationFindMany.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/communities/${COMMUNITY_ID}/conversations`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// POST /communities/:id/join
// ===========================================================================

describe('POST /communities/:id/join', () => {
  let app: FastifyInstance;

  const publicCommunity = { id: COMMUNITY_ID, isPrivate: false };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(publicCommunity);
    mockMemberFindFirst.mockResolvedValue(null);
    mockMemberCreate.mockResolvedValue(makeMember({ userId: USER_ID }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when user successfully joins a public community', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('creates member with MEMBER role on join', async () => {
    await app.ready();
    await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    expect(mockMemberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          communityId: COMMUNITY_ID,
          userId: USER_ID,
          role: 'member',
        }),
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when attempting to join a private community directly', async () => {
    mockCommunityFindFirst.mockResolvedValue({ id: COMMUNITY_ID, isPrivate: true });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when user is already a member', async () => {
    mockMemberFindFirst.mockResolvedValue(makeMember());
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on DB error', async () => {
    mockMemberCreate.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// POST /communities/:id/leave
// ===========================================================================

describe('POST /communities/:id/leave', () => {
  let app: FastifyInstance;

  const memberCommunity = { id: COMMUNITY_ID, createdBy: OTHER_USER };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(memberCommunity);
    mockMemberDeleteMany.mockResolvedValue({ count: 1 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success message when user leaves a community', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/leave` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Successfully left community');
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/leave` });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/leave` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the community creator tries to leave', async () => {
    mockCommunityFindFirst.mockResolvedValue({ id: COMMUNITY_ID, createdBy: USER_ID });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/leave` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when user is not a member (deleteMany count = 0)', async () => {
    mockMemberDeleteMany.mockResolvedValue({ count: 0 });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/leave` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockMemberDeleteMany.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/leave` });
    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// POST /communities/:id/invite
// ===========================================================================

describe('POST /communities/:id/invite', () => {
  let app: FastifyInstance;

  const adminInPrivateCommunity = {
    id: COMMUNITY_ID,
    isPrivate: true,
    createdBy: OTHER_USER,
    members: [{ role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(adminInPrivateCommunity);
    mockUserFindFirst.mockResolvedValue({ id: TARGET_USER });
    mockMemberFindFirst.mockResolvedValue(null);
    mockMemberCreate.mockResolvedValue(makeMember({ userId: TARGET_USER }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when admin invites user to private community', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 200 when any member invites to public community', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      id: COMMUNITY_ID,
      isPrivate: false,
      createdBy: OTHER_USER,
      members: [{ role: 'member' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when inviter is not a community member at all', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      id: COMMUNITY_ID,
      isPrivate: false,
      createdBy: OTHER_USER,
      members: [],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when regular member tries to invite to private community', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      id: COMMUNITY_ID,
      isPrivate: true,
      createdBy: OTHER_USER,
      members: [{ role: 'member' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 when moderator invites to private community', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      id: COMMUNITY_ID,
      isPrivate: true,
      createdBy: OTHER_USER,
      members: [{ role: 'moderator' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when invitee user does not exist', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when invitee is already a member', async () => {
    mockMemberFindFirst.mockResolvedValue(makeMember({ userId: TARGET_USER }));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on DB error during invite', async () => {
    mockMemberCreate.mockRejectedValue(new Error('DB failure'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/invite`,
      payload: { userId: TARGET_USER },
    });
    expect(res.statusCode).toBe(500);
  });
});
