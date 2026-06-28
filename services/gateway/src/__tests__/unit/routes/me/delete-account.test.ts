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
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 401;
  return reply;
});
const mockSendConflict = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 409;
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 500;
  return reply;
});

const mockSendAccountDeletionConfirmEmail = jest.fn<any>().mockResolvedValue(undefined);

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendAccountDeletionConfirmEmail: (...args: any[]) => mockSendAccountDeletionConfirmEmail(...args),
  })),
}));

jest.mock('../../../../validation/helpers.js', () => ({
  validateBody: () => jest.fn(),
  validateQuery: () => jest.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { deleteAccountRoutes } from '../../../../routes/me/delete-account';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

type Routes = Record<string, Record<string, Function>>;

const makePrisma = () => ({
  accountDeletionRequest: {
    findFirst: jest.fn<any>().mockResolvedValue(null),
    count: jest.fn<any>().mockResolvedValue(0),
    create: jest.fn<any>().mockResolvedValue({ id: 'dr-1' }),
    update: jest.fn<any>().mockResolvedValue({}),
    updateMany: jest.fn<any>().mockResolvedValue({}),
  },
  user: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    update: jest.fn<any>().mockResolvedValue({}),
  },
  $transaction: jest.fn<any>().mockResolvedValue([]),
});

const createMockFastify = () => {
  const routes: Routes = {};
  const fastify: any = {
    authenticate: jest.fn(),
    prisma: makePrisma(),
    delete: jest.fn((path: string, opts: any, handler: Function) => {
      routes['DELETE'] = routes['DELETE'] || {};
      routes['DELETE'][path] = handler;
    }),
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
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
  ...overrides,
});

const makeRequest = (overrides: any = {}) => ({
  body: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
  query: {},
  authContext: makeAuthContext(),
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  reply.type = jest.fn<any>().mockReturnValue(reply);
  reply.send = jest.fn<any>().mockImplementation((body: any) => {
    reply._body = body;
    return reply;
  });
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deleteAccountRoutes', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify();
    await deleteAccountRoutes(fastify);

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
    mockSendUnauthorized.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 401;
      return reply;
    });
    mockSendConflict.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 409;
      return reply;
    });
    mockSendInternalError.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 500;
      return reply;
    });
  });

  describe('DELETE /delete-account', () => {
    it('returns 401 when not authenticated', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      const req = makeRequest({ authContext: makeAuthContext({ isAuthenticated: false }) });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(401);
    });

    it('returns 401 when registeredUser is null', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      const req = makeRequest({ authContext: makeAuthContext({ registeredUser: null }) });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(401);
    });

    it('returns 400 for wrong confirmation phrase', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      const req = makeRequest({ body: { confirmationPhrase: 'wrong phrase' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 409 when deletion request already pending', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue({ id: 'existing-dr', status: 'PENDING_EMAIL_CONFIRMATION' });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(409);
    });

    it('creates deletion request and sends email successfully', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      fastify.prisma.accountDeletionRequest.count.mockResolvedValue(0);
      fastify.prisma.accountDeletionRequest.create.mockResolvedValue({ id: 'dr-new' });
      fastify.prisma.user.findUnique.mockResolvedValue({
        email: 'user@example.com',
        displayName: 'Alice',
        firstName: 'Alice',
        systemLanguage: 'fr',
      });
      mockSendAccountDeletionConfirmEmail.mockResolvedValue(undefined);

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data.message).toContain('email');
      expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com', name: 'Alice' })
      );
    });

    it('cleans up expired requests before creating a new one', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      fastify.prisma.accountDeletionRequest.count.mockResolvedValue(1);
      fastify.prisma.user.findUnique.mockResolvedValue({
        email: 'user@example.com',
        displayName: 'Alice',
        firstName: null,
        systemLanguage: null,
      });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.prisma.$transaction).toHaveBeenCalled();
      expect(reply._status).toBe(200);
    });

    it('uses firstName as name when displayName is null', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      fastify.prisma.accountDeletionRequest.count.mockResolvedValue(0);
      fastify.prisma.user.findUnique.mockResolvedValue({
        email: 'user@example.com',
        displayName: null,
        firstName: 'Bob',
        systemLanguage: 'en',
      });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bob' })
      );
    });

    it('uses fallback name "Utilisateur" when displayName and firstName are null', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      fastify.prisma.accountDeletionRequest.count.mockResolvedValue(0);
      fastify.prisma.user.findUnique.mockResolvedValue({
        email: 'user@example.com',
        displayName: null,
        firstName: null,
        systemLanguage: null,
      });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Utilisateur' })
      );
    });

    it('skips email when user has no email', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      fastify.prisma.accountDeletionRequest.count.mockResolvedValue(0);
      fastify.prisma.user.findUnique.mockResolvedValue({ email: null, displayName: 'Alice', firstName: null, systemLanguage: null });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(mockSendAccountDeletionConfirmEmail).not.toHaveBeenCalled();
      expect(reply._status).toBe(200);
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'DELETE', '/delete-account');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      fastify.prisma.accountDeletionRequest.count.mockRejectedValue(new Error('DB error'));

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });

  describe('GET /delete-account/confirm', () => {
    it('renders invalid link HTML when token not found', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/confirm');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);

      const req = makeRequest({ query: { token: 'invalid-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(reply._body).toContain('invalide');
    });

    it('confirms deletion and renders success HTML', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/confirm');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue({
        id: 'dr-1',
        userId: USER_ID,
      });
      fastify.prisma.accountDeletionRequest.update.mockResolvedValue({});

      const req = makeRequest({ query: { token: 'valid-token-abc' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(reply._body).toContain('confirm');
      expect(fastify.prisma.accountDeletionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) })
      );
    });

    it('renders error HTML on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/confirm');
      fastify.prisma.accountDeletionRequest.findFirst.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ query: { token: 'some-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(reply._body).toContain('Erreur');
    });
  });

  describe('GET /delete-account/cancel', () => {
    it('renders invalid link HTML when token not found', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/cancel');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);

      const req = makeRequest({ query: { token: 'invalid-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(reply._body).toContain('invalide');
    });

    it('cancels deletion and renders success HTML (user already active)', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/cancel');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue({
        id: 'dr-1',
        userId: USER_ID,
      });
      fastify.prisma.accountDeletionRequest.update.mockResolvedValue({});
      fastify.prisma.user.findUnique.mockResolvedValue({ isActive: true });

      const req = makeRequest({ query: { token: 'valid-cancel-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(fastify.prisma.accountDeletionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) })
      );
      expect(fastify.prisma.user.update).not.toHaveBeenCalled();
    });

    it('restores inactive user when cancelling deletion', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/cancel');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue({
        id: 'dr-1',
        userId: USER_ID,
      });
      fastify.prisma.accountDeletionRequest.update.mockResolvedValue({});
      fastify.prisma.user.findUnique.mockResolvedValue({ isActive: false });
      fastify.prisma.user.update.mockResolvedValue({});

      const req = makeRequest({ query: { token: 'valid-cancel-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: true, deletedAt: null }) })
      );
    });

    it('renders error HTML on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/cancel');
      fastify.prisma.accountDeletionRequest.findFirst.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ query: { token: 'some-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(reply._body).toContain('Erreur');
    });
  });

  describe('GET /delete-account/delete-now', () => {
    it('renders invalid link HTML when token not found or not expired', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/delete-now');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue(null);

      const req = makeRequest({ query: { token: 'invalid-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(reply._body).toContain('invalide');
    });

    it('deletes account immediately and renders success HTML', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/delete-now');
      fastify.prisma.accountDeletionRequest.findFirst.mockResolvedValue({
        id: 'dr-1',
        userId: USER_ID,
      });
      fastify.prisma.user.update.mockResolvedValue({});
      fastify.prisma.accountDeletionRequest.update.mockResolvedValue({});

      const req = makeRequest({ query: { token: 'valid-delete-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
      );
      expect(fastify.prisma.accountDeletionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'COMPLETED' } })
      );
      expect(reply.type).toHaveBeenCalledWith('text/html');
    });

    it('renders error HTML on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/delete-account/delete-now');
      fastify.prisma.accountDeletionRequest.findFirst.mockRejectedValue(new Error('DB error'));

      const req = makeRequest({ query: { token: 'some-token' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.type).toHaveBeenCalledWith('text/html');
      expect(reply._body).toContain('Erreur');
    });
  });
});
