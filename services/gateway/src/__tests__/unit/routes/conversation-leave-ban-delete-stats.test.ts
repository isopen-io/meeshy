import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (must be hoisted before imports) ───────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object' },
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any, data: any) => {
    reply._body = { success: true, data };
    return reply;
  }),
  sendBadRequest: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
  sendForbidden: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
  sendNotFound: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
  sendInternalError: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
}));

jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    getStats: jest.fn<any>(),
  },
}));

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: jest.fn<any>(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { resolveConversationId } from '../../../utils/conversation-id-cache';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../../utils/response';
import { registerLeaveRoutes } from '../../../routes/conversations/leave';
import { registerBanRoutes } from '../../../routes/conversations/ban';
import { registerDeleteForMeRoutes } from '../../../routes/conversations/delete-for-me';
import { registerStatsRoutes } from '../../../routes/conversations/stats';
import { conversationMessageStatsService } from '../../../services/ConversationMessageStatsService';
import { canAccessConversation } from '../../../routes/conversations/utils/access-control';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Typed mocks ─────────────────────────────────────────────────────────────

const mockedResolve = resolveConversationId as jest.MockedFunction<typeof resolveConversationId>;
const mockedSendSuccess = sendSuccess as jest.MockedFunction<typeof sendSuccess>;
const mockedSendBadRequest = sendBadRequest as jest.MockedFunction<typeof sendBadRequest>;
const mockedSendForbidden = sendForbidden as jest.MockedFunction<typeof sendForbidden>;
const mockedSendNotFound = sendNotFound as jest.MockedFunction<typeof sendNotFound>;
const mockedSendInternalError = sendInternalError as jest.MockedFunction<typeof sendInternalError>;
const mockedGetStats = (conversationMessageStatsService.getStats as jest.MockedFunction<any>);
const mockedCanAccess = canAccessConversation as jest.MockedFunction<typeof canAccessConversation>;

// ─── IDs ─────────────────────────────────────────────────────────────────────

const VALID_CONV_ID = '507f1f77bcf86cd799439011';
const VALID_USER_ID = '507f1f77bcf86cd799439022';
const TARGET_USER_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const TARGET_PARTICIPANT_ID = '507f1f77bcf86cd799439055';

// ─── Factories ───────────────────────────────────────────────────────────────

type RouteHandler = (request: any, reply: any) => Promise<any>;
type RouteRegistration = { method: string; path: string; handler: RouteHandler; options: any };

function createMockFastify() {
  const routes: RouteRegistration[] = [];
  return {
    routes,
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    delete: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'DELETE', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
    socketIOHandler: undefined as any,
  };
}

function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathFragment: string) {
  const r = fastify.routes.find(r => r.method === method && r.path.includes(pathFragment));
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not registered`);
  return r;
}

function createMockReply() {
  const reply: any = { _body: undefined, status: jest.fn<any>(), send: jest.fn<any>() };
  reply.status.mockReturnValue(reply);
  return reply;
}

function createMockPrisma() {
  return {
    conversation: {
      findFirst: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findMany: jest.fn<any>(),
    },
  } as any;
}

function createMockIO(extraSockets: any[] = []) {
  const mockEmit = jest.fn<any>();
  const mockLeave = jest.fn<any>();
  const sockets = extraSockets.length > 0 ? extraSockets : [{ leave: mockLeave }];
  return {
    to: jest.fn<any>().mockReturnValue({ emit: mockEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue(sockets) }),
    _emit: mockEmit,
    _leave: mockLeave,
  };
}

function wireIO(fastify: ReturnType<typeof createMockFastify>, io?: any) {
  const invalidateParticipantCache = jest.fn<any>();
  fastify.socketIOHandler = io
    ? { getManager: () => ({ getIO: () => io, invalidateParticipantCache }) }
    : undefined;
  (fastify as any)._invalidateParticipantCache = invalidateParticipantCache;
}

function makeRequest(params: Record<string, string>, userId: string, extra: Record<string, any> = {}) {
  return {
    params,
    authContext: { userId, isAuthenticated: true, isAnonymous: false },
    ...extra,
  };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return {
    id: PARTICIPANT_ID,
    conversationId: VALID_CONV_ID,
    userId: VALID_USER_ID,
    role: 'member',
    displayName: 'Alice',
    isActive: true,
    bannedAt: null,
    joinedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerLeaveRoutes — POST /conversations/:id/leave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, resolveConversationId returns the raw id unchanged (already a valid ObjectId)
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
  });

  function setup(ioInstance?: any) {
    const fastify = createMockFastify();
    wireIO(fastify, ioInstance);
    const prisma = createMockPrisma();
    registerLeaveRoutes(fastify, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'leave');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  it('returns 404 when participant not found', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(null);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns success when a regular member leaves (no IO)', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PARTICIPANT_ID } })
    );
    expect(mockedSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ conversationId: VALID_CONV_ID })
    );
  });

  it('returns 400 when creator tries to leave with other active participants', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.count.mockResolvedValue(2);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String));
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('deactivates conversation when creator is last member', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.count.mockResolvedValue(0);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('emits CONVERSATION_PARTICIPANT_LEFT and removes user from room when IO present', async () => {
    const io = createMockIO();
    const { fastify, prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(io.to).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
    expect(io._emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
      expect.objectContaining({ userId: VALID_USER_ID })
    );
    expect(io.in).toHaveBeenCalledWith(ROOMS.user(VALID_USER_ID));
    expect(io._leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
    expect((fastify as any)._invalidateParticipantCache).toHaveBeenCalledWith(VALID_USER_ID, VALID_CONV_ID);
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('handles multiple sockets when leaving room', async () => {
    const leaves = [jest.fn<any>(), jest.fn<any>()];
    const io = createMockIO(leaves.map(leave => ({ leave })));
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    leaves.forEach(leave => expect(leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID)));
  });

  it('resolves non-ObjectId identifier via resolveConversationId', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    const request = makeRequest({ id: 'my-conversation-slug' }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedResolve).toHaveBeenCalledWith(prisma, 'my-conversation-slug');
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('falls back to raw id when resolveConversationId returns null', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    prisma.participant.findFirst.mockResolvedValue(null);
    const request = makeRequest({ id: 'unknown-slug' }, VALID_USER_ID);
    await route.handler(request, reply);
    // Should not throw; uses raw id as fallback
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ conversationId: 'unknown-slug' }) })
    );
    expect(mockedSendNotFound).toHaveBeenCalled();
  });

  it('creator leaves with no other members and no IO', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.count.mockResolvedValue(0);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(mockedSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ conversationId: VALID_CONV_ID }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BAN ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerBanRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
  });

  function setup(ioInstance?: any) {
    const fastify = createMockFastify();
    wireIO(fastify, ioInstance);
    const prisma = createMockPrisma();
    registerBanRoutes(fastify, prisma, jest.fn(), jest.fn());
    const banRoute = getRoute(fastify, 'PATCH', '/ban');
    const unbanRoute = getRoute(fastify, 'PATCH', '/unban');
    const reply = createMockReply();
    return { fastify, prisma, banRoute, unbanRoute, reply };
  }

  // ── BAN ──────────────────────────────────────────────────────────────────

  describe('PATCH /conversations/:id/participants/:userId/ban', () => {
    it('returns 404 when current user is not in conversation', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst.mockResolvedValue(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 404 when target participant not found', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 400 when target is already banned', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'member', bannedAt: new Date(), displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 403 when current user has equal role to target', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'moderator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'moderator', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 403 when current user has lower role than target', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'member' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'admin', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('bans target when admin bans member (no IO)', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TARGET_PARTICIPANT_ID },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockedSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ userId: TARGET_USER_ID })
      );
    });

    it('emits CONVERSATION_PARTICIPANT_BANNED and removes sockets when IO present', async () => {
      const io = createMockIO();
      const { fastify, prisma, banRoute, reply } = setup(io);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(io._emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED,
        expect.objectContaining({ userId: TARGET_USER_ID })
      );
      expect(io._leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
      expect((fastify as any)._invalidateParticipantCache).toHaveBeenCalledWith(TARGET_USER_ID, VALID_CONV_ID);
    });

    it('creator can ban admin', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'admin', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('admin can ban moderator', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'moderator', bannedAt: null, displayName: 'Mod' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('handles unknown role (defaults to 0) — member cannot ban unknown role == 0', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'member' }) // level 10
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'unknown-role', bannedAt: null, displayName: 'X' }); // level 0
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      // 10 > 0 → ban succeeds
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('bans multiple sockets leave room', async () => {
      const leaves = [jest.fn<any>(), jest.fn<any>()];
      const io = createMockIO(leaves.map(l => ({ leave: l })));
      const { prisma, banRoute, reply } = setup(io);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'member', bannedAt: null, displayName: 'M' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      leaves.forEach(l => expect(l).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`));
    });
  });

  // ── UNBAN ────────────────────────────────────────────────────────────────

  describe('PATCH /conversations/:id/participants/:userId/unban', () => {
    it('returns 404 when current user is not in conversation', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst.mockResolvedValue(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 403 when current user is a moderator (below admin)', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'moderator' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 403 when current user is a member', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst.mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'member' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 404 when target banned participant not found', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('unbans participant successfully when admin (no IO)', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TARGET_PARTICIPANT_ID },
          data: expect.objectContaining({ bannedAt: null, isActive: true, leftAt: null }),
        })
      );
      expect(mockedSendSuccess).toHaveBeenCalledWith(reply, { userId: TARGET_USER_ID });
    });

    it('emits CONVERSATION_PARTICIPANT_UNBANNED when IO present', async () => {
      const io = createMockIO();
      const { prisma, unbanRoute, reply } = setup(io);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(io._emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED,
        expect.objectContaining({ userId: TARGET_USER_ID })
      );
    });

    it('creator can unban', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('falls back to rawId when resolveConversationId returns null (unban path)', async () => {
      const { prisma, unbanRoute, reply } = setup();
      mockedResolve.mockResolvedValue(null);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID });
      const request = makeRequest({ id: 'unknown-slug', userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      // Uses raw id 'unknown-slug' as fallback — participant lookup uses it
      expect(prisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ conversationId: 'unknown-slug' }) })
      );
      expect(mockedSendSuccess).toHaveBeenCalled();
    });
  });

  describe('PATCH ban — resolveConversationId fallback branch', () => {
    it('falls back to rawId when resolveConversationId returns null (ban path)', async () => {
      const { prisma, banRoute, reply } = setup();
      mockedResolve.mockResolvedValue(null);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: 'slug-conv', userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(prisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ conversationId: 'slug-conv' }) })
      );
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('ban uses ?? 0 role fallback — unknown current role cannot ban known role', async () => {
      const { prisma, banRoute, reply } = setup();
      // currentLevel = 0 (unknown role), targetLevel = 10 (member) → 0 <= 10 → forbidden
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'unknown-role' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalled();
    });

    it('ban uses ?? 0 for both roles — both unknown → equal (0 <= 0) → forbidden', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'role-x' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, role: 'role-y', bannedAt: null, displayName: 'X' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      // 0 <= 0 → forbidden
      expect(mockedSendForbidden).toHaveBeenCalled();
    });

    it('unban uses ?? 0 fallback on currentLevel — unknown role is treated as level 0 (< admin 30 → forbidden)', async () => {
      const { prisma, unbanRoute, reply } = setup();
      // ROLE_LEVELS['some-custom-role'] is undefined → ?? 0 → branch taken
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'some-custom-role' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE-FOR-ME ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerDeleteForMeRoutes — DELETE /conversations/:id/delete-for-me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
  });

  function setup(ioInstance?: any) {
    const fastify = createMockFastify();
    wireIO(fastify, ioInstance);
    const prisma = createMockPrisma();
    registerDeleteForMeRoutes(fastify, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'DELETE', 'delete-for-me');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  it('returns 404 when participant not found', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(null);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('marks deletedForMe for a regular member (no IO)', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARTICIPANT_ID },
        data: expect.objectContaining({ isActive: false }),
      })
    );
    expect(mockedSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ conversationId: VALID_CONV_ID })
    );
  });

  it('transfers ownership to first moderator when creator leaves with moderator available', async () => {
    const MODERATOR_ID = '507f1f77bcf86cd799439066';
    const io = createMockIO();
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst
      .mockResolvedValueOnce(makeParticipant({ role: 'creator' }))   // self
      .mockResolvedValueOnce({ id: MODERATOR_ID, userId: TARGET_USER_ID, role: 'moderator' }) // moderator successor
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MODERATOR_ID }, data: { role: 'creator' } })
    );
    expect(io._emit).toHaveBeenCalledWith(
      SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
      expect.objectContaining({ userId: TARGET_USER_ID, newRole: 'creator' })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('falls back to first active member when no moderator', async () => {
    const MEMBER_SUCCESSOR_ID = '507f1f77bcf86cd799439077';
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst
      .mockResolvedValueOnce(makeParticipant({ role: 'creator' }))  // self
      .mockResolvedValueOnce(null)                                   // no moderator
      .mockResolvedValueOnce({ id: MEMBER_SUCCESSOR_ID, userId: TARGET_USER_ID, role: 'member' }); // any active member
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEMBER_SUCCESSOR_ID }, data: { role: 'creator' } })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('deactivates conversation when creator is last member', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst
      .mockResolvedValueOnce(makeParticipant({ role: 'creator' }))
      .mockResolvedValueOnce(null)  // no moderator
      .mockResolvedValueOnce(null); // no other member
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('emits CONVERSATION_DELETED to user room when IO present', async () => {
    const io = createMockIO();
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(io.in).toHaveBeenCalledWith(ROOMS.user(VALID_USER_ID));
    expect(io._leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
    expect(io.to).toHaveBeenCalledWith(ROOMS.user(VALID_USER_ID));
    expect(io._emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_DELETED,
      expect.objectContaining({ userId: VALID_USER_ID, conversationId: VALID_CONV_ID })
    );
  });

  it('does not emit PARTICIPANT_ROLE_UPDATED when no IO but moderator successor found', async () => {
    const MOD_ID = '507f1f77bcf86cd799439066';
    const { prisma, route, reply } = setup(undefined);
    prisma.participant.findFirst
      .mockResolvedValueOnce(makeParticipant({ role: 'creator' }))
      .mockResolvedValueOnce({ id: MOD_ID, userId: TARGET_USER_ID, role: 'moderator' });
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    // update still happens (DB update), success is sent
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOD_ID }, data: { role: 'creator' } })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('resolves non-ObjectId identifier', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: 'mshy_abc123' }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedResolve).toHaveBeenCalledWith(prisma, 'mshy_abc123');
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('falls back to rawId when resolveConversationId returns null (?? rawId branch)', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: 'unknown-slug-delete' }, VALID_USER_ID);
    await route.handler(request, reply);
    // Fallback: conversationId = rawId = 'unknown-slug-delete'
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: 'unknown-slug-delete' }),
      })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('handles multiple sockets when removing user from conversation room', async () => {
    const leaves = [jest.fn<any>(), jest.fn<any>(), jest.fn<any>()];
    const io = createMockIO(leaves.map(l => ({ leave: l })));
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    leaves.forEach(l => expect(l).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerStatsRoutes — GET /conversations/:id/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
    mockedCanAccess.mockResolvedValue(true);
  });

  function setup() {
    const fastify = createMockFastify();
    const prisma = createMockPrisma();
    registerStatsRoutes(fastify, prisma, jest.fn());
    const route = getRoute(fastify, 'GET', 'stats');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  function makeStatsRequest(id = VALID_CONV_ID) {
    return {
      params: { id },
      authContext: { userId: VALID_USER_ID, isAuthenticated: true, isAnonymous: false },
    };
  }

  const defaultStats = {
    participantStats: {
      [VALID_USER_ID]: { messageCount: 5 },
    },
    dailyActivity: {
      '2026-06-01': 10,
      '2026-06-02': 20,
    },
    languageDistribution: {
      en: 50,
      fr: 30,
      es: 10,
    },
    totalMessages: 90,
  };

  it('returns 404 when resolveConversationId returns null', async () => {
    const { route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when user has no access', async () => {
    const { route, reply } = setup();
    mockedCanAccess.mockResolvedValue(false);
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns enriched stats with user info', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue(defaultStats);
    prisma.user.findMany.mockResolvedValue([
      { id: VALID_USER_ID, username: 'alice', displayName: 'Alice Doe', avatar: 'avatar.png' },
    ]);
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        participantStats: expect.arrayContaining([
          expect.objectContaining({ userId: VALID_USER_ID, username: 'alice' }),
        ]),
      })
    );
  });

  it('sorts dailyActivity chronologically', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      ...defaultStats,
      dailyActivity: { '2026-06-03': 5, '2026-06-01': 15, '2026-06-02': 10 },
      participantStats: {},
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.dailyActivity[0].date).toBe('2026-06-01');
    expect(sentData.dailyActivity[1].date).toBe('2026-06-02');
    expect(sentData.dailyActivity[2].date).toBe('2026-06-03');
  });

  it('sorts languageDistribution by count descending', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      ...defaultStats,
      languageDistribution: { es: 5, en: 100, fr: 40 },
      participantStats: {},
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.languageDistribution[0].language).toBe('en');
    expect(sentData.languageDistribution[1].language).toBe('fr');
    expect(sentData.languageDistribution[2].language).toBe('es');
  });

  it('returns null for user fields when user not found in DB', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      ...defaultStats,
      participantStats: { [TARGET_USER_ID]: { messageCount: 3 } },
    });
    prisma.user.findMany.mockResolvedValue([]); // no matching user
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats[0]).toMatchObject({
      userId: TARGET_USER_ID,
      username: null,
      displayName: null,
      avatar: null,
    });
  });

  it('handles empty participantStats gracefully', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: {},
      dailyActivity: {},
      languageDistribution: {},
      totalMessages: 0,
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats).toEqual([]);
    expect(sentData.dailyActivity).toEqual([]);
    expect(sentData.languageDistribution).toEqual([]);
  });

  it('handles null/undefined participantStats from service', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: undefined,
      dailyActivity: undefined,
      languageDistribution: undefined,
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats).toEqual([]);
    expect(sentData.dailyActivity).toEqual([]);
    expect(sentData.languageDistribution).toEqual([]);
  });

  it('calls sendInternalError when getStats throws', async () => {
    const { route, reply } = setup();
    mockedGetStats.mockRejectedValue(new Error('DB failure'));
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('calls sendInternalError when prisma.user.findMany throws', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: { [VALID_USER_ID]: { messageCount: 1 } },
      dailyActivity: {},
      languageDistribution: {},
    });
    prisma.user.findMany.mockRejectedValue(new Error('user query failed'));
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('passes the raw id param to resolveConversationId', async () => {
    const { route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    await route.handler(makeStatsRequest('some-identifier'), reply);
    expect(mockedResolve).toHaveBeenCalledWith(expect.anything(), 'some-identifier');
  });

  it('passes authContext to canAccessConversation', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({ participantStats: {}, dailyActivity: {}, languageDistribution: {} });
    prisma.user.findMany.mockResolvedValue([]);
    const request = makeStatsRequest();
    await route.handler(request, reply);
    expect(mockedCanAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: VALID_USER_ID }),
      VALID_CONV_ID,
      VALID_CONV_ID
    );
  });

  it('enriches multiple participants with user details', async () => {
    const USER2 = '507f1f77bcf86cd799439099';
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: {
        [VALID_USER_ID]: { messageCount: 10 },
        [USER2]: { messageCount: 5 },
      },
      dailyActivity: {},
      languageDistribution: {},
    });
    prisma.user.findMany.mockResolvedValue([
      { id: VALID_USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
      { id: USER2, username: 'bob', displayName: null, avatar: 'bob.png' },
    ]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats).toHaveLength(2);
    const alice = sentData.participantStats.find((p: any) => p.userId === VALID_USER_ID);
    const bob = sentData.participantStats.find((p: any) => p.userId === USER2);
    expect(alice).toMatchObject({ username: 'alice', displayName: 'Alice' });
    expect(bob).toMatchObject({ username: 'bob', displayName: null });
  });
});
