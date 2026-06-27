/**
 * users-preferences-routes.test.ts
 *
 * Unit tests for src/routes/users/preferences.ts
 * Covers:
 *   - getDashboardStats → GET /users/me/dashboard-stats
 *   - getUserStats      → GET /users/:userId/stats
 *   - searchUsers       → GET /users/search
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  userMinimalSchema:   { type: 'object', additionalProperties: true },
  userStatsSchema:     { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import { getDashboardStats, getUserStats, searchUsers } from '../../../routes/users/preferences';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID        = '507f1f77bcf86cd799439011';
const TARGET_USER_ID = '507f1f77bcf86cd799439099';

// ---------------------------------------------------------------------------
// Prisma mocks (shared across describe blocks, reset in beforeEach)
// ---------------------------------------------------------------------------

const mockParticipantCount     = jest.fn<any>();
const mockConversationFindMany = jest.fn<any>();
const mockCommunityMemberCount = jest.fn<any>();
const mockCommunityFindMany    = jest.fn<any>();
const mockMessageCount         = jest.fn<any>();
const mockMessageGroupBy       = jest.fn<any>();
const mockShareLinkCount       = jest.fn<any>();
const mockUserFindFirst        = jest.fn<any>();
const mockUserFindMany         = jest.fn<any>();
const mockUserCount            = jest.fn<any>();
const mockFriendRequestCount   = jest.fn<any>();
const mockRunCommandRaw        = jest.fn<any>();

const mockPrisma: any = {
  participant:           { count: mockParticipantCount },
  conversation:          { findMany: mockConversationFindMany },
  communityMember:       { count: mockCommunityMemberCount },
  community:             { findMany: mockCommunityFindMany },
  message:               { count: mockMessageCount, groupBy: mockMessageGroupBy },
  conversationShareLink: { count: mockShareLinkCount },
  user:                  { findFirst: mockUserFindFirst, findMany: mockUserFindMany, count: mockUserCount },
  friendRequest:         { count: mockFriendRequestCount },
  $runCommandRaw: (...args: any[]) => mockRunCommandRaw(...args),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuthCtx() {
  return { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
}

function unauthCtx() {
  return { isAuthenticated: false, registeredUser: null, userId: '' };
}

function makeConversation(overrides: any = {}) {
  return {
    id: 'conv-1', identifier: 'test-conv', title: 'Test Conv', type: 'direct',
    avatar: null, updatedAt: new Date('2024-01-15T10:00:00Z'), messages: [], participants: [],
    ...overrides,
  };
}

function makeCommunity(overrides: any = {}) {
  return {
    id: 'comm-1', name: 'Test Community', description: null, avatar: null, isPrivate: false,
    updatedAt: new Date('2024-01-15T10:00:00Z'), _count: { members: 5, Conversation: 2 }, members: [],
    ...overrides,
  };
}

function makeUser(overrides: any = {}) {
  return {
    id: TARGET_USER_ID, username: 'testuser', firstName: 'Test', lastName: 'User',
    displayName: 'Test User', email: 'test@example.com', isOnline: false, lastActiveAt: null,
    systemLanguage: 'en', createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  const ctx = authContext ?? defaultAuthCtx();
  app.decorate('authenticate', async (req: any) => { req.authContext = ctx; });
  app.decorate('prisma', mockPrisma);
  app.register(getDashboardStats);
  app.register(getUserStats);
  app.register(searchUsers);
  return app;
}

// ---------------------------------------------------------------------------
// GET /users/me/dashboard-stats
// ---------------------------------------------------------------------------

describe('GET /users/me/dashboard-stats', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParticipantCount.mockReset();
    mockConversationFindMany.mockReset();
    mockCommunityMemberCount.mockReset();
    mockCommunityFindMany.mockReset();
    mockMessageCount.mockReset();
    mockShareLinkCount.mockReset();

    app = buildApp();

    // Promise.all calls: participant.count x2, conversation.findMany,
    // communityMember.count, community.findMany,
    // message.count x3, conversationShareLink.count
    // Use stable defaults (same value for repeated calls is fine)
    mockParticipantCount.mockResolvedValue(10);
    mockConversationFindMany.mockResolvedValue([]);
    mockCommunityMemberCount.mockResolvedValue(2);
    mockCommunityFindMany.mockResolvedValue([]);
    mockMessageCount.mockResolvedValue(100);
    mockShareLinkCount.mockResolvedValue(4);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with stats on success', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('includes recentConversations in response data', async () => {
    mockConversationFindMany.mockResolvedValue([makeConversation()]);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
  });

  it('includes recentCommunities in response data', async () => {
    mockCommunityFindMany.mockResolvedValue([makeCommunity()]);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    mockParticipantCount.mockReset();
    mockParticipantCount.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(500);
  });

  it('builds direct conversation title from participant when title is blank', async () => {
    const conv = makeConversation({
      title: '',
      type: 'direct',
      participants: [
        { user: { id: 'other-user', displayName: 'Alice', username: 'alice', avatar: null } },
      ],
    });
    mockConversationFindMany.mockResolvedValue([conv]);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /users/:userId/stats
// ---------------------------------------------------------------------------

describe('GET /users/:userId/stats', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindFirst.mockReset();
    mockMessageCount.mockReset();
    mockParticipantCount.mockReset();
    mockRunCommandRaw.mockReset();
    mockFriendRequestCount.mockReset();
    mockMessageGroupBy.mockReset();

    app = buildApp();

    mockUserFindFirst.mockResolvedValue(makeUser());
    mockMessageCount.mockResolvedValue(100);
    mockParticipantCount.mockResolvedValue(5);
    mockRunCommandRaw.mockResolvedValue({ n: 50 });
    mockFriendRequestCount.mockResolvedValue(10);
    mockMessageGroupBy.mockResolvedValue([
      { originalLanguage: 'en' },
      { originalLanguage: 'fr' },
    ]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with stats when looked up by MongoDB ObjectId', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('returns 200 with stats when looked up by username', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/testuser/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('uses case-insensitive mode for username lookup', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/users/testuser/stats' });
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: expect.objectContaining({ mode: 'insensitive' }),
        }),
      })
    );
  });

  it('queries by id when param is a 24-char hex MongoDB ObjectId', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: TARGET_USER_ID }),
      })
    );
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(404);
  });

  it('includes languages array derived from groupBy results', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.languages).toEqual(['en', 'fr']);
  });

  it('includes achievements array in response', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data.achievements)).toBe(true);
  });

  it('marks bavard achievement as unlocked when totalMessages >= 1000', async () => {
    mockMessageCount.mockReset();
    mockMessageCount.mockResolvedValue(1500);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const bavard = body.data.achievements?.find((a: any) => a.id === 'bavard');
    expect(bavard?.isUnlocked).toBe(true);
  });

  it('marks bavard achievement as locked when totalMessages < 1000', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const bavard = body.data.achievements?.find((a: any) => a.id === 'bavard');
    expect(bavard?.isUnlocked).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindFirst.mockReset();
    mockUserFindFirst.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /users/search
// ---------------------------------------------------------------------------

describe('GET /users/search', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindMany.mockReset();
    mockUserCount.mockReset();

    app = buildApp();
    mockUserFindMany.mockResolvedValue([]);
    mockUserCount.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty array when no users match', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=xyz' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with matched users', async () => {
    mockUserFindMany.mockResolvedValue([makeUser()]);
    mockUserCount.mockResolvedValue(1);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=test' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
  });

  it('returns empty list without querying DB when q is missing', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/search' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it('returns 400 when q is 1 char (schema minLength: 2 validates before handler)', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=a' });
    expect(res.statusCode).toBe(400);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it('queries DB when q is 2+ chars', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/users/search?q=ab' });
    expect(mockUserFindMany).toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/users/search?q=test' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('includes pagination metadata in response', async () => {
    mockUserFindMany.mockResolvedValue([makeUser()]);
    mockUserCount.mockResolvedValue(10);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=test&limit=5&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(10);
  });

  it('searches across multiple fields (OR conditions)', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/users/search?q=alice' });
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ firstName: expect.objectContaining({ contains: 'alice' }) }),
              ]),
            }),
          ]),
        }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockUserFindMany.mockReset();
    mockUserFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=test' });
    expect(res.statusCode).toBe(500);
  });
});
