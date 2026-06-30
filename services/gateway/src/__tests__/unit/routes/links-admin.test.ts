import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>(() => async (req: any) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn<any>((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

jest.mock('../../../routes/links/types', () => ({
  shareLinkSchema: { type: 'object', properties: {}, additionalProperties: true },
  conversationSummarySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSchema: { type: 'object', properties: {}, additionalProperties: true },
  updateLinkSchema: { parse: (b: any) => b },
  updateLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  createLinkSchema: { parse: (b: any) => b },
  createLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  sendMessageSchema: { parse: (b: any) => b },
  sendMessageBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSenderSchema: { type: 'object', additionalProperties: true },
  SendMessageInput: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerAdminRoutes } from '../../../routes/links/admin';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const LINK_DB_ID = '507f1f77bcf86cd799439033';
const LINK_PUBLIC_ID = 'mshy_abc123_def456';
const CONV_ID = '507f1f77bcf86cd799439044';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(0),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

function makeShareLink(overrides: Record<string, any> = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_PUBLIC_ID,
    createdBy: USER_ID,
    conversationId: CONV_ID,
    currentUses: 5,
    allowedLanguages: ['fr', 'en'],
    conversation: {
      id: CONV_ID,
      title: 'Test Conv',
      type: 'group',
      description: null,
      participants: [],
    },
    ...overrides,
  };
}

function makeRegisteredAuthContext(overrides: Record<string, any> = {}) {
  return {
    type: 'registered' as const,
    registeredUser: {
      id: USER_ID,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      avatar: null,
      role: 'USER',
      ...overrides,
    },
  };
}

async function buildApp({
  authContext = makeRegisteredAuthContext(),
  prisma = makePrisma(),
}: {
  authContext?: any;
  prisma?: any;
} = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req) => {
    (req as any)._testAuthContext = authContext;
  });

  await registerAdminRoutes(app);
  await app.ready();
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /links/my-links
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /links/my-links', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when auth context is null', async () => {
    const app = await buildApp({ authContext: null });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 when user is anonymous (no registeredUser)', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 with empty list when no links exist', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    await app.close();
  });

  it('returns 200 with transformed links including stats and conversationUrl', async () => {
    const prisma = makePrisma();
    const link = makeShareLink({
      currentUses: 3,
      allowedLanguages: ['fr', 'en', 'de'],
      conversation: { id: CONV_ID, title: 'My Conv', type: 'group', description: 'Desc' },
    });
    prisma.conversationShareLink.count.mockResolvedValue(1);
    prisma.conversationShareLink.findMany.mockResolvedValue([link]);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    const result = body.data[0];
    expect(result.conversation.conversationUrl).toBe(`/conversations/${CONV_ID}`);
    expect(result.creator).toBeDefined();
    expect(result.stats.totalParticipants).toBe(3);
    expect(result.stats.languageCount).toBe(3);
    expect(result.stats.spokenLanguages).toEqual(['fr', 'en', 'de']);
    await app.close();
  });

  it('handles link with null currentUses (defaults to 0)', async () => {
    const prisma = makePrisma();
    const link = makeShareLink({ currentUses: null, allowedLanguages: null });
    prisma.conversationShareLink.count.mockResolvedValue(1);
    prisma.conversationShareLink.findMany.mockResolvedValue([link]);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].stats.totalParticipants).toBe(0);
    expect(body.data[0].stats.anonymousCount).toBe(0);
    expect(body.data[0].stats.languageCount).toBe(0);
    expect(body.data[0].stats.spokenLanguages).toEqual([]);
    await app.close();
  });

  it('applies default limit=20 and offset=0 when not specified', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
    await app.close();
  });

  it('respects provided limit and offset query params', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(100);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links?limit=10&offset=30' });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 30, take: 10 })
    );
    await app.close();
  });

  it('caps limit at 50 even when higher value is requested', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links?limit=200' });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
    await app.close();
  });

  it('returns correct pagination meta with hasMore=true', async () => {
    const prisma = makePrisma();
    const links = Array.from({ length: 10 }, (_, i) =>
      makeShareLink({ id: `id-${i}`, linkId: `link-${i}` })
    );
    prisma.conversationShareLink.count.mockResolvedValue(50);
    prisma.conversationShareLink.findMany.mockResolvedValue(links);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links?limit=10&offset=0' });
    const body = JSON.parse(res.body);
    expect(body.pagination.total).toBe(50);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.offset).toBe(0);
    await app.close();
  });

  it('returns hasMore=false when on last page', async () => {
    const prisma = makePrisma();
    const links = Array.from({ length: 5 }, (_, i) =>
      makeShareLink({ id: `id-${i}`, linkId: `link-${i}` })
    );
    prisma.conversationShareLink.count.mockResolvedValue(25);
    prisma.conversationShareLink.findMany.mockResolvedValue(links);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links?limit=10&offset=20' });
    const body = JSON.parse(res.body);
    expect(body.pagination.hasMore).toBe(false);
    await app.close();
  });

  it('filters by authenticated user id', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(prisma.conversationShareLink.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: USER_ID } })
    );
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: USER_ID } })
    );
    await app.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when findMany throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(5);
    prisma.conversationShareLink.findMany.mockRejectedValue(new Error('Query failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /links/:linkId/toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /links/:linkId/toggle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when user is not registered', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not admin/moderator', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: { id: CONV_ID, participants: [] },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant has non-admin role', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'MEMBER', isActive: true }],
        },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 when user is the link creator (activate)', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      isActive: true,
      conversation: {
        id: CONV_ID,
        title: 'Test',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: USER_ID,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        displayName: null,
        avatar: null,
      },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Lien activé avec succès');
    await app.close();
  });

  it('returns 200 when user is the link creator (deactivate)', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      isActive: false,
      conversation: {
        id: CONV_ID,
        title: 'Test',
        description: null,
        type: 'group',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: USER_ID,
        username: 'testuser',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Lien désactivé avec succès');
    await app.close();
  });

  it('returns 200 when user is conversation ADMIN', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      isActive: true,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'ADMIN', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is conversation MODERATOR', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      isActive: false,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'MODERATOR', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('calls update with correct isActive value', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_DB_ID },
        data: { isActive: true },
      })
    );
    await app.close();
  });

  it('returns 500 on DB findFirst error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockRejectedValue(new Error('Write failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /links/:linkId/extend
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /links/:linkId/extend', () => {
  beforeEach(() => jest.clearAllMocks());

  const FUTURE_DATE = '2030-12-31T23:59:59Z';

  it('returns 403 when user is not registered', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not admin/moderator', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: { id: CONV_ID, participants: [] },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant has non-privileged role', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'MEMBER', isActive: true }],
        },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 when user is link creator', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      expiresAt: new Date(FUTURE_DATE),
      conversation: {
        id: CONV_ID,
        title: 'Test',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: USER_ID,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        displayName: null,
        avatar: null,
      },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Lien prolongé avec succès');
    await app.close();
  });

  it('returns 200 when user is ADMIN in conversation', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'ADMIN', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is MODERATOR in conversation', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'MODERATOR', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('converts expiresAt string to a Date object when updating', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    const updateCall = prisma.conversationShareLink.update.mock.calls[0][0];
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
    expect(updateCall.data.expiresAt.toISOString()).toBe(new Date(FUTURE_DATE).toISOString());
    await app.close();
  });

  it('returns 500 on DB findFirst error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockRejectedValue(new Error('Write failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /links/:linkId
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /links/:linkId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when user is not registered', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not admin/moderator', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: { id: CONV_ID, participants: [] },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant has non-privileged role', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'MEMBER', isActive: true }],
        },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 and deletes link when user is creator', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.delete.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Lien supprimé avec succès');
    await app.close();
  });

  it('returns 200 when user is conversation ADMIN', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'ADMIN', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.delete.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    await app.close();
  });

  it('returns 200 when user is conversation MODERATOR', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'MODERATOR', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.delete.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('calls prisma.delete with the link db id', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.delete.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({ method: 'DELETE', url: `/links/${LINK_PUBLIC_ID}` });
    expect(prisma.conversationShareLink.delete).toHaveBeenCalledWith({
      where: { id: LINK_DB_ID },
    });
    await app.close();
  });

  it('returns 500 on DB findFirst error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when delete throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.delete.mockRejectedValue(new Error('Delete failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
