import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock variables ────────────────────────────────────────────────────────────

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  reply._status = 200;
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 400;
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
const mockLogError = jest.fn<any>();
const mockLogger = { warn: jest.fn<any>(), error: jest.fn<any>(), info: jest.fn<any>() };
const mockResolveConversationId = jest.fn<any>().mockResolvedValue(null);

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logError: (...args: any[]) => mockLogError(...args),
  logger: mockLogger,
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { translationRoutes } from '../../../routes/translation-non-blocking';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const MSG_ID = '507f1f77bcf86cd799439013';

// ─── Factories ────────────────────────────────────────────────────────────────

type Routes = Record<string, Record<string, Function>>;
type RouteOpts = Record<string, Record<string, any>>;

const makeTranslationService = () => ({
  handleNewMessage: jest.fn<any>().mockResolvedValue(undefined),
  getTranslation: jest.fn<any>().mockResolvedValue(null),
});

const makeMessagingService = () => ({
  handleMessage: jest.fn<any>().mockResolvedValue(undefined),
});

const createMockFastify = (translationService?: any, messagingService?: any) => {
  const routes: Routes = {};
  const routeOpts: RouteOpts = {};
  const fastify: any = {
    authenticate: jest.fn(),
    translationService: translationService ?? makeTranslationService(),
    messagingService: messagingService ?? makeMessagingService(),
    prisma: {
      message: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      conversation: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    },
    post: jest.fn((path: string, opts: any, handler: Function) => {
      routes['POST'] = routes['POST'] || {};
      routes['POST'][path] = handler;
      routeOpts['POST'] = routeOpts['POST'] || {};
      routeOpts['POST'][path] = opts;
    }),
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    _routes: routes,
    _routeOpts: routeOpts,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, path: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key = Object.keys(methodRoutes).find(k => k === path)
    ?? Object.keys(methodRoutes).find(k => k.includes(path));
  if (!key) throw new Error(`No ${method} route at '${path}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeRequest = (overrides: any = {}) => ({
  body: {},
  params: {},
  user: { userId: USER_ID },
  authContext: {
    isAuthenticated: true,
    isAnonymous: false,
    userId: USER_ID,
    registeredUser: { id: USER_ID },
    displayName: 'Alice',
  },
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('translationRoutes', () => {
  let fastify: ReturnType<typeof createMockFastify>;
  let translationService: ReturnType<typeof makeTranslationService>;
  let messagingService: ReturnType<typeof makeMessagingService>;

  beforeEach(async () => {
    translationService = makeTranslationService();
    messagingService = makeMessagingService();
    fastify = createMockFastify(translationService, messagingService);
    await translationRoutes(fastify, {});

    jest.clearAllMocks();
    mockSendSuccess.mockImplementation((reply: any, data: any) => {
      reply._body = { success: true, data };
      reply._status = 200;
      return reply;
    });
    mockSendBadRequest.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 400;
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
  });

  describe('initialization', () => {
    it('throws when translationService is not provided', async () => {
      const badFastify = createMockFastify(null, makeMessagingService());
      badFastify.translationService = null;
      await expect(translationRoutes(badFastify, {})).rejects.toThrow('MessageTranslationService not provided');
    });

    it('throws when messagingService is not provided', async () => {
      const badFastify = createMockFastify(makeTranslationService(), null);
      badFastify.messagingService = null;
      await expect(translationRoutes(badFastify, {})).rejects.toThrow('MessagingService not provided');
    });
  });

  describe('POST /translate', () => {
    describe('case 1: retranslation via message_id', () => {
      it('returns processing status immediately when message exists', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        fastify.prisma.message.findUnique.mockResolvedValue({
          id: MSG_ID,
          conversationId: CONV_ID,
          content: 'Hello world',
          originalLanguage: 'en',
          conversation: { participants: [] },
        });

        const req = makeRequest({
          body: { message_id: MSG_ID, target_language: 'fr' },
        });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(200);
        expect(reply._body.data).toMatchObject({
          messageId: MSG_ID,
          targetLanguage: 'fr',
          status: 'processing',
        });
      });

      it('returns 404 when message_id not found in DB', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        fastify.prisma.message.findUnique.mockResolvedValue(null);

        const req = makeRequest({
          body: { message_id: MSG_ID, target_language: 'fr' },
        });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(404);
      });

      it('uses custom text and source_language when provided alongside message_id', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        fastify.prisma.message.findUnique.mockResolvedValue({
          id: MSG_ID,
          conversationId: CONV_ID,
          content: 'Bonjour',
          originalLanguage: 'fr',
          conversation: { participants: [] },
        });

        const req = makeRequest({
          body: { message_id: MSG_ID, text: 'Custom text', source_language: 'de', target_language: 'en', model_type: 'premium' },
        });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(200);
        expect(reply._body.data.status).toBe('processing');
      });

      it('fires handleNewMessage without awaiting (non-blocking)', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        fastify.prisma.message.findUnique.mockResolvedValue({
          id: MSG_ID,
          conversationId: CONV_ID,
          content: 'Hello',
          originalLanguage: 'en',
          conversation: { participants: [] },
        });

        const handleNewMessageReject = jest.fn<any>().mockRejectedValue(new Error('async error'));
        translationService.handleNewMessage = handleNewMessageReject;

        const req = makeRequest({ body: { message_id: MSG_ID, target_language: 'fr' } });
        const reply = makeReply();

        // Should not throw even if handleNewMessage rejects
        await handler(req, reply);
        expect(reply._status).toBe(200);
      });
    });

    describe('case 2: new message translation', () => {
      it('returns processing status with conversation_id', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        mockResolveConversationId.mockResolvedValue(CONV_ID);

        const req = makeRequest({
          body: { text: 'Hello', conversation_id: CONV_ID, target_language: 'fr' },
        });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(200);
        expect(reply._body.data).toMatchObject({
          conversationId: CONV_ID,
          targetLanguage: 'fr',
          status: 'processing',
        });
      });

      it('returns 400 when conversation_id is missing', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');

        const req = makeRequest({
          body: { text: 'Hello', target_language: 'fr' },
        });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(400);
      });

      it('returns 404 when conversation_id cannot be resolved', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        mockResolveConversationId.mockResolvedValue(null);

        const req = makeRequest({
          body: { text: 'Hello', conversation_id: 'unknown-conv', target_language: 'fr' },
        });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(404);
      });

      it('handles anonymous user (isAnonymous=true)', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        mockResolveConversationId.mockResolvedValue(CONV_ID);

        const req = makeRequest({
          body: { text: 'Hello', conversation_id: CONV_ID, target_language: 'fr' },
          authContext: {
            isAuthenticated: true,
            isAnonymous: true,
            userId: 'anon-123',
            displayName: 'Guest',
            registeredUser: undefined,
          },
        });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(200);
      });

      it('fires handleMessage without awaiting (non-blocking)', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        mockResolveConversationId.mockResolvedValue(CONV_ID);

        const handleMessageReject = jest.fn<any>().mockRejectedValue(new Error('async error'));
        messagingService.handleMessage = handleMessageReject;

        const req = makeRequest({
          body: { text: 'Hello', conversation_id: CONV_ID, target_language: 'fr' },
        });
        const reply = makeReply();

        // Should not throw even if handleMessage rejects
        await handler(req, reply);
        expect(reply._status).toBe(200);
      });
    });

    describe('preHandler auth middleware', () => {
      it('delegates to fastify.authenticate', () => {
        const opts = fastify._routeOpts['POST']['/translate'];
        const preHandler = opts?.preHandler?.[0];
        expect(preHandler).toBeDefined();
        const mockReq = {};
        const mockRep = {};
        preHandler(mockReq, mockRep);
        expect(fastify.authenticate).toHaveBeenCalledWith(mockReq, mockRep);
      });
    });

    describe('error handling', () => {
      it('returns 400 on Zod validation error (no text and no message_id)', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');

        const req = makeRequest({ body: { target_language: 'fr' } });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(400);
      });

      it('returns 400 on Zod validation error (missing target_language)', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');

        const req = makeRequest({ body: { text: 'Hello' } });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(400);
      });

      it('returns 500 on unexpected error', async () => {
        const handler = getHandler(fastify, 'POST', '/translate');
        fastify.prisma.message.findUnique.mockRejectedValue(new Error('DB error'));

        const req = makeRequest({ body: { message_id: MSG_ID, target_language: 'fr' } });
        const reply = makeReply();

        await handler(req, reply);

        expect(reply._status).toBe(500);
      });
    });
  });

  describe('GET /status/:messageId/:language', () => {
    it('returns completed status when translation exists', async () => {
      const handler = getHandler(fastify, 'GET', '/status/:messageId/:language');
      translationService.getTranslation.mockResolvedValue({
        translatedText: 'Bonjour',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.95,
      });

      const req = makeRequest({ params: { messageId: MSG_ID, language: 'fr' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data).toMatchObject({ status: 'completed' });
    });

    it('returns processing status when translation not yet available', async () => {
      const handler = getHandler(fastify, 'GET', '/status/:messageId/:language');
      translationService.getTranslation.mockResolvedValue(null);

      const req = makeRequest({ params: { messageId: MSG_ID, language: 'fr' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data).toMatchObject({ status: 'processing' });
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/status/:messageId/:language');
      translationService.getTranslation.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ params: { messageId: MSG_ID, language: 'fr' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });

  describe('GET /conversation/:identifier', () => {
    it('returns conversation data when found by identifier', async () => {
      const handler = getHandler(fastify, 'GET', '/conversation/:identifier');
      fastify.prisma.conversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        identifier: 'my-conv',
        title: 'Test Conv',
        type: 'group',
        createdAt: new Date('2024-01-01'),
        lastMessageAt: new Date('2024-01-15'),
        _count: { messages: 42, participants: 3 },
      });

      const req = makeRequest({ params: { identifier: 'my-conv' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data).toMatchObject({
        id: CONV_ID,
        identifier: 'my-conv',
        messageCount: 42,
        memberCount: 3,
      });
    });

    it('returns 404 when conversation not found', async () => {
      const handler = getHandler(fastify, 'GET', '/conversation/:identifier');
      fastify.prisma.conversation.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { identifier: 'unknown' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/conversation/:identifier');
      fastify.prisma.conversation.findFirst.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ params: { identifier: 'my-conv' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });
});
