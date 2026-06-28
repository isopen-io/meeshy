import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock variables ────────────────────────────────────────────────────────────

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
const mockSendConflict = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 409;
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

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logError: (...args: any[]) => mockLogError(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { invitationRoutes } from '../../../routes/invitations';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = () => ({
  user: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    findFirst: jest.fn<any>().mockResolvedValue(null),
  },
});

const makeEmailService = () => ({
  sendInvitationEmail: jest.fn<any>().mockResolvedValue(undefined),
});

const createMockFastify = (emailService?: any) => {
  const routes: Record<string, Record<string, Function>> = {};
  const fastify: any = {
    prisma: makePrisma(),
    authenticate: jest.fn(),
    emailService: emailService ?? null,
    log: { warn: jest.fn(), error: jest.fn() },
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

const makeRequest = (overrides: any = {}) => ({
  body: { email: 'invite@example.com' },
  user: { userId: USER_ID },
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('invitationRoutes', () => {
  let fastify: ReturnType<typeof createMockFastify>;
  let emailService: ReturnType<typeof makeEmailService>;

  beforeEach(async () => {
    emailService = makeEmailService();
    fastify = createMockFastify(emailService);
    await invitationRoutes(fastify);

    jest.clearAllMocks();
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
    mockSendConflict.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 409;
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

  describe('POST /invitations/email', () => {
    it('sends invitation and returns 201 when everything succeeds', async () => {
      const handler = getHandler(fastify, 'POST', '/invitations/email');
      fastify.prisma.user.findUnique.mockResolvedValue({
        displayName: 'Alice',
        username: 'alice',
        avatar: 'https://example.com/avatar.png',
        systemLanguage: 'en',
      });
      fastify.prisma.user.findFirst.mockResolvedValue(null);
      emailService.sendInvitationEmail.mockResolvedValue(undefined);

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(emailService.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'invite@example.com',
          senderName: 'Alice',
          downloadUrl: 'https://meeshy.me/download',
          language: 'en',
        })
      );
      expect(reply._status).toBe(201);
      expect(reply._body).toMatchObject({ success: true, data: { email: 'invite@example.com' } });
    });

    it('uses username as senderName when displayName is null', async () => {
      const handler = getHandler(fastify, 'POST', '/invitations/email');
      fastify.prisma.user.findUnique.mockResolvedValue({
        displayName: null,
        username: 'alice_user',
        avatar: null,
        systemLanguage: 'fr',
      });
      fastify.prisma.user.findFirst.mockResolvedValue(null);

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(emailService.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ senderName: 'alice_user' })
      );
    });

    it('uses default language "fr" when systemLanguage is null', async () => {
      const handler = getHandler(fastify, 'POST', '/invitations/email');
      fastify.prisma.user.findUnique.mockResolvedValue({
        displayName: 'Bob',
        username: 'bob',
        avatar: null,
        systemLanguage: null,
      });
      fastify.prisma.user.findFirst.mockResolvedValue(null);

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(emailService.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' })
      );
    });

    it('returns 404 when sending user is not found', async () => {
      const handler = getHandler(fastify, 'POST', '/invitations/email');
      fastify.prisma.user.findUnique.mockResolvedValue(null);

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('returns 409 when invitee email already exists on Meeshy', async () => {
      const handler = getHandler(fastify, 'POST', '/invitations/email');
      fastify.prisma.user.findUnique.mockResolvedValue({
        displayName: 'Alice',
        username: 'alice',
        avatar: null,
        systemLanguage: 'en',
      });
      fastify.prisma.user.findFirst.mockResolvedValue({ id: 'existing-user-id' });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(409);
    });

    it('warns and skips email when emailService is not available', async () => {
      const fastifyNoEmail = createMockFastify(undefined); // no email service
      await invitationRoutes(fastifyNoEmail);
      const handler = getHandler(fastifyNoEmail, 'POST', '/invitations/email');

      fastifyNoEmail.prisma.user.findUnique.mockResolvedValue({
        displayName: 'Bob',
        username: 'bob',
        avatar: null,
        systemLanguage: 'en',
      });
      fastifyNoEmail.prisma.user.findFirst.mockResolvedValue(null);

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(fastifyNoEmail.log.warn).toHaveBeenCalledWith(
        'EmailService not available, invitation not sent'
      );
      expect(reply._status).toBe(201);
    });

    it('returns 400 for invalid email (Zod validation failure)', async () => {
      const handler = getHandler(fastify, 'POST', '/invitations/email');

      const req = makeRequest({ body: { email: 'not-an-email' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 500 on unexpected errors', async () => {
      const handler = getHandler(fastify, 'POST', '/invitations/email');
      fastify.prisma.user.findUnique.mockRejectedValue(new Error('DB connection error'));

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
      expect(mockLogError).toHaveBeenCalled();
    });
  });
});
