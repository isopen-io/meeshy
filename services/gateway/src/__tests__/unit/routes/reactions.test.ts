import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Top-level mock variables ────────────────────────────────────────────────

const mockCreateUnifiedAuthMiddleware = jest.fn<any>().mockReturnValue(jest.fn());

const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  reply._body = { success: true, data };
  reply._status = opts?.statusCode ?? 200;
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 400;
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 403;
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 404;
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 500;
  return reply;
});

const mockReactionServiceAddReaction = jest.fn<any>();
const mockReactionServiceRemoveReaction = jest.fn<any>();
const mockReactionServiceGetMessageReactions = jest.fn<any>();
const mockReactionServiceGetParticipantReactions = jest.fn<any>();
const mockReactionServiceCreateUpdateEvent = jest.fn<any>();

const mockNotifyReactionAdded = jest.fn<any>().mockResolvedValue(undefined);

// ─── jest.mock calls (hoisted) ────────────────────────────────────────────────

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (...args: any[]) => mockCreateUnifiedAuthMiddleware(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn().mockImplementation(() => ({
    addReaction: (...args: any[]) => mockReactionServiceAddReaction(...args),
    removeReaction: (...args: any[]) => mockReactionServiceRemoveReaction(...args),
    getMessageReactions: (...args: any[]) => mockReactionServiceGetMessageReactions(...args),
    getParticipantReactions: (...args: any[]) => mockReactionServiceGetParticipantReactions(...args),
    createUpdateEvent: (...args: any[]) => mockReactionServiceCreateUpdateEvent(...args),
  })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: (...args: any[]) => mockNotifyReactionAdded(...args),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    REACTION_ADDED: 'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  reactionSchema: { type: 'object' },
  reactionSummarySchema: { type: 'object' },
  addReactionRequestSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

jest.mock('@meeshy/shared/types', () => ({}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ─── Import route after mocks ─────────────────────────────────────────────────

import reactionRoutes from '../../../routes/reactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const OTHER_USER_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = () => ({
  message: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
  },
  participant: {
    findFirst: jest.fn<any>().mockResolvedValue(null),
  },
});

type Routes = Record<string, Record<string, Function>>;

const createMockFastify = (prismaOverrides?: any) => {
  const routes: Routes = {};
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockGetManager = jest.fn().mockReturnValue({ getIO: mockGetIO });

  const fastify: any = {
    prisma: { ...makePrisma(), ...prismaOverrides },
    notificationService: null,
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    post: jest.fn((path: string, opts: any, handler: Function) => {
      routes['POST'] = routes['POST'] || {};
      routes['POST'][path] = handler;
    }),
    delete: jest.fn((path: string, opts: any, handler: Function) => {
      routes['DELETE'] = routes['DELETE'] || {};
      routes['DELETE'][path] = handler;
    }),
    socketIOHandler: {
      getManager: mockGetManager,
    },
    log: {
      error: jest.fn(),
    },
    _routes: routes,
    _mockTo: mockTo,
    _mockEmit: mockEmit,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key = Object.keys(methodRoutes).find(k => k === pathFragment)
    ?? Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) throw new Error(`No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeRequest = (overrides: any = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  authContext: {
    isAuthenticated: true,
    userId: USER_ID,
    isAnonymous: false,
    sessionToken: null,
    participantId: PARTICIPANT_ID,
  },
  ...overrides,
});

const makeReply = () => {
  const reply: any = {
    _body: null,
    _status: 200,
    status: jest.fn().mockReturnThis(),
    send: jest.fn((body?: any) => { if (body !== undefined) reply._body = body; return reply; }),
    code: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
  };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reactionRoutes', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify();
    await reactionRoutes(fastify);

    jest.clearAllMocks();
    mockCreateUnifiedAuthMiddleware.mockReturnValue(jest.fn());
    mockSendSuccess.mockImplementation((reply: any, data: any, opts?: any) => {
      reply._body = { success: true, data };
      reply._status = opts?.statusCode ?? 200;
      return reply;
    });
    mockSendBadRequest.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 400;
      return reply;
    });
    mockSendForbidden.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 403;
      return reply;
    });
    mockSendNotFound.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 404;
      return reply;
    });
    mockSendInternalError.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 500;
      return reply;
    });
    mockNotifyReactionAdded.mockResolvedValue(undefined);
  });

  // ─── POST /reactions ──────────────────────────────────────────────────────

  describe('POST /reactions — add reaction', () => {
    it('adds reaction when participantId is in authContext', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      const reaction = { id: 'r1', emoji: '👍', participantId: PARTICIPANT_ID };
      mockReactionServiceAddReaction.mockResolvedValue(reaction);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({ type: 'add' });
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockReactionServiceAddReaction).toHaveBeenCalledWith({
        messageId: MSG_ID,
        emoji: '👍',
        participantId: PARTICIPANT_ID,
      });
      expect(reply._body).toMatchObject({ success: true, data: reaction });
      expect(reply._status).toBe(201);
    });

    it('looks up participantId from DB when not in authContext', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      const reaction = { id: 'r1', emoji: '❤️' };
      mockReactionServiceAddReaction.mockResolvedValue(reaction);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({});
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({
        body: { messageId: MSG_ID, emoji: '❤️' },
        authContext: { isAuthenticated: true, userId: USER_ID, isAnonymous: false, sessionToken: null, participantId: undefined },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, conversationId: CONV_ID, isActive: true },
        select: { id: true },
      });
      expect(reply._body).toMatchObject({ success: true });
    });

    it('returns 403 when participantId cannot be resolved', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
      fastify.prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({
        body: { messageId: MSG_ID, emoji: '👍' },
        authContext: { isAuthenticated: true, userId: USER_ID, isAnonymous: false, sessionToken: null, participantId: undefined },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._body).toMatchObject({ error: 'You are not a participant of this conversation' });
      expect(reply._status).toBe(403);
    });

    it('returns 500 when reactionService.addReaction returns null', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      mockReactionServiceAddReaction.mockResolvedValue(null);

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
      expect(reply._body).toMatchObject({ error: 'Failed to add reaction' });
    });

    it('broadcasts via socketIO when message is found', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      const reaction = { id: 'r1', emoji: '🔥' };
      mockReactionServiceAddReaction.mockResolvedValue(reaction);
      const updateEvent = { type: 'add', emoji: '🔥' };
      mockReactionServiceCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '🔥' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith('reaction:added', updateEvent);
    });

    it('fires notifyReactionAdded fire-and-forget', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      const reaction = { id: 'r1', emoji: '👍' };
      mockReactionServiceAddReaction.mockResolvedValue(reaction);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({});
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockNotifyReactionAdded).toHaveBeenCalledWith(
        { prisma: fastify.prisma, notificationService: null },
        { messageId: MSG_ID, reactorParticipantId: PARTICIPANT_ID, emoji: '👍', isAnonymous: false }
      );
    });

    it('returns 400 for Invalid emoji format error', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      mockReactionServiceAddReaction.mockRejectedValue(new Error('Invalid emoji format'));

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: 'bad' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
      expect(reply._body).toMatchObject({ error: 'Invalid emoji format' });
    });

    it('returns 404 for Message not found error', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      mockReactionServiceAddReaction.mockRejectedValue(new Error('Message not found'));

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('returns 403 for not a member error', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      mockReactionServiceAddReaction.mockRejectedValue(new Error('User is not a member of this conversation'));

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('returns 403 for not a participant error', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      mockReactionServiceAddReaction.mockRejectedValue(new Error('User is not a participant of the conversation'));

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('returns 500 for unexpected errors', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      mockReactionServiceAddReaction.mockRejectedValue(new Error('DB connection failed'));

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });

    it('returns 400 when messageId or emoji is missing from body', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');

      const req = makeRequest({ body: { messageId: MSG_ID } }); // emoji missing
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
      expect(reply._body).toMatchObject({ error: 'messageId and emoji are required' });
    });

    it('logs error when notifyReactionAdded rejects (fire-and-forget catch)', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      const reaction = { id: 'r1', emoji: '👍' };
      mockReactionServiceAddReaction.mockResolvedValue(reaction);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({});
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
      const notifyError = new Error('push failed');
      mockNotifyReactionAdded.mockRejectedValue(notifyError);

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      // The notification error is caught fire-and-forget — response still succeeds
      expect(reply._body).toMatchObject({ success: true });
      // Allow microtasks to flush so the .catch callback runs
      await Promise.resolve();
      expect(fastify.log.error).toHaveBeenCalledWith(
        { error: notifyError },
        'REST reaction notification creation failed'
      );
    });

    it('handles anonymous user reaction (no userId lookup)', async () => {
      const handler = getHandler(fastify, 'POST', '/reactions');
      const reaction = { id: 'r1', emoji: '👍' };
      mockReactionServiceAddReaction.mockResolvedValue(reaction);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({});
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({
        body: { messageId: MSG_ID, emoji: '👍' },
        authContext: {
          isAuthenticated: false,
          userId: undefined,
          isAnonymous: true,
          sessionToken: 'anon-session-123',
          participantId: PARTICIPANT_ID,
        },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockReactionServiceAddReaction).toHaveBeenCalled();
      expect(reply._body).toMatchObject({ success: true });
    });

    it('skips broadcast when socketIOHandler is absent', async () => {
      const fastifyNoSocket = createMockFastify();
      fastifyNoSocket.socketIOHandler = null;
      await reactionRoutes(fastifyNoSocket);
      const handler = getHandler(fastifyNoSocket, 'POST', '/reactions');

      const reaction = { id: 'r1', emoji: '👍' };
      mockReactionServiceAddReaction.mockResolvedValue(reaction);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({});
      fastifyNoSocket.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({ body: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._body).toMatchObject({ success: true });
    });
  });

  // ─── DELETE /reactions/:messageId/:emoji ──────────────────────────────────

  describe('DELETE /reactions/:messageId/:emoji — remove reaction', () => {
    it('removes reaction successfully', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      mockReactionServiceRemoveReaction.mockResolvedValue(true);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({ type: 'remove' });
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({ params: { messageId: MSG_ID, emoji: encodeURIComponent('👍') } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockReactionServiceRemoveReaction).toHaveBeenCalledWith({
        messageId: MSG_ID,
        emoji: '👍',
        participantId: PARTICIPANT_ID,
      });
      expect(reply._body).toMatchObject({ success: true, data: { message: 'Reaction removed successfully' } });
    });

    it('URL-decodes the emoji from params', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      mockReactionServiceRemoveReaction.mockResolvedValue(true);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({});
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({ params: { messageId: MSG_ID, emoji: '%F0%9F%91%8D' } }); // 👍 URL-encoded
      const reply = makeReply();

      await handler(req, reply);

      expect(mockReactionServiceRemoveReaction).toHaveBeenCalledWith(
        expect.objectContaining({ emoji: '👍' })
      );
    });

    it('looks up participantId from DB when not in authContext', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
      mockReactionServiceRemoveReaction.mockResolvedValue(true);
      mockReactionServiceCreateUpdateEvent.mockResolvedValue({});

      const req = makeRequest({
        params: { messageId: MSG_ID, emoji: '👍' },
        authContext: { isAuthenticated: true, userId: USER_ID, isAnonymous: false, sessionToken: null, participantId: undefined },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).toHaveBeenCalled();
      expect(reply._body).toMatchObject({ success: true });
    });

    it('returns 403 when participantId cannot be resolved', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });
      fastify.prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({
        params: { messageId: MSG_ID, emoji: '👍' },
        authContext: { isAuthenticated: true, userId: USER_ID, isAnonymous: false, sessionToken: null, participantId: undefined },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('returns 404 when reaction not found', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      mockReactionServiceRemoveReaction.mockResolvedValue(false);

      const req = makeRequest({ params: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('broadcasts removal via socketIO', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      mockReactionServiceRemoveReaction.mockResolvedValue(true);
      const updateEvent = { type: 'remove', emoji: '👍' };
      mockReactionServiceCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue({ conversationId: CONV_ID });

      const req = makeRequest({ params: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith('reaction:removed', updateEvent);
    });

    it('returns 400 for Invalid emoji format error', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      mockReactionServiceRemoveReaction.mockRejectedValue(new Error('Invalid emoji format'));

      const req = makeRequest({ params: { messageId: MSG_ID, emoji: 'bad' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 500 for unexpected errors in DELETE', async () => {
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');
      mockReactionServiceRemoveReaction.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ params: { messageId: MSG_ID, emoji: '👍' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });

  // ─── GET /reactions/:messageId ────────────────────────────────────────────

  describe('GET /reactions/:messageId — get message reactions', () => {
    it('returns reactions when user is a conversation member', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');
      const reactions = [{ emoji: '👍', count: 2 }];
      mockReactionServiceGetMessageReactions.mockResolvedValue(reactions);
      fastify.prisma.message.findUnique.mockResolvedValue({
        conversationId: CONV_ID,
        conversation: {
          participants: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
        },
      });

      const req = makeRequest({ params: { messageId: MSG_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockReactionServiceGetMessageReactions).toHaveBeenCalledWith({
        messageId: MSG_ID,
        currentParticipantId: PARTICIPANT_ID,
      });
      expect(reply._body).toMatchObject({ success: true, data: reactions });
    });

    it('returns 404 when message not found', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');
      fastify.prisma.message.findUnique.mockResolvedValue(null);

      const req = makeRequest({ params: { messageId: MSG_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('returns 403 when user is not a conversation member', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');
      fastify.prisma.message.findUnique.mockResolvedValue({
        conversationId: CONV_ID,
        conversation: {
          participants: [{ userId: OTHER_USER_ID }],
        },
      });

      const req = makeRequest({ params: { messageId: MSG_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('returns 403 for anonymous user not in conversation', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');
      const anonSession = 'anon-sess-xyz';
      fastify.prisma.message.findUnique.mockResolvedValue({
        conversationId: CONV_ID,
        conversation: {
          participants: [{ id: 'other-anon-id' }],
        },
      });

      const req = makeRequest({
        params: { messageId: MSG_ID },
        authContext: {
          isAuthenticated: false,
          userId: undefined,
          isAnonymous: true,
          sessionToken: anonSession,
          participantId: undefined,
        },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('allows anonymous user when their session matches a participant', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');
      const anonSession = 'anon-sess-match';
      mockReactionServiceGetMessageReactions.mockResolvedValue([]);
      fastify.prisma.message.findUnique.mockResolvedValue({
        conversationId: CONV_ID,
        conversation: {
          participants: [{ id: anonSession }],
        },
      });

      const req = makeRequest({
        params: { messageId: MSG_ID },
        authContext: {
          isAuthenticated: false,
          userId: undefined,
          isAnonymous: true,
          sessionToken: anonSession,
          participantId: undefined,
        },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._body).toMatchObject({ success: true });
    });

    it('looks up participantId from DB when not in authContext for GET', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');
      mockReactionServiceGetMessageReactions.mockResolvedValue([]);
      fastify.prisma.message.findUnique.mockResolvedValue({
        conversationId: CONV_ID,
        conversation: {
          participants: [{ userId: USER_ID }],
        },
      });
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({
        params: { messageId: MSG_ID },
        authContext: { isAuthenticated: true, userId: USER_ID, isAnonymous: false, sessionToken: null, participantId: undefined },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).toHaveBeenCalled();
      expect(reply._body).toMatchObject({ success: true });
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');
      fastify.prisma.message.findUnique.mockRejectedValue(new Error('DB down'));

      const req = makeRequest({ params: { messageId: MSG_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });

  // ─── GET /reactions/user/:userId ─────────────────────────────────────────

  describe('GET /reactions/user/:userId — get user reactions', () => {
    it('returns user reactions when userId matches current user', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');
      const reactions = [{ id: 'r1', emoji: '👍' }];
      mockReactionServiceGetParticipantReactions.mockResolvedValue(reactions);

      const req = makeRequest({ params: { userId: USER_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockReactionServiceGetParticipantReactions).toHaveBeenCalledWith(USER_ID);
      expect(reply._body).toMatchObject({ success: true, data: reactions });
    });

    it('returns 403 for anonymous users', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');

      const req = makeRequest({
        params: { userId: 'some-user-id' },
        authContext: {
          isAuthenticated: false,
          userId: undefined,
          isAnonymous: true,
          sessionToken: 'anon-session',
          participantId: undefined,
        },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
      expect(reply._body).toMatchObject({ error: 'Anonymous users cannot access user reactions' });
    });

    it('returns 403 when requesting another user reactions', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');

      const req = makeRequest({
        params: { userId: OTHER_USER_ID },
        authContext: { isAuthenticated: true, userId: USER_ID, isAnonymous: false, sessionToken: null, participantId: PARTICIPANT_ID },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
      expect(reply._body).toMatchObject({ error: 'You can only view your own reactions' });
    });

    it('returns 500 on unexpected error in user reactions', async () => {
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');
      mockReactionServiceGetParticipantReactions.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ params: { userId: USER_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });
});
