import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

const mockResolveConversationId = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();
const mockTransformTranslationsToArray = jest.fn<any>().mockReturnValue([]);
const mockMessageValidationHook = jest.fn<any>();

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
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

const mockProcessExplicitLinksInContent = jest.fn<any>().mockResolvedValue({
  processedContent: 'processed content',
  trackingLinks: [],
});
const mockDeleteAttachment = jest.fn<any>().mockResolvedValue(undefined);
const mockGetOrCompute = jest.fn<any>().mockResolvedValue([]);
const mockOnMessageEdited = jest.fn<any>().mockResolvedValue(undefined);
const mockOnMessageDeleted = jest.fn<any>().mockResolvedValue(undefined);

const mockAddReaction = jest.fn().mockResolvedValue({ reaction: { id: 'reaction-id', emoji: '👍' }, replacedEmojis: [] });
const mockRemoveReaction = jest.fn().mockResolvedValue(true);
const mockCreateUpdateEvent = jest.fn().mockResolvedValue({ messageId: 'msg-id', emoji: '👍' });

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: (...args: any[]) => mockProcessExplicitLinksInContent(...args),
  })),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: (...args: any[]) => mockDeleteAttachment(...args),
  })),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    getOrCompute: (...args: any[]) => mockGetOrCompute(...args),
  },
}));

jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    onMessageEdited: (...args: any[]) => mockOnMessageEdited(...args),
    onMessageDeleted: (...args: any[]) => mockOnMessageDeleted(...args),
  },
}));

jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: (...args: any[]) => mockTransformTranslationsToArray(...args),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  messageValidationHook: (...args: any[]) => mockMessageValidationHook(...args),
}));

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
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

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn().mockImplementation(() => ({
    addReaction: (...args: any[]) => mockAddReaction(...args),
    removeReaction: (...args: any[]) => mockRemoveReaction(...args),
    createUpdateEvent: (...args: any[]) => mockCreateUpdateEvent(...args),
  })),
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn((code: string, msg?: string) => {
    const e = new Error(msg || code) as any;
    e.code = code;
    return e;
  }),
  sendErrorResponse: jest.fn(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  messageSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    REACTION_ADDED: 'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

jest.mock('@meeshy/shared/utils/validation', () => {
  const { z } = require('zod');
  return {
    CommonSchemas: {
      messageContent: z.string().min(1),
      language: z.string().optional(),
    },
    ConversationSchemas: { create: {} },
    validateSchema: jest.fn((schema: any, data: any) => data),
  };
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import { registerMessagesAdvancedRoutes } from '../../../routes/conversations/messages-advanced';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const OTHER_USER_ID = '507f1f77bcf86cd799439033';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = (): any => ({
  message: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({
      id: MSG_ID,
      content: 'hello',
      validatedMentions: [],
      translations: null,
      createdAt: new Date(),
    }),
    delete: jest.fn(),
  },
  participant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  mention: {
    deleteMany: jest.fn().mockResolvedValue({}),
  },
  reaction: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
});

const createMockFastify = () => {
  const routes: Record<string, Record<string, Function>> = {};
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockGetManager = jest.fn().mockReturnValue({ getIO: mockGetIO });

  const fastify: any = {
    get: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['GET'] = routes['GET'] || {})[path] = handler;
    }),
    post: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['POST'] = routes['POST'] || {})[path] = handler;
    }),
    put: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['PUT'] = routes['PUT'] || {})[path] = handler;
    }),
    delete: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['DELETE'] = routes['DELETE'] || {})[path] = handler;
    }),
    patch: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['PATCH'] = routes['PATCH'] || {})[path] = handler;
    }),
    socketIOHandler: {
      getManager: mockGetManager,
    },
    notificationService: null,
    mentionService: null,
    translationService: {
      _processRetranslationAsync: jest.fn().mockResolvedValue(undefined),
    },
    _routes: routes,
    _mockTo: mockTo,
    _mockEmit: mockEmit,
    _mockGetManager: mockGetManager,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key = Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) throw new Error(`No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeRequest = (overrides: any = {}): any => ({
  authContext: {
    isAuthenticated: true,
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
    isAnonymous: false,
    sessionToken: null,
    participantId: PART_ID,
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

const makeExistingMessage = (overrides: any = {}) => ({
  id: MSG_ID,
  conversationId: CONV_ID,
  content: 'Original content',
  createdAt: new Date(), // recent = within 24h
  senderId: PART_ID,
  deletedAt: null,
  isEdited: false,
  sender: {
    id: PART_ID,
    userId: USER_ID,
    role: 'USER',
  },
  attachments: [],
  ...overrides,
});

const makeTranslationService = (): any => ({
  _processRetranslationAsync: jest.fn().mockResolvedValue(undefined),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerMessagesAdvancedRoutes', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let fastify: ReturnType<typeof createMockFastify>;
  let translationService: any;
  const optionalAuth = jest.fn();
  const requiredAuth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    fastify = createMockFastify();
    translationService = makeTranslationService();

    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockGetOrCompute.mockResolvedValue([]);
    mockOnMessageEdited.mockResolvedValue(undefined);
    mockOnMessageDeleted.mockResolvedValue(undefined);
    mockTransformTranslationsToArray.mockReturnValue([]);
    mockProcessExplicitLinksInContent.mockResolvedValue({
      processedContent: 'processed content',
      trackingLinks: [],
    });
    mockAddReaction.mockResolvedValue({ reaction: { id: 'reaction-id', emoji: '👍' }, replacedEmojis: [] });
    mockRemoveReaction.mockResolvedValue(true);
    mockCreateUpdateEvent.mockResolvedValue({ messageId: MSG_ID, emoji: '👍' });

    registerMessagesAdvancedRoutes(fastify, prisma, translationService, optionalAuth, requiredAuth);
  });

  // ─── PUT /conversations/:id/messages/:messageId ────────────────────────────

  describe('PUT /conversations/:id/messages/:messageId', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('returns 404 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
    });

    it('returns 403 when author exceeds 24h limit without special role', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        createdAt: oldDate,
        sender: { id: PART_ID, userId: USER_ID, role: 'USER' },
      }));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('24-hour limit')
      );
    });

    it('allows edit when author is MODERATOR and 24h limit exceeded', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        createdAt: oldDate,
        sender: { id: PART_ID, userId: USER_ID, role: 'MODERATOR' },
      }));
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'New content',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('allows edit when author is ADMIN and 24h limit exceeded', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        createdAt: oldDate,
        sender: { id: PART_ID, userId: USER_ID, role: 'ADMIN' },
      }));
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'New content',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('returns 403 when non-author has no elevated membership', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        sender: { id: PART_ID, userId: OTHER_USER_ID, role: 'USER' },
      }));
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('allows edit by ADMIN membership (non-author)', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        sender: { id: PART_ID, userId: OTHER_USER_ID, role: 'USER' },
      }));
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'ADMIN' },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'New content',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
    });

    it('returns 400 when content is whitespace only', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: '   ' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('empty')
      );
    });

    it('continues when trackingLinkService throws', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      mockProcessExplicitLinksInContent.mockRejectedValue(new Error('link error'));
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('processes mentions when mentionService is available', async () => {
      const extractMock = jest.fn().mockReturnValue(['@alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: true,
        validUserIds: ['user-alice'],
      });
      const createMentions = jest.fn().mockResolvedValue(undefined);
      fastify.mentionService = {
        extractMentions: extractMock,
        resolveUsernames,
        validateMentionPermissions,
        createMentions,
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Hello @alice',
        validatedMentions: ['alice'],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello @alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(extractMock).toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('clears mentions when mentionService unavailable', async () => {
      fastify.mentionService = null;
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ validatedMentions: [] }),
        })
      );
    });

    it('continues when retranslation fails', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      fastify.translationService = {
        _processRetranslationAsync: jest.fn().mockRejectedValue(new Error('translation error')),
      };
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('broadcasts MESSAGE_EDITED via Socket.IO on happy path', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith('message:edited', expect.any(Object));
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('continues when socket broadcast throws', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });
      fastify.socketIOHandler.getManager.mockReturnValue({
        getIO: jest.fn().mockReturnValue({
          to: jest.fn().mockImplementation(() => { throw new Error('socket error'); }),
        }),
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('calls sendInternalError on outer DB error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('DB down'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    it('processes mentions with no valid usernames (empty mentions)', async () => {
      const extractMock = jest.fn().mockReturnValue([]);
      fastify.mentionService = {
        extractMentions: extractMock,
        resolveUsernames: jest.fn(),
        validateMentionPermissions: jest.fn(),
        createMentions: jest.fn(),
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('sends mention notifications when notificationService available', async () => {
      const extractMock = jest.fn().mockReturnValue(['alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: true,
        validUserIds: ['user-alice'],
      });
      const createMentions = jest.fn().mockResolvedValue(undefined);
      fastify.mentionService = { extractMentions: extractMock, resolveUsernames, validateMentionPermissions, createMentions };

      const createBatchMock = jest.fn().mockResolvedValue(1);
      fastify.notificationService = { createMentionNotificationsBatch: createBatchMock };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'Hello alice', validatedMentions: ['alice'], translations: null });
      prisma.user.findUnique.mockResolvedValue({ username: 'creator', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({
        title: 'Test',
        type: 'group',
        participants: [{ userId: USER_ID }],
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(createBatchMock).toHaveBeenCalled();
    });

    it('handles mention processing error gracefully', async () => {
      fastify.mentionService = {
        extractMentions: jest.fn().mockImplementation(() => { throw new Error('mention error'); }),
        resolveUsernames: jest.fn(),
        validateMentionPermissions: jest.fn(),
        createMentions: jest.fn(),
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'hello', validatedMentions: [], translations: null });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // Should not fail — mention error is caught
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  // ─── DELETE /conversations/:id/messages/:messageId ────────────────────────

  describe('DELETE /conversations/:id/messages/:messageId', () => {
    const getDeleteMsgHandler = (f: any) =>
      getHandler(f, 'DELETE', '/conversations/:id/messages/:messageId');

    it('returns 404 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
    });

    it('returns 403 when non-author has no elevated role', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('allows delete when non-author has ADMIN role', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'ADMIN' },
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('allows delete when user is author', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('deletes attachments before soft-deleting message', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [
          { id: 'attach-1', mimeType: 'image/jpeg' },
          { id: 'attach-2', mimeType: 'audio/mp3' },
        ],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockDeleteAttachment).toHaveBeenCalledTimes(2);
      expect(mockDeleteAttachment).toHaveBeenCalledWith('attach-1');
      expect(mockDeleteAttachment).toHaveBeenCalledWith('attach-2');
    });

    it('continues deleting other attachments when one fails', async () => {
      mockDeleteAttachment
        .mockRejectedValueOnce(new Error('delete error'))
        .mockResolvedValueOnce(undefined);

      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [
          { id: 'attach-1', mimeType: 'image/jpeg' },
          { id: 'attach-2', mimeType: 'audio/mp3' },
        ],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockDeleteAttachment).toHaveBeenCalledTimes(2);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('broadcasts MESSAGE_DELETED via Socket.IO', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith('message:deleted', expect.objectContaining({ messageId: MSG_ID }));
    });

    it('calls sendInternalError on outer error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ─── PATCH /messages/:messageId ───────────────────────────────────────────

  describe('PATCH /messages/:messageId', () => {
    const getPatchHandler = (f: any) => getHandler(f, 'PATCH', '/messages/:messageId');

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalled();
    });

    it('returns 403 when user is not author', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        sender: { userId: OTHER_USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [],
        },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('propres messages')
      );
    });

    it('returns 403 when user not member of non-meeshy conversation', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [],
        },
      });
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('Unauthorized')
      );
    });

    it('allows edit for meeshy conversation without membership check', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'meeshy',
          participants: [],
        },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('updates message content on happy path', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('calls sendInternalError on error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    it('broadcasts MESSAGE_EDITED via Socket.IO on happy path (parity with PUT sibling)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(fastify._mockGetManager).toHaveBeenCalled();
      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith(
        'message:edited',
        expect.objectContaining({ id: MSG_ID, conversationId: CONV_ID })
      );
    });

    it('invalidates cached translations and triggers retranslation on happy path (parity with PUT sibling)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(fastify.translationService._processRetranslationAsync).toHaveBeenCalledWith(
        MSG_ID,
        expect.objectContaining({ id: MSG_ID, content: 'Updated', conversationId: CONV_ID })
      );
    });

    it('continues successfully when retranslation fails (parity with PUT sibling)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: { identifier: 'meeshy', participants: [] },
      });
      fastify.translationService = {
        _processRetranslationAsync: jest.fn().mockRejectedValue(new Error('translation error')),
      };
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('socketIOManager null in patch edit - no broadcast but success', async () => {
      fastify.socketIOHandler.getManager.mockReturnValue(null);
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: { identifier: 'meeshy', participants: [] },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).not.toHaveBeenCalled();
    });
  });

  // ─── GET /conversations/:id/reactions ────────────────────────────────────

  describe('GET /conversations/:id/reactions', () => {
    const getReactionsHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id/reactions');

    it('returns 403 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns 403 when access denied', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns empty reactions array when no reactions', async () => {
      prisma.reaction.findMany.mockResolvedValue([]);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, {
        reactions: [],
        total: 0,
      });
    });

    it('groups reactions by messageId and emoji', async () => {
      prisma.reaction.findMany.mockResolvedValue([
        {
          messageId: MSG_ID,
          emoji: '👍',
          participantId: PART_ID,
          createdAt: new Date(),
          participant: {
            id: PART_ID,
            displayName: 'Alice',
            avatar: null,
            type: 'user',
            user: { username: 'alice' },
          },
        },
        {
          messageId: MSG_ID,
          emoji: '👍',
          participantId: 'other-part',
          createdAt: new Date(),
          participant: {
            id: 'other-part',
            displayName: 'Bob',
            avatar: null,
            type: 'user',
            user: { username: 'bob' },
          },
        },
        {
          messageId: MSG_ID,
          emoji: '❤️',
          participantId: PART_ID,
          createdAt: new Date(),
          participant: {
            id: PART_ID,
            displayName: 'Alice',
            avatar: null,
            type: 'user',
            user: { username: 'alice' },
          },
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      const result = mockSendSuccess.mock.calls[0][1];
      expect(result.total).toBe(3);
      const msgReactions = result.reactions.find((r: any) => r.messageId === MSG_ID);
      expect(msgReactions).toBeDefined();
      const thumbsUp = msgReactions.reactions.find((r: any) => r.emoji === '👍');
      expect(thumbsUp.count).toBe(2);
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.reaction.findMany.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ─── POST /conversations/:id/messages/:messageId/reactions ───────────────

  describe('POST /conversations/:id/messages/:messageId/reactions', () => {
    const getAddReactionHandler = (f: any) =>
      getHandler(f, 'POST', '/conversations/:id/messages/:messageId/reactions');

    it('returns 400 when emoji is missing', async () => {
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: {},
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'emoji is required');
    });

    it('returns 404 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns 403 when access denied', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found in this conversation');
    });

    it('returns 403 when registered user has no participant record', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
        authContext: {
          isAuthenticated: true,
          userId: USER_ID,
          isAnonymous: false,
          sessionToken: null,
          participantId: null,
        },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'You are not a participant of this conversation');
    });

    it('uses participantId for anonymous user', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
        authContext: {
          isAuthenticated: true,
          userId: null,
          isAnonymous: true,
          sessionToken: 'sess-token',
          participantId: PART_ID,
        },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockAddReaction).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: PART_ID })
      );
    });

    it('returns 500 when reactionService.addReaction returns null', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockAddReaction.mockResolvedValue(null);

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    it('returns success and broadcasts reaction on happy path', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockAddReaction.mockResolvedValue({ reaction: { id: 'reaction-id', emoji: '👍' }, replacedEmojis: [] });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { added: true, emoji: '👍' });
      expect(fastify._mockEmit).toHaveBeenCalledWith('reaction:added', expect.any(Object));
    });

    it('returns 400 on Invalid emoji format error', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockAddReaction.mockRejectedValue(new Error('Invalid emoji format'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: 'bad' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Invalid emoji format');
    });

    it('returns 404 on Message not found error from service', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockAddReaction.mockRejectedValue(new Error('Message not found'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
    });

    it('returns 403 on not a member error from service', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockAddReaction.mockRejectedValue(new Error('User is not a member of this conversation'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns 400 when reacting to a system message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockAddReaction.mockRejectedValue(new Error('Cannot react to a system message'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Cannot react to a system message');
    });

    it('returns 500 on generic error', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockAddReaction.mockRejectedValue(new Error('Unknown error'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    it('continues when socket broadcast throws', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: MSG_ID });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockCreateUpdateEvent.mockRejectedValue(new Error('socket error'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getAddReactionHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  // ─── DELETE /conversations/:id/messages/:messageId/reactions ─────────────

  describe('DELETE /conversations/:id/messages/:messageId/reactions', () => {
    const getRemoveReactionHandler = (f: any) =>
      getHandler(f, 'DELETE', '/conversations/:id/messages/:messageId/reactions');

    it('returns 400 when emoji is missing', async () => {
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: {},
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'emoji is required');
    });

    it('returns 404 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns 403 when access denied', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns 403 when user has no participant record', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
        authContext: {
          isAuthenticated: true,
          userId: USER_ID,
          isAnonymous: false,
          sessionToken: null,
          participantId: null,
        },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'You are not a participant of this conversation');
    });

    it('uses participantId for anonymous user', async () => {
      mockRemoveReaction.mockResolvedValue(true);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
        authContext: {
          isAuthenticated: true,
          userId: null,
          isAnonymous: true,
          sessionToken: 'sess-token',
          participantId: PART_ID,
        },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockRemoveReaction).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: PART_ID })
      );
    });

    it('returns 404 when reaction not found (removeReaction returns false)', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockRemoveReaction.mockResolvedValue(false);

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Reaction not found');
    });

    it('returns success and broadcasts removal on happy path', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockRemoveReaction.mockResolvedValue(true);

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { removed: true });
      expect(fastify._mockEmit).toHaveBeenCalledWith('reaction:removed', expect.any(Object));
    });

    it('returns 400 on Invalid emoji format error', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockRemoveReaction.mockRejectedValue(new Error('Invalid emoji format'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: 'bad' },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Invalid emoji format');
    });

    it('returns 500 on generic error', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      mockRemoveReaction.mockRejectedValue(new Error('Unknown error'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      });
      const reply = makeReply();

      await getRemoveReactionHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ─── GET /conversations/:id/status ───────────────────────────────────────

  describe('GET /conversations/:id/status', () => {
    const getStatusHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id/status');

    it('returns 403 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns 403 when access denied', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns empty statuses when no messages', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, {
        statuses: [],
        total: 0,
      });
    });

    it('formats message statuses correctly', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: MSG_ID,
          senderId: PART_ID,
          deliveredCount: 3,
          readCount: 2,
          deliveredToAllAt: new Date(),
          readByAllAt: null,
          createdAt: new Date(),
          statusEntries: [
            {
              participantId: PART_ID,
              deliveredAt: new Date(),
              readAt: new Date(),
              participant: {
                id: PART_ID,
                displayName: 'Alice',
                avatar: null,
                type: 'user',
                user: { username: 'alice' },
              },
            },
          ],
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      const result = mockSendSuccess.mock.calls[0][1];
      expect(result.total).toBe(1);
      expect(result.statuses[0].summary.deliveredCount).toBe(3);
      expect(result.statuses[0].summary.readCount).toBe(2);
      expect(result.statuses[0].entries[0].user.username).toBe('alice');
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.message.findMany.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    it('deliveredCount=0 and readCount=0 use fallback 0', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: MSG_ID,
          senderId: PART_ID,
          deliveredCount: 0,
          readCount: 0,
          deliveredToAllAt: null,
          readByAllAt: null,
          statusEntries: [],
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      const result = mockSendSuccess.mock.calls[0][1];
      expect(result.statuses[0].summary.deliveredCount).toBe(0);
      expect(result.statuses[0].summary.readCount).toBe(0);
    });
  });

  // ─── Additional branch coverage ───────────────────────────────────────────

  describe('PUT edit message - additional branch coverage', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('allows edit by BIGBOSS membership (non-author)', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        sender: { id: PART_ID, userId: OTHER_USER_ID, role: 'USER' },
      }));
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'BIGBOSS' },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'New', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('tracking links non-empty logs info', async () => {
      mockProcessExplicitLinksInContent.mockResolvedValue({
        processedContent: 'content with [[link]]',
        trackingLinks: [{ id: 'tl-1', url: 'https://example.com' }],
      });
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'content with [[link]]', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'content with [[link]]' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('updatedMessage.validatedMentions null uses fallback []', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: null, // null → should fallback to []
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // mockSendSuccess captures the second arg (data) directly
      expect(mockSendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ validatedMentions: [] })
      );
    });

    it('socketIOManager null in edit - no broadcast but success', async () => {
      // socketIOHandler is captured at registration time → must re-register with null handler
      const fastifyNullSocket: any = {
        ...fastify,
        socketIOHandler: { getManager: jest.fn().mockReturnValue(null) },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn((path: string, _opts: any, handler: Function) => {
          if (path.includes(':messageId')) {
            fastifyNullSocket._editHandler = handler;
          }
        }),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const localPrisma = makePrisma();
      localPrisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      localPrisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'hello', validatedMentions: [], translations: null,
      });
      registerMessagesAdvancedRoutes(fastifyNullSocket, localPrisma, makeTranslationService(), jest.fn(), jest.fn());

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await fastifyNullSocket._editHandler(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('resolveUsernames returns empty userMap - clears mentions', async () => {
      const extractMock = jest.fn().mockReturnValue(['@unknown']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map()); // empty map
      fastify.mentionService = {
        extractMentions: extractMock,
        resolveUsernames,
        validateMentionPermissions: jest.fn(),
        createMentions: jest.fn(),
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'hello @unknown', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello @unknown' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // Empty map → mentionedUserIds is [] → updates validatedMentions to []
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ validatedMentions: [] }) })
      );
    });

    it('validationResult.validUserIds empty - clears mentions without createMentions', async () => {
      const extractMock = jest.fn().mockReturnValue(['@alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: false,
        validUserIds: [], // empty valid ids
      });
      const createMentions = jest.fn();
      fastify.mentionService = {
        extractMentions: extractMock,
        resolveUsernames,
        validateMentionPermissions,
        createMentions,
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'hello @alice', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello @alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(createMentions).not.toHaveBeenCalled();
    });

    it('existingMessage.content null uses ?? empty string for stats', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({ content: null }));
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'new content', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'new content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockOnMessageEdited).toHaveBeenCalledWith(
        expect.anything(), // prisma
        CONV_ID,
        USER_ID,
        '', // null ?? '' = ''
        expect.any(String)
      );
    });
  });

  describe('DELETE message - additional branch coverage', () => {
    const getDeleteMsgHandler = (f: any) =>
      getHandler(f, 'DELETE', '/conversations/:id/messages/:messageId');

    it('allows delete by BIGBOSS role', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'BIGBOSS' },
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('handles null sender.userId using ?? empty string', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: null, // null sender → isAuthor = false → check participant
        attachments: [],
      });
      // Let the participant lookup succeed so canDelete=true
      prisma.participant.findFirst.mockResolvedValue({ user: { role: 'BIGBOSS' } });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(),
        CONV_ID,
        '', // null?.userId ?? '' = ''
        expect.any(String),
        []
      );
    });

    it('handles null content using ?? empty string', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: null,
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(),
        CONV_ID,
        USER_ID,
        '', // null ?? '' = ''
        []
      );
    });

    it('handles null attachments using ?? []', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: null, // null attachments
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(),
        CONV_ID,
        USER_ID,
        'hello',
        [] // null ?? [] = []
      );
    });

    it('handles null mimeType in attachment using ?? empty string', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [{ id: 'a1', mimeType: null }], // null mimeType → ''
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(), CONV_ID, USER_ID, 'hello',
        ['file'] // '' doesn't start with any prefix → 'file'
      );
    });

    it('video mimeType categorized as video', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [
          { id: 'a1', mimeType: 'video/mp4' },
          { id: 'a2', mimeType: 'application/pdf' }, // → 'file'
        ],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(), CONV_ID, USER_ID, 'hello',
        ['video', 'file']
      );
    });

    it('socketIOManager null in delete - no broadcast but success', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('socket null branches - re-registered with null socketIOHandler', () => {
    // socketIOHandler is captured at registration time in registerMessagesAdvancedRoutes
    // We must create a fresh fastify with socketIOHandler=null and re-register

    const createNullSocketFastify = () => {
      const routes: Record<string, Record<string, Function>> = {};
      const f: any = {
        get: jest.fn((path: string, _opts: any, handler: Function) => {
          (routes['GET'] = routes['GET'] || {})[path] = handler;
        }),
        post: jest.fn((path: string, _opts: any, handler: Function) => {
          (routes['POST'] = routes['POST'] || {})[path] = handler;
        }),
        put: jest.fn((path: string, _opts: any, handler: Function) => {
          (routes['PUT'] = routes['PUT'] || {})[path] = handler;
        }),
        delete: jest.fn((path: string, _opts: any, handler: Function) => {
          (routes['DELETE'] = routes['DELETE'] || {})[path] = handler;
        }),
        patch: jest.fn((path: string, _opts: any, handler: Function) => {
          (routes['PATCH'] = routes['PATCH'] || {})[path] = handler;
        }),
        socketIOHandler: null, // null at registration time
        notificationService: null,
        mentionService: null,
        translationService: { _processRetranslationAsync: jest.fn().mockResolvedValue(undefined) },
        _routes: routes,
      };
      return f;
    };

    it('edit: socketIOHandler null at registration - no broadcast but success', async () => {
      const f = createNullSocketFastify();
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue(makeExistingMessage());
      p.message.update.mockResolvedValue({ id: MSG_ID, content: 'hello', validatedMentions: [], translations: null });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'PUT', ':messageId');
      const reply = makeReply();
      await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'hello' } }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('delete message: socketIOHandler.getManager returns null - no broadcast but success', async () => {
      const f = createNullSocketFastify();
      f.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      p.message.update.mockResolvedValue({});
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'DELETE', ':messageId');
      const reply = makeReply();
      await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('add reaction: socketIOHandler null at registration - no broadcast but success', async () => {
      mockAddReaction.mockResolvedValue({ reaction: { id: 'reaction-id', emoji: '👍' }, replacedEmojis: [] });
      const f = createNullSocketFastify();
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue({ id: MSG_ID });
      p.participant.findFirst.mockResolvedValue({ id: PART_ID });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'POST', ':messageId/reactions');
      const reply = makeReply();
      await handler(makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      }), reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { added: true, emoji: '👍' });
    });

    it('remove reaction: socketIOHandler null at registration - no broadcast but success', async () => {
      mockRemoveReaction.mockResolvedValue(true);
      const f = createNullSocketFastify();
      const p = makePrisma();
      p.participant.findFirst.mockResolvedValue({ id: PART_ID });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'DELETE', ':messageId/reactions');
      const reply = makeReply();
      await handler(makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      }), reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { removed: true });
    });

    it('edit: socketIOManager getIO returns null - no broadcast but success', async () => {
      const f = createNullSocketFastify();
      f.socketIOHandler = { getManager: jest.fn().mockReturnValue({ getIO: jest.fn().mockReturnValue(null) }) };
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue(makeExistingMessage());
      p.message.update.mockResolvedValue({ id: MSG_ID, content: 'hello', validatedMentions: [], translations: null });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'PUT', ':messageId');
      const reply = makeReply();
      await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'hello' } }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('add reaction: socketIOHandler getIO returns null - no broadcast but success', async () => {
      mockAddReaction.mockResolvedValue({ reaction: { id: 'reaction-id', emoji: '👍' }, replacedEmojis: [] });
      const f = createNullSocketFastify();
      f.socketIOHandler = { getManager: jest.fn().mockReturnValue({ getIO: jest.fn().mockReturnValue(null) }) };
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue({ id: MSG_ID });
      p.participant.findFirst.mockResolvedValue({ id: PART_ID });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'POST', ':messageId/reactions');
      const reply = makeReply();
      await handler(makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      }), reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { added: true, emoji: '👍' });
    });

    it('remove reaction: socketIOHandler getIO returns null - no broadcast but success', async () => {
      mockRemoveReaction.mockResolvedValue(true);
      const f = createNullSocketFastify();
      f.socketIOHandler = { getManager: jest.fn().mockReturnValue({ getIO: jest.fn().mockReturnValue(null) }) };
      const p = makePrisma();
      p.participant.findFirst.mockResolvedValue({ id: PART_ID });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'DELETE', ':messageId/reactions');
      const reply = makeReply();
      await handler(makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { emoji: '👍' },
      }), reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { removed: true });
    });
  });

  describe('Edit message - remaining notification branches', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('sender or conversationInfo null - skips notification', async () => {
      // Covers branch 20: if (sender && conversationInfo) → false
      const extractMock = jest.fn().mockReturnValue(['alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: true,
        validUserIds: ['user-alice'],
      });
      const createMentions = jest.fn().mockResolvedValue(undefined);
      fastify.mentionService = { extractMentions: extractMock, resolveUsernames, validateMentionPermissions, createMentions };

      const createBatchMock = jest.fn().mockResolvedValue(1);
      fastify.notificationService = { createMentionNotificationsBatch: createBatchMock };

      // user.findUnique returns null → sender is null → if (sender && conversationInfo) = false
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue({
        title: 'Test', type: 'group', participants: [{ userId: USER_ID }],
      });

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'Hello alice', validatedMentions: ['alice'], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(createBatchMock).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  // ─── Branch 0: safeParse failure ─────────────────────────────────────────────

  describe('PUT edit message - safeParse validation failure', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('returns 400 when body content is empty string (safeParse fails)', async () => {
      // EditMessageBodySchema uses z.string().min(1) for content
      // Sending content: '' triggers safeParse failure → branch 0[0] covered
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: '' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(
        reply,
        'Validation error',
        expect.objectContaining({ message: expect.any(String) })
      );
    });
  });

  // ─── Branches 24/25: updatedMessage.validatedMentions stays null ──────────────

  describe('PUT edit message - validatedMentions remains null after double update failure', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('covers || [] fallback when both mention-clear updates throw', async () => {
      // When mentionService is null, code tries to clear validatedMentions via prisma.message.update
      // at line 390. If that throws, the catch block at line 401 tries again.
      // If that also throws, updatedMessage.validatedMentions remains null from the initial update.
      // Line 464: updatedMessage.validatedMentions || [] → null || [] covers branch 24[1]
      // Line 468: same expression covers branch 25[1]
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      // Call 1 (line 206 main update): succeeds, returns validatedMentions: null
      prisma.message.update
        .mockResolvedValueOnce({
          id: MSG_ID,
          content: 'hello',
          validatedMentions: null,
          translations: null,
          createdAt: new Date(),
        })
        // Call 2 (line 390 clear mentions, mentionService=null branch): throws
        .mockRejectedValueOnce(new Error('DB mention clear error'))
        // Call 3 (line 401 catch-block clear): throws
        .mockRejectedValueOnce(new Error('DB catch clear error'))
        // Call 4 (line 418 reset translations): succeeds
        .mockResolvedValue({});

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // validatedMentions was null, || [] used → response contains []
      expect(mockSendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ validatedMentions: [] })
      );
    });
  });
});
