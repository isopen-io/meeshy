/**
 * links-validation-retrieval-routes.test.ts
 *
 * Unit tests for src/routes/links/validation.ts and src/routes/links/retrieval.ts
 * Covers:
 *   GET /links/check-identifier/:identifier
 *   GET /links/:identifier
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.type === 'registered'),
  UnifiedAuthRequest: {},
}));

const mockFindShareLink    = jest.fn<any>();
const mockGetMessages      = jest.fn<any>();
const mockCountMessages    = jest.fn<any>();
const mockFormatMessage    = jest.fn<any>();

jest.mock('../../../routes/links/utils/prisma-queries', () => ({
  findShareLinkByIdentifier: (...args: any[]) => mockFindShareLink(...args),
  getConversationMessages:   (...args: any[]) => mockGetMessages(...args),
  countConversationMessages: (...args: any[]) => mockCountMessages(...args),
  shareLinkIncludeStructure: {},
}));

jest.mock('../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithUnifiedSender: (...args: any[]) => mockFormatMessage(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { registerValidationRoutes } from '../../../routes/links/validation';
import { registerRetrievalRoutes }  from '../../../routes/links/retrieval';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID  = '507f1f77bcf86cd799439011';
const LINK_ID  = 'mshy_test-link-123';
const LINK_DB_ID = '507f1f77bcf86cd799439012';
const CONV_ID  = '507f1f77bcf86cd799439013';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationShareLink = {
  findFirst: jest.fn<any>(),
};

const mockPrisma: any = {
  conversationShareLink: mockConversationShareLink,
};

// ---------------------------------------------------------------------------
// App builders
// ---------------------------------------------------------------------------

function buildValidationApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        type: 'registered',
        registeredUser: { id: USER_ID, role: 'USER' },
        userId: USER_ID,
        hasFullAccess: true,
      };
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.register(registerValidationRoutes);
  return app;
}

function buildRetrievalApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        type: 'registered',
        registeredUser: { id: USER_ID, role: 'USER', username: 'alice', firstName: 'Alice', lastName: 'A', displayName: null, systemLanguage: 'en' },
        userId: USER_ID,
        hasFullAccess: true,
      };
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.register(registerRetrievalRoutes);
  return app;
}

function makeShareLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID,
    conversationId: CONV_ID,
    isActive: true,
    allowViewHistory: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: true,
    requireEmail: false,
    requireNickname: true,
    name: null,
    description: null,
    expiresAt: null,
    conversation: {
      id: CONV_ID,
      identifier: 'test-conv',
      title: 'Test Conversation',
      description: null,
      type: 'public',
      createdAt: new Date('2024-01-15'),
      participants: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /links/check-identifier/:identifier
// ---------------------------------------------------------------------------

describe('GET /links/check-identifier/:identifier', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildValidationApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with available: true when identifier is free', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/links/check-identifier/my-link',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(true);
    expect(body.data.identifier).toBe('my-link');
  });

  it('returns 200 with available: false when identifier is taken', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue({ id: LINK_DB_ID, linkId: 'mshy_my-link' });

    const res = await app.inject({
      method: 'GET',
      url: '/links/check-identifier/my-link',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.available).toBe(false);
    expect(body.data.identifier).toBe('my-link');
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockRejectedValue(new Error('DB connection error'));

    const res = await app.inject({
      method: 'GET',
      url: '/links/check-identifier/my-link',
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /links/:identifier
// ---------------------------------------------------------------------------

describe('GET /links/:identifier', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildRetrievalApp();
    mockFormatMessage.mockImplementation((msg: any) => msg);
    mockGetMessages.mockResolvedValue([]);
    mockCountMessages.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    await app.ready();
    mockFindShareLink.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 for authenticated member with redirectTo', async () => {
    await app.ready();
    mockFindShareLink.mockResolvedValue(makeShareLink({
      conversation: {
        id: CONV_ID,
        identifier: 'test-conv',
        title: 'Test Conversation',
        description: null,
        type: 'public',
        createdAt: new Date('2024-01-15'),
        participants: [
          {
            id: 'part-1',
            type: 'user',
            userId: USER_ID,
            isActive: true,
            role: 'member',
            joinedAt: new Date('2024-01-10'),
            user: {
              id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'A',
              displayName: null, avatar: null, isOnline: true, lastActiveAt: null,
            },
            displayName: 'Alice', avatar: null, language: 'en', isOnline: true,
            canSendMessages: true, canSendFiles: true, canSendImages: true, permissions: {},
          },
        ],
      },
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.userType).toBe('member');
    expect(body.data.redirectTo).toBe(`/conversations/${CONV_ID}`);
    expect(body.data.link.id).toBe(LINK_DB_ID);
  });

  it('returns 200 for unauthenticated user on public link with allowViewHistory', async () => {
    const unauthApp = buildRetrievalApp({ type: 'unauthenticated', userId: null });
    await unauthApp.ready();

    mockFindShareLink.mockResolvedValue(makeShareLink({ isActive: true, allowViewHistory: true }));

    const res = await unauthApp.inject({
      method: 'GET',
      url: `/links/${LINK_ID}`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 403 for unauthenticated user on link with allowViewHistory: false', async () => {
    const unauthApp = buildRetrievalApp({ type: 'unauthenticated', userId: null });
    await unauthApp.ready();

    mockFindShareLink.mockResolvedValue(makeShareLink({ isActive: true, allowViewHistory: false }));

    const res = await unauthApp.inject({
      method: 'GET',
      url: `/links/${LINK_ID}`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for authenticated user not a member of private link', async () => {
    await app.ready();
    mockFindShareLink.mockResolvedValue(makeShareLink({
      conversation: {
        id: CONV_ID,
        identifier: 'private-conv',
        title: 'Private',
        description: null,
        type: 'group',
        createdAt: new Date(),
        participants: [
          {
            id: 'part-2', type: 'user', userId: 'other-user',
            isActive: true, role: 'member', joinedAt: new Date(),
            user: { id: 'other-user', username: 'bob', firstName: 'Bob', lastName: 'B', displayName: null, avatar: null, isOnline: false, lastActiveAt: null },
            displayName: 'Bob', avatar: null, language: 'en', isOnline: false,
            canSendMessages: true, canSendFiles: true, canSendImages: true, permissions: {},
          },
        ],
      },
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with messages and stats (unauthenticated on public link)', async () => {
    // Use unauthenticated context so hasAccess = isActive && allowViewHistory = true
    const publicApp = buildRetrievalApp({ type: 'unauthenticated', userId: null });
    await publicApp.ready();

    const message = { id: 'msg-1', content: 'Hello', createdAt: new Date(), originalLanguage: 'en' };
    mockFindShareLink.mockResolvedValue(makeShareLink({ isActive: true, allowViewHistory: true }));
    mockGetMessages.mockResolvedValue([message]);
    mockCountMessages.mockResolvedValue(1);
    mockFormatMessage.mockReturnValue({ id: 'msg-1', content: 'Hello' });

    const res = await publicApp.inject({
      method: 'GET',
      url: `/links/${LINK_ID}`,
    });
    await publicApp.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.stats.totalMessages).toBe(1);
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(), CONV_ID, 50, 0
    );
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockFindShareLink.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}`,
    });

    expect(res.statusCode).toBe(500);
  });
});
