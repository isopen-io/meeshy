/**
 * reactions-routes.test.ts
 *
 * Unit tests for src/routes/reactions.ts
 * Covers:
 *   - POST /reactions
 *   - DELETE /reactions/:messageId/:emoji
 *   - GET  /reactions/:messageId
 *   - GET  /reactions/user/:userId
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  reactionSchema:          { type: 'object', additionalProperties: true },
  reactionSummarySchema:   { type: 'object', additionalProperties: true },
  addReactionRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema:     { type: 'object', additionalProperties: true },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    REACTION_ADDED:   'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

const mockCreateUnifiedAuth = jest.fn<any>();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (...args: any[]) => mockCreateUnifiedAuth(...args),
  UnifiedAuthRequest: {},
}));

const mockAddReaction        = jest.fn<any>();
const mockRemoveReaction     = jest.fn<any>();
const mockCreateUpdateEvent  = jest.fn<any>();
const mockGetMessageReactions = jest.fn<any>();
const mockGetParticipantReactions = jest.fn<any>();

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn().mockImplementation(() => ({
    addReaction:             (...args: any[]) => mockAddReaction(...args),
    removeReaction:          (...args: any[]) => mockRemoveReaction(...args),
    createUpdateEvent:       (...args: any[]) => mockCreateUpdateEvent(...args),
    getMessageReactions:     (...args: any[]) => mockGetMessageReactions(...args),
    getParticipantReactions: (...args: any[]) => mockGetParticipantReactions(...args),
  })),
}));

const mockNotifyReactionAdded = jest.fn<any>();
jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: (...args: any[]) => mockNotifyReactionAdded(...args),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import reactionRoutes from '../../../routes/reactions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID        = '507f1f77bcf86cd799439011';
const MESSAGE_ID     = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockMessageFindUnique  = jest.fn<any>();
const mockParticipantFindFirst = jest.fn<any>();

const mockPrisma: any = {
  message: {
    findUnique: (...args: any[]) => mockMessageFindUnique(...args),
  },
  participant: {
    findFirst: (...args: any[]) => mockParticipantFindFirst(...args),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthCtx(overrides: any = {}): any {
  return {
    userId: USER_ID,
    sessionToken: undefined,
    isAnonymous: false,
    participantId: PARTICIPANT_ID,
    ...overrides,
  };
}

function buildApp(authCtx?: any): FastifyInstance {
  const ctx = authCtx ?? makeAuthCtx();
  const authMiddleware = async (req: any) => { req.authContext = ctx; };
  mockCreateUnifiedAuth.mockReturnValue(authMiddleware);

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.register(reactionRoutes);
  return app;
}

function makeReaction(overrides: any = {}): any {
  return {
    id: 'reaction-1',
    messageId: MESSAGE_ID,
    participantId: PARTICIPANT_ID,
    emoji: '👍',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /reactions
// ---------------------------------------------------------------------------

describe('POST /reactions', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddReaction.mockReset();
    mockCreateUpdateEvent.mockReset();
    mockNotifyReactionAdded.mockReset();
    app = buildApp();
    mockAddReaction.mockResolvedValue(makeReaction());
    mockCreateUpdateEvent.mockResolvedValue({ event: 'update' });
    mockNotifyReactionAdded.mockResolvedValue(undefined);
    mockMessageFindUnique.mockResolvedValue({ conversationId: 'conv-1' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful reaction add', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: '👍' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls addReaction with participantId from authContext', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: '❤️' },
    });
    expect(mockAddReaction).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      emoji: '❤️',
      participantId: PARTICIPANT_ID,
    });
  });

  it('returns 403 when participantId cannot be resolved', async () => {
    const app2 = buildApp(makeAuthCtx({ participantId: undefined }));
    mockMessageFindUnique.mockResolvedValue(null);
    await app2.ready();
    const res = await app2.inject({
      method: 'POST', url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: '👍' },
    });
    await app2.close();
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when emoji format is invalid', async () => {
    mockAddReaction.mockRejectedValue(new Error('Invalid emoji format'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: 'bad' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when message not found (service error)', async () => {
    mockAddReaction.mockRejectedValue(new Error('Message not found'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: '👍' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when addReaction returns null', async () => {
    mockAddReaction.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: '👍' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on unexpected error', async () => {
    mockAddReaction.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: '👍' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /reactions/:messageId/:emoji
// ---------------------------------------------------------------------------

describe('DELETE /reactions/:messageId/:emoji', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveReaction.mockReset();
    mockCreateUpdateEvent.mockReset();
    app = buildApp();
    mockRemoveReaction.mockResolvedValue({ id: 'reaction-1' });
    mockCreateUpdateEvent.mockResolvedValue({ event: 'update' });
    mockMessageFindUnique.mockResolvedValue({ conversationId: 'conv-1' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful reaction remove', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MESSAGE_ID}/%F0%9F%91%8D`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Reaction removed successfully');
  });

  it('returns 403 when participantId cannot be resolved', async () => {
    const app2 = buildApp(makeAuthCtx({ participantId: undefined }));
    mockMessageFindUnique.mockResolvedValue(null);
    await app2.ready();
    const res = await app2.inject({
      method: 'DELETE',
      url: `/reactions/${MESSAGE_ID}/%F0%9F%91%8D`,
    });
    await app2.close();
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when reaction not found', async () => {
    mockRemoveReaction.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MESSAGE_ID}/%F0%9F%91%8D`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockRemoveReaction.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MESSAGE_ID}/%F0%9F%91%8D`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /reactions/:messageId
// ---------------------------------------------------------------------------

describe('GET /reactions/:messageId', () => {
  let app: FastifyInstance;

  const mockMessage = {
    id: MESSAGE_ID,
    conversationId: 'conv-1',
    conversation: {
      participants: [{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMessageReactions.mockReset();
    mockParticipantFindFirst.mockReset();
    app = buildApp();
    mockMessageFindUnique.mockResolvedValue(mockMessage);
    mockParticipantFindFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockGetMessageReactions.mockResolvedValue({
      messageId: MESSAGE_ID,
      reactions: [{ emoji: '👍', count: 1, userReacted: true }],
      totalCount: 1,
      userReactions: ['👍'],
    });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with reactions data', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/reactions/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.messageId).toBe(MESSAGE_ID);
  });

  it('returns 404 when message not found', async () => {
    mockMessageFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/reactions/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a participant', async () => {
    mockMessageFindUnique.mockResolvedValue({
      ...mockMessage,
      conversation: { participants: [{ id: 'other-participant', userId: 'other-user', isActive: true }] },
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/reactions/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockGetMessageReactions.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/reactions/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /reactions/user/:userId
// ---------------------------------------------------------------------------

describe('GET /reactions/user/:userId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetParticipantReactions.mockReset();
    app = buildApp();
    mockGetParticipantReactions.mockResolvedValue([makeReaction()]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user reactions', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/reactions/user/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 403 for anonymous users', async () => {
    const anonApp = buildApp(makeAuthCtx({ isAnonymous: true }));
    await anonApp.ready();
    const res = await anonApp.inject({ method: 'GET', url: `/reactions/user/${USER_ID}` });
    await anonApp.close();
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when viewing another user reactions', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/reactions/user/other-user-id' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockGetParticipantReactions.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/reactions/user/${USER_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
