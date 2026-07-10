/**
 * Unit tests for routes/push-tokens.ts
 *
 * Uses a mock Fastify pattern — registers the route plugin and calls
 * route handlers directly, mocking Prisma.
 *
 * Note: These routes use (request as UnifiedAuthRequest).authContext for
 * authentication, NOT just request.user.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 401;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 404;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 400;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 500;
  reply._body = { success: false, error: msg };
  return reply;
});

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logError: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object' },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { pushTokenRoutes } from '../../../routes/push-tokens';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'aabbccddeeff001122334455';
const DEVICE_ID = 'device-record-id-123';
const NOW = new Date('2024-01-15T10:00:00.000Z');

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler; options: any };

function createMockPrisma() {
  return {
    pushToken: {
      upsert: jest.fn<any>(),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  };
}

function createMockFastify(prisma?: any) {
  const routes: RouteReg[] = [];
  const pr = prisma || createMockPrisma();

  return {
    routes,
    prisma: pr,
    log: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
    authenticate: jest.fn<any>(),
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    delete: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'DELETE', path, handler, options });
    }),
  };
}

function createMockReply() {
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

function getRoute(
  fastify: ReturnType<typeof createMockFastify>,
  method: string,
  pathFragment: string
) {
  const r = fastify.routes.find(
    (r) => r.method === method && r.path.includes(pathFragment)
  );
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found in ${fastify.routes.map(r => `${r.method} ${r.path}`).join(', ')}`);
  return r;
}

function makeAuthContext(overrides: Record<string, any> = {}) {
  return {
    isAuthenticated: true,
    registeredUser: { id: USER_ID },
    userId: USER_ID,
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    query: {},
    user: { userId: USER_ID, role: 'USER' },
    authContext: makeAuthContext(),
    ...overrides,
  };
}

function makePushToken(overrides: Record<string, any> = {}) {
  return {
    id: DEVICE_ID,
    type: 'apns',
    platform: 'ios',
    deviceName: 'iPhone 15',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setup() {
  const pr = createMockPrisma();
  const fastify = createMockFastify(pr);
  pushTokenRoutes(fastify as any);
  return { fastify, pr, reply: createMockReply() };
}

// ─── POST /users/register-device-token ───────────────────────────────────────

describe('POST /users/register-device-token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers a new iOS APNS token', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    const token = makePushToken({ createdAt: NOW, updatedAt: NOW }); // isNew = true
    pr.pushToken.upsert.mockResolvedValue(token);

    const req = makeRequest({
      body: {
        token: 'apns-token-1234567890abcdef',
        platform: 'ios',
        apnsEnvironment: 'production',
      },
    });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
    const sentData = mockSendSuccess.mock.calls[0][1] as any;
    expect(sentData.isNew).toBe(true);
    expect(sentData.type).toBe('apns');
  });

  it('registers an Android FCM token', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    const token = makePushToken({ type: 'fcm', platform: 'android', createdAt: NOW, updatedAt: NOW });
    pr.pushToken.upsert.mockResolvedValue(token);

    const req = makeRequest({
      body: {
        token: 'fcm-token-1234567890abcdef',
        platform: 'android',
        type: 'fcm',
      },
    });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('uses apnsToken field when token is absent', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    const token = makePushToken({ createdAt: NOW, updatedAt: NOW });
    pr.pushToken.upsert.mockResolvedValue(token);

    const req = makeRequest({
      body: {
        apnsToken: 'apns-token-from-field-1234567890',
        platform: 'ios',
      },
    });
    await route.handler(req, reply);

    expect(pr.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId_token_type: expect.objectContaining({
            token: 'apns-token-from-field-1234567890',
          }),
        }),
      })
    );
  });

  it('infers apns type for iOS when type not specified', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    pr.pushToken.upsert.mockResolvedValue(makePushToken({ createdAt: NOW, updatedAt: NOW }));

    const req = makeRequest({
      body: {
        token: 'ios-token-without-explicit-type-1234',
        platform: 'ios',
      },
    });
    await route.handler(req, reply);

    expect(pr.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId_token_type: expect.objectContaining({ type: 'apns' }),
        }),
      })
    );
  });

  it('infers fcm type for Android when type not specified', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    pr.pushToken.upsert.mockResolvedValue(makePushToken({ type: 'fcm', createdAt: NOW, updatedAt: NOW }));

    const req = makeRequest({
      body: {
        token: 'android-token-no-type-1234567890',
        platform: 'android',
      },
    });
    await route.handler(req, reply);

    expect(pr.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId_token_type: expect.objectContaining({ type: 'fcm' }),
        }),
      })
    );
  });

  it('detects updated (not new) token when timestamps differ', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    const updatedAt = new Date(NOW.getTime() + 1000); // different from createdAt
    pr.pushToken.upsert.mockResolvedValue(makePushToken({ createdAt: NOW, updatedAt }));

    const req = makeRequest({
      body: { token: 'apns-existing-token-1234567890', platform: 'ios' },
    });
    await route.handler(req, reply);

    const sentData = mockSendSuccess.mock.calls[0][1] as any;
    expect(sentData.isNew).toBe(false);
    expect(sentData.message).toContain('updated');
  });

  it('sets apnsEnvironment to null for fcm (non-APNS-like) tokens', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    pr.pushToken.upsert.mockResolvedValue(makePushToken({ type: 'fcm', createdAt: NOW, updatedAt: NOW }));

    const req = makeRequest({
      body: { token: 'fcm-token-1234567890abcdef', platform: 'android', type: 'fcm' },
    });
    await route.handler(req, reply);

    expect(pr.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ apnsEnvironment: null }),
      })
    );
  });

  it('defaults apnsEnvironment to "production" for APNS token without explicit env', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    pr.pushToken.upsert.mockResolvedValue(makePushToken({ createdAt: NOW, updatedAt: NOW }));

    const req = makeRequest({
      body: { token: 'apns-token-no-env-1234567890', platform: 'ios' },
    });
    await route.handler(req, reply);

    expect(pr.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ apnsEnvironment: 'production' }),
      })
    );
  });

  it('returns 401 when authContext is absent', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when not authenticated', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');

    const req = makeRequest({
      authContext: makeAuthContext({ isAuthenticated: false }),
    });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is null', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');

    const req = makeRequest({
      authContext: makeAuthContext({ registeredUser: null }),
    });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 400 on ZodError (missing both token and apnsToken)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');

    const req = makeRequest({ body: { platform: 'ios' } }); // no token or apnsToken
    await route.handler(req, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('returns 400 on ZodError (invalid platform)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');

    const req = makeRequest({
      body: { token: 'valid-token-1234567890', platform: 'fridge' },
    });
    await route.handler(req, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'register-device-token');
    pr.pushToken.upsert.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({
      body: { token: 'valid-token-1234567890', platform: 'ios' },
    });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── DELETE /users/register-device-token ─────────────────────────────────────

describe('DELETE /users/register-device-token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes by specific token', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 1 });

    const req = makeRequest({
      body: { token: 'apns-token-to-delete-1234567890' },
    });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
    const call = pr.pushToken.deleteMany.mock.calls[0][0];
    expect(call.where.token).toBe('apns-token-to-delete-1234567890');
  });

  it('deletes by deviceId', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 2 });

    const req = makeRequest({ body: { deviceId: 'my-device-123' } });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
    const call = pr.pushToken.deleteMany.mock.calls[0][0];
    expect(call.where.deviceId).toBe('my-device-123');
  });

  it('deletes all tokens (no filter) when body is empty', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 5 });

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
    const call = pr.pushToken.deleteMany.mock.calls[0][0];
    expect(call.where.token).toBeUndefined();
    expect(call.where.deviceId).toBeUndefined();
  });

  it('returns message about no tokens when count=0', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 0 });

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    const sentData = mockSendSuccess.mock.calls[0][1] as any;
    expect(sentData.deletedCount).toBe(0);
    expect(sentData.message).toContain('No matching tokens');
  });

  it('returns success message when tokens deleted', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 3 });

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    const sentData = mockSendSuccess.mock.calls[0][1] as any;
    expect(sentData.deletedCount).toBe(3);
    expect(sentData.message).toContain('3');
  });

  it('returns 401 when not authenticated', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is null', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');

    const req = makeRequest({
      authContext: makeAuthContext({ registeredUser: null }),
    });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 400 on ZodError (token too short)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');

    const req = makeRequest({ body: { token: 'short' } }); // min 10 chars
    await route.handler(req, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it('handles null body by treating it as empty object (no filter)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 1 });

    // null body exercises the `request.body || {}` branch
    const req = makeRequest({ body: null });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 500 on unexpected DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'register-device-token');
    pr.pushToken.deleteMany.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── GET /users/me/devices ────────────────────────────────────────────────────

describe('GET /users/me/devices', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns list of devices for authenticated user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', 'me/devices');
    const devices = [
      { id: 'd1', type: 'apns', platform: 'ios', createdAt: NOW, updatedAt: NOW },
      { id: 'd2', type: 'fcm', platform: 'android', createdAt: NOW, updatedAt: NOW },
    ];
    pr.pushToken.findMany.mockResolvedValue(devices);

    const req = makeRequest();
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, devices);
  });

  it('returns empty list when no devices registered', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', 'me/devices');
    pr.pushToken.findMany.mockResolvedValue([]);

    const req = makeRequest();
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, []);
  });

  it('returns 401 when not authenticated', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'GET', 'me/devices');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is null', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'GET', 'me/devices');

    const req = makeRequest({
      authContext: makeAuthContext({ registeredUser: null }),
    });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 on DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', 'me/devices');
    pr.pushToken.findMany.mockRejectedValue(new Error('DB error'));

    const req = makeRequest();
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── DELETE /users/me/devices/:deviceId ──────────────────────────────────────

describe('DELETE /users/me/devices/:deviceId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes device when it belongs to user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'me/devices/:deviceId');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 1 });

    const req = makeRequest({ params: { deviceId: DEVICE_ID } });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
    const sentData = mockSendSuccess.mock.calls[0][1] as any;
    expect(sentData.message).toBe('Device removed successfully');
  });

  it('uses IDOR protection (filters by userId in where clause)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'me/devices/:deviceId');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 1 });

    const req = makeRequest({ params: { deviceId: DEVICE_ID } });
    await route.handler(req, reply);

    const call = pr.pushToken.deleteMany.mock.calls[0][0];
    expect(call.where.userId).toBe(USER_ID);
    expect(call.where.id).toBe(DEVICE_ID);
  });

  it('returns 404 when device not found (count=0)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'me/devices/:deviceId');
    pr.pushToken.deleteMany.mockResolvedValue({ count: 0 });

    const req = makeRequest({ params: { deviceId: 'nonexistent-device' } });
    await route.handler(req, reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when not authenticated', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'me/devices/:deviceId');

    const req = makeRequest({ params: { deviceId: DEVICE_ID }, authContext: undefined });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is null', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'me/devices/:deviceId');

    const req = makeRequest({
      params: { deviceId: DEVICE_ID },
      authContext: makeAuthContext({ registeredUser: null }),
    });
    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 on DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'me/devices/:deviceId');
    pr.pushToken.deleteMany.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ params: { deviceId: DEVICE_ID } });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});
