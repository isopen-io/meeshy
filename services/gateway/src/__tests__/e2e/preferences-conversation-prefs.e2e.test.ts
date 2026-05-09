/**
 * E2E Tests for PUT /api/user-preferences/conversations/:conversationId
 * Specifically covers categoryId ownership validation.
 */

import Fastify, { FastifyInstance } from 'fastify';
import conversationPreferencesRoutes from '../../routes/conversation-preferences';

// Mock auth middleware. The PUT handler reads `request.authContext` (UnifiedAuthRequest),
// which is set on the request object by the unified auth middleware in production.
jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'user-A',
      isAnonymous: false
    };
  })
}));

describe('E2E: PUT /api/user-preferences/conversations/:conversationId — categoryId ownership', () => {
  let app: FastifyInstance;
  const mockPrisma = {
    userConversationPreferences: { upsert: jest.fn() },
    userConversationCategory: { findUnique: jest.fn() }
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    (app as any).prisma = mockPrisma;
    // The route handler relies on fastify.authenticate as preValidation. We supply a stub
    // decorator that injects the same authContext the unified middleware would have set.
    app.decorate('authenticate', async (request: any) => {
      request.authContext = {
        isAuthenticated: true,
        registeredUser: true,
        userId: 'user-A',
        isAnonymous: false
      };
    });
    await app.register(conversationPreferencesRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects categoryId belonging to another user with 400 INVALID_CATEGORY_ID', async () => {
    mockPrisma.userConversationCategory.findUnique.mockResolvedValue({
      id: 'cat-of-user-B',
      userId: 'user-B'
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: 'cat-of-user-B' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_CATEGORY_ID');
    expect(mockPrisma.userConversationPreferences.upsert).not.toHaveBeenCalled();
  });

  it('rejects categoryId that does not exist', async () => {
    mockPrisma.userConversationCategory.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: 'does-not-exist' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_CATEGORY_ID');
    expect(mockPrisma.userConversationPreferences.upsert).not.toHaveBeenCalled();
  });

  it('accepts categoryId owned by the authenticated user', async () => {
    mockPrisma.userConversationCategory.findUnique.mockResolvedValue({
      id: 'cat-of-A',
      userId: 'user-A'
    });
    mockPrisma.userConversationPreferences.upsert.mockResolvedValue({
      id: 'p1',
      userId: 'user-A',
      conversationId: 'conv-1',
      categoryId: 'cat-of-A',
      isPinned: false,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      customName: null,
      reaction: null,
      orderInCategory: null,
      category: { id: 'cat-of-A', name: 'Family', color: null, icon: null }
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: 'cat-of-A' }
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.userConversationPreferences.upsert).toHaveBeenCalled();
  });

  it('skips validation when categoryId is null (uncategorize)', async () => {
    mockPrisma.userConversationPreferences.upsert.mockResolvedValue({
      id: 'p1',
      userId: 'user-A',
      conversationId: 'conv-1',
      categoryId: null,
      isPinned: false,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      customName: null,
      reaction: null,
      orderInCategory: null
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: null }
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.userConversationCategory.findUnique).not.toHaveBeenCalled();
  });
});
