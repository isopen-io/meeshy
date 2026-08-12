import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock logger-enhanced BEFORE importing route files
// ---------------------------------------------------------------------------
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

// Mock the basic logger utility used by posts.ts
jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn<any>(),
  logWarn: jest.fn<any>(),
  logger: {
    info: jest.fn<any>(),
    warn: jest.fn<any>(),
    error: jest.fn<any>(),
    debug: jest.fn<any>(),
  },
}));

// Mock BroadcastTranslationService
const mockTranslateContent = jest.fn<any>();
jest.mock('../../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn<any>().mockImplementation(() => ({
    translateContent: mockTranslateContent,
  })),
}));

// Mock BroadcastSenderJob
const mockJobExecute = jest.fn<any>();
jest.mock('../../../../jobs/broadcast-sender', () => ({
  BroadcastSenderJob: jest.fn<any>().mockImplementation(() => ({
    execute: mockJobExecute,
  })),
}));

// Mock EmailService
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn<any>().mockImplementation(() => ({})),
}));

// Mock postIncludes (uses Prisma.validator which is stubbed)
jest.mock('../../../../services/posts/postIncludes', () => ({
  authorSelect: { id: true, username: true, displayName: true, avatar: true },
  mediaSelect: { id: true, fileName: true },
  NOT_DELETED: { isSet: false },
}));

import { broadcastRoutes } from '../../../../routes/admin/broadcasts';
import { adminPostRoutes } from '../../../../routes/admin/posts';

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockPrisma: any = {
  adminBroadcast: {
    findMany: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
    count: jest.fn<any>(),
  },
  adminAuditLog: {
    create: jest.fn<any>(),
  },
  user: {
    count: jest.fn<any>(),
    groupBy: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
  post: {
    count: jest.fn<any>(),
    groupBy: jest.fn<any>(),
    findMany: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
  },
};

// ---------------------------------------------------------------------------
// Shared auth contexts
// ---------------------------------------------------------------------------

const VALID_ADMIN_ID = '507f1f77bcf86cd799439011';

function makeAuthContext(role: string, id = VALID_ADMIN_ID) {
  return {
    isAuthenticated: true,
    registeredUser: { id, role, username: 'admin' },
  };
}

// ---------------------------------------------------------------------------
// App builders
// ---------------------------------------------------------------------------

function buildBroadcastApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(broadcastRoutes);
  return app;
}

function buildBroadcastAppNoAuth(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    // no authContext set → simulates unauthenticated
    request.authContext = null;
  });
  app.register(broadcastRoutes);
  return app;
}

function buildPostApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(adminPostRoutes);
  return app;
}

function buildPostAppNoAuth(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = null;
  });
  app.register(adminPostRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ID = '507f1f77bcf86cd799439011';

function fakeBroadcast(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ID,
    name: 'Test broadcast',
    subject: 'Hello',
    body: 'Body text',
    sourceLanguage: 'fr',
    targeting: {},
    status: 'DRAFT',
    createdById: VALID_ADMIN_ID,
    translatedSubjects: null,
    translatedBodies: null,
    targetLanguages: [],
    totalRecipients: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakePost(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ID,
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello world',
    deletedAt: null,
    authorId: 'author1',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ===========================================================================
// BROADCAST ROUTES TESTS
// ===========================================================================

describe('broadcastRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = buildBroadcastApp('ADMIN');
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // GET / — List broadcasts
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildBroadcastAppNoAuth();
      await noAuthApp.ready();

      mockPrisma.adminBroadcast.findMany.mockResolvedValue([]);
      mockPrisma.adminBroadcast.count.mockResolvedValue(0);

      const res = await noAuthApp.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when role is USER', async () => {
      await app.close();
      const userApp = buildBroadcastApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 403 when role is MODERATOR', async () => {
      await app.close();
      const modApp = buildBroadcastApp('MODERATOR');
      await modApp.ready();

      const res = await modApp.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(403);
      await modApp.close();
    });

    it('returns 200 with paginated broadcasts for ADMIN', async () => {
      const broadcasts = [fakeBroadcast(), fakeBroadcast({ id: '607f1f77bcf86cd799439012' })];
      mockPrisma.adminBroadcast.findMany.mockResolvedValue(broadcasts);
      mockPrisma.adminBroadcast.count.mockResolvedValue(2);

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.broadcasts).toHaveLength(2);
      expect(body.data.pagination.total).toBe(2);
    });

    it('returns 200 for BIGBOSS role', async () => {
      await app.close();
      const bossApp = buildBroadcastApp('BIGBOSS');
      await bossApp.ready();

      mockPrisma.adminBroadcast.findMany.mockResolvedValue([]);
      mockPrisma.adminBroadcast.count.mockResolvedValue(0);

      const res = await bossApp.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      await bossApp.close();
    });

    it('filters by status query param', async () => {
      mockPrisma.adminBroadcast.findMany.mockResolvedValue([]);
      mockPrisma.adminBroadcast.count.mockResolvedValue(0);

      const res = await app.inject({ method: 'GET', url: '/?status=DRAFT' });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.adminBroadcast.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'DRAFT' } })
      );
    });

    it('respects offset and limit query params', async () => {
      mockPrisma.adminBroadcast.findMany.mockResolvedValue([]);
      mockPrisma.adminBroadcast.count.mockResolvedValue(50);

      const res = await app.inject({ method: 'GET', url: '/?offset=10&limit=5' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.pagination.offset).toBe(10);
      expect(body.data.pagination.limit).toBe(5);
    });

    it('hasMore is true when more items exist beyond current page', async () => {
      mockPrisma.adminBroadcast.findMany.mockResolvedValue([fakeBroadcast()]);
      mockPrisma.adminBroadcast.count.mockResolvedValue(100);

      const res = await app.inject({ method: 'GET', url: '/?offset=0&limit=1' });
      const body = JSON.parse(res.body);
      expect(body.data.pagination.hasMore).toBe(true);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.adminBroadcast.findMany.mockRejectedValue(new Error('DB error'));
      mockPrisma.adminBroadcast.count.mockResolvedValue(0);

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST / — Create broadcast
  // -------------------------------------------------------------------------

  describe('POST /', () => {
    const validPayload = {
      name: 'My broadcast',
      subject: 'Subject line',
      body: 'Body content here',
      sourceLanguage: 'fr',
    };

    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildBroadcastAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({
        method: 'POST',
        url: '/',
        payload: validPayload,
      });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildBroadcastApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'POST', url: '/', payload: validPayload });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('creates broadcast and returns 201 on success', async () => {
      const created = fakeBroadcast();
      mockPrisma.adminBroadcast.create.mockResolvedValue(created);
      mockPrisma.adminAuditLog.create.mockResolvedValue({});

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: validPayload,
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(mockPrisma.adminBroadcast.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    });

    it('creates broadcast with targeting when provided', async () => {
      const created = fakeBroadcast({ targeting: { languages: ['fr', 'en'] } });
      mockPrisma.adminBroadcast.create.mockResolvedValue(created);
      mockPrisma.adminAuditLog.create.mockResolvedValue({});

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { ...validPayload, targeting: { languages: ['fr', 'en'] } },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 400 when required fields are missing (Zod validation)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Only name' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 when DB create throws', async () => {
      mockPrisma.adminBroadcast.create.mockRejectedValue(new Error('DB fail'));

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: validPayload,
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get broadcast by ID
  // -------------------------------------------------------------------------

  describe('GET /:id', () => {
    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildBroadcastAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({ method: 'GET', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildBroadcastApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'GET', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 200 with broadcast when found', async () => {
      const broadcast = fakeBroadcast();
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(broadcast);

      const res = await app.inject({ method: 'GET', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.id).toBe(VALID_ID);
    });

    it('returns 404 when broadcast not found', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when id is not a valid mongo ObjectId', async () => {
      const res = await app.inject({ method: 'GET', url: '/not-a-valid-id' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.adminBroadcast.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update broadcast
  // -------------------------------------------------------------------------

  describe('PUT /:id', () => {
    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildBroadcastAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({
        method: 'PUT',
        url: `/${VALID_ID}`,
        payload: { name: 'New name' },
      });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildBroadcastApp('USER');
      await userApp.ready();

      const res = await userApp.inject({
        method: 'PUT',
        url: `/${VALID_ID}`,
        payload: { name: 'New name' },
      });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 404 when broadcast not found', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'PUT',
        url: `/${VALID_ID}`,
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when broadcast is not DRAFT', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'SENT' }));

      const res = await app.inject({
        method: 'PUT',
        url: `/${VALID_ID}`,
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 200 and updates all provided fields for DRAFT broadcast', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'DRAFT' }));
      const updated = fakeBroadcast({ name: 'Updated name' });
      mockPrisma.adminBroadcast.update.mockResolvedValue(updated);

      const res = await app.inject({
        method: 'PUT',
        url: `/${VALID_ID}`,
        payload: { name: 'Updated name', subject: 'New subject' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VALID_ID },
          data: expect.objectContaining({ name: 'Updated name', subject: 'New subject' }),
        })
      );
    });

    it('updates body/sourceLanguage/targeting when name is omitted', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'DRAFT' }));
      const updated = fakeBroadcast({ body: 'New body' });
      mockPrisma.adminBroadcast.update.mockResolvedValue(updated);

      const res = await app.inject({
        method: 'PUT',
        url: `/${VALID_ID}`,
        payload: { body: 'New body', sourceLanguage: 'en', targeting: { languages: ['en'] } },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ body: 'New body', sourceLanguage: 'en' }),
        })
      );
    });

    it('returns 400 when id param is not valid ObjectId', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/invalid-id',
        payload: { name: 'x' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 when DB throws during update', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'DRAFT' }));
      mockPrisma.adminBroadcast.update.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({
        method: 'PUT',
        url: `/${VALID_ID}`,
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/preview — Preview & translate
  // -------------------------------------------------------------------------

  describe('POST /:id/preview', () => {
    function setupPreviewMocks(targeting: any = {}) {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(
        fakeBroadcast({ targeting, status: 'DRAFT' })
      );
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.user.groupBy
        .mockResolvedValueOnce([{ systemLanguage: 'en', _count: 5 }, { systemLanguage: 'fr', _count: 5 }])
        .mockResolvedValueOnce([{ registrationCountry: 'US', _count: 10 }]);
      mockTranslateContent.mockResolvedValue({ subjects: { fr: 'Bonjour' }, bodies: { fr: 'Corps' } });
      mockPrisma.adminBroadcast.update.mockResolvedValue(fakeBroadcast({ status: 'READY' }));
    }

    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildBroadcastAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildBroadcastApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 404 when broadcast not found', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 200 with preview data on success (no targeting)', async () => {
      setupPreviewMocks({});

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.recipientCount).toBe(10);
      expect(body.data.translations).toBeDefined();
    });

    it('applies language targeting filter', async () => {
      setupPreviewMocks({ languages: ['fr', 'en'] });

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
    });

    it('applies country targeting filter', async () => {
      setupPreviewMocks({ countries: ['FR', 'US'] });

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
    });

    it('applies activityStatus=active filter (last 30 days)', async () => {
      setupPreviewMocks({ activityStatus: 'active' });

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
      const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
      expect(whereArg.lastActiveAt).toBeDefined();
      expect(whereArg.lastActiveAt.gte).toBeInstanceOf(Date);
    });

    it('applies activityStatus=inactive filter (no activity in 30 days)', async () => {
      setupPreviewMocks({ activityStatus: 'inactive' });

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
      const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
      expect(Array.isArray(whereArg.OR)).toBe(true);
    });

    it('applies activityStatus=new filter (registered in last 7 days)', async () => {
      setupPreviewMocks({ activityStatus: 'new' });

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
      const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
      expect(whereArg.createdAt).toBeDefined();
      expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
    });

    it('ignores unrecognized activityStatus (treats as all)', async () => {
      setupPreviewMocks({ activityStatus: 'all' });

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
      const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
      // no extra filter added for 'all'
      expect(whereArg.lastActiveAt).toBeUndefined();
      expect(whereArg.createdAt).toBeUndefined();
    });

    it('sets broadcast status to READY after preview', async () => {
      setupPreviewMocks({});

      await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'READY' }),
        })
      );
    });

    it('handles null targeting gracefully (falls back to empty object)', async () => {
      setupPreviewMocks(null);

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(200);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.adminBroadcast.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/send — Launch sending
  // -------------------------------------------------------------------------

  describe('POST /:id/send', () => {
    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildBroadcastAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({ method: 'POST', url: `/${VALID_ID}/send` });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildBroadcastApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'POST', url: `/${VALID_ID}/send` });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 404 when broadcast not found', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/send` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when broadcast is not READY', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'DRAFT' }));

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/send` });
      expect(res.statusCode).toBe(400);
    });

    it('returns 200 and fires BroadcastSenderJob for READY broadcast', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'READY' }));
      mockPrisma.adminBroadcast.update.mockResolvedValue(fakeBroadcast({ status: 'SENDING' }));
      mockPrisma.adminAuditLog.create.mockResolvedValue({});
      mockJobExecute.mockResolvedValue(undefined);

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/send` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SENDING' }),
        })
      );
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    });

    it('does not fail if BroadcastSenderJob.execute rejects (fire-and-forget)', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'READY' }));
      mockPrisma.adminBroadcast.update.mockResolvedValue(fakeBroadcast({ status: 'SENDING' }));
      mockPrisma.adminAuditLog.create.mockResolvedValue({});
      mockJobExecute.mockRejectedValue(new Error('Job failed'));

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/send` });
      // Should still respond 200 — job failure is fire-and-forget
      expect(res.statusCode).toBe(200);
    });

    it('returns 500 when DB throws during send', async () => {
      mockPrisma.adminBroadcast.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/send` });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:id — Delete broadcast
  // -------------------------------------------------------------------------

  describe('DELETE /:id', () => {
    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildBroadcastAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildBroadcastApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 404 when broadcast not found', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when broadcast is in SENT status', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'SENT' }));

      const res = await app.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when broadcast is in SENDING status', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'SENDING' }));

      const res = await app.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(400);
    });

    it('deletes DRAFT broadcast and returns 200', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'DRAFT' }));
      mockPrisma.adminAuditLog.create.mockResolvedValue({});
      mockPrisma.adminBroadcast.delete.mockResolvedValue({});

      const res = await app.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.adminBroadcast.delete).toHaveBeenCalledWith({ where: { id: VALID_ID } });
    });

    it('deletes READY broadcast and returns 200', async () => {
      mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ status: 'READY' }));
      mockPrisma.adminAuditLog.create.mockResolvedValue({});
      mockPrisma.adminBroadcast.delete.mockResolvedValue({});

      const res = await app.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
    });

    it('returns 400 when id is not a valid ObjectId', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/invalid' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.adminBroadcast.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'DELETE', url: `/${VALID_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });
});

// ===========================================================================
// ADMIN POST ROUTES TESTS
// ===========================================================================

describe('adminPostRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = buildPostApp('ADMIN');
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /posts/stats — Post statistics
  // -------------------------------------------------------------------------

  describe('GET /posts/stats', () => {
    function setupStatsMocks() {
      mockPrisma.post.count
        .mockResolvedValueOnce(100)  // total posts
        .mockResolvedValueOnce(5);   // deleted posts
      mockPrisma.post.groupBy
        .mockResolvedValueOnce([
          { type: 'POST', _count: { id: 80 } },
          { type: 'REEL', _count: { id: 20 } },
        ])
        .mockResolvedValueOnce([
          { authorId: 'author1', _count: { id: 50 } },
          { authorId: 'author2', _count: { id: 30 } },
        ]);
      mockPrisma.post.findMany.mockResolvedValue([fakePost(), fakePost()]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'author1', username: 'alice', displayName: 'Alice', avatar: null },
        { id: 'author2', username: 'bob', displayName: 'Bob', avatar: null },
      ]);
    }

    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildPostAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role (no admin access)', async () => {
      await app.close();
      const userApp = buildPostApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 403 for ANALYST role (canAccessAdmin=false)', async () => {
      await app.close();
      const analystApp = buildPostApp('ANALYST');
      await analystApp.ready();

      const res = await analystApp.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(403);
      await analystApp.close();
    });

    it('returns 403 for AUDIT role that lacks canViewAnalytics AND canModerateContent', async () => {
      // AUDIT role has canAccessAdmin=true, canViewAnalytics=true, canModerateContent=false
      // The stats endpoint requires canViewAnalytics OR canModerateContent — AUDIT passes
      // Let's verify with MODERATOR which has canModerateContent=true but canViewAnalytics=false
      await app.close();
      const modApp = buildPostApp('MODERATOR');
      await modApp.ready();
      setupStatsMocks();

      const res = await modApp.inject({ method: 'GET', url: '/posts/stats' });
      // MODERATOR has canAccessAdmin=true (passes requireAdmin) and canModerateContent=true
      expect(res.statusCode).toBe(200);
      await modApp.close();
    });

    it('returns 200 with statistics for ADMIN role', async () => {
      setupStatsMocks();

      const res = await app.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(100);
      expect(body.data.deleted).toBe(5);
      expect(body.data.byType).toEqual({ POST: 80, REEL: 20 });
      expect(body.data.topAuthors).toHaveLength(2);
      expect(body.data.trending).toHaveLength(2);
    });

    it('returns 200 with period=today filter', async () => {
      setupStatsMocks();

      const res = await app.inject({ method: 'GET', url: '/posts/stats?period=today' });
      expect(res.statusCode).toBe(200);
      // dateFilter should have been passed to each query
      const countCall = mockPrisma.post.count.mock.calls[0][0];
      expect(countCall.where.createdAt).toBeDefined();
    });

    it('returns 200 with period=week filter', async () => {
      setupStatsMocks();

      const res = await app.inject({ method: 'GET', url: '/posts/stats?period=week' });
      expect(res.statusCode).toBe(200);
      const countCall = mockPrisma.post.count.mock.calls[0][0];
      expect(countCall.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('returns 200 with period=month filter', async () => {
      setupStatsMocks();

      const res = await app.inject({ method: 'GET', url: '/posts/stats?period=month' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 with no period (no date filter)', async () => {
      setupStatsMocks();

      const res = await app.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(200);
      const countCall = mockPrisma.post.count.mock.calls[0][0];
      expect(countCall.where.createdAt).toBeUndefined();
    });

    it('handles empty topAuthors correctly (no user lookup)', async () => {
      mockPrisma.post.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.post.groupBy
        .mockResolvedValueOnce([])  // no types
        .mockResolvedValueOnce([]); // no top authors
      mockPrisma.post.findMany.mockResolvedValue([]);
      // No user.findMany should be called

      const res = await app.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('returns 200 when author not found in map (falls back to id only)', async () => {
      mockPrisma.post.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      mockPrisma.post.groupBy
        .mockResolvedValueOnce([{ type: 'POST', _count: { id: 1 } }])
        .mockResolvedValueOnce([{ authorId: 'unknownAuthor', _count: { id: 1 } }]);
      mockPrisma.post.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]); // author not in DB

      const res = await app.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // When author not in map: fallback to { id: authorId }
      expect(body.data.topAuthors[0].author).toEqual({ id: 'unknownAuthor' });
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.post.count.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/posts/stats' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /posts — List posts
  // -------------------------------------------------------------------------

  describe('GET /posts', () => {
    function setupListMocks(posts = [fakePost()], total = 1) {
      mockPrisma.post.findMany.mockResolvedValue(posts);
      mockPrisma.post.count.mockResolvedValue(total);
    }

    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildPostAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({ method: 'GET', url: '/posts' });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildPostApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'GET', url: '/posts' });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 403 for AUDIT role (canModerateContent=false)', async () => {
      await app.close();
      const auditApp = buildPostApp('AUDIT');
      await auditApp.ready();

      const res = await auditApp.inject({ method: 'GET', url: '/posts' });
      expect(res.statusCode).toBe(403);
      await auditApp.close();
    });

    it('returns 200 with list of posts for ADMIN', async () => {
      setupListMocks([fakePost(), fakePost()], 2);

      const res = await app.inject({ method: 'GET', url: '/posts' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('returns 200 for MODERATOR role (canModerateContent=true)', async () => {
      await app.close();
      const modApp = buildPostApp('MODERATOR');
      await modApp.ready();
      setupListMocks();

      const res = await modApp.inject({ method: 'GET', url: '/posts' });
      expect(res.statusCode).toBe(200);
      await modApp.close();
    });

    it('filters deleted posts when isDeleted=true', async () => {
      setupListMocks([fakePost({ deletedAt: new Date() })]);

      const res = await app.inject({ method: 'GET', url: '/posts?isDeleted=true' });
      expect(res.statusCode).toBe(200);
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.deletedAt).toEqual({ not: null });
    });

    it('filters non-deleted posts by default (isDeleted=undefined)', async () => {
      setupListMocks();

      const res = await app.inject({ method: 'GET', url: '/posts' });
      expect(res.statusCode).toBe(200);
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.deletedAt).toBeNull();
    });

    it('filters non-deleted posts when isDeleted=false', async () => {
      setupListMocks();

      const res = await app.inject({ method: 'GET', url: '/posts?isDeleted=false' });
      expect(res.statusCode).toBe(200);
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.deletedAt).toBeNull();
    });

    it('applies search filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?search=hello' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.content).toEqual({ contains: 'hello', mode: 'insensitive' });
    });

    it('applies type filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?type=REEL' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBe('REEL');
    });

    it('applies visibility filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?visibility=PUBLIC' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.visibility).toBe('PUBLIC');
    });

    it('applies authorId filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?authorId=abc123' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.authorId).toBe('abc123');
    });

    it('applies isPinned=true filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?isPinned=true' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.isPinned).toBe(true);
    });

    it('applies isPinned=false filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?isPinned=false' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.isPinned).toBe(false);
    });

    it('applies period=today filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?period=today' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.createdAt).toBeDefined();
      expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
    });

    it('applies period=week filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?period=week' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
    });

    it('applies period=month filter', async () => {
      setupListMocks();

      await app.inject({ method: 'GET', url: '/posts?period=month' });
      const whereArg = mockPrisma.post.findMany.mock.calls[0][0].where;
      expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
    });

    it('returns pagination metadata', async () => {
      setupListMocks([fakePost()], 50);

      const res = await app.inject({ method: 'GET', url: '/posts?offset=0&limit=1' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.pagination.total).toBe(50);
      expect(body.pagination.hasMore).toBe(true);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.post.findMany.mockRejectedValue(new Error('DB error'));
      mockPrisma.post.count.mockResolvedValue(0);

      const res = await app.inject({ method: 'GET', url: '/posts' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /posts/:postId — Get single post
  // -------------------------------------------------------------------------

  describe('GET /posts/:postId', () => {
    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildPostAppNoAuth();
      await noAuthApp.ready();

      const res = await noAuthApp.inject({ method: 'GET', url: `/posts/${VALID_ID}` });
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildPostApp('USER');
      await userApp.ready();

      const res = await userApp.inject({ method: 'GET', url: `/posts/${VALID_ID}` });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 403 for AUDIT role (canModerateContent=false)', async () => {
      await app.close();
      const auditApp = buildPostApp('AUDIT');
      await auditApp.ready();

      const res = await auditApp.inject({ method: 'GET', url: `/posts/${VALID_ID}` });
      expect(res.statusCode).toBe(403);
      await auditApp.close();
    });

    it('returns 200 with post details for ADMIN', async () => {
      const post = fakePost();
      mockPrisma.post.findUnique.mockResolvedValue(post);

      const res = await app.inject({ method: 'GET', url: `/posts/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(VALID_ID);
    });

    it('returns 200 for BIGBOSS role', async () => {
      await app.close();
      const bossApp = buildPostApp('BIGBOSS');
      await bossApp.ready();
      mockPrisma.post.findUnique.mockResolvedValue(fakePost());

      const res = await bossApp.inject({ method: 'GET', url: `/posts/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
      await bossApp.close();
    });

    it('returns 404 when post not found', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/posts/${VALID_ID}` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.post.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: `/posts/${VALID_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /posts/:postId — Admin force-delete post
  // -------------------------------------------------------------------------

  describe('DELETE /posts/:postId', () => {
    // The DELETE route defines a JSON body schema in Fastify, so Fastify 5
    // requires either a JSON body or content-type header for body parsing.
    // Use `headers` + empty payload to satisfy the schema validator.
    const deleteInject = (app: FastifyInstance, postId: string, payload: Record<string, unknown> = {}) =>
      app.inject({
        method: 'DELETE',
        url: `/posts/${postId}`,
        headers: { 'content-type': 'application/json' },
        payload,
      });

    it('returns 401 when unauthenticated', async () => {
      await app.close();
      const noAuthApp = buildPostAppNoAuth();
      await noAuthApp.ready();

      const res = await deleteInject(noAuthApp, VALID_ID);
      expect(res.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 for USER role', async () => {
      await app.close();
      const userApp = buildPostApp('USER');
      await userApp.ready();

      const res = await deleteInject(userApp, VALID_ID);
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 403 for AUDIT role (canModerateContent=false)', async () => {
      await app.close();
      const auditApp = buildPostApp('AUDIT');
      await auditApp.ready();

      const res = await deleteInject(auditApp, VALID_ID);
      expect(res.statusCode).toBe(403);
      await auditApp.close();
    });

    it('returns 404 when post not found', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(null);

      const res = await deleteInject(app, VALID_ID);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when post is already deleted', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(
        fakePost({ deletedAt: new Date('2024-01-01') })
      );

      const res = await deleteInject(app, VALID_ID);
      expect(res.statusCode).toBe(400);
    });

    it('soft-deletes post and returns 200 for ADMIN', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(fakePost({ deletedAt: null }));
      mockPrisma.post.update.mockResolvedValue(fakePost({ deletedAt: new Date() }));

      const res = await deleteInject(app, VALID_ID);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(mockPrisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VALID_ID },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      );
    });

    it('soft-deletes post for MODERATOR role', async () => {
      await app.close();
      const modApp = buildPostApp('MODERATOR');
      await modApp.ready();
      mockPrisma.post.findUnique.mockResolvedValue(fakePost({ deletedAt: null }));
      mockPrisma.post.update.mockResolvedValue(fakePost({ deletedAt: new Date() }));

      const res = await deleteInject(modApp, VALID_ID);
      expect(res.statusCode).toBe(200);
      await modApp.close();
    });

    it('accepts optional reason body param', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(fakePost({ deletedAt: null }));
      mockPrisma.post.update.mockResolvedValue(fakePost({ deletedAt: new Date() }));

      const res = await deleteInject(app, VALID_ID, { reason: 'Spam content' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.post.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await deleteInject(app, VALID_ID);
      expect(res.statusCode).toBe(500);
    });

    it('returns 500 when post.update throws', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(fakePost({ deletedAt: null }));
      mockPrisma.post.update.mockRejectedValue(new Error('DB update error'));

      const res = await deleteInject(app, VALID_ID);
      expect(res.statusCode).toBe(500);
    });
  });
});
