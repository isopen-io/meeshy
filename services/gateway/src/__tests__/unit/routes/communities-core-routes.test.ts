/**
 * communities-core-routes.test.ts
 *
 * Unit tests for src/routes/communities/core.ts
 * Covers:
 *   - GET  /communities/check-identifier/:identifier
 *   - GET  /communities
 *   - GET  /communities/:id
 *   - POST /communities
 *   - GET  /communities/:id/conversations
 *   - POST /communities/:id/conversations/:conversationId
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communitySchema:              { type: 'object', additionalProperties: true },
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

jest.mock('../../../routes/communities/types', () => ({
  CreateCommunitySchema: {
    parse: (body: any) => body,
  },
  UpdateCommunitySchema: {
    parse: (body: any) => body,
  },
  CommunityRole: { ADMIN: 'admin', MODERATOR: 'moderator', MEMBER: 'member' },
  generateIdentifier: (_name: string, identifier?: string) =>
    identifier ?? `mshy_${_name.toLowerCase().replace(/\s+/g, '_')}`,
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import { registerCoreRoutes } from '../../../routes/communities/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID         = '507f1f77bcf86cd799439011';
const COMMUNITY_ID    = '507f1f77bcf86cd799439022';
const CONVERSATION_ID = '507f1f77bcf86cd799439033';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockCommunityFindUnique  = jest.fn<any>();
const mockCommunityFindFirst   = jest.fn<any>();
const mockCommunityFindMany    = jest.fn<any>();
const mockCommunityCount       = jest.fn<any>();
const mockCommunityCreate      = jest.fn<any>();
const mockConversationFindMany = jest.fn<any>();
const mockConversationFindFirst = jest.fn<any>();
const mockConversationUpdate   = jest.fn<any>();

const mockPrisma: any = {
  community: {
    findUnique:  (...args: any[]) => mockCommunityFindUnique(...args),
    findFirst:   (...args: any[]) => mockCommunityFindFirst(...args),
    findMany:    (...args: any[]) => mockCommunityFindMany(...args),
    count:       (...args: any[]) => mockCommunityCount(...args),
    create:      (...args: any[]) => mockCommunityCreate(...args),
  },
  conversation: {
    findMany:  (...args: any[]) => mockConversationFindMany(...args),
    findFirst: (...args: any[]) => mockConversationFindFirst(...args),
    update:    (...args: any[]) => mockConversationUpdate(...args),
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
  app.register(registerCoreRoutes);
  return app;
}

function makeCommunity(overrides: any = {}): any {
  return {
    id: COMMUNITY_ID,
    name: 'Test Community',
    identifier: 'mshy_test_community',
    description: 'A test community',
    avatar: null,
    isPrivate: false,
    createdBy: USER_ID,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    creator: { id: USER_ID, username: 'testuser', displayName: 'Test User', avatar: null },
    members: [{ userId: USER_ID, role: 'admin', user: { id: USER_ID, username: 'testuser' } }],
    _count: { members: 1, Conversation: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /communities/check-identifier/:identifier
// ---------------------------------------------------------------------------

describe('GET /communities/check-identifier/:identifier', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindUnique.mockReset();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with available=true when identifier is free', async () => {
    mockCommunityFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/communities/check-identifier/mshy_new_community',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(true);
    expect(body.data.identifier).toBe('mshy_new_community');
  });

  it('returns 200 with available=false when identifier is taken', async () => {
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
    mockCommunityFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/communities/check-identifier/mshy_test_community',
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /communities
// ---------------------------------------------------------------------------

describe('GET /communities', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindMany.mockReset();
    mockCommunityCount.mockReset();
    app = buildApp();
    mockCommunityFindMany.mockResolvedValue([makeCommunity()]);
    mockCommunityCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with communities list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'GET', url: '/communities' });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('supports search query', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities?search=test' });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) })
    );
  });

  it('supports pagination with offset and limit', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities?offset=10&limit=5' });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });

  it('returns 500 on DB error', async () => {
    mockCommunityFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /communities/:id
// ---------------------------------------------------------------------------

describe('GET /communities/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindFirst.mockReset();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(makeCommunity());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with community data', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user has no access to private community', async () => {
    mockCommunityFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(
      makeCommunity({ isPrivate: true, createdBy: 'other-user', members: [] })
    );
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 for public community even without membership', async () => {
    mockCommunityFindFirst.mockResolvedValue(
      makeCommunity({ isPrivate: false, createdBy: 'other-user', members: [] })
    );
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
  });

  it('falls back to identifier lookup when id not found', async () => {
    mockCommunityFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCommunity());
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities/mshy_test_community' });
    expect(res.statusCode).toBe(200);
    expect(mockCommunityFindFirst).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on DB error', async () => {
    mockCommunityFindFirst.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /communities
// ---------------------------------------------------------------------------

describe('POST /communities', () => {
  let app: FastifyInstance;
  const validPayload = { name: 'My Community', description: 'A test community' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindUnique.mockReset();
    mockCommunityCreate.mockReset();
    app = buildApp();
    mockCommunityFindUnique.mockResolvedValue(null);
    mockCommunityCreate.mockResolvedValue(makeCommunity());
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful creation', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls community.create with correct data', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/communities',
      payload: validPayload,
    });
    expect(mockCommunityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'My Community',
          createdBy: USER_ID,
        }),
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'POST', url: '/communities',
      payload: validPayload,
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 409 when identifier already exists', async () => {
    mockCommunityFindUnique.mockResolvedValue(makeCommunity());
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on DB error during creation', async () => {
    mockCommunityCreate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /communities/:id/conversations
// ---------------------------------------------------------------------------

describe('GET /communities/:id/conversations', () => {
  let app: FastifyInstance;

  const mockCommunity = {
    createdBy: USER_ID,
    isPrivate: false,
    members: [{ userId: USER_ID }],
  };

  const mockConversation = {
    id: CONVERSATION_ID,
    communityId: COMMUNITY_ID,
    participants: [],
    _count: { messages: 0, participants: 0 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindFirst.mockReset();
    mockConversationFindMany.mockReset();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(mockCommunity);
    mockConversationFindMany.mockResolvedValue([mockConversation]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with conversations list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user has no access to private community', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      createdBy: 'other-user',
      isPrivate: true,
      members: [],
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    mockConversationFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /communities/:id/conversations/:conversationId
// ---------------------------------------------------------------------------

describe('POST /communities/:id/conversations/:conversationId', () => {
  let app: FastifyInstance;

  const mockCommunity = {
    id: COMMUNITY_ID,
    createdBy: USER_ID,
    members: [{ userId: USER_ID, role: 'admin' }],
  };

  const mockConversation = {
    id: CONVERSATION_ID,
    communityId: null,
    participants: [{ userId: USER_ID, role: 'admin' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindFirst.mockReset();
    mockConversationFindFirst.mockReset();
    mockConversationUpdate.mockReset();
    app = buildApp();
    mockCommunityFindFirst.mockResolvedValue(mockCommunity);
    mockConversationFindFirst.mockResolvedValue(mockConversation);
    mockConversationUpdate.mockResolvedValue({ ...mockConversation, communityId: COMMUNITY_ID });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on success', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls conversation.update with correct communityId', async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(mockConversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONVERSATION_ID },
        data: { communityId: COMMUNITY_ID },
      })
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const unauthedApp = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthedApp.ready();
    const res = await unauthedApp.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    await unauthedApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when community not found', async () => {
    mockCommunityFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not creator or admin', async () => {
    mockCommunityFindFirst.mockResolvedValue({
      id: COMMUNITY_ID,
      createdBy: 'other-user',
      members: [{ userId: USER_ID, role: 'member' }],
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when conversation not found', async () => {
    mockConversationFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockConversationUpdate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});
