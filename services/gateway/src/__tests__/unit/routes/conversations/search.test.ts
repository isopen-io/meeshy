/**
 * Unit tests for conversations search route (search.ts)
 * Tests GET /conversations/search.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockGetUnreadCounts = jest.fn<any>().mockResolvedValue(new Map());
const mockGenerateDefaultConversationTitle = jest.fn<any>().mockReturnValue('Default Title');

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../services/MessageReadStatusService.js', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: (...args: any[]) => mockGetUnreadCounts(...args),
  })),
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  generateDefaultConversationTitle: (...args: any[]) => mockGenerateDefaultConversationTitle(...args),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationMinimalSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerSearchRoutes } from '../../../../routes/conversations/search';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const mockConversation = {
  id: CONV_ID,
  identifier: 'test-conv',
  title: 'Test Conversation',
  type: 'group',
  avatar: null,
  banner: null,
  isActive: true,
  communityId: null,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  _count: { participants: 3 },
  participants: [
    {
      id: 'part-1',
      userId: USER_ID,
      displayName: 'Alice',
      user: { id: USER_ID, username: 'alice', displayName: 'Alice Smith' },
    },
  ],
  messages: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false, userId: null };
    }
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  registerSearchRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /conversations/search ────────────────────────────────────────────────

describe('GET /conversations/search — missing query param', () => {
  it('returns 400 when q is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/conversations/search' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /conversations/search — no matching users or conversations', () => {
  it('returns 200 with empty array when prisma returns nothing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=xyz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toEqual([]);
    await app.close();
  });
});


describe('GET /conversations/search — conversations found', () => {
  it('returns 200 with list of matching conversations', async () => {
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockResolvedValue([{ id: USER_ID }]) },
      conversation: { findMany: jest.fn<any>().mockResolvedValue([mockConversation]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    await app.close();
  });
});

describe('GET /conversations/search — conversation with last message', () => {
  it('returns 200 and includes lastMessage with sender info', async () => {
    const convWithMessage = {
      ...mockConversation,
      messages: [
        {
          id: 'msg-1',
          content: 'Hello world',
          senderId: 'part-1',
          messageType: 'text',
          createdAt: new Date(),
          sender: {
            id: 'part-1',
            userId: USER_ID,
            displayName: 'Alice',
            avatar: null,
            user: { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null, isOnline: true },
          },
          attachments: [],
          _count: { attachments: 0 },
        },
      ],
    };
    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([convWithMessage]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].lastMessage).toBeDefined();
    await app.close();
  });
});

describe('GET /conversations/search — direct conversation without title', () => {
  it('returns 200 with null title for direct conversation with no title', async () => {
    const directConv = {
      ...mockConversation,
      type: 'direct',
      title: null,
    };
    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([directConv]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET /conversations/search — group conversation without title', () => {
  it('calls generateDefaultConversationTitle for group with no title', async () => {
    const noTitleConv = {
      ...mockConversation,
      type: 'group',
      title: '',
    };
    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([noTitleConv]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=group' });
    expect(res.statusCode).toBe(200);
    expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /conversations/search — with unread counts', () => {
  it('returns 200 and includes unread counts from service', async () => {
    const unreadMap = new Map([[CONV_ID, 5]]);
    mockGetUnreadCounts.mockResolvedValueOnce(unreadMap);

    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([mockConversation]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].unreadCount).toBe(5);
    await app.close();
  });
});

describe('GET /conversations/search — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('GET /conversations/search — last-message preview excludes soft-deleted messages', () => {
  it('gates the nested messages preview with deletedAt: null (mirror of conversations/core.ts)', async () => {
    const findMany = jest.fn<any>().mockResolvedValue([mockConversation]);
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockResolvedValue([{ id: USER_ID }]) },
      conversation: { findMany },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(200);

    const queryArg = findMany.mock.calls[0][0];
    expect(queryArg.include.messages.where).toEqual({ deletedAt: null });
    await app.close();
  });
});
