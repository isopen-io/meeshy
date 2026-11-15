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
import {
  findManyNotifications,
  groupByNotificationType,
  matchesNotificationWhere,
} from '../../helpers/notification-where';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'aabbccddeeff001122334455';
const NOTIF_ID = 'bbccddeeff001122334455aa';
const CONV_ID = 'ccddeeff001122334455aabb';
const POST_ID = 'ddeeff001122334455aabbcc';

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler; options: any };

function createMockNotificationService() {
  return {
    getUnreadCount: jest.fn<any>().mockResolvedValue(5),
    markAsRead: jest.fn<any>().mockResolvedValue({ id: NOTIF_ID, isRead: true }),
    markAllAsRead: jest.fn<any>().mockResolvedValue(3),
    markConversationNotificationsAsRead: jest.fn<any>().mockResolvedValue(2),
    markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(2),
    markNotificationsByTypesAsRead: jest.fn<any>().mockResolvedValue(4),
    deleteNotification: jest.fn<any>().mockResolvedValue(true),
    deleteAllRead: jest.fn<any>().mockResolvedValue(4),
    createMessageNotification: jest.fn<any>().mockResolvedValue({ id: 'new-notif' }),
  };
}

function createMockPrisma() {
  return {
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      groupBy: jest.fn<any>().mockResolvedValue([]),
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

  it('hides a notification whose ephemeral message has expired — list and total alike', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    const rows = [
      makeNotification({ id: 'alive', isRead: false, expiresAt: null }),
      makeNotification({
        id: 'expired',
        isRead: false,
        expiresAt: new Date(Date.now() - 60_000),
      }),
    ];
    pr.notification.findMany.mockImplementation((args: any) =>
      Promise.resolve(rows.filter((r) => matchesNotificationWhere(r as any, args?.where)))
    );
    pr.notification.count.mockImplementation((args: any) =>
      Promise.resolve(rows.filter((r) => matchesNotificationWhere(r as any, args?.where)).length)
    );

    const req = makeRequest({ query: { offset: 0, limit: 20, unreadOnly: false } });
    const result: any = await route.handler(req, reply);

    expect(result.data.map((n: any) => n.id)).toEqual(['alive']);
    expect(result.pagination.total).toBe(1);
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

// ─── GET /notifications — pagination keyset ──────────────────────────────────

describe('GET /notifications — pagination par curseur', () => {
  beforeEach(() => jest.clearAllMocks());

  const at = (minute: number) => new Date(Date.UTC(2024, 0, 1, 12, minute, 0));

  function inbox(...ids: Array<{ id: string; minute: number; isRead?: boolean }>) {
    return ids.map(({ id, minute, isRead = false }) =>
      makeNotification({ id, isRead, expiresAt: null, createdAt: at(minute) })
    );
  }

  /** Une source VIVANTE : chaque lecture rejoue le filtre et le tri sur `rows`. */
  function serve(pr: any, rows: any[]) {
    pr.notification.findMany.mockImplementation((args: any) =>
      Promise.resolve(findManyNotifications(rows, args))
    );
    pr.notification.count.mockImplementation((args: any) =>
      Promise.resolve(findManyNotifications(rows, { where: args?.where }).length)
    );
  }

  it('sert la page suivante sans doublon quand une notification arrive entre les deux', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    const rows = inbox(
      { id: 'n4', minute: 40 },
      { id: 'n3', minute: 30 },
      { id: 'n2', minute: 20 },
      { id: 'n1', minute: 10 }
    );
    serve(pr, rows);

    const first: any = await route.handler(makeRequest({ query: { limit: 2 } }), reply);
    expect(first.data.map((n: any) => n.id)).toEqual(['n4', 'n3']);
    expect(first.pagination.hasMore).toBe(true);
    expect(typeof first.pagination.nextCursor).toBe('string');

    // La cloche est vivante : une notification arrive AVANT que le lecteur ne
    // demande la suite. En offset, elle décale toute la liste d'un rang et la
    // page 2 re-sert `n3` en sautant `n1`.
    rows.push(...inbox({ id: 'n5', minute: 50 }));

    const second: any = await route.handler(
      makeRequest({ query: { limit: 2, cursor: first.pagination.nextCursor } }),
      reply
    );

    expect(second.data.map((n: any) => n.id)).toEqual(['n2', 'n1']);
    expect(second.pagination.hasMore).toBe(false);
    expect(second.pagination.nextCursor).toBeNull();
  });

  it('ne compte pas la table en mode curseur', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    const rows = inbox({ id: 'n2', minute: 20 }, { id: 'n1', minute: 10 });
    serve(pr, rows);

    const first: any = await route.handler(makeRequest({ query: { limit: 1 } }), reply);
    pr.notification.count.mockClear();

    const second: any = await route.handler(
      makeRequest({ query: { limit: 1, cursor: first.pagination.nextCursor } }),
      reply
    );

    expect(pr.notification.count).not.toHaveBeenCalled();
    expect(second.pagination.total).toBeUndefined();
  });

  it('laisse le mode offset intact — total compté, offset rendu', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    serve(pr, inbox({ id: 'n2', minute: 20 }, { id: 'n1', minute: 10 }));

    const result: any = await route.handler(
      makeRequest({ query: { offset: 1, limit: 1 } }),
      reply
    );

    expect(pr.notification.count).toHaveBeenCalled();
    expect(result.data.map((n: any) => n.id)).toEqual(['n1']);
    expect(result.pagination).toMatchObject({ total: 2, offset: 1, limit: 1, hasMore: false });
  });

  it('garde le prédicat de visibilité sous le curseur (expirées et lues exclues)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    const rows = [
      ...inbox({ id: 'n4', minute: 40 }, { id: 'n3', minute: 30, isRead: true }),
      makeNotification({
        id: 'n2',
        isRead: false,
        createdAt: at(20),
        expiresAt: new Date(Date.now() - 60_000),
      }),
      ...inbox({ id: 'n1', minute: 10 }),
    ];
    serve(pr, rows);

    const first: any = await route.handler(
      makeRequest({ query: { limit: 1, unreadOnly: true } }),
      reply
    );
    const second: any = await route.handler(
      makeRequest({
        query: { limit: 5, unreadOnly: true, cursor: first.pagination.nextCursor },
      }),
      reply
    );

    expect(first.data.map((n: any) => n.id)).toEqual(['n4']);
    expect(second.data.map((n: any) => n.id)).toEqual(['n1']);
  });

  it('sert la première page sur un curseur illisible', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    serve(pr, inbox({ id: 'n2', minute: 20 }, { id: 'n1', minute: 10 }));

    const result: any = await route.handler(
      makeRequest({ query: { limit: 1, cursor: 'pas-un-curseur' } }),
      reply
    );

    expect(result.data.map((n: any) => n.id)).toEqual(['n2']);
  });

  it('déclare nextCursor dans le schéma de réponse — sinon Fastify le retire du fil', () => {
    const { fastify } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    const pagination = route.options.schema.response[200].properties.pagination;

    expect(pagination.properties.nextCursor).toBeDefined();
    expect(route.options.schema.querystring.properties.cursor).toBeDefined();
  });
});

// ─── GET /notifications — filtre par type ────────────────────────────────────

describe('GET /notifications — filtre par type', () => {
  beforeEach(() => jest.clearAllMocks());

  const at = (minute: number) => new Date(Date.UTC(2024, 0, 1, 12, minute, 0));

  /** Une inbox où le type recherché est HORS de la première page. */
  function mixedInbox() {
    return [
      ...Array.from({ length: 3 }, (_, i) =>
        makeNotification({
          id: `msg${i}`,
          type: 'new_message',
          isRead: false,
          expiresAt: null,
          createdAt: at(50 - i),
        })
      ),
      makeNotification({
        id: 'men1',
        type: 'user_mentioned',
        isRead: false,
        expiresAt: null,
        createdAt: at(20),
      }),
      makeNotification({
        id: 'men0',
        type: 'mention',
        isRead: false,
        expiresAt: null,
        createdAt: at(10),
      }),
    ];
  }

  function serve(pr: any, rows: any[]) {
    pr.notification.findMany.mockImplementation((args: any) =>
      Promise.resolve(findManyNotifications(rows, args))
    );
    pr.notification.count.mockImplementation((args: any) =>
      Promise.resolve(findManyNotifications(rows, { where: args?.where }).length)
    );
  }

  it('rend les mentions ENFOUIES sous la première page, pas seulement celles déjà chargées', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    serve(pr, mixedInbox());

    const result: any = await route.handler(
      makeRequest({ query: { limit: 2, types: 'user_mentioned,mention' } }),
      reply
    );

    expect(result.data.map((n: any) => n.id)).toEqual(['men1', 'men0']);
    // Sans `offset`, la page est servie au CURSEUR depuis #4175 : `hasMore`
    // vient de la ligne SONDE, et la table n'est plus comptée. C'est ce
    // `hasMore` qui prouve désormais que le filtre a bien été appliqué EN BASE
    // — deux mentions dans toute l'inbox, pas deux parmi les vingt dernières.
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.form).toBe('keyset');
    expect(result.pagination.total).toBeUndefined();
  });

  it('compte encore les mentions quand l’appelant demande un RANG — l’alias déprécié est intact', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    serve(pr, mixedInbox());

    const result: any = await route.handler(
      makeRequest({ query: { offset: 0, limit: 2, types: 'user_mentioned,mention' } }),
      reply
    );

    expect(result.data.map((n: any) => n.id)).toEqual(['men1', 'men0']);
    expect(result.pagination).toMatchObject({ total: 2, offset: 0, form: 'offset' });
  });

  it('déclare types dans le querystring — sinon Fastify le retire de la requête', () => {
    const { fastify } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');

    expect(route.options.schema.querystring.properties.types).toBeDefined();
  });

  it('garde le filtre sous le curseur — une page suivante ne réélargit pas l’onglet', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    serve(pr, mixedInbox());

    const first: any = await route.handler(
      makeRequest({ query: { limit: 1, types: 'user_mentioned,mention' } }),
      reply
    );
    const second: any = await route.handler(
      makeRequest({
        query: { limit: 5, types: 'user_mentioned,mention', cursor: first.pagination.nextCursor },
      }),
      reply
    );

    expect(first.data.map((n: any) => n.id)).toEqual(['men1']);
    expect(second.data.map((n: any) => n.id)).toEqual(['men0']);
  });

  it('sans types, l’inbox reste entière', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    serve(pr, mixedInbox());

    const result: any = await route.handler(makeRequest({ query: { limit: 10 } }), reply);

    expect(result.data).toHaveLength(5);
  });

  it('un types vide vaut « aucun filtre », pas « aucune notification »', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'GET', '/notifications');
    serve(pr, mixedInbox());

    const result: any = await route.handler(
      makeRequest({ query: { limit: 10, types: ' , ' } }),
      reply
    );

    expect(result.data).toHaveLength(5);
  });
});

// ─── GET /notifications/counts ───────────────────────────────────────────────

describe('GET /notifications/counts', () => {
  beforeEach(() => jest.clearAllMocks());

  const rows = [
    makeNotification({ id: 'a', type: 'new_message', isRead: false, expiresAt: null }),
    makeNotification({ id: 'b', type: 'new_message', isRead: true, expiresAt: null }),
    makeNotification({ id: 'c', type: 'user_mentioned', isRead: false, expiresAt: null }),
    makeNotification({
      id: 'd',
      type: 'user_mentioned',
      isRead: false,
      expiresAt: new Date(Date.now() - 60_000),
    }),
    makeNotification({ id: 'e', userId: 'other', type: 'missed_call', expiresAt: null }),
  ];

  function serve(pr: any) {
    pr.notification.groupBy.mockImplementation((args: any) =>
      Promise.resolve(groupByNotificationType(rows, args))
    );
  }

  it('compte TOUTE l’inbox par type, pas les pages chargées', async () => {
    const { fastify, pr, ns, reply } = setup();
    serve(pr);
    ns.getUnreadCount.mockResolvedValue(2);
    const route = getRoute(fastify, 'GET', '/notifications/counts');

    await route.handler(makeRequest(), reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        total: 3,
        unread: 2,
        byType: { new_message: 2, user_mentioned: 1 },
      })
    );
  });

  it('exclut les expirées et l’inbox d’autrui — même prédicat que la liste', async () => {
    const { fastify, pr, reply } = setup();
    serve(pr);
    const route = getRoute(fastify, 'GET', '/notifications/counts');

    await route.handler(makeRequest(), reply);

    const [, payload] = mockSendSuccess.mock.calls[0] as [unknown, any];
    expect(payload.byType.missed_call).toBeUndefined();
    expect(payload.byType.user_mentioned).toBe(1);
  });

  it('returns 500 on service error', async () => {
    const { fastify, pr, reply } = setup();
    pr.notification.groupBy.mockRejectedValue(new Error('boom'));
    const route = getRoute(fastify, 'GET', '/notifications/counts');

    await route.handler(makeRequest(), reply);

    expect(mockSendInternalError).toHaveBeenCalled();
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

// ─── POST /notifications/post/:postId/read ───────────────────────────────────

describe('POST /notifications/post/:postId/read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks post notifications as read', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'post/:postId/read');
    ns.markPostNotificationsAsRead.mockResolvedValue(3);

    const req = makeRequest({ params: { postId: POST_ID } });
    const result = await route.handler(req, reply);

    expect(result).toEqual({ success: true, count: 3 });
    expect(ns.markPostNotificationsAsRead).toHaveBeenCalledWith(USER_ID, POST_ID);
  });

  it('returns 500 on service error', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'POST', 'post/:postId/read');
    ns.markPostNotificationsAsRead.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ params: { postId: POST_ID } });
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

// ─── DELETE /notifications/read ───────────────────────────────────────────────
//
// Le web appelait déjà cet endpoint (« supprimer les lues ») : sans route
// dédiée, la requête matchait DELETE /notifications/:id avec id="read" → 404
// systématique. La route statique gagne sur la paramétrique dans find-my-way.

describe('DELETE /notifications/read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('purge les notifications lues du user courant via le service', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'DELETE', '/notifications/read');
    ns.deleteAllRead.mockResolvedValue(4);

    const req = makeRequest();
    const result = await route.handler(req, reply);

    expect(ns.deleteAllRead).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({ success: true, count: 4 });
  });

  it('returns 500 on service error', async () => {
    const { fastify, ns, reply } = setup();
    const route = getRoute(fastify, 'DELETE', '/notifications/read');
    ns.deleteAllRead.mockRejectedValue(new Error('DB error'));

    const req = makeRequest();
    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
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
