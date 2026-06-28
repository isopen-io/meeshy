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

const mockGetOrCreateConversationKey = jest.fn<any>().mockResolvedValue('key-id-123');
const mockGetEncryptionService = jest.fn<any>().mockResolvedValue({
  getOrCreateConversationKey: (...args: any[]) => mockGetOrCreateConversationKey(...args),
});
const mockCreateUnifiedAuthMiddleware = jest.fn<any>().mockReturnValue(jest.fn<any>());

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: (...args: any[]) => mockGetEncryptionService(...args),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (...args: any[]) => mockCreateUnifiedAuthMiddleware(...args),
}));

jest.mock('../../../validation/helpers.js', () => ({
  validateParams: () => jest.fn(),
  validateBody: () => jest.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import encryptionRoutes from '../../../routes/conversation-encryption';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';

// ─── Factories ────────────────────────────────────────────────────────────────

type Routes = Record<string, Record<string, Function>>;

const makeConversation = (overrides: any = {}) => ({
  id: CONV_ID,
  encryptionEnabledAt: null,
  encryptionMode: null,
  encryptionEnabledBy: null,
  type: 'direct',
  participants: [{ userId: USER_ID, role: 'member' }],
  ...overrides,
});

const createMockFastify = () => {
  const routes: Routes = {};
  const fastify: any = {
    prisma: {
      conversation: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(null),
      },
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
      message: {
        create: jest.fn<any>().mockResolvedValue({}),
      },
    },
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    post: jest.fn((path: string, opts: any, handler: Function) => {
      routes['POST'] = routes['POST'] || {};
      routes['POST'][path] = handler;
    }),
    _routes: routes,
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

const makeAuthContext = (overrides: any = {}) => ({
  isAuthenticated: true,
  isAnonymous: false,
  userId: USER_ID,
  registeredUser: { id: USER_ID },
  hasFullAccess: true,
  ...overrides,
});

const makeRequest = (overrides: any = {}) => ({
  params: { conversationId: CONV_ID },
  body: { mode: 'e2ee' },
  authContext: makeAuthContext(),
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  reply.send = jest.fn<any>().mockImplementation((body: any) => {
    reply._body = body;
    reply._status = 200;
    return reply;
  });
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('encryptionRoutes', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify();
    await encryptionRoutes(fastify as any);

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
    mockGetOrCreateConversationKey.mockResolvedValue('key-id-123');
    mockGetEncryptionService.mockResolvedValue({
      getOrCreateConversationKey: (...args: any[]) => mockGetOrCreateConversationKey(...args),
    });
  });

  describe('GET /conversations/:conversationId/encryption-status', () => {
    it('returns encryption status for a conversation member', async () => {
      const handler = getHandler(fastify, 'GET', '/conversations/:conversationId/encryption-status');
      const conv = makeConversation({ encryptionEnabledAt: new Date('2024-01-01'), encryptionMode: 'server', encryptionEnabledBy: USER_ID });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data).toMatchObject({ isEncrypted: true, mode: 'server', canTranslate: true });
    });

    it('returns 404 when conversation not found', async () => {
      const handler = getHandler(fastify, 'GET', '/conversations/:conversationId/encryption-status');
      fastify.prisma.conversation.findUnique.mockResolvedValue(null);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('returns 403 when user is not a member', async () => {
      const handler = getHandler(fastify, 'GET', '/conversations/:conversationId/encryption-status');
      const conv = makeConversation({ participants: [{ userId: 'other-user-id' }] });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('skips member check for anonymous users', async () => {
      const handler = getHandler(fastify, 'GET', '/conversations/:conversationId/encryption-status');
      const conv = makeConversation({ participants: [] });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({
        params: { conversationId: CONV_ID },
        authContext: makeAuthContext({ isAnonymous: true }),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
    });

    it('correctly reports canTranslate=false for e2ee mode', async () => {
      const handler = getHandler(fastify, 'GET', '/conversations/:conversationId/encryption-status');
      const conv = makeConversation({ encryptionEnabledAt: new Date(), encryptionMode: 'e2ee', encryptionEnabledBy: USER_ID });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._body.data).toMatchObject({ isEncrypted: true, canTranslate: false });
    });

    it('correctly reports canTranslate=true for hybrid mode', async () => {
      const handler = getHandler(fastify, 'GET', '/conversations/:conversationId/encryption-status');
      const conv = makeConversation({ encryptionEnabledAt: new Date(), encryptionMode: 'hybrid', encryptionEnabledBy: USER_ID });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._body.data).toMatchObject({ isEncrypted: true, canTranslate: true });
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/conversations/:conversationId/encryption-status');
      fastify.prisma.conversation.findUnique.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });

  describe('POST /conversations/:conversationId/encryption', () => {
    it('enables e2ee encryption on a direct conversation', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({ encryptionEnabledAt: null, type: 'direct' });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);
      fastify.prisma.conversation.update.mockResolvedValue({
        id: CONV_ID,
        encryptionEnabledAt: new Date(),
        encryptionMode: 'e2ee',
        encryptionProtocol: 'signal_v3',
        encryptionEnabledBy: USER_ID,
      });
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._body.success).toBe(true);
      expect(fastify.prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ encryptionMode: 'e2ee' }) })
      );
    });

    it('enables server encryption and creates a key', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({ encryptionEnabledAt: null, type: 'direct' });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);
      fastify.prisma.conversation.update.mockResolvedValue({
        id: CONV_ID,
        encryptionEnabledAt: new Date(),
        encryptionMode: 'server',
        encryptionProtocol: 'aes-256-gcm',
        encryptionEnabledBy: USER_ID,
      });
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });

      const req = makeRequest({ body: { mode: 'server' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockGetOrCreateConversationKey).toHaveBeenCalled();
      expect(reply._body.success).toBe(true);
    });

    it('enables hybrid encryption and creates a key', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({ encryptionEnabledAt: null, type: 'direct' });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);
      fastify.prisma.conversation.update.mockResolvedValue({
        id: CONV_ID,
        encryptionEnabledAt: new Date(),
        encryptionMode: 'hybrid',
        encryptionProtocol: 'aes-256-gcm',
        encryptionEnabledBy: USER_ID,
      });
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });

      const req = makeRequest({ body: { mode: 'hybrid' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockGetOrCreateConversationKey).toHaveBeenCalled();
    });

    it('returns 403 for anonymous user', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');

      const req = makeRequest({
        body: { mode: 'e2ee' },
        authContext: makeAuthContext({ isAnonymous: true }),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('returns 400 for invalid encryption mode', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');

      const req = makeRequest({ body: { mode: 'invalid-mode' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 404 when conversation not found', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      fastify.prisma.conversation.findUnique.mockResolvedValue(null);

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('returns 400 when encryption already enabled (immutable)', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({ encryptionEnabledAt: new Date('2024-01-01') });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 403 when user is not a member', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({ encryptionEnabledAt: null, participants: [{ userId: 'other-user', role: 'member' }] });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('returns 403 when group member has no moderator role', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({
        encryptionEnabledAt: null,
        type: 'group',
        participants: [{ userId: USER_ID, role: 'member' }],
      });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(403);
    });

    it('allows group moderator to enable encryption', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({
        encryptionEnabledAt: null,
        type: 'group',
        participants: [{ userId: USER_ID, role: 'MODERATOR' }],
      });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);
      fastify.prisma.conversation.update.mockResolvedValue({
        id: CONV_ID,
        encryptionEnabledAt: new Date(),
        encryptionMode: 'e2ee',
        encryptionProtocol: 'signal_v3',
        encryptionEnabledBy: USER_ID,
      });
      fastify.prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._body.success).toBe(true);
    });

    it('skips system message creation when senderParticipant not found', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      const conv = makeConversation({ encryptionEnabledAt: null, type: 'direct' });
      fastify.prisma.conversation.findUnique.mockResolvedValue(conv);
      fastify.prisma.conversation.update.mockResolvedValue({
        id: CONV_ID,
        encryptionEnabledAt: new Date(),
        encryptionMode: 'e2ee',
        encryptionProtocol: 'signal_v3',
        encryptionEnabledBy: USER_ID,
      });
      fastify.prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.prisma.message.create).not.toHaveBeenCalled();
      expect(reply._body.success).toBe(true);
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'POST', '/conversations/:conversationId/encryption');
      fastify.prisma.conversation.findUnique.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ body: { mode: 'e2ee' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });
});
