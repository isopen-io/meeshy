/**
 * Unit tests for routes/notifications.ts
 *
 * Uses a mock Fastify pattern — registers the route plugin and calls
 * route handlers directly, mocking Prisma and NotificationService.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 404;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 403;
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
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
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

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  notificationSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { notificationRoutes } from '../../../routes/notifications';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'aabbccddeeff001122334455';
const NOTIF_ID = 'bbccddeeff001122334455aa';
const CONV_ID = 'ccddeeff001122334455aabb';

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler; options: any };

function createMockNotificationService() {
  return {
    getUnreadCount: jest.fn<any>().mockResolvedValue(5),
    markAsRead: jest.fn<any>().mockResolvedValue({ id: NOTIF_ID, isRead: true }),
    markAllAsRead: jest.fn<any>().mockResolvedValue(3),
    markConversationNotificationsAsRead: jest.fn<any>().mockResolvedValue(2),
    markNotificationsByTypesAsRead: jest.fn<any>().mockResolvedValue(4),
    deleteNotification: jest.fn<any>().mockResolvedValue(true),
    createMessageNotification: jest.fn<any>().mockResolvedValue({ id: 'new-notif' }),
  };
}

function createMockPrisma() {
  return {
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 5 }),
    },
  };
}

function createMockFastify(notifService?: any, prisma?: any) {
  const routes: RouteReg[] = [];
  const ns = notifService || createMockNotificationService();
  const pr = prisma || createMockPrisma();

  return {
    routes,
    notificationService: ns,
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
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return r;
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    query: {},
    user: { userId: USER_ID, role: 'USER' },
    ...overrides,
  };
}

function makeNotification(overrides: Record<string, any> = {}) {
  return {
    id: NOTIF_ID,
    userId: USER_ID,
    type: 'new_message',
    content: 'Hello',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setup() {
  const ns = createMockNotificationService();
  const pr = createMockPrisma();
  const fastify = createMockFastify(ns, pr);
  notificationRoutes(fastify as any);
  return { fastify, ns, pr, reply: createMockReply() };
}

// ─── GET /notifications ───────────────────────────────────────────────────────

describe('GET /notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated notifications on success', async () => {
    const { fastify, ns, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    pr.notification.findMany.mockResolvedValue([makeNotification()]);
    pr.notification.count.mockResolvedValue(1);
    ns.getUnreadCount.mockResolvedValue(1);

    const req = makeRequest({ query: { offset: 0, limit: 20, unreadOnly: false } });
    const result = await route.handler(req, reply);

    expect(result).toMatchObject({ success: true });
    expect(pr.notification.findMany).toHaveBeenCalled();
  });

  it('uses unreadOnly filter when provided', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    pr.notification.findMany.mockResolvedValue([]);
    pr.notification.count.mockResolvedValue(0);

    const req = makeRequest({ query: { offset: 0, limit: 20, unreadOnly: true } });
    await route.handler(req, reply);

    const call = pr.notification.findMany.mock.calls[0][0];
    expect(call.where.isRead).toBe(false);
  });

  it('does not add isRead filter when unreadOnly is false', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    pr.notification.findMany.mockResolvedValue([]);
    pr.notification.count.mockResolvedValue(0);

    const req = makeRequest({ query: { offset: 0, limit: 20, unreadOnly: false } });
    await route.handler(req, reply);

    const call = pr.notification.findMany.mock.calls[0][0];
    expect(call.where.isRead).toBeUndefined();
  });

  it('returns 500 on service error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    pr.notification.findMany.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ query: {} });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── GET /notifications/unread-count ─────────────────────────────────────────

describe('GET /notifications/unread-count', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns unread count on success', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'GET', 'unread-count');
    ns.getUnreadCount.mockResolvedValue(7);

    const req = makeRequest();
    const result = await route.handler(req, reply);

    expect(result).toEqual({ success: true, count: 7 });
  });

  it('returns 500 on service error', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'GET', 'unread-count');
    ns.getUnreadCount.mockRejectedValue(new Error('Redis down'));

    const req = makeRequest();
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── POST /notifications/:id/read ────────────────────────────────────────────

describe('POST /notifications/:id/read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks notification as read when owned by user', async () => {
    const { fastify, ns, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', ':id/read');
    pr.notification.findUnique.mockResolvedValue(makeNotification());
    ns.markAsRead.mockResolvedValue(makeNotification({ isRead: true }));

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 404 when notification not found', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', ':id/read');
    pr.notification.findUnique.mockResolvedValue(null);

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when notification belongs to different user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', ':id/read');
    pr.notification.findUnique.mockResolvedValue(makeNotification({ userId: 'other-user' }));

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 on unexpected error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', ':id/read');
    pr.notification.findUnique.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── POST /notifications/read-all ────────────────────────────────────────────

describe('POST /notifications/read-all', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks all as read and returns count', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'read-all');
    ns.markAllAsRead.mockResolvedValue(10);

    const req = makeRequest();
    const result = await route.handler(req, reply);

    expect(result).toEqual({ success: true, count: 10 });
  });

  it('returns 500 on service error', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'read-all');
    ns.markAllAsRead.mockRejectedValue(new Error('DB error'));

    const req = makeRequest();
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── POST /notifications/conversation/:conversationId/read ───────────────────

describe('POST /notifications/conversation/:conversationId/read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks conversation notifications as read', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'conversation/:conversationId/read');
    ns.markConversationNotificationsAsRead.mockResolvedValue(3);

    const req = makeRequest({ params: { conversationId: CONV_ID } });
    const result = await route.handler(req, reply);

    expect(result).toEqual({ success: true, count: 3 });
    expect(ns.markConversationNotificationsAsRead).toHaveBeenCalledWith(USER_ID, CONV_ID);
  });

  it('returns 500 on service error', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'conversation/:conversationId/read');
    ns.markConversationNotificationsAsRead.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── POST /notifications/read-by-types ───────────────────────────────────────

describe('POST /notifications/read-by-types', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks notifications by types as read', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'read-by-types');
    ns.markNotificationsByTypesAsRead.mockResolvedValue(4);

    const req = makeRequest({ body: { types: ['new_message', 'message_reply'] } });
    const result = await route.handler(req, reply);

    expect(result).toEqual({ success: true, count: 4 });
    expect(ns.markNotificationsByTypesAsRead).toHaveBeenCalledWith(
      USER_ID,
      ['new_message', 'message_reply']
    );
  });

  it('returns 500 on service error', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'read-by-types');
    ns.markNotificationsByTypesAsRead.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ body: { types: ['new_message'] } });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── DELETE /notifications/:id ────────────────────────────────────────────────

describe('DELETE /notifications/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes notification when owned by user', async () => {
    const { fastify, ns, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', '/notifications/:id');
    pr.notification.findUnique.mockResolvedValue(makeNotification());
    ns.deleteNotification.mockResolvedValue(true);

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 404 when notification not found', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', '/notifications/:id');
    pr.notification.findUnique.mockResolvedValue(null);

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when notification belongs to different user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', '/notifications/:id');
    pr.notification.findUnique.mockResolvedValue(makeNotification({ userId: 'other-user' }));

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 when deleteNotification returns false', async () => {
    const { fastify, ns, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', '/notifications/:id');
    pr.notification.findUnique.mockResolvedValue(makeNotification());
    ns.deleteNotification.mockResolvedValue(false);

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 on unexpected error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', '/notifications/:id');
    pr.notification.findUnique.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ params: { id: NOTIF_ID } });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── Removed debug routes stay removed (broken access control) ───────────────
//
// DELETE /notifications/test/clear-all and POST /notifications/test/create
// were reachable by any authenticated USER (no admin/ownership check) and let
// any account wipe every notification in the system or spoof a notification
// to an arbitrary recipientUserId. The sanctioned, admin-gated equivalent is
// DELETE /notifications/admin/clear-all below.

describe('removed debug notification routes', () => {
  it('no longer registers DELETE /notifications/test/clear-all', () => {
    const { fastify } = setup();
    expect(() => getRoute(fastify, 'DELETE', 'test/clear-all')).toThrow();
  });

  it('no longer registers POST /notifications/test/create', () => {
    const { fastify } = setup();
    expect(() => getRoute(fastify, 'POST', 'test/create')).toThrow();
  });
});

// ─── DELETE /notifications/admin/clear-all ───────────────────────────────────

describe('DELETE /notifications/admin/clear-all', () => {
  beforeEach(() => jest.clearAllMocks());

  it('clears all notifications for ADMIN user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'admin/clear-all');
    pr.notification.deleteMany.mockResolvedValue({ count: 99 });

    const req = makeRequest({ user: { userId: USER_ID, role: 'ADMIN' } });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { deletedCount: 99 });
  });

  it('clears all notifications for BIGBOSS user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'admin/clear-all');
    pr.notification.deleteMany.mockResolvedValue({ count: 10 });

    const req = makeRequest({ user: { userId: USER_ID, role: 'BIGBOSS' } });
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { deletedCount: 10 });
  });

  it('returns 403 for non-admin USER role', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'admin/clear-all');

    const req = makeRequest({ user: { userId: USER_ID, role: 'USER' } });
    await route.handler(req, reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 for MODERATOR role', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'admin/clear-all');

    const req = makeRequest({ user: { userId: USER_ID, role: 'MODERATOR' } });
    await route.handler(req, reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 on DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'DELETE', 'admin/clear-all');
    pr.notification.deleteMany.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ user: { userId: USER_ID, role: 'ADMIN' } });
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});
