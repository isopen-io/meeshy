/**
 * GET /notifications — `hideReadTypes` : une notification CONSOMMÉE quitte la
 * cloche (#8958). Le filtre se joue EN BASE, pour que la pagination ne serve
 * pas des pages entières de lignes que le client masquerait.
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

jest.mock('@meeshy/shared/types/api-schemas', () => {
  const actual = jest.requireActual('@meeshy/shared/types/api-schemas') as Record<string, unknown>;
  return actual;
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { notificationRoutes } from '../../../routes/notifications';
import { findManyNotifications } from '../../helpers/notification-where';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'aabbccddeeff001122334455';
const NOTIF_ID = 'bbccddeeff001122334455aa';

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

const at = (minute: number) => new Date(Date.UTC(2026, 8, 30, 12, minute));

function inbox() {
  return [
    makeNotification({ id: 'm-read', type: 'new_message', isRead: true, expiresAt: null, createdAt: at(50) }),
    makeNotification({ id: 'm-unread', type: 'new_message', isRead: false, expiresAt: null, createdAt: at(40) }),
    makeNotification({ id: 'r-read', type: 'message_reaction', isRead: true, expiresAt: null, createdAt: at(30) }),
    makeNotification({ id: 'f-read', type: 'friend_request', isRead: true, expiresAt: null, createdAt: at(20) }),
    makeNotification({ id: 'c-read', type: 'post_comment', isRead: true, expiresAt: null, createdAt: at(10) }),
  ];
}

function serve(pr: any, rows: any[]) {
  pr.notification.findMany.mockImplementation((args: any) => Promise.resolve(findManyNotifications(rows, args)));
  pr.notification.count.mockImplementation((args: any) =>
    Promise.resolve(findManyNotifications(rows, { where: args?.where }).length)
  );
}

describe('GET /notifications — hideReadTypes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retire les lignes LUES des types nommés, garde les non lues et les autres types', async () => {
    const { fastify, pr, reply } = setup();
    serve(pr, inbox());

    const result: any = await getRoute(fastify, 'GET', '/notifications').handler(
      makeRequest({ query: { limit: 10, hideReadTypes: 'new_message,message_reaction,post_comment' } }),
      reply
    );

    expect(result.data.map((n: any) => n.id)).toEqual(['m-unread', 'f-read']);
  });

  it('se combine avec types — un onglet ne ramène pas ses lignes consommées', async () => {
    const { fastify, pr, reply } = setup();
    serve(pr, inbox());

    const result: any = await getRoute(fastify, 'GET', '/notifications').handler(
      makeRequest({ query: { limit: 10, types: 'new_message', hideReadTypes: 'new_message' } }),
      reply
    );

    expect(result.data.map((n: any) => n.id)).toEqual(['m-unread']);
  });

  it('tient sous le curseur : la page suivante ne ramène pas de ligne consommée', async () => {
    const { fastify, pr, reply } = setup();
    serve(pr, inbox());
    const route = getRoute(fastify, 'GET', '/notifications');
    const hideReadTypes = 'new_message,message_reaction,post_comment';

    const first: any = await route.handler(makeRequest({ query: { limit: 1, hideReadTypes } }), reply);
    const second: any = await route.handler(
      makeRequest({ query: { limit: 5, hideReadTypes, cursor: first.pagination.nextCursor } }),
      reply
    );

    expect(first.data.map((n: any) => n.id)).toEqual(['m-unread']);
    expect(second.data.map((n: any) => n.id)).toEqual(['f-read']);
    expect(second.pagination.hasMore).toBe(false);
  });

  it('absent ou vide, rien n’est retiré', async () => {
    const { fastify, pr, reply } = setup();
    serve(pr, inbox());
    const route = getRoute(fastify, 'GET', '/notifications');

    const none: any = await route.handler(makeRequest({ query: { limit: 10 } }), reply);
    const blank: any = await route.handler(makeRequest({ query: { limit: 10, hideReadTypes: ' , ' } }), reply);

    expect(none.data).toHaveLength(5);
    expect(blank.data).toHaveLength(5);
  });

  it('déclare hideReadTypes dans le querystring — sinon Fastify le retire de la requête', () => {
    const { fastify } = setup();

    expect(getRoute(fastify, 'GET', '/notifications').options.schema.querystring.properties.hideReadTypes).toBeDefined();
  });
});
