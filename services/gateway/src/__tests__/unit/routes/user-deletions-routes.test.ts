/**
 * user-deletions-routes.test.ts
 *
 * Unit tests for src/routes/user-deletions.ts
 * Covers: DELETE /api/conversations/:id/delete-for-me, POST restore-for-me,
 *         POST clear-history, DELETE /api/messages/:id/delete-for-me,
 *         POST restore, DELETE /api/messages/batch-delete-for-me, GET deleted
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn((_prisma: any, _opts: any) =>
    async (request: any) => {
      request.authContext = request._injectedAuthContext;
    }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import userDeletionsRoutes from '../../../routes/user-deletions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID  = '507f1f77bcf86cd799439011';
const CONV_ID  = '507f1f77bcf86cd799439012';
const MSG_ID   = '507f1f77bcf86cd799439013';
const PART_ID  = '507f1f77bcf86cd799439014';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockParticipant = {
  findFirst: jest.fn<any>(),
  findMany:  jest.fn<any>(),
};

const mockUserConvPrefs = {
  findUnique: jest.fn<any>(),
  findMany:   jest.fn<any>(),
  upsert:     jest.fn<any>().mockResolvedValue({}),
  update:     jest.fn<any>().mockResolvedValue({}),
};

const mockUserMsgDeletion = {
  findUnique: jest.fn<any>(),
  upsert:     jest.fn<any>().mockResolvedValue({}),
  delete:     jest.fn<any>().mockResolvedValue({}),
  createMany: jest.fn<any>().mockResolvedValue({}),
};

const mockMessage = {
  findUnique: jest.fn<any>(),
  findMany:   jest.fn<any>(),
};

const mockPrisma: any = {
  participant:                mockParticipant,
  userConversationPreferences: mockUserConvPrefs,
  userMessageDeletion:        mockUserMsgDeletion,
  message:                    mockMessage,
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function makeAuthContext(overrides: any = {}) {
  return {
    isAuthenticated: true,
    userId: USER_ID,
    participantId: PART_ID,
    isAnonymous: false,
    registeredUser: { id: USER_ID, role: 'USER' },
    sessionToken: undefined,
    ...overrides,
  };
}

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);

  const { createUnifiedAuthMiddleware } = require('../../../middleware/auth');
  (createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? makeAuthContext();
    }
  );

  app.register(userDeletionsRoutes);
  return app;
}

function makeMembership() {
  return { id: PART_ID, userId: USER_ID, conversationId: CONV_ID, isActive: true };
}

// ---------------------------------------------------------------------------
// DELETE /api/conversations/:conversationId/delete-for-me
// ---------------------------------------------------------------------------

describe('DELETE /api/conversations/:conversationId/delete-for-me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when conversation deleted for user', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(makeMembership());

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockUserConvPrefs.upsert).toHaveBeenCalled();
  });

  it('returns 403 when user is not a conversation member', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockParticipant.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/conversations/:conversationId/restore-for-me
// ---------------------------------------------------------------------------

describe('POST /api/conversations/:conversationId/restore-for-me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when conversation restored', async () => {
    await app.ready();
    mockUserConvPrefs.findUnique.mockResolvedValue({
      userId: USER_ID, conversationId: CONV_ID, deletedForUserAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockUserConvPrefs.update).toHaveBeenCalled();
  });

  it('returns 400 when conversation was not deleted by user', async () => {
    await app.ready();
    // No record found means not deleted
    mockUserConvPrefs.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUserConvPrefs.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/conversations/:conversationId/clear-history
// ---------------------------------------------------------------------------

describe('POST /api/conversations/:conversationId/clear-history', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when history cleared', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(makeMembership());

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      payload: { beforeDate: '2026-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUserConvPrefs.upsert).toHaveBeenCalled();
  });

  it('returns 400 when beforeDate is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when beforeDate is invalid', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      payload: { beforeDate: 'not-a-date' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when user is not a conversation member', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      payload: { beforeDate: '2026-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/messages/:messageId/delete-for-me
// ---------------------------------------------------------------------------

describe('DELETE /api/messages/:messageId/delete-for-me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when message deleted for user', async () => {
    await app.ready();
    mockMessage.findUnique.mockResolvedValue({
      id: MSG_ID,
      conversationId: CONV_ID,
      conversation: {
        participants: [{ userId: USER_ID }],
      },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(200);
    expect(mockUserMsgDeletion.upsert).toHaveBeenCalled();
  });

  it('returns 404 when message not found', async () => {
    await app.ready();
    mockMessage.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a conversation member', async () => {
    await app.ready();
    mockMessage.findUnique.mockResolvedValue({
      id: MSG_ID,
      conversationId: CONV_ID,
      conversation: { participants: [] },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockMessage.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/messages/:messageId/restore-for-me
// ---------------------------------------------------------------------------

describe('POST /api/messages/:messageId/restore-for-me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when message restored', async () => {
    await app.ready();
    mockUserMsgDeletion.findUnique.mockResolvedValue({
      messageId: MSG_ID, userId: USER_ID,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(200);
    expect(mockUserMsgDeletion.delete).toHaveBeenCalled();
  });

  it('returns 400 when message was not deleted by user', async () => {
    await app.ready();
    mockUserMsgDeletion.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/messages/bulk/delete-for-me
// ---------------------------------------------------------------------------

describe('DELETE /api/messages/bulk/delete-for-me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when batch delete succeeds', async () => {
    await app.ready();
    mockMessage.findMany.mockResolvedValue([
      {
        id: MSG_ID,
        conversationId: CONV_ID,
        conversation: { participants: [{ userId: USER_ID }] },
      },
    ]);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      payload: { messageIds: [MSG_ID] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.deletedCount).toBe(1);
  });

  it('returns 400 when messageIds is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when more than 100 messages requested', async () => {
    await app.ready();
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      payload: { messageIds: ids },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when user has no accessible messages', async () => {
    await app.ready();
    mockMessage.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      payload: { messageIds: [MSG_ID] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/user/deleted-conversations
// ---------------------------------------------------------------------------

describe('GET /api/user/deleted-conversations', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with list of deleted conversations', async () => {
    await app.ready();
    mockUserConvPrefs.findMany.mockResolvedValue([
      {
        conversationId: CONV_ID,
        deletedForUserAt: new Date('2026-01-01'),
        conversation: { id: CONV_ID, identifier: 'conv-1', title: 'Test Conv', type: 'direct', avatar: null, lastMessageAt: null },
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].conversationId).toBe(CONV_ID);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUserConvPrefs.findMany.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
    });
    expect(res.statusCode).toBe(500);
  });
});
