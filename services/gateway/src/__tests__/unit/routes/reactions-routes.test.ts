/**
 * Unit tests for routes/reactions.ts
 *
 * Uses the mock-Fastify pattern: registers the route plugin against a synthetic
 * fastify object and invokes handlers directly so we avoid spinning up a real
 * HTTP server while still driving every branch in the route file.
 *
 * Routes covered (all 4):
 *   POST   /reactions                      - addReaction
 *   DELETE /reactions/:messageId/:emoji    - removeReaction
 *   GET    /reactions/:messageId           - getMessageReactions
 *   GET    /reactions/user/:userId         - getUserReactions
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module-level mock variables (must be declared before jest.mock()) ─────────

const mockAddReaction = jest.fn<any>();
const mockRemoveReaction = jest.fn<any>();
const mockGetMessageReactions = jest.fn<any>();
const mockGetParticipantReactions = jest.fn<any>();
const mockGetUserReactions = jest.fn<any>();
const mockCreateUpdateEvent = jest.fn<any>();

const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  reply.statusCode = opts?.statusCode ?? 200;
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 400;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 403;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 404;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 500;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendConflict = jest.fn<any>((reply: any, msg: any, opts?: any) => {
  reply.statusCode = 409;
  reply._body = { success: false, error: msg, code: opts?.code };
  return reply;
});

const mockNotifyReactionAdded = jest.fn<any>().mockResolvedValue(undefined);
const mockNotifyReactionRemoved = jest.fn<any>().mockResolvedValue(undefined);

// Auth mock: configurable per-test via authContextOverride
let authContextOverride: Record<string, any> = {};

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn<any>().mockImplementation(() => ({
    addReaction: (...args: any[]) => mockAddReaction(...args),
    removeReaction: (...args: any[]) => mockRemoveReaction(...args),
    getMessageReactions: (...args: any[]) => mockGetMessageReactions(...args),
    getParticipantReactions: (...args: any[]) => mockGetParticipantReactions(...args),
    getUserReactions: (...args: any[]) => mockGetUserReactions(...args),
    createUpdateEvent: (...args: any[]) => mockCreateUpdateEvent(...args),
  })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: (...args: any[]) => mockNotifyReactionAdded(...args),
  notifyReactionRemoved: (...args: any[]) => mockNotifyReactionRemoved(...args),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  reactionSchema: {},
  reactionSummarySchema: {},
  addReactionRequestSchema: {},
  errorResponseSchema: {},
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

// ─── Import SUT after mocks ────────────────────────────────────────────────────

import reactionRoutes from '../../../routes/reactions';
import { ConflictError } from '../../../errors/custom-errors';
import { REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const SESSION_TOKEN = 'anon-session-token-abc123';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;

const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
// The offline-replay audience. REST is the PRIMARY reaction transport for iOS
// (`ReactionService.swift` → POST /reactions, DELETE /reactions/:id/:emoji), so
// a reaction that only reaches the live conversation room is lost forever for
// any participant offline at that instant.
const mockEnqueueOfflineReaction = jest.fn<any>(async (_params: any) => {});
const mockGetManager = jest.fn().mockReturnValue({
  getIO: mockGetIO,
  enqueueOfflineReactionMutation: mockEnqueueOfflineReaction,
});

function createMockFastify(withSocket = true) {
  const routes: Record<string, Record<string, RouteHandler>> = {};

  const fastify: any = {
    prisma: {
      message: {
        findUnique: jest.fn<any>(),
        findFirst: jest.fn<any>(),
      },
      participant: {
        findFirst: jest.fn<any>(),
      },
    },
    notificationService: {},
    log: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    post: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      (routes['POST'] = routes['POST'] ?? {})[path] = handler;
    }),
    get: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      (routes['GET'] = routes['GET'] ?? {})[path] = handler;
    }),
    delete: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      (routes['DELETE'] = routes['DELETE'] ?? {})[path] = handler;
    }),
    _routes: routes,
  };

  if (withSocket) {
    fastify.socketIOHandler = {
      getManager: mockGetManager,
    };
  }

  // reactionRoutes accesses fastify.socketIOHandler at plugin init time so we
  // need to assign it before calling the plugin.
  return fastify;
}

function createMockReply(): any {
  const reply: any = {
    _body: undefined,
    statusCode: 200,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => {
      reply._body = body;
      return reply;
    }),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

function makeAuthContext(overrides: Record<string, any> = {}) {
  return {
    type: 'registered' as const,
    isAnonymous: false,
    userId: USER_ID,
    hasFullAccess: true,
    participantId: PARTICIPANT_ID,
    sessionToken: undefined,
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    body: {},
    query: {},
    authContext: makeAuthContext(),
    ...overrides,
  };
}

function getHandler(fastify: any, method: string, pathFragment: string): RouteHandler {
  const methodRoutes = fastify._routes[method] ?? {};
  if (methodRoutes[pathFragment]) return methodRoutes[pathFragment];
  const key = Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) {
    throw new Error(
      `No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`
    );
  }
  return methodRoutes[key];
}

function setup(withSocket = true) {
  const fastify = createMockFastify(withSocket);
  reactionRoutes(fastify);
  return { fastify, reply: createMockReply() };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reactionRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateUpdateEvent.mockResolvedValue({ messageId: MESSAGE_ID, emoji: '👍' });
    mockNotifyReactionAdded.mockResolvedValue(undefined);
    mockNotifyReactionRemoved.mockResolvedValue(undefined);
    mockEmit.mockClear();
    mockTo.mockClear();
    mockGetIO.mockClear();
    mockGetManager.mockClear();
    // Restore default mock implementations after clearAllMocks
    mockTo.mockReturnValue({ emit: mockEmit });
    mockGetIO.mockReturnValue({ to: mockTo });
    mockEnqueueOfflineReaction.mockResolvedValue(undefined);
    mockGetManager.mockReturnValue({
      getIO: mockGetIO,
      enqueueOfflineReactionMutation: mockEnqueueOfflineReaction,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /reactions
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /reactions', () => {
    const reactionData = {
      id: 'reaction-id-1',
      messageId: MESSAGE_ID,
      emoji: '👍',
      participantId: PARTICIPANT_ID,
      createdAt: new Date(),
    };
    const messageRow = { conversationId: CONV_ID };

    it('returns 201 when auth user has participantId in context (no DB lookup)', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockAddReaction).toHaveBeenCalledWith({
        messageId: MESSAGE_ID,
        emoji: '👍',
        participantId: PARTICIPANT_ID,
      });
      expect(mockSendSuccess).toHaveBeenCalledWith(reply, reactionData, { statusCode: 201 });
      expect(reply.statusCode).toBe(201);
    });

    it('looks up participant from DB when no participantId in context', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
      mockAddReaction.mockResolvedValue({ reaction: reactionData });

      const req = makeRequest({
        body: { messageId: MESSAGE_ID, emoji: '👍' },
        authContext: makeAuthContext({ participantId: undefined }),
      });
      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, conversationId: CONV_ID, isActive: true },
        select: { id: true },
      });
      expect(mockAddReaction).toHaveBeenCalledWith({
        messageId: MESSAGE_ID,
        emoji: '👍',
        participantId: PARTICIPANT_ID,
      });
      expect(reply.statusCode).toBe(201);
    });

    it('returns 403 when no participantId in context and no participant found in DB', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);
      fastify.prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({
        body: { messageId: MESSAGE_ID, emoji: '👍' },
        authContext: makeAuthContext({ participantId: undefined }),
      });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        'You are not a participant of this conversation'
      );
      expect(reply.statusCode).toBe(403);
    });

    it('returns 403 when no participantId at all (anonymous without participantId)', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      const req = makeRequest({
        body: { messageId: MESSAGE_ID, emoji: '👍' },
        authContext: makeAuthContext({
          isAnonymous: true,
          userId: undefined,
          participantId: undefined,
          sessionToken: SESSION_TOKEN,
        }),
      });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        'You are not a participant of this conversation'
      );
    });

    it('returns 500 when reactionService.addReaction returns null', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue(null);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Failed to add reaction');
      expect(reply.statusCode).toBe(500);
    });

    it('returns 400 when service throws "Invalid emoji format"', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockRejectedValue(new Error('Invalid emoji format'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: 'bad' } });
      await handler(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Invalid emoji format');
      expect(reply.statusCode).toBe(400);
    });

    it('returns 404 when service throws "Message not found"', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockRejectedValue(new Error('Message not found'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
      expect(reply.statusCode).toBe(404);
    });

    /**
     * REPOINTÉ depuis la porte IMBRIQUÉE retirée (#4188/#4190).
     *
     * `POST /conversations/:id/messages/:messageId/reactions` portait ce témoin
     * (« returns 400 when reacting to a system message ») ; la porte plate porte
     * la MÊME branche — `error.message === 'Cannot react to a system message'`
     * → `sendBadRequest` — et n'en avait AUCUN témoin. Supprimer l'imbriquée
     * sans repointer aurait emporté la seule couverture d'un comportement
     * toujours servi, et l'aurait fait en silence : la branche serait restée
     * là, verte de couverture ligne, sans que rien ne garde son CODE de retour.
     *
     * L'enjeu est ce code, pas le texte. Sans cette branche, réagir à un
     * message système retombe sur le `sendInternalError` du bas — un 500 pour
     * une règle produit, donc un client qui réessaie sans fin, exactement le
     * défaut que la branche 410 du fil clos corrige un peu plus bas.
     *
     * `ReactionService.test.ts` couvre le service qui LÈVE cette erreur ; il ne
     * dit rien de ce que la route en fait. Les deux moitiés sont disjointes.
     */
    it('returns 400 when service throws "Cannot react to a system message"', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockRejectedValue(new Error('Cannot react to a system message'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Cannot react to a system message');
      expect(reply.statusCode).toBe(400);
      // Le 500 est le repli du bas : c'est précisément ce que la branche évite.
      expect(mockSendInternalError).not.toHaveBeenCalled();
    });

    it('returns 409 with the reaction-limit message when service throws ConflictError (cap reached)', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockRejectedValue(
        new ConflictError(REACTION_LIMIT_REACHED_MESSAGE, 'REACTION_LIMIT_REACHED')
      );

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '🎉' } });
      await handler(req, reply);

      expect(mockSendConflict).toHaveBeenCalledWith(
        reply,
        REACTION_LIMIT_REACHED_MESSAGE,
        { code: 'REACTION_LIMIT_REACHED' }
      );
      expect(reply.statusCode).toBe(409);
    });

    it('returns 403 when service throws "not a member of..." error', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockRejectedValue(new Error('User is not a member of this conversation'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Access denied to this conversation');
    });

    it('returns 403 when service throws "not a participant" error', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockRejectedValue(new Error('User is not a participant'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Access denied to this conversation');
    });

    it('returns 500 on unexpected service error', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockRejectedValue(new Error('unexpected db crash'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Failed to add reaction');
    });

    it('returns 403 when message not found during participant DB lookup (no msg branch)', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      // findUnique returns null → msg is falsy → participantId stays undefined → 403
      fastify.prisma.message.findUnique.mockResolvedValue(null);

      const req = makeRequest({
        body: { messageId: MESSAGE_ID, emoji: '👍' },
        authContext: makeAuthContext({ participantId: undefined }),
      });
      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).not.toHaveBeenCalled();
      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        'You are not a participant of this conversation'
      );
    });

    it('skips broadcast when message not found after addReaction (no message branch in socket emit)', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      // findUnique for socket broadcast returns null → skip emit
      fastify.prisma.message.findUnique.mockResolvedValue(null);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockEmit).not.toHaveBeenCalled();
      // Still returns 201
      expect(reply.statusCode).toBe(201);
    });

    it('returns 400 when messageId is missing from body', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      const req = makeRequest({ body: { emoji: '👍' } });
      await handler(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(
        reply,
        'messageId and emoji are required'
      );
      expect(reply.statusCode).toBe(400);
    });

    it('returns 400 when emoji is missing from body', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      const req = makeRequest({ body: { messageId: MESSAGE_ID } });
      await handler(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(
        reply,
        'messageId and emoji are required'
      );
    });

    it('broadcasts REACTION_ADDED to conversation room when socketIOHandler and message exist', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'POST', '/reactions');

      const updateEvent = { messageId: MESSAGE_ID, emoji: '👍', action: 'add' };
      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      mockCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      expect(mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(mockEmit).toHaveBeenCalledWith('reaction:added', updateEvent);
    });

    it('queues REACTION_ADDED for participants who are offline, not just the live room', async () => {
      // The live room emit only reaches participants currently sitting in
      // `conversation:<id>`. Anyone offline gets nothing, so their cached
      // reaction counts stay stale until an unrelated full refetch. The socket
      // handler has always queued the replay; REST — the iOS transport — did not.
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'POST', '/reactions');

      const updateEvent = { messageId: MESSAGE_ID, emoji: '👍', action: 'add' };
      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      mockCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);
      await Promise.resolve();

      expect(mockEnqueueOfflineReaction).toHaveBeenCalledWith({
        conversationId: CONV_ID,
        actorParticipantId: PARTICIPANT_ID,
        eventType: 'reaction-added',
        messageId: MESSAGE_ID,
        emoji: '👍',
        payload: updateEvent,
      });
    });


    it('does not queue an offline replay for an idempotent re-react (nothing changed)', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue({ reaction: reactionData, unchanged: true });
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);
      await Promise.resolve();

      expect(mockEnqueueOfflineReaction).not.toHaveBeenCalled();
    });

    it('still returns 201 when the offline enqueue rejects — the reaction is committed', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);
      mockEnqueueOfflineReaction.mockRejectedValue(new Error('redis down'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);
      await Promise.resolve();

      expect(reply.statusCode).toBe(201);
    });

    it('skips broadcast and notification when addReaction reports unchanged (idempotent re-react)', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'POST', '/reactions');

      // The participant already had this exact emoji — a duplicate POST (client
      // retry / offline outbox replay) is a DB no-op. The route must return the
      // existing reaction WITHOUT broadcasting REACTION_ADDED or firing a push,
      // otherwise every participant gets a redundant fan-out and the author is
      // re-notified for a reaction that never changed. 200, not 201 — nothing
      // was created.
      mockAddReaction.mockResolvedValue({ reaction: reactionData, unchanged: true });
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);
      await Promise.resolve();

      expect(mockEmit).not.toHaveBeenCalled();
      expect(mockNotifyReactionAdded).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(200);
    });

    it('skips socket broadcast when socketIOHandler is absent', async () => {
      const { fastify, reply } = setup(false);
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      // emit should never be called
      expect(mockEmit).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(201);
    });

    it('fires notifyReactionAdded as fire-and-forget after successful add', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);

      // Allow microtasks to flush (void fire-and-forget)
      await Promise.resolve();

      expect(mockNotifyReactionAdded).toHaveBeenCalledWith(
        expect.objectContaining({ prisma: fastify.prisma }),
        expect.objectContaining({
          messageId: MESSAGE_ID,
          reactorParticipantId: PARTICIPANT_ID,
          emoji: '👍',
          isAnonymous: false,
        })
      );
    });

    it('logs error but does not fail when notifyReactionAdded rejects', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'POST', '/reactions');

      mockAddReaction.mockResolvedValue({ reaction: reactionData });
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);
      mockNotifyReactionAdded.mockRejectedValue(new Error('push failed'));

      const req = makeRequest({ body: { messageId: MESSAGE_ID, emoji: '👍' } });
      await handler(req, reply);
      await Promise.resolve(); // flush void promise chain

      // The route still returned 201 — notification failure is swallowed
      expect(reply.statusCode).toBe(201);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /reactions/:messageId/:emoji
  // ══════════════════════════════════════════════════════════════════════════

  describe('DELETE /reactions/:messageId/:emoji', () => {
    const encodedEmoji = encodeURIComponent('👍');
    const messageRow = { conversationId: CONV_ID };
    const updateEvent = { messageId: MESSAGE_ID, emoji: '👍', action: 'remove' };

    it('returns 200 and broadcasts REACTION_REMOVED on success', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(true);
      mockCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
      });
      await handler(req, reply);

      expect(mockRemoveReaction).toHaveBeenCalledWith({
        messageId: MESSAGE_ID,
        emoji: '👍',
        participantId: PARTICIPANT_ID,
      });
      expect(mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(mockEmit).toHaveBeenCalledWith('reaction:removed', updateEvent);
      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        { message: 'Reaction removed successfully' }
      );
      expect(reply.statusCode).toBe(200);
    });

    /**
     * Le symétrique du `notifyReactionAdded` de la route de pose. Sans lui,
     * « X a réagi 👍 à votre message » survit au 👍 : la notification garde une
     * copie dénormalisée que rien ne relit, donc aucun filtre à la lecture ne
     * peut la rattraper.
     */
    it('fires notifyReactionRemoved as fire-and-forget after successful remove', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(true);
      mockCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ params: { messageId: MESSAGE_ID, emoji: encodedEmoji } });
      await handler(req, reply);
      await Promise.resolve();

      expect(mockNotifyReactionRemoved).toHaveBeenCalledWith(
        expect.objectContaining({ prisma: fastify.prisma }),
        expect.objectContaining({
          messageId: MESSAGE_ID,
          // L'emoji DÉCODÉ, comme celui passé à `removeReaction` : la
          // notification porte le caractère, pas son échappement d'URL.
          emoji: '👍',
          reactorParticipantId: PARTICIPANT_ID,
          isAnonymous: false,
        })
      );
    });

    /**
     * Le retrait est un EFFET du dé-réagir, jamais sa condition : la réaction
     * est déjà partie de la base quand il s'exécute. Un rejet ne doit donc pas
     * transformer un dé-réagir réussi en 500 — c'est ce que ferait un `void`
     * sans `.catch`, et pire : sous Node 22 le rejet non écouté tue le process.
     */
    it('reste en 200 quand la rétractation de notification rejette', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(true);
      mockCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);
      mockNotifyReactionRemoved.mockRejectedValue(new Error('retraction failed'));

      const req = makeRequest({ params: { messageId: MESSAGE_ID, emoji: encodedEmoji } });
      await handler(req, reply);
      await Promise.resolve();

      expect(reply.statusCode).toBe(200);
    });

    it('queues REACTION_REMOVED for participants who are offline, not just the live room', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(true);
      mockCreateUpdateEvent.mockResolvedValue(updateEvent);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({ params: { messageId: MESSAGE_ID, emoji: encodedEmoji } });
      await handler(req, reply);
      await Promise.resolve();

      expect(mockEnqueueOfflineReaction).toHaveBeenCalledWith({
        conversationId: CONV_ID,
        actorParticipantId: PARTICIPANT_ID,
        eventType: 'reaction-removed',
        messageId: MESSAGE_ID,
        emoji: '👍',
        payload: updateEvent,
      });
    });

    it('does not queue an offline replay when the reaction was already absent', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(false);

      const req = makeRequest({ params: { messageId: MESSAGE_ID, emoji: encodedEmoji } });
      await handler(req, reply);
      await Promise.resolve();

      expect(mockEnqueueOfflineReaction).not.toHaveBeenCalled();
    });

    it('returns 403 when no participantId and anonymous without userId', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
        authContext: makeAuthContext({
          isAnonymous: true,
          userId: undefined,
          participantId: undefined,
          sessionToken: SESSION_TOKEN,
        }),
      });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        'You are not a participant of this conversation'
      );
    });

    it('is idempotent — returns success (not 404) when the reaction is already absent', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(false); // no matching reaction row

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
      });
      await handler(req, reply);

      // DELETE is idempotent: the desired end-state (reaction absent) is already
      // achieved, so return success. A 404 makes the iOS outbox treat it as a
      // permanent reject and roll the optimistic un-react back, re-showing a
      // reaction that is gone. Mirrors the add path's idempotent P2002 handling.
      expect(mockSendNotFound).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { message: 'Reaction already absent' });
      // Nothing changed → no broadcast.
      expect(mockEmit).not.toHaveBeenCalledWith('reaction:removed', expect.anything());
    });

    it('returns 400 when service throws "Invalid emoji format"', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockRejectedValue(new Error('Invalid emoji format'));

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
      });
      await handler(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Invalid emoji format');
      expect(reply.statusCode).toBe(400);
    });

    it('returns 500 on unexpected service error', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockRejectedValue(new Error('db timeout'));

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
      });
      await handler(req, reply);

      expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Failed to remove reaction');
    });

    it('decodes URL-encoded emoji before passing to service', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(true);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const heartEmoji = '❤️';
      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodeURIComponent(heartEmoji) },
      });
      await handler(req, reply);

      expect(mockRemoveReaction).toHaveBeenCalledWith(
        expect.objectContaining({ emoji: heartEmoji })
      );
    });

    it('skips broadcast when socketIOHandler is absent', async () => {
      const { fastify, reply } = setup(false);
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(true);
      fastify.prisma.message.findUnique.mockResolvedValue(messageRow);

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
      });
      await handler(req, reply);

      expect(mockEmit).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(200);
    });

    it('looks up participantId from DB when not in context (auth user)', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      fastify.prisma.message.findUnique
        // first call: resolve conversationId for participant lookup
        .mockResolvedValueOnce(messageRow)
        // second call: after remove, for broadcast
        .mockResolvedValueOnce(messageRow);
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
      mockRemoveReaction.mockResolvedValue(true);

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
        authContext: makeAuthContext({ participantId: undefined }),
      });
      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).toHaveBeenCalled();
      expect(mockRemoveReaction).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: PARTICIPANT_ID })
      );
    });

    it('returns 403 when message not found during participant DB lookup (no msg branch)', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      // findUnique returns null → msg is falsy → participantId stays undefined → 403
      fastify.prisma.message.findUnique.mockResolvedValue(null);

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
        authContext: makeAuthContext({ participantId: undefined }),
      });
      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).not.toHaveBeenCalled();
      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        'You are not a participant of this conversation'
      );
    });

    it('skips broadcast when message not found after remove (no message branch in socket emit)', async () => {
      const { fastify, reply } = setup(true);
      const handler = getHandler(fastify, 'DELETE', '/reactions/:messageId/:emoji');

      mockRemoveReaction.mockResolvedValue(true);
      // First findUnique (for participantId): participant already in context so not called
      // Second findUnique (for broadcast): returns null → skip emit
      fastify.prisma.message.findUnique.mockResolvedValue(null);

      const req = makeRequest({
        params: { messageId: MESSAGE_ID, emoji: encodedEmoji },
        // participantId in context so no lookup needed
      });
      await handler(req, reply);

      expect(mockEmit).not.toHaveBeenCalled();
      expect(reply.statusCode).toBe(200);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /reactions/:messageId
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /reactions/:messageId', () => {
    const reactionsResult = {
      messageId: MESSAGE_ID,
      reactions: [],
      totalCount: 0,
      userReactions: [],
    };

    function makeMessageWithParticipants(participantOverrides: any[] = []) {
      return {
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        conversation: {
          participants: [
            { id: PARTICIPANT_ID, userId: USER_ID, isActive: true },
            ...participantOverrides,
          ],
        },
      };
    }

    it('returns 404 when message is not found', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');

      fastify.prisma.message.findUnique.mockResolvedValue(null);

      const req = makeRequest({ params: { messageId: MESSAGE_ID } });
      await handler(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
      expect(reply.statusCode).toBe(404);
    });

    it('returns 200 with reactions for authenticated member', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');

      fastify.prisma.message.findUnique.mockResolvedValue(makeMessageWithParticipants());
      mockGetMessageReactions.mockResolvedValue(reactionsResult);

      const req = makeRequest({ params: { messageId: MESSAGE_ID } });
      await handler(req, reply);

      expect(mockGetMessageReactions).toHaveBeenCalledWith({
        messageId: MESSAGE_ID,
        currentParticipantId: PARTICIPANT_ID,
      });
      expect(mockSendSuccess).toHaveBeenCalledWith(reply, reactionsResult);
      expect(reply.statusCode).toBe(200);
    });

    it('returns 403 when authenticated user is not a member', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');

      const otherUserId = '507f1f77bcf86cd799439099';
      fastify.prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        conversation: {
          participants: [{ id: 'other-part', userId: otherUserId, isActive: true }],
        },
      });

      const req = makeRequest({ params: { messageId: MESSAGE_ID } });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Access denied to this conversation');
      expect(reply.statusCode).toBe(403);
    });

    it('returns 200 for anonymous participant (participant id is an ObjectId, not the sessionToken)', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');

      // Realistic anonymous shape: createAnonymousUserContext sets
      // participantId to the Participant.id (an ObjectId) and keeps the raw
      // sessionToken separate. PARTICIPANT_ID !== SESSION_TOKEN by construction.
      fastify.prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        conversation: {
          participants: [
            { id: PARTICIPANT_ID, userId: null, isActive: true },
          ],
        },
      });
      mockGetMessageReactions.mockResolvedValue(reactionsResult);

      const req = makeRequest({
        params: { messageId: MESSAGE_ID },
        authContext: makeAuthContext({
          isAnonymous: true,
          userId: PARTICIPANT_ID,
          participantId: PARTICIPANT_ID,
          sessionToken: SESSION_TOKEN,
        }),
      });
      await handler(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, reactionsResult);
      expect(reply.statusCode).toBe(200);
    });

    it('returns 403 for anonymous user who is NOT a participant', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');

      const otherParticipantId = '507f1f77bcf86cd799439066';
      fastify.prisma.message.findUnique.mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        conversation: {
          participants: [{ id: otherParticipantId, userId: null, isActive: true }],
        },
      });

      const req = makeRequest({
        params: { messageId: MESSAGE_ID },
        authContext: makeAuthContext({
          isAnonymous: true,
          userId: PARTICIPANT_ID,
          participantId: PARTICIPANT_ID,
          sessionToken: SESSION_TOKEN,
        }),
      });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Access denied to this conversation');
    });

    it('resolves currentParticipantId from DB when not in authContext', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');

      const dbParticipantId = '507f1f77bcf86cd799439055';
      fastify.prisma.message.findUnique.mockResolvedValue(makeMessageWithParticipants());
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: dbParticipantId });
      mockGetMessageReactions.mockResolvedValue(reactionsResult);

      const req = makeRequest({
        params: { messageId: MESSAGE_ID },
        authContext: makeAuthContext({ participantId: undefined }),
      });
      await handler(req, reply);

      expect(fastify.prisma.participant.findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, conversationId: CONV_ID, isActive: true },
        select: { id: true },
      });
      expect(mockGetMessageReactions).toHaveBeenCalledWith({
        messageId: MESSAGE_ID,
        currentParticipantId: dbParticipantId,
      });
    });

    it('returns 500 on unexpected error', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/:messageId');

      fastify.prisma.message.findUnique.mockRejectedValue(new Error('db error'));

      const req = makeRequest({ params: { messageId: MESSAGE_ID } });
      await handler(req, reply);

      expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Failed to get reactions');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /reactions/user/:userId
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /reactions/user/:userId', () => {
    const userReactions = [
      { id: 'r1', emoji: '👍', messageId: MESSAGE_ID },
      { id: 'r2', emoji: '❤️', messageId: MESSAGE_ID },
    ];

    it('returns 403 for anonymous users', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');

      const req = makeRequest({
        params: { userId: USER_ID },
        authContext: makeAuthContext({
          isAnonymous: true,
          userId: undefined,
          sessionToken: SESSION_TOKEN,
        }),
      });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        'Anonymous users cannot access user reactions'
      );
      expect(reply.statusCode).toBe(403);
    });

    it('returns 403 when currentUserId !== targetUserId', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');

      const otherUserId = '507f1f77bcf86cd799439099';
      const req = makeRequest({
        params: { userId: otherUserId },
        authContext: makeAuthContext({ userId: USER_ID }),
      });
      await handler(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'You can only view your own reactions');
      expect(reply.statusCode).toBe(403);
    });

    it('returns 200 with reactions for own userId', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');

      mockGetUserReactions.mockResolvedValue(userReactions);

      const req = makeRequest({
        params: { userId: USER_ID },
        authContext: makeAuthContext({ userId: USER_ID }),
      });
      await handler(req, reply);

      expect(mockGetUserReactions).toHaveBeenCalledWith(USER_ID);
      expect(mockSendSuccess).toHaveBeenCalledWith(reply, userReactions);
      expect(reply.statusCode).toBe(200);
    });

    it('returns 500 on unexpected service error', async () => {
      const { fastify, reply } = setup();
      const handler = getHandler(fastify, 'GET', '/reactions/user/:userId');

      mockGetUserReactions.mockRejectedValue(new Error('redis down'));

      const req = makeRequest({
        params: { userId: USER_ID },
        authContext: makeAuthContext({ userId: USER_ID }),
      });
      await handler(req, reply);

      expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Failed to get user reactions');
    });
  });
});
