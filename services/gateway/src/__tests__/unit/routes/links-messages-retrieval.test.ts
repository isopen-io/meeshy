/**
 * Unit tests for links/messages-retrieval.ts routes.
 * Tests GET /links/:identifier/messages
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

const mockCreateLegacyHybridRequest = jest.fn<any>();

jest.mock('../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: (...a: any[]) => mockCreateLegacyHybridRequest(...a),
}));

const mockGetConversationMessagesWithDetails = jest.fn<any>().mockResolvedValue([]);
const mockCountConversationMessages = jest.fn<any>().mockResolvedValue(0);

jest.mock('../../../routes/links/utils/prisma-queries', () => ({
  getConversationMessagesWithDetails: (...a: any[]) => mockGetConversationMessagesWithDetails(...a),
  countConversationMessages: (...a: any[]) => mockCountConversationMessages(...a),
}));

const mockFormatMessageWithSeparateSenders = jest.fn<any>((msg: any) => msg);

jest.mock('../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithSeparateSenders: (...a: any[]) => mockFormatMessageWithSeparateSenders(...a),
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

import { registerMessagesRetrievalRoutes } from '../../../routes/links/messages-retrieval';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_link_abc123';
const LINK_DB_ID = '507f1f77bcf86cd799439099';

const mockShareLink = {
  id: LINK_DB_ID,
  linkId: LINK_ID,
  conversationId: CONV_ID,
  isActive: true,
  conversation: { id: CONV_ID, title: 'Test Chat', type: 'group' },
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(mockShareLink),
      ...overrides.conversationShareLink,
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      ...overrides.participant,
    },
    ...overrides,
  };
}

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(hybridRequest: any = {}, prismaOverrides: any = {}): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async () => {});
  mockCreateLegacyHybridRequest.mockReturnValue(hybridRequest);

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);
  await registerMessagesRetrievalRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /links/:identifier/messages — link not found (mshy_ prefix)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ isAuthenticated: false, isAnonymous: false }, {
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when link not found by linkId', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /links/:identifier/messages — link not found by DB ID', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ isAuthenticated: false, isAnonymous: false }, {
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when link not found by ID', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_DB_ID}/messages` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /links/:identifier/messages — unauthenticated, not anonymous', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ isAuthenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when unauthenticated and not anonymous', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier/messages — authenticated member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: USER_ID } },
      { participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1' }) } }
    );
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for authenticated member', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.conversation.id).toBe(CONV_ID);
    expect(Array.isArray(data.messages)).toBe(true);
  });
});

describe('GET /links/:identifier/messages — authenticated non-member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: 'other-user' } },
      { participant: { findFirst: jest.fn<any>().mockResolvedValue(null) } }
    );
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for non-member', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier/messages — anonymous participant with matching shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      isAuthenticated: false,
      isAnonymous: true,
      anonymousParticipant: { shareLinkId: LINK_DB_ID },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for anonymous participant with correct shareLinkId', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(0);
    expect(data.hasMore).toBe(false);
  });
});

describe('GET /links/:identifier/messages — anonymous participant wrong shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      isAuthenticated: false,
      isAnonymous: true,
      anonymousParticipant: { shareLinkId: 'wrong-id' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for wrong shareLinkId', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier/messages — with messages and pagination', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetConversationMessagesWithDetails.mockResolvedValue([
      { id: 'msg-1', content: 'Hello', createdAt: new Date() },
      { id: 'msg-2', content: 'World', createdAt: new Date() },
    ]);
    mockCountConversationMessages.mockResolvedValue(5);
    app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: USER_ID } },
      { participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1' }) } }
    );
  });
  afterAll(async () => {
    mockGetConversationMessagesWithDetails.mockResolvedValue([]);
    mockCountConversationMessages.mockResolvedValue(0);
    await app.close();
  });

  it('returns messages with hasMore=true when more exist', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages?limit=2&offset=0` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.messages).toHaveLength(2);
    expect(data.total).toBe(5);
    expect(data.hasMore).toBe(true);
  });
});

describe('GET /links/:identifier/messages — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: USER_ID } },
      {
        conversationShareLink: {
          findUnique: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
        },
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      }
    );
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(500);
  });
});
