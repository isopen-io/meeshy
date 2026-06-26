/**
 * mentions-routes.test.ts
 *
 * Tests for:
 *   GET /mentions/messages/:messageId — returns users mentioned in a message
 *   GET /mentions/me                  — returns recent mentions for current user
 *   GET /mentions/suggestions error path — 500 on unexpected error
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const VALID_MESSAGE_ID = '507f1f77bcf86cd799439011';
const VALID_CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439099';

// ─── Module-level mocks ───────────────────────────────────────────────────────

const mockGetMentionsForMessage = jest.fn<any>();
const mockGetRecentMentionsForUser = jest.fn<any>();
const mockGetSuggestionsForConversation = jest.fn<any>();
const mockGetSuggestionsForPost = jest.fn<any>();

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    getMentionsForMessage: mockGetMentionsForMessage,
    getRecentMentionsForUser: mockGetRecentMentionsForUser,
    getUserSuggestionsForConversation: mockGetSuggestionsForConversation,
    getUserSuggestionsForPost: mockGetSuggestionsForPost,
  })),
}));

const mockPrismaMessageFindFirst = jest.fn<any>();

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (
        request: import('fastify').FastifyRequest,
        reply: import('fastify').FastifyReply
      ): Promise<void> => {
        const token = request.headers['authorization'];
        if (!token) {
          await reply.code(401).send({ success: false, error: 'Authentification requise' });
          return;
        }
        (request as unknown as Record<string, unknown>).authContext = {
          type: 'registered',
          userId: USER_ID,
          hasFullAccess: true,
        };
      }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    message: { findFirst: mockPrismaMessageFindFirst },
  } as unknown as PrismaClient;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma());
  const { default: mentionRoutes } = await import('../../../routes/mentions');
  await app.register(mentionRoutes);
  await app.ready();
  return app;
}

const AUTH_HEADER = { authorization: 'Bearer token' };

// ─── GET /mentions/messages/:messageId ───────────────────────────────────────

describe('GET /mentions/messages/:messageId', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mockPrismaMessageFindFirst.mockResolvedValue({ id: VALID_MESSAGE_ID, conversationId: VALID_CONV_ID });
    mockGetMentionsForMessage.mockResolvedValue([]);
    app = await buildApp();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaMessageFindFirst.mockResolvedValue({ id: VALID_MESSAGE_ID, conversationId: VALID_CONV_ID });
    mockGetMentionsForMessage.mockResolvedValue([]);
  });

  it('returns 401 when no authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: `/mentions/messages/${VALID_MESSAGE_ID}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when message not found or access denied', async () => {
    mockPrismaMessageFindFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/mentions/messages/${VALID_MESSAGE_ID}`,
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with empty array when no mentions', async () => {
    mockGetMentionsForMessage.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: `/mentions/messages/${VALID_MESSAGE_ID}`,
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with mapped mention objects', async () => {
    const mentionedUser = {
      id: 'user-abc',
      username: 'alice',
      displayName: 'Alice',
      avatar: null,
    };
    mockGetMentionsForMessage.mockResolvedValue([mentionedUser]);

    const res = await app.inject({
      method: 'GET',
      url: `/mentions/messages/${VALID_MESSAGE_ID}`,
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: any[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      mentionedUserId: 'user-abc',
      messageId: VALID_MESSAGE_ID,
      mentionedUser: { id: 'user-abc', username: 'alice', displayName: 'Alice' },
    });
  });

  it('calls getMentionsForMessage with the messageId param', async () => {
    await app.inject({
      method: 'GET',
      url: `/mentions/messages/${VALID_MESSAGE_ID}`,
      headers: AUTH_HEADER,
    });
    expect(mockGetMentionsForMessage).toHaveBeenCalledWith(VALID_MESSAGE_ID);
  });

  it('returns 500 on unexpected service error', async () => {
    mockGetMentionsForMessage.mockRejectedValue(new Error('db timeout'));

    const res = await app.inject({
      method: 'GET',
      url: `/mentions/messages/${VALID_MESSAGE_ID}`,
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /mentions/me ─────────────────────────────────────────────────────────

function makeMention(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mention-1',
    messageId: VALID_MESSAGE_ID,
    mentionedAt: new Date('2025-01-01T00:00:00Z'),
    message: {
      id: VALID_MESSAGE_ID,
      content: 'hello @alice',
      conversationId: VALID_CONV_ID,
      senderId: 'participant-1',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      sender: {
        id: 'participant-1',
        userId: 'user-sender',
        displayName: 'Bob',
        avatar: null,
        user: { username: 'bob' },
      },
      conversation: {
        id: VALID_CONV_ID,
        title: 'Test convo',
        type: 'GROUP',
      },
    },
    ...overrides,
  };
}

describe('GET /mentions/me', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mockGetRecentMentionsForUser.mockResolvedValue([]);
    app = await buildApp();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecentMentionsForUser.mockResolvedValue([]);
  });

  it('returns 401 when no authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/mentions/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with empty array when no mentions', async () => {
    const res = await app.inject({ method: 'GET', url: '/mentions/me', headers: AUTH_HEADER });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with mapped mention objects', async () => {
    mockGetRecentMentionsForUser.mockResolvedValue([makeMention()]);

    const res = await app.inject({ method: 'GET', url: '/mentions/me', headers: AUTH_HEADER });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: any[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 'mention-1',
      messageId: VALID_MESSAGE_ID,
      message: {
        id: VALID_MESSAGE_ID,
        content: 'hello @alice',
        conversationId: VALID_CONV_ID,
        sender: { username: 'bob', displayName: 'Bob' },
        conversation: { id: VALID_CONV_ID, title: 'Test convo', type: 'GROUP' },
      },
    });
  });

  it('passes limit query param to service', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/mentions/me?limit=10',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
    expect(mockGetRecentMentionsForUser).toHaveBeenCalledWith(USER_ID, 10);
  });

  it('uses schema default limit of 20 when not provided', async () => {
    await app.inject({ method: 'GET', url: '/mentions/me', headers: AUTH_HEADER });
    expect(mockGetRecentMentionsForUser).toHaveBeenCalledWith(USER_ID, 20);
  });

  it('maps sender=null correctly when no sender participant', async () => {
    const mention = makeMention();
    (mention as any).message.sender = null;
    mockGetRecentMentionsForUser.mockResolvedValue([mention]);

    const res = await app.inject({ method: 'GET', url: '/mentions/me', headers: AUTH_HEADER });
    const body = JSON.parse(res.body) as { success: boolean; data: any[] };
    expect(body.data[0].message.sender).toBeNull();
  });

  it('returns 500 on unexpected service error', async () => {
    mockGetRecentMentionsForUser.mockRejectedValue(new Error('connection refused'));

    const res = await app.inject({ method: 'GET', url: '/mentions/me', headers: AUTH_HEADER });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /mentions/suggestions — 500 error path ───────────────────────────────

describe('GET /mentions/suggestions — internal server error path', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mockGetSuggestionsForConversation.mockResolvedValue([]);
    app = await buildApp();
  });

  afterAll(() => app.close());

  it('returns 500 when service throws non-access-denied error', async () => {
    mockGetSuggestionsForConversation.mockRejectedValue(new Error('redis timeout'));

    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?conversationId=${VALID_CONV_ID}`,
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(500);
  });
});
