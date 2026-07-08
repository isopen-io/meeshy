import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Top-level mock variables (hoisted before jest.mock calls) ────────────────

const mockResolveConversationId = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();
const mockIsBlockedBetween = jest.fn<any>();
const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any, extra?: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any, extra?: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendError = jest.fn<any>((reply: any, status: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockGenerateConversationIdentifier = jest.fn<any>().mockReturnValue('auto-id');
const mockEnsureUniqueConversationIdentifier = jest.fn<any>().mockResolvedValue('mshy_unique');
const mockBuildCursorPaginationMeta = jest.fn<any>().mockReturnValue({ nextCursor: null, hasMore: false });
const mockSendWithETag = jest.fn<any>().mockReturnValue(false);
const mockGenerateDefaultConversationTitle = jest.fn<any>().mockReturnValue('Generated Title');
const mockValidateSchema = jest.fn<any>();
const mockCreateError = jest.fn<any>((code: string, msg?: string) => {
  const e = new Error(msg || code) as any;
  e.code = code;
  return e;
});
const mockSendErrorResponse = jest.fn<any>();

// ─── jest.mock calls (hoisted) ────────────────────────────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...args: any[]) => mockIsBlockedBetween(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

jest.mock('../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: (...args: any[]) => mockGenerateConversationIdentifier(...args),
  ensureUniqueConversationIdentifier: (...args: any[]) => mockEnsureUniqueConversationIdentifier(...args),
}));

jest.mock('../../../utils/pagination', () => ({
  buildCursorPaginationMeta: (...args: any[]) => mockBuildCursorPaginationMeta(...args),
}));

jest.mock('../../../utils/etag', () => ({
  sendWithETag: (...args: any[]) => mockSendWithETag(...args),
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  generateDefaultConversationTitle: (...args: any[]) => mockGenerateDefaultConversationTitle(...args),
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: (...args: any[]) => mockCreateError(...args),
  sendErrorResponse: (...args: any[]) => mockSendErrorResponse(...args),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  ConversationSchemas: { create: {} },
  validateSchema: (...args: any[]) => mockValidateSchema(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
    getUnreadCount: jest.fn().mockResolvedValue(0),
  })),
}));

const mockResolvePrefsOnly = jest.fn<any>();

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolvePrefsOnly: (...args: any[]) => mockResolvePrefsOnly(...args),
  }),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationListResponseSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
  createConversationRequestSchema: { type: 'object' },
  updateConversationRequestSchema: { type: 'object' },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CONVERSATION_NEW: 'conversation:new',
    CONVERSATION_UPDATED: 'conversation:updated',
    CONVERSATION_CLOSED: 'conversation:closed',
  },
  ROOMS: {
    user: (id: string) => `user:${id}`,
    conversation: (id: string) => `conversation:${id}`,
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/conversations/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const OTHER_USER_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const COMMUNITY_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = (): any => ({
  conversation: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      id: CONV_ID,
      type: 'direct',
      title: null,
      createdAt: new Date(),
      participants: [],
    }),
    update: jest.fn().mockResolvedValue({ id: CONV_ID, participants: [] }),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  participant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  message: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  community: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  communityMember: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
  },
  agentConversationSummary: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  agentUserRole: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  agentAnalysisSnapshot: {
    findMany: jest.fn().mockResolvedValue([]),
  },
});

type Routes = Record<string, Record<string, Function>>;

const createMockFastify = () => {
  const routes: Routes = {};
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockGetManager = jest.fn().mockReturnValue({ getIO: mockGetIO });

  const fastify: any = {
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    post: jest.fn((path: string, opts: any, handler: Function) => {
      routes['POST'] = routes['POST'] || {};
      routes['POST'][path] = handler;
    }),
    put: jest.fn((path: string, opts: any, handler: Function) => {
      routes['PUT'] = routes['PUT'] || {};
      routes['PUT'][path] = handler;
    }),
    delete: jest.fn((path: string, opts: any, handler: Function) => {
      routes['DELETE'] = routes['DELETE'] || {};
      routes['DELETE'][path] = handler;
    }),
    patch: jest.fn((path: string, opts: any, handler: Function) => {
      routes['PATCH'] = routes['PATCH'] || {};
      routes['PATCH'][path] = handler;
    }),
    socketIOHandler: {
      getManager: mockGetManager,
    },
    notificationService: null,
    mentionService: null,
    translationService: null,
    presenceChecker: null,
    _routes: routes,
    _mockTo: mockTo,
    _mockEmit: mockEmit,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  // Try exact match first, then substring match
  const key = Object.keys(methodRoutes).find(k => k === pathFragment)
    ?? Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) throw new Error(`No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeRequest = (overrides: any = {}) => ({
  authContext: {
    isAuthenticated: true,
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
    isAnonymous: false,
    sessionToken: null,
  },
  params: {},
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

const makeReply = () => {
  const reply: any = {
    _body: null,
    status: jest.fn().mockReturnThis(),
    send: jest.fn((body?: any) => { if (body !== undefined) reply._body = body; return reply; }),
    code: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
  };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerCoreRoutes', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let fastify: ReturnType<typeof createMockFastify>;
  const optionalAuth = jest.fn();
  const requiredAuth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    fastify = createMockFastify();

    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockIsBlockedBetween.mockResolvedValue(false);
    mockResolvePrefsOnly.mockResolvedValue(new Map());
    mockSendWithETag.mockReturnValue(false);
    mockBuildCursorPaginationMeta.mockReturnValue({ nextCursor: null, hasMore: false });
    mockEnsureUniqueConversationIdentifier.mockResolvedValue('mshy_unique');
    mockGenerateConversationIdentifier.mockReturnValue('auto-id');
    mockGenerateDefaultConversationTitle.mockReturnValue('Generated Title');
    mockValidateSchema.mockReturnValue({
      type: 'direct',
      participantIds: [OTHER_USER_ID],
    });

    registerCoreRoutes(fastify, prisma, optionalAuth, requiredAuth);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations/check-identifier/:identifier
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations/check-identifier/:identifier', () => {
    const getCheckHandler = (f: any) =>
      getHandler(f, 'GET', 'check-identifier');

    it('returns available:true when identifier is not taken', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { identifier: 'my-conv' } });
      const reply = makeReply();

      await getCheckHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { available: true, identifier: 'my-conv' });
    });

    it('returns available:false when identifier is already taken', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: CONV_ID });
      const req = makeRequest({ params: { identifier: 'taken-conv' } });
      const reply = makeReply();

      await getCheckHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { available: false, identifier: 'taken-conv' });
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.conversation.findFirst.mockRejectedValue(new Error('DB failure'));
      const req = makeRequest({ params: { identifier: 'test' } });
      const reply = makeReply();

      await getCheckHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    const makeConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      title: null,
      type: 'direct',
      identifier: 'conv-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      memberCount: 2,
      isAnnouncementChannel: false,
      participants: [
        {
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: true,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: true, lastActiveAt: null },
        },
      ],
      userPreferences: [],
      messages: [],
      ...overrides,
    });

    it('returns sendForbidden when not authenticated', async () => {
      const req = makeRequest({ authContext: { isAuthenticated: false, userId: null } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns empty list with default pagination', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(0);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply.send).toHaveBeenCalled();
      const body = reply._body;
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('returns conversations with unreadCount merged', async () => {
      const conv = makeConversation();
      prisma.conversation.findMany.mockResolvedValue([conv]);
      prisma.conversation.count.mockResolvedValue(1);

      const req = makeRequest({ query: { includeCount: 'true' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].unreadCount).toBeDefined();
    });

    it('applies typeFilter when query.type is provided', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { type: 'group' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'group' }),
        })
      );
    });

    it('applies withUserId filter when provided', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { withUserId: OTHER_USER_ID } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ AND: expect.any(Array) }),
        })
      );
    });

    it('handles beforeCursor with valid lastMessageAt', async () => {
      const cursorDate = new Date('2024-01-01');
      prisma.conversation.findFirst.mockResolvedValue({ lastMessageAt: cursorDate });
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { before: CONV_ID } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lastMessageAt: { lt: cursorDate } }),
        })
      );
    });

    it('handles beforeCursor when cursorConversation has null lastMessageAt', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ lastMessageAt: null });
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { before: CONV_ID } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      // No lastMessageAt filter applied — just verify findMany was called
      expect(prisma.conversation.findMany).toHaveBeenCalled();
    });

    it('applies updatedSince filter for valid ISO date', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { updatedSince: '2024-01-01T00:00:00Z' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ updatedAt: expect.any(Object) }),
        })
      );
    });

    it('ignores invalid updatedSince date (NaN)', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { updatedSince: 'not-a-date' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const call = prisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.updatedAt).toBeUndefined();
    });

    it('returns early (no send) when sendWithETag returns true (304)', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      mockSendWithETag.mockReturnValue(true);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply.send).not.toHaveBeenCalled();
    });

    it('triggers batch participant query for convsMissingCurrentUser', async () => {
      const conv = makeConversation({
        participants: [
          {
            id: 'other-part-id',
            userId: OTHER_USER_ID,
            conversationId: CONV_ID,
            type: 'user',
            displayName: 'Bob',
            avatar: null,
            role: 'member',
            language: 'fr',
            nickname: null,
            joinedAt: new Date(),
            isActive: true,
            isOnline: false,
            lastActiveAt: null,
            user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: null, isOnline: false, lastActiveAt: null },
          },
        ],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      prisma.participant.findMany.mockResolvedValue([
        { conversationId: CONV_ID, role: 'creator', joinedAt: new Date() },
      ]);
      prisma.conversation.count.mockResolvedValue(1);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.participant.findMany).toHaveBeenCalled();
      expect(reply.send).toHaveBeenCalled();
      const body = (reply as any)._body ?? (reply.send as jest.Mock).mock.calls[0]?.[0];
      expect(body).toHaveProperty('success', true);
    });

    it('generates title for group conversation with no title', async () => {
      const conv = makeConversation({ type: 'group', title: '' });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    });

    const makeLastMessage = (content: string) => ({
      id: 'msg-1',
      content,
      createdAt: new Date(),
      senderId: PARTICIPANT_ID,
      messageType: 'text',
      isBlurred: false,
      isViewOnce: false,
      effectFlags: 0,
      expiresAt: null,
      sender: null,
      attachments: [],
      _count: { attachments: 0 },
    });

    it('truncates oversized lastMessage.content to the preview cap', async () => {
      const conv = makeConversation({ messages: [makeLastMessage('x'.repeat(5000))] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.data[0].lastMessage.content.length).toBe(300);
    });

    it('keeps short lastMessage.content intact', async () => {
      const conv = makeConversation({ messages: [makeLastMessage('salut ✋')] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.data[0].lastMessage.content).toBe('salut ✋');
    });

    it('does not split a surrogate pair at the truncation boundary', async () => {
      const conv = makeConversation({ messages: [makeLastMessage('a'.repeat(299) + '😀😀😀')] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const content = reply._body.data[0].lastMessage.content as string;
      expect(content).toBe('a'.repeat(299) + '😀');
      expect(() => encodeURIComponent(content)).not.toThrow();
    });

    it('keeps null title for direct conversation', async () => {
      const conv = makeConversation({ type: 'direct', title: null });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.data[0].title).toBeNull();
    });

    it('uses presenceChecker to override isOnline when available', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      const conv = makeConversation();
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(fastify.presenceChecker.isOnline).toHaveBeenCalled();
      expect(body.data[0].participants[0].isOnline).toBe(true);
    });

    it('masks participant presence when showOnlineStatus is hidden, even if live-online', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      mockResolvePrefsOnly.mockResolvedValue(new Map([
        [USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
      ]));
      const conv = makeConversation();
      conv.participants[0].lastActiveAt = new Date();
      conv.participants[0].user.lastActiveAt = new Date();
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const participant = reply._body.data[0].participants[0];
      expect(participant.isOnline).toBe(false);
      expect(participant.lastActiveAt).toBeNull();
      expect(participant.user.isOnline).toBe(false);
      expect(participant.user.lastActiveAt).toBeNull();
    });

    it('masks only lastActiveAt when showLastSeen is hidden but showOnlineStatus is visible', async () => {
      mockResolvePrefsOnly.mockResolvedValue(new Map([
        [USER_ID, { showOnline: true, showLastSeenTimestamp: false }],
      ]));
      const conv = makeConversation();
      conv.participants[0].lastActiveAt = new Date();
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const participant = reply._body.data[0].participants[0];
      expect(participant.isOnline).toBe(true);
      expect(participant.lastActiveAt).toBeNull();
    });

    const makeSentLastMessage = () => ({
      id: 'msg-presence',
      content: 'yo',
      createdAt: new Date(),
      senderId: 'participant-2',
      messageType: 'text',
      isBlurred: false,
      isViewOnce: false,
      effectFlags: 0,
      expiresAt: null,
      sender: {
        id: 'participant-2',
        userId: OTHER_USER_ID,
        displayName: 'Bob',
        avatar: null,
        type: 'user',
        user: {
          id: OTHER_USER_ID,
          username: 'bob',
          displayName: 'Bob',
          avatar: null,
          isOnline: true,
          lastActiveAt: new Date(),
        },
      },
      attachments: [],
      _count: { attachments: 0 },
    });

    it('masks lastMessage sender presence when showOnlineStatus is hidden', async () => {
      mockResolvePrefsOnly.mockResolvedValue(new Map([
        [OTHER_USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
      ]));
      const conv = makeConversation({ messages: [makeSentLastMessage()] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const sender = reply._body.data[0].lastMessage.sender;
      expect(sender.isOnline).toBe(false);
      expect(sender.lastActiveAt).toBeNull();
    });

    it('applies live presence to lastMessage sender when visible', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(false) };
      const conv = makeConversation({ messages: [makeSentLastMessage()] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const sender = reply._body.data[0].lastMessage.sender;
      expect(fastify.presenceChecker.isOnline).toHaveBeenCalledWith(OTHER_USER_ID);
      expect(sender.isOnline).toBe(false);
    });

    it('sets hasMore correctly when totalCount > 0 and includeCount=true', async () => {
      const convs = Array.from({ length: 30 }, (_, i) => makeConversation({ id: `conv-${i}` }));
      prisma.conversation.findMany.mockResolvedValue(convs);
      prisma.conversation.count.mockResolvedValue(100);

      const req = makeRequest({ query: { includeCount: 'true', limit: '30' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.pagination.hasMore).toBe(true);
    });

    it('falls back to length===limit for hasMore when totalCount is sentinel 0', async () => {
      const convs = Array.from({ length: 30 }, (_, i) => makeConversation({ id: `conv-${i}` }));
      prisma.conversation.findMany.mockResolvedValue(convs);
      prisma.conversation.count.mockResolvedValue(0);

      const req = makeRequest({ query: { offset: '5', limit: '30' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.pagination.hasMore).toBe(true);
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.conversation.findMany.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations/:id
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations/:id', () => {
    const getDetailHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id');

    const makeFullConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      type: 'direct',
      title: null,
      identifier: 'some-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      participants: [],
      userPreferences: [],
      _count: { participants: 2 },
      ...overrides,
    });

    it('returns sendForbidden when not authenticated', async () => {
      const req = makeRequest({ authContext: { isAuthenticated: false, userId: null } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns sendNotFound when resolveConversationId returns null', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: 'unknown-id' } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalled();
    });

    it('returns sendForbidden with CONVERSATION_ACCESS_DENIED when canAccessConversation is false', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.any(String),
        expect.objectContaining({ code: 'CONVERSATION_ACCESS_DENIED' })
      );
    });

    it('returns sendNotFound when conversation not found after access check', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalled();
    });

    it('happy path: returns conversation with unreadCount', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ id: CONV_ID, unreadCount: expect.any(Number) })
      );
    });

    const makeDetailParticipant = (overrides: any = {}) => ({
      id: PARTICIPANT_ID,
      userId: OTHER_USER_ID,
      type: 'user',
      displayName: 'Bob',
      avatar: null,
      role: 'member',
      permissions: null,
      isActive: true,
      isOnline: false,
      lastActiveAt: new Date(),
      joinedAt: new Date(),
      user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'Jones' },
      ...overrides,
    });

    it('overrides participant isOnline from presenceChecker on detail', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ participants: [makeDetailParticipant()] })
      );
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(fastify.presenceChecker.isOnline).toHaveBeenCalledWith(OTHER_USER_ID);
      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participants[0].isOnline).toBe(true);
    });

    it('masks participant presence on detail when showOnlineStatus is hidden', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      mockResolvePrefsOnly.mockResolvedValue(new Map([
        [OTHER_USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
      ]));
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ participants: [makeDetailParticipant({ isOnline: true })] })
      );
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participants[0].isOnline).toBe(false);
      expect(sent.participants[0].lastActiveAt).toBeNull();
    });

    it('unreadCount silently fails when participant not found', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ unreadCount: 0 })
      );
    });

    it('generates title for group conversation with no title', async () => {
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ type: 'group', title: '' })
      );

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    });

    it('keeps title for direct conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ type: 'direct', title: null })
      );

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.title).toBeNull();
    });

    it('calls markConversationNotificationsAsRead fire-and-forget when notificationService present', async () => {
      const markRead = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { markConversationNotificationsAsRead: markRead };
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(markRead).toHaveBeenCalledWith(USER_ID, CONV_ID);
    });

    it('notificationService error is swallowed (does not fail route)', async () => {
      fastify.notificationService = {
        markConversationNotificationsAsRead: jest.fn().mockRejectedValue(new Error('notif fail')),
      };
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.conversation.findFirst.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /conversations
  // ───────────────────────────────────────────────────────────────────────────

  describe('POST /conversations', () => {
    const getCreateHandler = (f: any) => getHandler(f, 'POST', '/conversations');

    it('calls sendErrorResponse when validateSchema throws', async () => {
      mockValidateSchema.mockImplementation(() => {
        throw new Error('Validation failed');
      });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendErrorResponse).toHaveBeenCalledWith(reply, expect.any(Error), 'create-conversation');
    });

    it('throws UNAUTHORIZED when no registeredUser', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      const req = makeRequest({
        authContext: { isAuthenticated: false, userId: null, registeredUser: null },
        body: {},
      });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('UNAUTHORIZED', expect.any(String));
      expect(mockSendErrorResponse).toHaveBeenCalled();
    });

    it('throws INVALID_OPERATION when creating direct conversation with self', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [USER_ID] });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('INVALID_OPERATION', expect.any(String));
    });

    it('throws INVALID_OPERATION when userId is included in participantIds', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', participantIds: [USER_ID, OTHER_USER_ID] });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('INVALID_OPERATION', expect.any(String));
    });

    it('returns sendNotFound when communityId provided but community not found', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
      });
      prisma.community.findFirst.mockResolvedValue(null);
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Community not found');
    });

    it('returns sendForbidden when user is not a community member', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: 'someone-else',
        members: [],
      });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('uses ensureUniqueConversationIdentifier with mshy_ prefix when identifier provided', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'direct',
        participantIds: [OTHER_USER_ID],
        identifier: 'myconv',
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([{ id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null }]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockEnsureUniqueConversationIdentifier).toHaveBeenCalledWith(
        prisma,
        'mshy_myconv'
      );
    });

    it('uses generateConversationIdentifier when no identifier provided', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockGenerateConversationIdentifier).toHaveBeenCalled();
    });

    it('throws USER_BLOCKED when direct conversation participants are blocked', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      mockIsBlockedBetween.mockResolvedValue(true);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('USER_BLOCKED');
      expect(mockSendErrorResponse).toHaveBeenCalled();
    });

    it('happy path: creates conversation and broadcasts CONVERSATION_NEW', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', participantIds: [OTHER_USER_ID], title: 'My Group' });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'My Group',
        createdAt: new Date(),
        participants: [{ userId: USER_ID, user: { displayName: 'Alice' } }],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:new', expect.any(Object));
    });

    it('sends invitation notifications when notificationService is present', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      const createInviteNotif = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { createConversationInviteNotification: createInviteNotif };
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(createInviteNotif).toHaveBeenCalled();
    });

    it('skips notifications when notificationService is null', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      fastify.notificationService = null;
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('creates communityMember records when communityId is provided', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
        title: 'Community Group',
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: USER_ID,
        members: [{ userId: USER_ID }],
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'Community Group',
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);
      prisma.communityMember.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(prisma.communityMember.createMany).toHaveBeenCalled();
    });

    it('creates broadcast conversation with isAnnouncementChannel and defaultWriteRole:admin', async () => {
      mockValidateSchema.mockReturnValue({ type: 'broadcast', participantIds: [], title: 'Broadcast' });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'broadcast',
        title: 'Broadcast',
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isAnnouncementChannel: true,
            defaultWriteRole: 'admin',
          }),
        })
      );
    });

    it('broadcast error is non-blocking', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      fastify.socketIOHandler.getManager.mockReturnValue({
        getIO: jest.fn().mockReturnValue({
          to: jest.fn().mockReturnValue({
            emit: jest.fn().mockImplementation(() => { throw new Error('socket fail'); }),
          }),
        }),
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PUT /conversations/:id
  // ───────────────────────────────────────────────────────────────────────────

  describe('PUT /conversations/:id', () => {
    const getUpdateHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id');

    it('returns sendForbidden when membership not found and id is not meeshy', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'New Title' } });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns sendForbidden when id is meeshy (global conversation)', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      const req = makeRequest({ params: { id: 'meeshy' }, body: { title: 'New Title' } });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'The global conversation cannot be modified');
    });

    it('returns sendForbidden when moderator tries to set restricted fields', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { defaultWriteRole: 'member' },
      });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('happy path: updates conversation and broadcasts CONVERSATION_UPDATED', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });

      const req = makeRequest({
        params: { id: CONV_ID },
        body: { title: 'Updated Title' },
      });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:updated', expect.any(Object));
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockRejectedValue(new Error('DB fail'));

      const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'Title' } });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DELETE /conversations/:id
  // ───────────────────────────────────────────────────────────────────────────

  describe('DELETE /conversations/:id', () => {
    const getDeleteHandler = (f: any) => getHandler(f, 'DELETE', '/conversations/:id');

    it('returns sendForbidden when id is meeshy (global conversation)', async () => {
      const req = makeRequest({ params: { id: 'meeshy' } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'The global conversation cannot be deleted');
    });

    it('returns sendForbidden when resolveConversationId returns null', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: 'unknown-id' } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns sendForbidden when membership not found', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('happy path: soft-deletes conversation and broadcasts CONVERSATION_CLOSED', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator', id: PARTICIPANT_ID });
      prisma.conversation.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:closed', expect.any(Object));
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockRejectedValue(new Error('DB fail'));

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations/:id/analysis
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations/:id/analysis', () => {
    const getAnalysisHandler = (f: any) => getHandler(f, 'GET', 'analysis');

    it('returns sendNotFound when resolveConversationId returns null', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: 'unknown' } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns sendForbidden when canAccessConversation is false', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Access denied');
    });

    it('happy path: returns analysis with null summary', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ summary: null, participantProfiles: [], history: [] })
      );
    });

    it('returns summary data when summary exists', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue({
        summary: 'Good conversation',
        currentTopics: ['topic1'],
        overallTone: 'positive',
        messageCount: 42,
        updatedAt: new Date(),
        healthScore: 0.8,
        engagementLevel: 'high',
        conflictLevel: 'low',
        dynamique: null,
        dominantEmotions: ['joy'],
      });
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.summary).not.toBeNull();
      expect(sent.summary.text).toBe('Good conversation');
    });

    it('builds traits correctly for roles with trait fields', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: 'A good communicator',
          tone: 'neutral',
          vocabularyLevel: 'high',
          typicalLength: 'medium',
          emojiUsage: 'low',
          topicsOfExpertise: ['tech'],
          catchphrases: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 100,
          confidence: 0.9,
          dominantEmotions: [],
          relationshipMap: {},
          sentimentScore: 0.5,
          engagementLevel: 'high',
          locked: false,
          traitVerbosity: 'verbose',
          traitVerbosityScore: 0.8,
          traitSocialStyle: 'extrovert',
          traitSocialStyleScore: 0.7,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob', firstName: 'Bob', lastName: 'Smith', avatar: null },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].traits).not.toBeNull();
      expect(sent.participantProfiles[0].traits.communication).toBeDefined();
    });

    it('returns null traits for roles with no trait fields', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null,
          tone: null,
          vocabularyLevel: null,
          typicalLength: null,
          emojiUsage: null,
          topicsOfExpertise: [],
          catchphrases: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 0,
          confidence: null,
          dominantEmotions: [],
          relationshipMap: {},
          sentimentScore: null,
          engagementLevel: null,
          locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].traits).toBeNull();
    });

    it('returns history when snapshots exist', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([
        {
          snapshotDate: new Date('2024-01-01'),
          overallTone: 'positive',
          healthScore: 0.9,
          engagementLevel: 'high',
          conflictLevel: 'low',
          topTopics: ['topic1'],
          dominantEmotions: [],
          messageCountAtSnapshot: 10,
          participantSnapshots: [],
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.history).toHaveLength(1);
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.agentConversationSummary.findUnique.mockRejectedValue(new Error('DB fail'));

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ─── Additional branch coverage tests ─────────────────────────────────────

  describe('GET /conversations - additional branch coverage', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    const makeConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      title: null,
      type: 'direct',
      identifier: 'conv-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      memberCount: 2,
      isAnnouncementChannel: false,
      participants: [
        {
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: false,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: false, lastActiveAt: null },
        },
      ],
      userPreferences: [],
      messages: [],
      ...overrides,
    });

    it('lastMessage is null when messages is empty', async () => {
      const conv = makeConversation({ messages: [] });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage).toBeNull();
    });

    it('lastMessage sender null when sender is null', async () => {
      const conv = makeConversation({
        messages: [{
          id: 'msg-1',
          content: 'Hi',
          createdAt: new Date(),
          senderId: PARTICIPANT_ID,
          messageType: 'text',
          isBlurred: false,
          isViewOnce: false,
          effectFlags: null,
          expiresAt: null,
          sender: null,
          attachments: [],
          _count: { attachments: 0 },
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage.sender).toBeNull();
    });

    it('lastMessage sender with no user property uses sender own fields', async () => {
      const conv = makeConversation({
        messages: [{
          id: 'msg-2',
          content: 'Hello',
          createdAt: new Date(),
          senderId: PARTICIPANT_ID,
          messageType: 'text',
          isBlurred: false,
          isViewOnce: false,
          effectFlags: null,
          expiresAt: null,
          sender: {
            id: PARTICIPANT_ID,
            userId: USER_ID,
            displayName: 'Alice',
            avatar: 'alice.jpg',
            type: 'user',
            // No user property
            user: null,
          },
          attachments: [],
          _count: { attachments: 0 },
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      const lastMsg = reply._body.data[0].lastMessage;
      expect(lastMsg.sender.avatar).toBe('alice.jpg');
      expect(lastMsg.sender.username).toBeNull();
    });

    it('presence checker returns undefined (offline not known) - isOnline unchanged', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(undefined) };
      const conv = makeConversation({
        participants: [{
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: true,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: null, isOnline: true, lastActiveAt: null },
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].participants[0].isOnline).toBe(true);
    });

    it('participant with no userId uses participant id for presence', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      const conv = makeConversation({
        participants: [{
          id: PARTICIPANT_ID,
          userId: null, // Anonymous - no userId
          conversationId: CONV_ID,
          type: 'anonymous',
          displayName: 'Anon',
          avatar: null,
          role: 'member',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: false,
          lastActiveAt: null,
          user: null,
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(fastify.presenceChecker.isOnline).toHaveBeenCalledWith(PARTICIPANT_ID);
    });

    it('group conversation with non-empty title keeps existing title', async () => {
      const conv = makeConversation({ type: 'group', title: 'My Group' });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      // generateDefaultConversationTitle should NOT be called
      expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
      expect(reply._body.data[0].title).toBe('My Group');
    });

    it('direct conversation with non-null title keeps title', async () => {
      const conv = makeConversation({ type: 'direct', title: 'DM title' });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].title).toBe('DM title');
    });
  });

  describe('GET /conversations/:id - additional branch coverage', () => {
    const getDetailHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id');

    const makeFullConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      type: 'group',
      title: 'My Group',
      identifier: 'some-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      participants: [],
      userPreferences: [],
      _count: { participants: 2 },
      ...overrides,
    });

    it('keeps non-empty group title as-is', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation({
        type: 'group',
        title: 'Existing Group Title',
      }));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getDetailHandler(fastify)(req, reply);
      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.title).toBe('Existing Group Title');
      expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
    });

    it('handles unreadCount error silently when getUnreadCount throws', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
      const { MessageReadStatusService } = jest.requireMock('../../../services/MessageReadStatusService') as any;
      MessageReadStatusService.mockImplementationOnce(() => ({
        getUnreadCount: jest.fn().mockRejectedValue(new Error('unread error')),
        getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
      }));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getDetailHandler(fastify)(req, reply);
      // Should still respond successfully with unreadCount=0
      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ unreadCount: 0 })
      );
    });
  });

  describe('POST /conversations - additional branch coverage', () => {
    it('community member via members.some() check passes', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
        title: 'Test',
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: 'some-other-creator',
        members: [{ userId: USER_ID }], // user is member via members array
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.communityMember.findMany.mockResolvedValue([{ userId: USER_ID }]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'Test', createdAt: new Date(), participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('notification error is caught and does not fail creation', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Creator', username: 'creator', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Other', username: 'other', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G', createdAt: new Date(), participants: [],
      });
      fastify.notificationService = {
        createConversationInviteNotification: jest.fn().mockRejectedValue(new Error('notif error')),
      };
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      // Should succeed despite notification error
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('group conversation with non-empty title keeps existing title', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        title: 'My Group',
        participantIds: [OTHER_USER_ID],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'My Group',
        createdAt: new Date(),
        participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      const sentData = mockSendSuccess.mock.calls[0][1];
      expect(sentData.title).toBe('My Group');
      expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
    });

    it('direct conversation with empty participantIds generates identifier with unknown', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'direct',
        participantIds: [],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(mockGenerateConversationIdentifier).toHaveBeenCalledWith(
        expect.stringContaining('unknown')
      );
    });

    it('no notification when creator not in userMap', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      // userMap doesn't include userId
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, displayName: 'Other', username: 'other', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G', createdAt: new Date(), participants: [],
      });
      const notifMock = jest.fn();
      fastify.notificationService = { createConversationInviteNotification: notifMock };
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      // Creator not found → no notifications sent
      expect(notifMock).not.toHaveBeenCalled();
    });

    it('uses username fallback when creator.displayName is null', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: null, username: 'alice-username', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'direct', title: null, createdAt: new Date(), participants: [],
      });
      const createInviteNotif = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { createConversationInviteNotification: createInviteNotif };
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(createInviteNotif).toHaveBeenCalledWith(
        expect.objectContaining({ inviterUsername: 'alice-username' })
      );
    });

    it('socket io null - CONVERSATION_NEW not broadcast but creation succeeds', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      // Make getManager return null so io is null
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G', createdAt: new Date(), participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('createdAt as string falls back to String() conversion', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G',
        createdAt: '2024-01-01T00:00:00.000Z', // string, not Date
        participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('communityMember createMany skipped when all users already exist in community', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
        title: 'CG',
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: USER_ID,
        members: [{ userId: USER_ID }],
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'CG', createdAt: new Date(), participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);
      // All users are already members — no new ones
      prisma.communityMember.findMany.mockResolvedValue([
        { userId: USER_ID },
        { userId: OTHER_USER_ID },
      ]);
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('PUT /conversations/:id - additional branch coverage', () => {
    const getUpdateHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id');

    it('moderator is blocked by isAnnouncementChannel field', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { isAnnouncementChannel: true },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('moderator is blocked by slowModeSeconds field', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { slowModeSeconds: 30 },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('moderator is blocked by autoTranslateEnabled field', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { autoTranslateEnabled: true },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('moderator can update title/description without restriction', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { title: 'New Title', description: 'New desc' },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('update with all optional fields set - changedFields has all entries', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: {
          title: 'T',
          description: 'D',
          avatar: 'a.jpg',
          banner: 'b.jpg',
          defaultWriteRole: 'member',
          isAnnouncementChannel: false,
          slowModeSeconds: 60,
          autoTranslateEnabled: true,
        },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            avatar: 'a.jpg',
            banner: 'b.jpg',
            defaultWriteRole: 'member',
            isAnnouncementChannel: false,
            slowModeSeconds: 60,
            autoTranslateEnabled: true,
          }),
        })
      );
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('socket io null in PUT - no broadcast but update succeeds', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'T' } });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('DELETE /conversations/:id - additional branch coverage', () => {
    const getDeleteHandler = (f: any) => getHandler(f, 'DELETE', '/conversations/:id');

    it('socket io null in DELETE - no broadcast but delete succeeds', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator', id: PARTICIPANT_ID });
      prisma.conversation.update.mockResolvedValue({});
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getDeleteHandler(fastify)(req, reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('GET /conversations - userId=null branch', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    it('skips participant batch query when userId is null', async () => {
      const convWithParticipants = {
        id: CONV_ID,
        title: null,
        type: 'direct',
        identifier: 'conv-id',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: new Date(),
        banner: null,
        avatar: null,
        communityId: null,
        memberCount: 2,
        isAnnouncementChannel: false,
        participants: [],
        userPreferences: [],
        messages: [],
      };
      prisma.conversation.findMany.mockResolvedValue([convWithParticipants]);
      // Authenticated but with null userId (edge case)
      const req = makeRequest({
        authContext: {
          isAuthenticated: true,
          userId: null,
          registeredUser: null,
          isAnonymous: false,
          sessionToken: null,
        },
        query: {},
      });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      // userId is null, so if(userId) block is skipped
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('GET /conversations - lastMessage sender ?? chains', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    const makeConvWithSender = (senderOverrides: any) => ({
      id: CONV_ID,
      title: null,
      type: 'direct',
      identifier: 'conv-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      memberCount: 2,
      isAnnouncementChannel: false,
      participants: [
        {
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: false,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: false, lastActiveAt: null },
        },
      ],
      userPreferences: [],
      messages: [{
        id: 'msg-1',
        content: 'Hello',
        createdAt: new Date(),
        senderId: PARTICIPANT_ID,
        messageType: 'text',
        isBlurred: false,
        isViewOnce: false,
        effectFlags: null,
        expiresAt: null,
        attachments: [],
        _count: { attachments: 0 },
        sender: senderOverrides,
      }],
    });

    it('uses sender.user.displayName when sender.displayName is null', async () => {
      const conv = makeConvWithSender({
        id: PARTICIPANT_ID,
        userId: USER_ID,
        displayName: null, // null displayName on sender
        avatar: null,
        type: 'user',
        user: { username: 'alice', displayName: 'Alice From User', avatar: 'user-avatar.jpg', isOnline: false, lastActiveAt: null, firstName: 'Alice', lastName: null },
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage.sender.displayName).toBe('Alice From User');
      expect(reply._body.data[0].lastMessage.sender.avatar).toBe('user-avatar.jpg');
    });

    it('uses null when both sender.displayName and user.displayName are null', async () => {
      const conv = makeConvWithSender({
        id: PARTICIPANT_ID,
        userId: USER_ID,
        displayName: null,
        avatar: null,
        type: 'user',
        user: { username: 'alice', displayName: null, avatar: null, isOnline: false, lastActiveAt: null, firstName: 'Alice', lastName: null },
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage.sender.displayName).toBeNull();
      expect(reply._body.data[0].lastMessage.sender.avatar).toBeNull();
    });
  });

  describe('GET /conversations/:id/analysis - additional branch coverage', () => {
    const getAnalysisHandler = (f: any) => getHandler(f, 'GET', 'analysis');

    it('participant with null firstName and lastName uses username for displayName', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null,
          tone: null,
          vocabularyLevel: null,
          typicalLength: null,
          emojiUsage: null,
          topicsOfExpertise: [],
          catchphrases: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 0,
          confidence: null,
          dominantEmotions: [],
          relationshipMap: {},
          sentimentScore: null,
          engagementLevel: null,
          locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob-user', firstName: null, lastName: null, avatar: 'bob.jpg' },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].displayName).toBe('bob-user');
      expect(sent.participantProfiles[0].avatar).toBe('bob.jpg');
    });

    it('participant with null firstName and non-null lastName trims correctly', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null, tone: null, vocabularyLevel: null, typicalLength: null, emojiUsage: null,
          topicsOfExpertise: [], catchphrases: [], commonEmojis: [], reactionPatterns: [],
          messagesAnalyzed: 0, confidence: null, dominantEmotions: [], relationshipMap: {},
          sentimentScore: null, engagementLevel: null, locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob', firstName: null, lastName: 'Smith', avatar: null },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].displayName).toBe('Smith');
    });

    it('summary with null optional fields uses ?? null fallbacks', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue({
        summary: 'Test',
        currentTopics: [],
        overallTone: 'neutral',
        messageCount: 5,
        updatedAt: new Date(),
        healthScore: null,
        engagementLevel: null,
        conflictLevel: null,
        dynamique: null,
        dominantEmotions: null, // null → should use ?? []
      });
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.summary.dominantEmotions).toEqual([]);
      expect(sent.summary.healthScore).toBeNull();
    });

    it('participantProfile with null dominantEmotions and null relationshipMap uses ?? fallbacks', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null, tone: null, vocabularyLevel: null, typicalLength: null, emojiUsage: null,
          topicsOfExpertise: [], catchphrases: [], commonEmojis: [], reactionPatterns: [],
          messagesAnalyzed: 0, confidence: null,
          dominantEmotions: null,     // null → ?? []
          relationshipMap: null,      // null → ?? {}
          sentimentScore: null, engagementLevel: null, locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob', firstName: 'Bob', lastName: null, avatar: null },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].dominantEmotions).toEqual([]);
      expect(sent.participantProfiles[0].relationshipMap).toEqual({});
    });
  });

  describe('POST /conversations - participantIds default arg', () => {
    it('uses default participantIds=[] when not provided in validatedData', async () => {
      // validateSchema returns object WITHOUT participantIds → destructuring default [] is used
      mockValidateSchema.mockReturnValue({ type: 'broadcast', title: 'Broadcast' });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'broadcast', title: 'Broadcast', createdAt: new Date(), participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('POST /conversations - group conversation empty title in POST', () => {
    it('group conversation created with empty title triggers generateDefaultConversationTitle', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: null, // null title for group
        createdAt: new Date(),
        participants: [
          { userId: OTHER_USER_ID, user: { displayName: 'Bob', username: 'bob', firstName: 'Bob', lastName: null } },
        ],
      });
      mockGenerateDefaultConversationTitle.mockReturnValue('Alice, Bob');

      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);

      expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    });
  });

  describe('PUT /conversations/:id - title undefined in body', () => {
    it('update without title field - title is undefined in changedFields', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });

      const req = makeRequest({
        params: { id: CONV_ID },
        body: { description: 'Updated description' }, // No title
      });
      const reply = makeReply();
      const handler = getHandler(fastify, 'PUT', '/conversations/:id');
      await handler(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      // changedFields should NOT have title key
      const updateCall = prisma.conversation.update.mock.calls[0][0];
      expect(updateCall.data.title).toBeUndefined();
    });
  });
});
