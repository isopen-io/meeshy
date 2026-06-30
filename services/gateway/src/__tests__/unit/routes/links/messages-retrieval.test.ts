/**
 * Unit tests for links messages-retrieval routes (messages-retrieval.ts)
 * Tests GET /links/:identifier/messages.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
}));

const mockGetConversationMessagesWithDetails = jest.fn<any>().mockResolvedValue([]);
const mockCountConversationMessages = jest.fn<any>().mockResolvedValue(0);

jest.mock('../../../../routes/links/utils/prisma-queries', () => ({
  getConversationMessagesWithDetails: (...args: any[]) => mockGetConversationMessagesWithDetails(...args),
  countConversationMessages: (...args: any[]) => mockCountConversationMessages(...args),
}));

jest.mock('../../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithSeparateSenders: jest.fn((m: any) => m),
}));

jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: jest.fn((req: any) => {
    const ctx = req.authContext;
    if (ctx?.registeredUser) {
      return { isAuthenticated: true, isAnonymous: false, user: ctx.registeredUser, anonymousParticipant: null };
    }
    if (ctx?.anonymousParticipant) {
      return { isAuthenticated: false, isAnonymous: true, user: null, anonymousParticipant: ctx.anonymousParticipant };
    }
    return { isAuthenticated: false, isAnonymous: false, user: null, anonymousParticipant: null };
  }),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

jest.mock('../../../../routes/links/types', () => ({
  conversationSummarySchema: { type: 'object', properties: {} },
  messageSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMessagesRetrievalRoutes } from '../../../../routes/links/messages-retrieval';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';
const LINK_DB_ID = '507f1f77bcf86cd799439044';

const mockShareLink = {
  id: LINK_DB_ID,
  linkId: LINK_ID,
  conversationId: CONV_ID,
  isActive: true,
  conversation: { id: CONV_ID, title: 'Test Conv', type: 'group' },
};

const mockRegisteredUser = { id: USER_ID, username: 'alice' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(mockShareLink),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1', userId: USER_ID }),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  auth?: 'member' | 'non-member' | 'anonymous-member' | 'none';
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { auth = 'member', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'member') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: mockRegisteredUser,
      };
    } else if (auth === 'non-member') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: mockRegisteredUser,
      };
    } else if (auth === 'anonymous-member') {
      (req as any)._testAuthContext = {
        isAuthenticated: false,
        isAnonymous: true,
        userId: null,
        registeredUser: null,
        anonymousParticipant: { id: 'anon-1', shareLinkId: LINK_DB_ID },
      };
    } else {
      (req as any)._testAuthContext = {
        isAuthenticated: false,
        isAnonymous: false,
        userId: null,
        registeredUser: null,
      };
    }
  });

  await registerMessagesRetrievalRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /links/:identifier/messages — not found ──────────────────────────────

describe('GET /links/:identifier/messages — link not found by linkId', () => {
  it('returns 404 when share link does not exist', async () => {
    const prisma = makePrisma({
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /links/:identifier/messages — link not found by DB id', () => {
  it('returns 404 when looking up by DB id and link does not exist', async () => {
    const prisma = makePrisma({
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_DB_ID}/messages` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── GET /links/:identifier/messages — no access ─────────────────────────────

describe('GET /links/:identifier/messages — unauthenticated, no anonymous participant', () => {
  it('returns 403 when user has no auth and no anonymous participant', async () => {
    const app = await buildApp({ auth: 'none' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /links/:identifier/messages — non-member authenticated user', () => {
  it('returns 403 when user is not a participant in the conversation', async () => {
    const prisma = makePrisma({
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(mockShareLink) },
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
    const app = await buildApp({ auth: 'non-member', prisma });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── GET /links/:identifier/messages — success as member ─────────────────────

describe('GET /links/:identifier/messages — success as authenticated member', () => {
  it('returns 200 with messages and conversation data', async () => {
    const app = await buildApp({ auth: 'member' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    await app.close();
  });
});

describe('GET /links/:identifier/messages — success with messages', () => {
  it('returns 200 with formatted message list', async () => {
    mockGetConversationMessagesWithDetails.mockResolvedValueOnce([
      { id: 'msg-1', content: 'Hello', senderId: USER_ID },
      { id: 'msg-2', content: 'World', senderId: USER_ID },
    ]);
    mockCountConversationMessages.mockResolvedValueOnce(2);
    const app = await buildApp({ auth: 'member' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(2);
    await app.close();
  });
});

describe('GET /links/:identifier/messages — success by DB id (no mshy_ prefix)', () => {
  it('returns 200 when identifier is a DB id', async () => {
    const app = await buildApp({ auth: 'member' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_DB_ID}/messages` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /links/:identifier/messages — anonymous member ──────────────────────

describe('GET /links/:identifier/messages — success as anonymous participant', () => {
  it('returns 200 when anonymousParticipant.shareLinkId matches', async () => {
    const app = await buildApp({ auth: 'anonymous-member' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /links/:identifier/messages — pagination ────────────────────────────

describe('GET /links/:identifier/messages — with pagination', () => {
  it('returns 200 with limit and offset respected', async () => {
    mockGetConversationMessagesWithDetails.mockResolvedValueOnce([]);
    mockCountConversationMessages.mockResolvedValueOnce(100);
    const app = await buildApp({ auth: 'member' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages?limit=10&offset=20` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(100);
    await app.close();
  });
});

// ─── GET /links/:identifier/messages — hasMore ────────────────────────────────

describe('GET /links/:identifier/messages — hasMore true when more messages exist', () => {
  it('sets hasMore=true when total > offset + messages.length', async () => {
    mockGetConversationMessagesWithDetails.mockResolvedValueOnce([{ id: 'msg-1', content: 'Hi' }]);
    mockCountConversationMessages.mockResolvedValueOnce(50);
    const app = await buildApp({ auth: 'member' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages?limit=1&offset=0` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.hasMore).toBe(true);
    await app.close();
  });
});

// ─── GET /links/:identifier/messages — error ──────────────────────────────────

describe('GET /links/:identifier/messages — DB error', () => {
  it('returns 500 when findUnique throws', async () => {
    const prisma = makePrisma({
      conversationShareLink: { findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}/messages` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
