/**
 * Unit tests for links/retrieval routes.
 * Tests GET /links/:identifier
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  UnifiedAuthRequest: {},
}));

const mockAuthMiddleware = jest.fn<any>();

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

// Mock the link utility functions
const mockFindShareLinkByIdentifier = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>().mockResolvedValue([]);
const mockCountConversationMessages = jest.fn<any>().mockResolvedValue(0);
const mockFormatMessageWithUnifiedSender = jest.fn<any>((msg: any) => msg);
const mockCreateLegacyHybridRequest = jest.fn<any>();

jest.mock('../../../routes/links/utils/prisma-queries', () => ({
  findShareLinkByIdentifier: (...a: any[]) => mockFindShareLinkByIdentifier(...a),
  getConversationMessages: (...a: any[]) => mockGetConversationMessages(...a),
  countConversationMessages: (...a: any[]) => mockCountConversationMessages(...a),
}));

jest.mock('../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithUnifiedSender: (...a: any[]) => mockFormatMessageWithUnifiedSender(...a),
}));

jest.mock('../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: (...a: any[]) => mockCreateLegacyHybridRequest(...a),
}));

jest.mock('../../../routes/links/types', () => ({
  conversationSummarySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSchema: { type: 'object', properties: {}, additionalProperties: true },
  updateLinkSchema: { parse: (b: any) => b },
  updateLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  shareLinkSchema: { type: 'object', properties: {}, additionalProperties: true },
  createLinkSchema: { parse: (b: any) => b },
  createLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  sendMessageSchema: { parse: (b: any) => b },
  sendMessageBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSenderSchema: { type: 'object', additionalProperties: true },
  SendMessageInput: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRetrievalRoutes } from '../../../routes/links/retrieval';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_link_abc123';

const mockShareLink = {
  id: '507f1f77bcf86cd799439099',
  linkId: LINK_ID,
  conversationId: CONV_ID,
  name: 'Test Link',
  description: null,
  isActive: true,
  expiresAt: null,
  allowViewHistory: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: false,
  requireEmail: false,
  requireNickname: false,
  conversation: {
    id: CONV_ID,
    title: 'Test Conversation',
    description: null,
    identifier: 'test-conv',
    type: 'group',
    createdAt: new Date('2025-01-01'),
    participants: [
      {
        id: 'part-1', type: 'user', userId: USER_ID, isActive: true, role: 'member',
        joinedAt: new Date(), username: 'alice', firstName: 'Alice', lastName: 'Smith',
        displayName: 'Alice', language: 'fr', isOnline: false, canSendMessages: true,
        canSendFiles: true, canSendImages: true,
        user: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice', avatar: null, isOnline: false, lastActiveAt: null, systemLanguage: 'fr' }
      }
    ]
  }
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(hybridRequest: any = {}): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async () => {});
  mockCreateLegacyHybridRequest.mockReturnValue(hybridRequest);

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as any);
  await registerRetrievalRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /links/:identifier — link not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(null);
    app = await buildApp({ isAuthenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /links/:identifier — unauthenticated, allowViewHistory=true', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when anonymous visitor can view history', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().data.link.linkId).toBe(LINK_ID);
  });
});

describe('GET /links/:identifier — unauthenticated, allowViewHistory=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue({ ...mockShareLink, allowViewHistory: false });
    app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous visitor cannot view history', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier — authenticated member of conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: true, isAnonymous: false,
      user: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice', systemLanguage: 'fr' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with redirectTo for conversation members', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.userType).toBe('member');
    expect(data.redirectTo).toBe(`/conversations/${CONV_ID}`);
  });
});

describe('GET /links/:identifier — authenticated non-member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: true, isAnonymous: false,
      user: { id: 'other-user-id', username: 'bob', firstName: 'Bob', lastName: 'Jones', displayName: 'Bob', systemLanguage: 'en' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when authenticated user is not a member', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier — meeshy conversation (all users have access)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, identifier: 'meeshy' },
    });
    app = await buildApp({
      isAuthenticated: true, isAnonymous: false,
      user: { id: 'any-user-id', username: 'charlie', firstName: 'Charlie', lastName: 'Brown', displayName: 'Charlie', systemLanguage: 'fr' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for any authenticated user on meeshy conversation', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /links/:identifier — anonymous participant with matching shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: false, isAnonymous: true,
      anonymousParticipant: {
        shareLinkId: '507f1f77bcf86cd799439099',
        id: 'anon-part-1', username: 'guest', firstName: 'Guest', lastName: null,
        displayName: 'Guest', language: 'fr', canSendMessages: true, canSendFiles: false, canSendImages: false,
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for anonymous participant with correct shareLinkId', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.userType).toBe('anonymous');
    expect(data.currentUser).not.toBeNull();
  });
});

describe('GET /links/:identifier — anonymous participant wrong shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: false, isAnonymous: true,
      anonymousParticipant: { shareLinkId: 'wrong-id' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for anonymous participant with wrong shareLinkId', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier — with messages', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    mockGetConversationMessages.mockResolvedValue([
      { id: 'msg-1', content: 'Hello', createdAt: new Date() },
      { id: 'msg-2', content: 'World', createdAt: new Date() },
    ]);
    mockCountConversationMessages.mockResolvedValue(2);
    app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with messages and stats', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}?limit=10&offset=0` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.stats.totalMessages).toBe(2);
    expect(data.messages).toHaveLength(2);
  });
});

describe('GET /links/:identifier — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockRejectedValue(new Error('DB failure'));
    app = await buildApp({ isAuthenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
