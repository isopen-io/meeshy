/**
 * links-messages-retrieval-routes.test.ts
 *
 * Unit tests for src/routes/links/messages-retrieval.ts
 * Covers: GET /links/:identifier/messages
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

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../routes/links/types', () => ({
  conversationSummarySchema: { type: 'object', additionalProperties: true },
  messageSchema: { type: 'object', additionalProperties: true },
}));

const mockCreateLegacyHybridRequest = jest.fn<any>();
jest.mock('../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: (...args: any[]) => mockCreateLegacyHybridRequest(...args),
}));

const mockGetMessagesWithDetails = jest.fn<any>();
const mockCountConversationMessages = jest.fn<any>();
jest.mock('../../../routes/links/utils/prisma-queries', () => ({
  getConversationMessagesWithDetails: (...args: any[]) => mockGetMessagesWithDetails(...args),
  countConversationMessages:          (...args: any[]) => mockCountConversationMessages(...args),
}));

const mockFormatMessageWithSeparateSenders = jest.fn<any>();
jest.mock('../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithSeparateSenders: (...args: any[]) => mockFormatMessageWithSeparateSenders(...args),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerMessagesRetrievalRoutes } from '../../../routes/links/messages-retrieval';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID    = '507f1f77bcf86cd799439011';
const LINK_ID    = 'mshy_507f1f77bcf86cd799439012_abc';
const LINK_DB_ID = '507f1f77bcf86cd799439012';
const CONV_ID    = '507f1f77bcf86cd799439013';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationShareLink = {
  findUnique: jest.fn<any>(),
};

const mockParticipant = {
  findFirst: jest.fn<any>(),
};

const mockPrisma: any = {
  conversationShareLink: mockConversationShareLink,
  participant: mockParticipant,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
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
  app.register(registerMessagesRetrievalRoutes);
  return app;
}

function makeShareLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID,
    conversationId: CONV_ID,
    isActive: true,
    allowViewHistory: true,
    conversation: { id: CONV_ID, title: 'Test', type: 'public' },
    ...overrides,
  };
}

function makeMessage(overrides: any = {}) {
  return {
    id: 'msg-1',
    content: 'Hello',
    createdAt: new Date('2024-01-15'),
    originalLanguage: 'en',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /links/:identifier/messages
// ---------------------------------------------------------------------------

describe('GET /links/:identifier/messages', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockFormatMessageWithSeparateSenders.mockImplementation((msg: any) => msg);
    mockGetMessagesWithDetails.mockResolvedValue([]);
    mockCountConversationMessages.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 404 when share link not found (by linkId)', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({ isAuthenticated: false, user: null, isAnonymous: false, anonymousParticipant: null });
    mockConversationShareLink.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when share link not found (by DB id)', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({ isAuthenticated: false, user: null, isAnonymous: false, anonymousParticipant: null });
    mockConversationShareLink.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_DB_ID}/messages`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with messages for registered member (by linkId)', async () => {
    await app.ready();
    const message = makeMessage();
    mockCreateLegacyHybridRequest.mockReturnValue({
      isAuthenticated: true,
      user: { id: USER_ID },
      isAnonymous: false,
      anonymousParticipant: null,
    });
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink());
    mockParticipant.findFirst.mockResolvedValue({ id: 'part-1', userId: USER_ID });
    mockGetMessagesWithDetails.mockResolvedValue([message]);
    mockCountConversationMessages.mockResolvedValue(1);
    mockFormatMessageWithSeparateSenders.mockReturnValue(message);

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.conversation).toBeDefined();
  });

  it('returns 200 for anonymous participant with matching shareLinkId', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isAnonymous: true,
      anonymousParticipant: { shareLinkId: LINK_DB_ID },
    });
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink());
    mockGetMessagesWithDetails.mockResolvedValue([makeMessage()]);
    mockCountConversationMessages.mockResolvedValue(1);
    mockFormatMessageWithSeparateSenders.mockReturnValue(makeMessage());

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 403 for registered user who is not a conversation member', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({
      isAuthenticated: true,
      user: { id: USER_ID },
      isAnonymous: false,
      anonymousParticipant: null,
    });
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink());
    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for anonymous with wrong shareLinkId', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isAnonymous: true,
      anonymousParticipant: { shareLinkId: 'different-link-id' },
    });
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink());

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for unauthenticated user with no anonymous participant', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isAnonymous: false,
      anonymousParticipant: null,
    });
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink());

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('passes pagination params to getConversationMessagesWithDetails', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({
      isAuthenticated: true,
      user: { id: USER_ID },
      isAnonymous: false,
      anonymousParticipant: null,
    });
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink());
    mockParticipant.findFirst.mockResolvedValue({ id: 'part-1', userId: USER_ID });

    await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages?limit=10&offset=20`,
    });

    expect(mockGetMessagesWithDetails).toHaveBeenCalledWith(
      expect.anything(), CONV_ID, 10, 20
    );
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockCreateLegacyHybridRequest.mockReturnValue({
      isAuthenticated: true,
      user: { id: USER_ID },
      isAnonymous: false,
      anonymousParticipant: null,
    });
    mockConversationShareLink.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/links/${LINK_ID}/messages`,
    });

    expect(res.statusCode).toBe(500);
  });
});
