/**
 * E2E Tests for /me/preferences/conversation-tags route
 * Tests aggregation of distinct tags across user's conversation preferences.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { conversationTagsRoutes } from '../../routes/me/preferences/conversation-tags';

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any) => {
    request.auth = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'test-user-123',
      isAnonymous: false
    };
  })
}));

describe('E2E: GET /me/preferences/conversation-tags', () => {
  let app: FastifyInstance;
  const mockPrisma = {
    userConversationPreferences: {
      findMany: jest.fn()
    }
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    (app as any).prisma = mockPrisma;
    await app.register(conversationTagsRoutes, { prefix: '/me/preferences/conversation-tags' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns deduplicated, sorted tags', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([
      { tags: ['urgent', 'family'] },
      { tags: ['family', 'work'] },
      { tags: [] },
      { tags: ['urgent'] }
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.tags).toEqual(['family', 'urgent', 'work']);
  });

  it('returns empty array when no tags exist', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.tags).toEqual([]);
  });

  it('trims whitespace and ignores blanks', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([
      { tags: ['  urgent  ', '', '   ', 'family'] }
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.json().data.tags).toEqual(['family', 'urgent']);
  });

  it('scopes query to authenticated user', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([]);

    await app.inject({ method: 'GET', url: '/me/preferences/conversation-tags' });

    expect(mockPrisma.userConversationPreferences.findMany).toHaveBeenCalledWith({
      where: { userId: 'test-user-123', tags: { isEmpty: false } },
      select: { tags: true }
    });
  });

  it('returns 500 on prisma failure', async () => {
    mockPrisma.userConversationPreferences.findMany.mockRejectedValue(new Error('boom'));

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});
