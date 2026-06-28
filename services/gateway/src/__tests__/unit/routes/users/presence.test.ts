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
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 500;
  return reply;
});

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getUsersPresence } from '../../../../routes/users/presence';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID_1 = '507f1f77bcf86cd799439011';
const USER_ID_2 = '507f1f77bcf86cd799439012';

// ─── Factories ────────────────────────────────────────────────────────────────

type Routes = Record<string, Record<string, Function>>;

const createMockFastify = (withPresenceChecker = true) => {
  const routes: Routes = {};
  const presenceChecker = withPresenceChecker
    ? { bulk: jest.fn<any>().mockReturnValue(new Map([[USER_ID_1, true], [USER_ID_2, false]])) }
    : null;

  const fastify: any = {
    authenticate: jest.fn(),
    presenceChecker,
    prisma: {
      user: { findMany: jest.fn<any>().mockResolvedValue([]) },
      participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    },
    log: { error: jest.fn() },
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

const makeRequest = (overrides: any = {}) => ({
  query: { ids: `${USER_ID_1},${USER_ID_2}` },
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getUsersPresence', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify(true);
    await getUsersPresence(fastify);

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
    mockSendInternalError.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 500;
      return reply;
    });
  });

  describe('GET /users/presence', () => {
    it('returns presence data for given user ids', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');
      fastify.presenceChecker.bulk.mockReturnValue(new Map([[USER_ID_1, true], [USER_ID_2, false]]));
      fastify.prisma.user.findMany.mockResolvedValue([
        { id: USER_ID_1, lastActiveAt: new Date('2024-01-01') },
        { id: USER_ID_2, lastActiveAt: null },
      ]);
      fastify.prisma.participant.findMany.mockResolvedValue([]);

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data.users).toHaveLength(2);
      expect(reply._body.data.users[0]).toMatchObject({ userId: USER_ID_1, isOnline: true });
      expect(reply._body.data.users[1]).toMatchObject({ userId: USER_ID_2, isOnline: false });
    });

    it('returns 400 when ids query param is empty', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');

      const req = makeRequest({ query: { ids: '' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 400 when ids query param is missing', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns empty users array when ids become empty after filtering', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');

      const req = makeRequest({ query: { ids: ',,,' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data.users).toEqual([]);
    });

    it('returns 400 when more than 200 ids are provided', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');
      const ids = Array.from({ length: 201 }, (_, i) => `user-${i}`).join(',');

      const req = makeRequest({ query: { ids } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('deduplicates ids before querying', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');
      fastify.presenceChecker.bulk.mockReturnValue(new Map([[USER_ID_1, true]]));
      fastify.prisma.user.findMany.mockResolvedValue([{ id: USER_ID_1, lastActiveAt: null }]);
      fastify.prisma.participant.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { ids: `${USER_ID_1},${USER_ID_1},${USER_ID_1}` } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data.users).toHaveLength(1);
    });

    it('returns all offline when presenceChecker is null (boot phase)', async () => {
      const noPresenceFastify = createMockFastify(false);
      await getUsersPresence(noPresenceFastify);
      const handler = getHandler(noPresenceFastify, 'GET', '/users/presence');

      const req = makeRequest({ query: { ids: `${USER_ID_1},${USER_ID_2}` } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data.users.every((u: any) => u.isOnline === false)).toBe(true);
    });

    it('includes lastActiveAt from anonymous participants', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');
      const anonId = 'anon-participant-1';
      fastify.presenceChecker.bulk.mockReturnValue(new Map([[anonId, true]]));
      fastify.prisma.user.findMany.mockResolvedValue([]);
      fastify.prisma.participant.findMany.mockResolvedValue([
        { id: anonId, lastActiveAt: new Date('2024-02-01') },
      ]);

      const req = makeRequest({ query: { ids: anonId } });
      const reply = makeReply();

      await handler(req, reply);

      const user = reply._body.data.users.find((u: any) => u.userId === anonId);
      expect(user?.lastActiveAt).toBeDefined();
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/users/presence');
      fastify.prisma.user.findMany.mockRejectedValue(new Error('DB error'));

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(fastify.log.error).toHaveBeenCalled();
    });
  });
});
