/**
 * Unit tests for conversations threads route (threads.ts)
 * Tests GET /conversations/:id/threads/:messageId.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {
    id: true,
    fileName: true,
    mimeType: true,
    fileUrl: true,
    thumbnailUrl: true,
  },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerThreadsRoutes } from '../../../../routes/conversations/threads';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const REPLY_ID = '507f1f77bcf86cd799439044';

const mockParentMessage = {
  id: MSG_ID,
  content: 'Parent message',
  originalLanguage: 'en',
  conversationId: CONV_ID,
  senderId: 'part-1',
  messageType: 'text',
  messageSource: null,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  reactionSummary: {},
  reactionCount: 0,
  translations: [],
  validatedMentions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  sender: null,
  attachments: [],
  replyTo: null,
  _count: { reactions: 0, statusEntries: 0 },
};

const mockReplyMessage = {
  ...mockParentMessage,
  id: REPLY_ID,
  content: 'Reply message',
  replyToId: MSG_ID,
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
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(mockParentMessage),
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

  registerThreadsRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /conversations/:id/threads/:messageId ────────────────────────────────

describe('GET threads — conversation not found', () => {
  it('returns 404 when conversation ID cannot be resolved', async () => {
    mockResolveConversationId.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET threads — access denied', () => {
  it('returns 403 when user cannot access conversation', async () => {
    mockCanAccessConversation.mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET threads — parent message not found', () => {
  it('returns 404 when the parent message does not exist', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET threads — success with no replies', () => {
  it('returns 200 when parent has no replies', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET threads — success with replies', () => {
  it('returns 200 when parent has nested replies', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue(mockParentMessage),
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([mockReplyMessage]) // first level replies
          .mockResolvedValueOnce([]),                // no deeper replies
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET threads — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
