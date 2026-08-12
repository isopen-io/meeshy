/**
 * Unit tests for links retrieval routes (retrieval.ts)
 * Tests GET /links/:identifier.
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
  UnifiedAuthRequest: {},
}));

const mockFindShareLinkByIdentifier = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>().mockResolvedValue([]);
const mockCountConversationMessages = jest.fn<any>().mockResolvedValue(0);

jest.mock('../../../../routes/links/utils/prisma-queries', () => ({
  findShareLinkByIdentifier: (...args: any[]) => mockFindShareLinkByIdentifier(...args),
  getConversationMessages: (...args: any[]) => mockGetConversationMessages(...args),
  countConversationMessages: (...args: any[]) => mockCountConversationMessages(...args),
}));

jest.mock('../../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithUnifiedSender: jest.fn((m: any) => m),
}));

jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: jest.fn((req: any) => {
    const ctx = req.authContext;
    if (ctx?.registeredUser) {
      return { isAuthenticated: true, isAnonymous: false, user: ctx.registeredUser, anonymousParticipant: null };
    }
    return { isAuthenticated: false, isAnonymous: false, user: null, anonymousParticipant: null };
  }),
  generateInitialLinkId: jest.fn(() => 'mshy_initial_abc123'),
  generateConversationIdentifier: jest.fn((t: string) => `conv_${t}`),
  generateFinalLinkId: jest.fn((id: string) => `mshy_final_${id}`),
  ensureUniqueShareLinkIdentifier: jest.fn().mockResolvedValue('mshy_unique_link'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRetrievalRoutes } from '../../../../routes/links/retrieval';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';

const mockRegisteredUser = {
  id: USER_ID,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  systemLanguage: 'fr',
};

function makeShareLink(overrides: Record<string, any> = {}) {
  return {
    id: 'link-001',
    linkId: LINK_ID,
    conversationId: CONV_ID,
    name: 'Test Link',
    description: null,
    isActive: true,
    allowViewHistory: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: false,
    requireEmail: false,
    requireNickname: false,
    expiresAt: null,
    conversation: {
      id: CONV_ID,
      identifier: 'test-conv',
      title: 'Test Conversation',
      description: null,
      type: 'group',
      createdAt: new Date('2024-01-01'),
      participants: [
        {
          id: 'part-1',
          userId: USER_ID,
          type: 'user',
          role: 'member',
          isActive: true,
          isOnline: false,
          joinedAt: new Date('2024-01-01'),
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Smith',
          language: 'fr',
          user: mockRegisteredUser,
        },
      ],
    },
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(opts: {
  auth?: 'registered' | 'none';
  userId?: string;
  prisma?: any;
} = {}): Promise<{ app: FastifyInstance }> {
  const { auth = 'registered', userId = USER_ID, prisma = {} as any } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId,
        registeredUser: { ...mockRegisteredUser, id: userId },
        hasFullAccess: true,
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

  await registerRetrievalRoutes(app);
  await app.ready();
  return { app };
}

// ─── GET /links/:identifier — not found ──────────────────────────────────────

describe('GET /links/:identifier — not found', () => {
  it('returns 404 when share link does not exist', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValueOnce(null);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── GET /links/:identifier — unauthenticated, link requires history access ──

describe('GET /links/:identifier — unauthenticated, no allowViewHistory', () => {
  it('returns 403 when link does not allow history viewing and user is unauthenticated', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValueOnce(makeShareLink({ isActive: false, allowViewHistory: false }));
    const { app } = await buildApp({ auth: 'none' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── GET /links/:identifier — success as member ───────────────────────────────

describe('GET /links/:identifier — success as conversation member', () => {
  it('returns 200 with member userType and redirectTo', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValueOnce(makeShareLink());
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.userType).toBe('member');
    await app.close();
  });
});

// ─── GET /links/:identifier — success as non-member registered user ───────────

describe('GET /links/:identifier — success as registered but non-member', () => {
  it('returns 200 with anonymous userType when user is not in conversation', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValueOnce(makeShareLink({
      conversation: {
        id: CONV_ID,
        identifier: 'test-conv',
        title: 'Test Conversation',
        description: null,
        type: 'group',
        createdAt: new Date('2024-01-01'),
        participants: [], // No participants
      },
    }));
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    // Non-member registered user — hasAccess=false → 403
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── GET /links/:identifier — success unauthenticated with allowViewHistory ───

describe('GET /links/:identifier — success unauthenticated with history allowed', () => {
  it('returns 200 when link is active and allows view history', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValueOnce(makeShareLink({ isActive: true, allowViewHistory: true }));
    const { app } = await buildApp({ auth: 'none' });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /links/:identifier — meeshy global conversation ─────────────────────

describe('GET /links/:identifier — meeshy global conversation grants access', () => {
  it('returns 200 when conversation identifier is meeshy', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValueOnce(makeShareLink({
      conversation: {
        id: CONV_ID,
        identifier: 'meeshy',
        title: 'Global',
        description: null,
        type: 'global',
        createdAt: new Date('2024-01-01'),
        participants: [],
      },
    }));
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /links/:identifier — DB error ────────────────────────────────────────

describe('GET /links/:identifier — DB error', () => {
  it('returns 500 when findShareLinkByIdentifier throws', async () => {
    mockFindShareLinkByIdentifier.mockRejectedValueOnce(new Error('DB failure'));
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /links/:identifier — with pagination params ─────────────────────────

describe('GET /links/:identifier — with pagination', () => {
  it('returns 200 with limit and offset params respected', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValueOnce(makeShareLink());
    mockGetConversationMessages.mockResolvedValueOnce([]);
    mockCountConversationMessages.mockResolvedValueOnce(100);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}?limit=10&offset=20` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
