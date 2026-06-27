/**
 * reaction-routes.test.ts
 *
 * Unit tests for src/routes/reactions.ts
 * Covers: POST /reactions, DELETE /reactions/:messageId/:emoji,
 *         GET /reactions/:messageId, GET /reactions/user/:userId
 *
 * Auth guards, participant checks, happy paths, 403/404/500 error handling.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — before any imports
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

const mockAddReaction       = jest.fn<any>();
const mockRemoveReaction    = jest.fn<any>();
const mockGetMessageReactions = jest.fn<any>();
const mockGetParticipantReactions = jest.fn<any>();
const mockCreateUpdateEvent = jest.fn<any>();

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn().mockImplementation(() => ({
    addReaction:              mockAddReaction,
    removeReaction:           mockRemoveReaction,
    getMessageReactions:      mockGetMessageReactions,
    getParticipantReactions:  mockGetParticipantReactions,
    createUpdateEvent:        mockCreateUpdateEvent,
  })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('@meeshy/shared/types', () => ({}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    REACTION_ADDED:   'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  reactionSchema:           { type: 'object', additionalProperties: true },
  reactionSummarySchema:    { type: 'object', additionalProperties: true },
  addReactionRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema:      { type: 'object', additionalProperties: true },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import reactionRoutes from '../../../routes/reactions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MSG_ID  = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';
const PART_ID = '507f1f77bcf86cd799439014';
const EMOJI   = '👍';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockPrisma: any = {
  message: {
    findUnique: jest.fn<any>(),
  },
  participant: {
    findFirst: jest.fn<any>(),
  },
};

// ---------------------------------------------------------------------------
// Mock Socket.IO
// ---------------------------------------------------------------------------

const mockEmit = jest.fn();
const mockTo   = jest.fn().mockReturnValue({ emit: mockEmit });
const mockIO   = { to: mockTo };
const mockSocketIOHandler = {
  getManager: jest.fn(() => ({ getIO: jest.fn(() => mockIO) })),
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function makeAuthContext(overrides: Record<string, any> = {}) {
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
  app.decorate('socketIOHandler', mockSocketIOHandler);
  app.decorate('notificationService', null);

  const { createUnifiedAuthMiddleware } = require('../../../middleware/auth');
  (createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      if (authContext === undefined) {
        req.authContext = makeAuthContext();
      } else if (authContext === null) {
        const err: any = new Error('Unauthorized');
        err.statusCode = 401;
        throw err;
      } else {
        req.authContext = authContext;
      }
    }
  );

  app.register(reactionRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeReaction(overrides: any = {}) {
  return {
    id: 'rxn1',
    messageId: MSG_ID,
    emoji: EMOJI,
    participantId: PART_ID,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeMessage(participantOverrides: any[] = [{ userId: USER_ID }]) {
  return {
    id: MSG_ID,
    conversationId: CONV_ID,
    conversation: { participants: participantOverrides },
  };
}

// ---------------------------------------------------------------------------
// POST /reactions
// ---------------------------------------------------------------------------

describe('POST /reactions', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 with reaction when participantId is in authContext', async () => {
    await app.ready();
    mockAddReaction.mockResolvedValue(makeReaction());
    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
    mockCreateUpdateEvent.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: EMOJI },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('rxn1');
  });

  it('resolves participantId from DB when not in authContext', async () => {
    await app.ready();
    const ctx = makeAuthContext({ participantId: undefined });
    await app.close();
    app = buildApp(ctx);
    await app.ready();

    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
    mockAddReaction.mockResolvedValue(makeReaction());
    mockCreateUpdateEvent.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: EMOJI },
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns 403 when participantId cannot be resolved', async () => {
    await app.ready();
    const ctx = makeAuthContext({ participantId: undefined });
    await app.close();
    app = buildApp(ctx);
    await app.ready();

    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: EMOJI },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when addReaction returns null', async () => {
    await app.ready();
    mockAddReaction.mockResolvedValue(null);
    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: EMOJI },
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 404 when service throws "Message not found"', async () => {
    await app.ready();
    mockAddReaction.mockRejectedValue(new Error('Message not found'));
    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: EMOJI },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when service throws "Invalid emoji format"', async () => {
    await app.ready();
    mockAddReaction.mockRejectedValue(new Error('Invalid emoji format'));
    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: 'bad' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when service throws "not a participant"', async () => {
    await app.ready();
    mockAddReaction.mockRejectedValue(new Error('User is not a participant'));
    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: EMOJI },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on unexpected error', async () => {
    await app.ready();
    mockAddReaction.mockRejectedValue(new Error('DB failure'));
    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MSG_ID, emoji: EMOJI },
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
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when reaction removed successfully', async () => {
    await app.ready();
    mockRemoveReaction.mockResolvedValue(true);
    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
    mockCreateUpdateEvent.mockResolvedValue({});

    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MSG_ID}/${encodeURIComponent(EMOJI)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Reaction removed successfully');
  });

  it('returns 404 when reaction not found', async () => {
    await app.ready();
    mockRemoveReaction.mockResolvedValue(false);

    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MSG_ID}/${encodeURIComponent(EMOJI)}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when participantId cannot be resolved', async () => {
    await app.ready();
    const ctx = makeAuthContext({ participantId: undefined });
    await app.close();
    app = buildApp(ctx);
    await app.ready();

    mockPrisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MSG_ID}/${encodeURIComponent(EMOJI)}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when service throws "Invalid emoji format"', async () => {
    await app.ready();
    mockRemoveReaction.mockRejectedValue(new Error('Invalid emoji format'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MSG_ID}/bad`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    await app.ready();
    mockRemoveReaction.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/${MSG_ID}/${encodeURIComponent(EMOJI)}`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /reactions/:messageId
// ---------------------------------------------------------------------------

describe('GET /reactions/:messageId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with reactions for message participant', async () => {
    await app.ready();
    mockPrisma.message.findUnique.mockResolvedValue(makeMessage());
    mockGetMessageReactions.mockResolvedValue({
      messageId: MSG_ID,
      reactions: [{ emoji: EMOJI, count: 1, byMe: true }],
      totalCount: 1,
      userReactions: [EMOJI],
    });

    const res = await app.inject({ method: 'GET', url: `/reactions/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalCount).toBe(1);
  });

  it('returns 404 when message does not exist', async () => {
    await app.ready();
    mockPrisma.message.findUnique.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/reactions/${MSG_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when authenticated user is not a conversation member', async () => {
    await app.ready();
    mockPrisma.message.findUnique.mockResolvedValue(
      makeMessage([{ userId: 'other-user' }])
    );

    const res = await app.inject({ method: 'GET', url: `/reactions/${MSG_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when anonymous user is not a participant', async () => {
    await app.ready();
    const ctx = makeAuthContext({ isAnonymous: true, sessionToken: 'anon-token', userId: undefined });
    await app.close();
    app = buildApp(ctx);
    await app.ready();

    mockPrisma.message.findUnique.mockResolvedValue(
      makeMessage([{ id: 'other-part', userId: 'other-user' }])
    );

    const res = await app.inject({ method: 'GET', url: `/reactions/${MSG_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockPrisma.message.findUnique.mockRejectedValue(new Error('DB failure'));

    const res = await app.inject({ method: 'GET', url: `/reactions/${MSG_ID}` });
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
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user own reactions', async () => {
    await app.ready();
    mockGetParticipantReactions.mockResolvedValue([makeReaction()]);

    const res = await app.inject({ method: 'GET', url: `/reactions/user/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 403 when anonymous user tries to access', async () => {
    await app.ready();
    const ctx = makeAuthContext({ isAnonymous: true, sessionToken: 'anon-token', userId: undefined });
    await app.close();
    app = buildApp(ctx);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/reactions/user/${USER_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when user requests another user reactions', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/reactions/user/other-user-id' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetParticipantReactions.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: `/reactions/user/${USER_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
