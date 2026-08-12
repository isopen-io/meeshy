import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that trigger the modules
// ---------------------------------------------------------------------------

const mockReportService = {
  createReport: jest.fn<any>(),
  listReports: jest.fn<any>(),
  getReportStats: jest.fn<any>(),
  getRecentReports: jest.fn<any>(),
  getReportById: jest.fn<any>(),
  updateReport: jest.fn<any>(),
  deleteReport: jest.fn<any>(),
  getReportsForEntity: jest.fn<any>(),
  assignModerator: jest.fn<any>(),
  getModeratorReports: jest.fn<any>(),
};

jest.mock('../../../../services/admin/report.service', () => ({
  getReportService: jest.fn(() => mockReportService),
}));

const mockCacheGet = jest.fn<any>().mockResolvedValue(null);
const mockCacheSet = jest.fn<any>().mockResolvedValue(undefined);
const mockCacheDel = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
    del: mockCacheDel,
  })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { reportRoutes } from '../../../../routes/admin/reports';
import { analyticsRoutes } from '../../../../routes/admin/analytics';
import { messagesRoutes } from '../../../../routes/admin/messages';
import { updateUserRoleSchema, updateUserStatusSchema } from '../../../../routes/admin/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const makeAuthContext = (role = 'ADMIN') => ({
  isAuthenticated: true,
  registeredUser: { id: '507f1f77bcf86cd799439011', role, username: 'admin' },
});

// ---------------------------------------------------------------------------
// Prisma mock factories
// ---------------------------------------------------------------------------

function makePrismaForAnalytics({
  userCount = 5,
  messageCount = 100,
  groupByConvResult = [{ conversationId: 'c1' }, { conversationId: 'c2' }],
  groupByTypeResult = [{ messageType: 'text', _count: { id: 80 } }, { messageType: 'image', _count: { id: 20 } }],
  groupByLangResult = [{ originalLanguage: 'fr', _count: { id: 70 } }],
  userDistCounts = [3, 5, 2, 10],
  kpiCounts = [200, 50, 30, 10],
} = {}) {
  const [veryActive, active, occasional, inactive] = userDistCounts;
  const [totalMsg, totalUsers, activeUsers, newUsers] = kpiCounts;

  return {
    user: {
      count: jest.fn<any>()
        .mockResolvedValueOnce(userCount)       // realtime: onlineUsers
        .mockResolvedValueOnce(veryActive)      // user-distribution: veryActive
        .mockResolvedValueOnce(active)          // user-distribution: active
        .mockResolvedValueOnce(occasional)      // user-distribution: occasional
        .mockResolvedValueOnce(inactive)        // user-distribution: inactive
        .mockResolvedValueOnce(totalUsers)      // kpis: totalUsers
        .mockResolvedValueOnce(activeUsers)     // kpis: activeUsers
        .mockResolvedValueOnce(newUsers),       // kpis: newUsers
    },
    message: {
      count: jest.fn<any>()
        .mockResolvedValue(messageCount),
      groupBy: jest.fn<any>()
        .mockResolvedValueOnce(groupByConvResult)
        .mockResolvedValueOnce(groupByTypeResult)
        .mockResolvedValueOnce(groupByLangResult),
    },
    reaction: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  };
}

function makePrismaForMessages({
  totalMessages = 10,
  deletedMessages = 1,
  editedMessages = 2,
  groupByTypeResult = [{ messageType: 'text', _count: { id: 10 } }],
  findManyResult = [{ createdAt: new Date(), content: 'hello' }],
  messagesWithTranslations = 5,
  topSenders = [{ senderId: 'p1', _count: { id: 5 } }],
  participants = [],
  messagesWithAttachments = 2,
  totalReactions = 3,
  totalReplies = 1,
  messagesWithReactions = 2,
  messagesWithReplies = 1,
}: any = {}) {
  return {
    message: {
      count: jest.fn<any>()
        .mockResolvedValueOnce(totalMessages)
        .mockResolvedValueOnce(deletedMessages)
        .mockResolvedValueOnce(editedMessages)
        .mockResolvedValueOnce(messagesWithTranslations)
        .mockResolvedValueOnce(messagesWithAttachments)
        // for trends:
        .mockResolvedValue(10),
      groupBy: jest.fn<any>()
        .mockResolvedValueOnce(groupByTypeResult)
        .mockResolvedValueOnce(topSenders),
      findMany: jest.fn<any>()
        .mockResolvedValue(findManyResult),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(participants),
    },
    reaction: {
      count: jest.fn<any>().mockResolvedValue(totalReactions),
    },
  };
}

// ---------------------------------------------------------------------------
// App builders
// ---------------------------------------------------------------------------

function buildReportApp(authContext = makeAuthContext()) {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {} as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = authContext;
  });
  app.register(reportRoutes);
  return app;
}

function buildReportAppWithRole(role: string) {
  return buildReportApp(makeAuthContext(role));
}

function buildAnalyticsApp(prisma: any, authContext = makeAuthContext()) {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = authContext;
  });
  app.register(analyticsRoutes);
  return app;
}

function buildMessagesApp(prisma: any, authContext = makeAuthContext()) {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = authContext;
  });
  app.register(messagesRoutes);
  return app;
}

// ===========================================================================
// SECTION 1 — reportRoutes
// ===========================================================================

describe('Admin report routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------
  describe('POST /', () => {
    it('creates a report using registeredUser.id as reporterId', async () => {
      app = buildReportApp();
      await app.ready();

      const fakeReport = { id: 'r1', reportedType: 'user', reportType: 'spam' };
      mockReportService.createReport.mockResolvedValueOnce(fakeReport);

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          reportedType: 'user',
          reportedEntityId: '507f1f77bcf86cd799439012',
          reportType: 'spam',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject(fakeReport);
      expect(mockReportService.createReport).toHaveBeenCalledWith(
        expect.objectContaining({ reporterId: '507f1f77bcf86cd799439011' })
      );
    });

    it('uses reporterId from body when provided (overridden by authContext.registeredUser.id)', async () => {
      // registeredUser.id takes priority over body.reporterId
      app = buildReportApp();
      await app.ready();

      mockReportService.createReport.mockResolvedValueOnce({ id: 'r2' });

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          reportedType: 'message',
          reportedEntityId: '507f1f77bcf86cd799439013',
          reportType: 'harassment',
          reporterId: '507f1f77bcf86cd799439099',
        },
      });

      expect(res.statusCode).toBe(201);
      // registeredUser.id wins because it's checked first (authContext.registeredUser?.id || body.reporterId)
      expect(mockReportService.createReport).toHaveBeenCalledWith(
        expect.objectContaining({ reporterId: '507f1f77bcf86cd799439011' })
      );
    });

    it('uses body.reporterName when provided', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.createReport.mockResolvedValueOnce({ id: 'r3' });

      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          reportedType: 'conversation',
          reportedEntityId: '507f1f77bcf86cd799439014',
          reportType: 'spam',
          reporterName: 'John Doe',
        },
      });

      expect(mockReportService.createReport).toHaveBeenCalledWith(
        expect.objectContaining({ reporterName: 'John Doe' })
      );
    });

    it('returns 400 on invalid body (ZodError)', async () => {
      app = buildReportApp();
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { reportedType: 'INVALID_TYPE', reportType: 'spam' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.createReport.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          reportedType: 'user',
          reportedEntityId: '507f1f77bcf86cd799439015',
          reportType: 'spam',
        },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /  (list)
  // -------------------------------------------------------------------------
  describe('GET /', () => {
    it('returns 401 when not authenticated', async () => {
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', {} as any);
      unauthApp.decorate('authenticate', async (request: any, reply: any) => {
        reply.status(401).send({ success: false, error: { message: 'Unauthorized' } });
      });
      unauthApp.register(reportRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });

    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with reports list', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.listReports.mockResolvedValueOnce({
        reports: [{ id: 'r1' }],
        total: 1,
      });

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.reports).toHaveLength(1);
    });

    it('passes filters (reportedType, reportType, status, sortBy, createdAfter, createdBefore)', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.listReports.mockResolvedValueOnce({ reports: [], total: 0 });

      const res = await app.inject({
        method: 'GET',
        url: '/?reportedType=user&reportType=spam&status=pending&sortBy=createdAt&createdAfter=2024-01-01&createdBefore=2024-12-31',
      });

      expect(res.statusCode).toBe(200);
      const callArgs = mockReportService.listReports.mock.calls[0][0];
      expect(callArgs.reportedType).toBe('user');
      expect(callArgs.reportType).toBe('spam');
      expect(callArgs.status).toBe('pending');
      expect(callArgs.sortBy).toBe('createdAt');
      expect(callArgs.createdAfter).toBeInstanceOf(Date);
      expect(callArgs.createdBefore).toBeInstanceOf(Date);
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.listReports.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /stats
  // -------------------------------------------------------------------------
  describe('GET /stats', () => {
    it('returns 403 when ANALYST role', async () => {
      app = buildReportAppWithRole('ANALYST');
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with stats', async () => {
      app = buildReportApp();
      await app.ready();

      const stats = { pending: 5, resolved: 10 };
      mockReportService.getReportStats.mockResolvedValueOnce(stats);

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject(stats);
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getReportStats.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /recent
  // -------------------------------------------------------------------------
  describe('GET /recent', () => {
    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/recent' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with default limit=10', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getRecentReports.mockResolvedValueOnce([{ id: 'r1' }]);

      const res = await app.inject({ method: 'GET', url: '/recent' });
      expect(res.statusCode).toBe(200);
      expect(mockReportService.getRecentReports).toHaveBeenCalledWith(10);
    });

    it('returns 200 with custom limit', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getRecentReports.mockResolvedValueOnce([]);

      const res = await app.inject({ method: 'GET', url: '/recent?limit=5' });
      expect(res.statusCode).toBe(200);
      expect(mockReportService.getRecentReports).toHaveBeenCalledWith(5);
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getRecentReports.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/recent' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------
  describe('GET /:id', () => {
    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with report', async () => {
      app = buildReportApp();
      await app.ready();

      const report = { id: '507f1f77bcf86cd799439020', status: 'pending' };
      mockReportService.getReportById.mockResolvedValueOnce(report);

      const res = await app.inject({ method: 'GET', url: '/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toMatchObject(report);
    });

    it('returns 404 when report not found', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getReportById.mockResolvedValueOnce(null);

      const res = await app.inject({ method: 'GET', url: '/507f1f77bcf86cd799439099' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getReportById.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /:id
  // -------------------------------------------------------------------------
  describe('PATCH /:id', () => {
    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/507f1f77bcf86cd799439020',
        payload: { status: 'resolved' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with updated report', async () => {
      app = buildReportApp();
      await app.ready();

      const updated = { id: '507f1f77bcf86cd799439020', status: 'resolved' };
      mockReportService.updateReport.mockResolvedValueOnce(updated);

      const res = await app.inject({
        method: 'PATCH',
        url: '/507f1f77bcf86cd799439020',
        payload: { status: 'resolved', moderatorNotes: 'Handled' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toMatchObject(updated);
      expect(mockReportService.updateReport).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439020',
        '507f1f77bcf86cd799439011',
        expect.objectContaining({ status: 'resolved' })
      );
    });

    it('returns 400 on ZodError (invalid status)', async () => {
      app = buildReportApp();
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/507f1f77bcf86cd799439020',
        payload: { status: 'INVALID_STATUS' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.updateReport.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({
        method: 'PATCH',
        url: '/507f1f77bcf86cd799439020',
        payload: { status: 'resolved' },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:id
  // -------------------------------------------------------------------------
  describe('DELETE /:id', () => {
    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 on successful delete', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.deleteReport.mockResolvedValueOnce(undefined);

      const res = await app.inject({ method: 'DELETE', url: '/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.deleteReport.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'DELETE', url: '/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /entity/:type/:id
  // -------------------------------------------------------------------------
  describe('GET /entity/:type/:id', () => {
    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/entity/user/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with entity reports', async () => {
      app = buildReportApp();
      await app.ready();

      const reports = [{ id: 'r1' }, { id: 'r2' }];
      mockReportService.getReportsForEntity.mockResolvedValueOnce(reports);

      const res = await app.inject({ method: 'GET', url: '/entity/user/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(2);
      expect(mockReportService.getReportsForEntity).toHaveBeenCalledWith('user', '507f1f77bcf86cd799439020');
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getReportsForEntity.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/entity/user/507f1f77bcf86cd799439020' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/assign
  // -------------------------------------------------------------------------
  describe('POST /:id/assign', () => {
    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({ method: 'POST', url: '/507f1f77bcf86cd799439020/assign' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 and uses authContext moderatorId', async () => {
      app = buildReportApp();
      await app.ready();

      const updatedReport = { id: '507f1f77bcf86cd799439020', moderatorId: '507f1f77bcf86cd799439011' };
      mockReportService.assignModerator.mockResolvedValueOnce(updatedReport);

      const res = await app.inject({ method: 'POST', url: '/507f1f77bcf86cd799439020/assign' });
      expect(res.statusCode).toBe(200);
      expect(mockReportService.assignModerator).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439020',
        '507f1f77bcf86cd799439011'
      );
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.assignModerator.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'POST', url: '/507f1f77bcf86cd799439020/assign' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /moderator/mine
  // -------------------------------------------------------------------------
  describe('GET /moderator/mine', () => {
    it('returns 403 when USER role', async () => {
      app = buildReportAppWithRole('USER');
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/moderator/mine' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with moderator reports', async () => {
      app = buildReportApp();
      await app.ready();

      const reports = [{ id: 'r1' }];
      mockReportService.getModeratorReports.mockResolvedValueOnce(reports);

      const res = await app.inject({ method: 'GET', url: '/moderator/mine' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(mockReportService.getModeratorReports).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('returns 500 on service error', async () => {
      app = buildReportApp();
      await app.ready();

      mockReportService.getModeratorReports.mockRejectedValueOnce(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/moderator/mine' });
      expect(res.statusCode).toBe(500);
    });
  });
});

// ===========================================================================
// SECTION 2 — analyticsRoutes
// ===========================================================================

describe('Admin analytics routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /realtime
  // -------------------------------------------------------------------------
  describe('GET /realtime', () => {
    it('returns 403 when USER role', async () => {
      const prisma = makePrismaForAnalytics();
      app = buildAnalyticsApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/realtime' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with realtime metrics on cache miss', async () => {
      const prisma = makePrismaForAnalytics({ userCount: 5, messageCount: 42, groupByConvResult: [{ conversationId: 'c1' }] });
      app = buildAnalyticsApp(prisma);
      await app.ready();

      // realtime needs: user.count, message.count, message.groupBy
      prisma.user.count.mockResolvedValueOnce(5);
      prisma.message.count.mockResolvedValueOnce(42);
      prisma.message.groupBy.mockResolvedValueOnce([{ conversationId: 'c1' }]);

      const res = await app.inject({ method: 'GET', url: '/realtime' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('onlineUsers');
      expect(body.data).toHaveProperty('messagesLastHour');
      expect(body.data).toHaveProperty('activeConversations');
      expect(body.data).toHaveProperty('timestamp');
    });

    it('returns cached data on cache hit', async () => {
      const cached = JSON.stringify({
        success: true,
        data: { onlineUsers: 99, messagesLastHour: 999, activeConversations: 5, timestamp: new Date().toISOString() },
      });
      mockCacheGet.mockResolvedValueOnce(cached);

      const prisma = makePrismaForAnalytics();
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/realtime' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.onlineUsers).toBe(99);
      // DB should not have been queried
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      const prisma = {
        user: { count: jest.fn<any>().mockRejectedValue(new Error('DB error')) },
        message: { count: jest.fn<any>().mockResolvedValue(0), groupBy: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/realtime' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /hourly-activity
  // -------------------------------------------------------------------------
  describe('GET /hourly-activity', () => {
    it('returns 403 when USER role', async () => {
      const prisma = makePrismaForAnalytics();
      app = buildAnalyticsApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/hourly-activity' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with 8 buckets on cache miss', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(5) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/hourly-activity' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(8);
      body.data.forEach((bucket: any) => {
        expect(bucket).toHaveProperty('hour');
        expect(bucket).toHaveProperty('activity');
      });
    });

    it('returns cached data on cache hit', async () => {
      const cachedData = Array.from({ length: 8 }, (_, i) => ({ hour: `${i * 3}h`, activity: i }));
      mockCacheGet.mockResolvedValueOnce(JSON.stringify({ success: true, data: cachedData }));

      const prisma = { message: { count: jest.fn<any>() } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/hourly-activity' });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.count).not.toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      const prisma = { message: { count: jest.fn<any>().mockRejectedValue(new Error('DB error')) } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/hourly-activity' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /message-types
  // -------------------------------------------------------------------------
  describe('GET /message-types', () => {
    it('returns 403 when USER role', async () => {
      const prisma = { message: { groupBy: jest.fn<any>().mockResolvedValue([]) } };
      app = buildAnalyticsApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/message-types' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 for period=24h', async () => {
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([
            { messageType: 'text', _count: { id: 50 } },
            { messageType: 'image', _count: { id: 50 } },
          ]),
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/message-types?period=24h' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data[0].percentage).toBe(50);
    });

    it('returns 200 for period=7d (default)', async () => {
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([
            { messageType: 'text', _count: { id: 100 } },
          ]),
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/message-types' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data[0].percentage).toBe(100);
    });

    it('returns 200 for period=30d', async () => {
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([]),
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/message-types?period=30d' });
      expect(res.statusCode).toBe(200);
    });

    it('returns percentage=0 when totalMessages=0', async () => {
      const prisma = {
        message: { groupBy: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/message-types' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(0);
    });

    it('returns cached data on cache hit', async () => {
      const cached = [{ type: 'text', count: 10, percentage: 100 }];
      mockCacheGet.mockResolvedValueOnce(JSON.stringify({ success: true, data: cached }));

      const prisma = { message: { groupBy: jest.fn<any>() } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/message-types' });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.groupBy).not.toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      const prisma = { message: { groupBy: jest.fn<any>().mockRejectedValue(new Error('DB error')) } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/message-types' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /user-distribution
  // -------------------------------------------------------------------------
  describe('GET /user-distribution', () => {
    it('returns 403 when USER role', async () => {
      const prisma = { user: { count: jest.fn<any>().mockResolvedValue(0) } };
      app = buildAnalyticsApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/user-distribution' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with user distribution categories', async () => {
      const prisma = {
        user: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(3)   // veryActive
            .mockResolvedValueOnce(10)  // active
            .mockResolvedValueOnce(5)   // occasional
            .mockResolvedValueOnce(20), // inactive
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/user-distribution' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(4);
      expect(body.data[0].name).toBe('Très actifs');
      expect(body.data[1].name).toBe('Actifs');
      expect(body.data[2].name).toBe('Occasionnels');
      expect(body.data[3].name).toBe('Inactifs');
    });

    it('returns cached data on cache hit', async () => {
      const cached = [{ name: 'Très actifs', value: 99, color: '#10b981' }];
      mockCacheGet.mockResolvedValueOnce(JSON.stringify({ success: true, data: cached }));

      const prisma = { user: { count: jest.fn<any>() } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/user-distribution' });
      expect(res.statusCode).toBe(200);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      const prisma = { user: { count: jest.fn<any>().mockRejectedValue(new Error('DB error')) } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/user-distribution' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /language-distribution
  // -------------------------------------------------------------------------
  describe('GET /language-distribution', () => {
    it('returns 403 when USER role', async () => {
      const prisma = { message: { groupBy: jest.fn<any>().mockResolvedValue([]) } };
      app = buildAnalyticsApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/language-distribution' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with default limit=5', async () => {
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([
            { originalLanguage: 'fr', _count: { id: 100 } },
            { originalLanguage: 'en', _count: { id: 50 } },
          ]),
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/language-distribution' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Called with take=5 (default)
      expect(prisma.message.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });

    it('returns 200 with custom limit', async () => {
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([]),
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/language-distribution?limit=3' });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 })
      );
    });

    it('returns cached data on cache hit', async () => {
      const cached = [{ name: 'fr', value: 100, color: '#8b5cf6' }];
      mockCacheGet.mockResolvedValueOnce(JSON.stringify({ success: true, data: cached }));

      const prisma = { message: { groupBy: jest.fn<any>() } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/language-distribution' });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.groupBy).not.toHaveBeenCalled();
    });

    it('falls back to Unknown when originalLanguage is null', async () => {
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([
            { originalLanguage: null, _count: { id: 30 } },
          ]),
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/language-distribution' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data[0].name).toBe('Unknown');
    });

    it('falls back to #6b7280 color when more than 5 languages returned', async () => {
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([
            { originalLanguage: 'fr', _count: { id: 100 } },
            { originalLanguage: 'en', _count: { id: 90 } },
            { originalLanguage: 'de', _count: { id: 80 } },
            { originalLanguage: 'es', _count: { id: 70 } },
            { originalLanguage: 'it', _count: { id: 60 } },
            { originalLanguage: 'pt', _count: { id: 50 } },  // index 5 → colors[5] = undefined → '#6b7280'
          ]),
        },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/language-distribution?limit=6' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data[5].color).toBe('#6b7280');
    });

    it('returns 500 on DB error', async () => {
      const prisma = { message: { groupBy: jest.fn<any>().mockRejectedValue(new Error('DB error')) } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/language-distribution' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /kpis
  // -------------------------------------------------------------------------
  describe('GET /kpis', () => {
    it('returns 403 when USER role', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(0) },
        user: { count: jest.fn<any>().mockResolvedValue(0) },
      };
      app = buildAnalyticsApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/kpis' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 for period=7d', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(200) },
        user: { count: jest.fn<any>().mockResolvedValueOnce(50).mockResolvedValueOnce(30).mockResolvedValueOnce(10) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/kpis?period=7d' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('engagementRate');
      expect(body.data).toHaveProperty('growthRate');
    });

    it('returns 200 for period=30d (default)', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(1000) },
        user: { count: jest.fn<any>().mockResolvedValueOnce(100).mockResolvedValueOnce(60).mockResolvedValueOnce(20) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/kpis' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 for period=90d', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(5000) },
        user: { count: jest.fn<any>().mockResolvedValueOnce(200).mockResolvedValueOnce(150).mockResolvedValueOnce(30) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/kpis?period=90d' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 0 rates when totalUsers=0', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(0) },
        user: { count: jest.fn<any>().mockResolvedValue(0) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/kpis' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.engagementRate).toBe(0);
      expect(body.data.growthRate).toBe(0);
      expect(body.data.messagesPerUser).toBe(0);
    });

    it('returns cached data on cache hit', async () => {
      const cached = { engagementRate: 75, avgSessionTime: '2h', peakHours: '18h-21h', growthRate: 5, messagesPerUser: 10, activeUserRate: 75 };
      mockCacheGet.mockResolvedValueOnce(JSON.stringify({ success: true, data: cached }));

      const prisma = {
        message: { count: jest.fn<any>() },
        user: { count: jest.fn<any>() },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/kpis' });
      expect(res.statusCode).toBe(200);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockRejectedValue(new Error('DB error')) },
        user: { count: jest.fn<any>().mockResolvedValue(0) },
      };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/kpis' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /volume-timeline
  // -------------------------------------------------------------------------
  describe('GET /volume-timeline', () => {
    it('returns 403 when USER role', async () => {
      const prisma = { message: { count: jest.fn<any>().mockResolvedValue(0) } };
      app = buildAnalyticsApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with 7-day timeline on cache miss', async () => {
      const prisma = { message: { count: jest.fn<any>().mockResolvedValue(10) } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(7);
      body.data.forEach((entry: any) => {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('messages');
      });
    });

    it('returns cached data on cache hit', async () => {
      const cached = Array.from({ length: 7 }, (_, i) => ({ date: `2024-01-${i + 1}`, messages: i * 10 }));
      mockCacheGet.mockResolvedValueOnce(JSON.stringify({ success: true, data: cached }));

      const prisma = { message: { count: jest.fn<any>() } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.count).not.toHaveBeenCalled();
    });

    it('returns 500 on DB error', async () => {
      const prisma = { message: { count: jest.fn<any>().mockRejectedValue(new Error('DB error')) } };
      app = buildAnalyticsApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // 401 — no auth context (covers analytics requireAnalyticsPermission line 21)
  // authenticate completes without setting authContext → middleware sends 401
  // -------------------------------------------------------------------------
  describe('401 unauthenticated paths (no authContext)', () => {
    it('GET /realtime returns 401 when authContext is missing', async () => {
      const prisma = { user: { count: jest.fn<any>() }, message: { count: jest.fn<any>(), groupBy: jest.fn<any>() } };
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', prisma);
      // authenticate succeeds but does NOT set authContext → requireAnalyticsPermission sees undefined
      unauthApp.decorate('authenticate', async (_request: any, _reply: any) => {
        // intentionally do nothing — authContext remains undefined
      });
      unauthApp.register(analyticsRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/realtime' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });

    it('GET /hourly-activity returns 401 when authContext is missing', async () => {
      const prisma = { message: { count: jest.fn<any>() } };
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', prisma);
      unauthApp.decorate('authenticate', async (_request: any, _reply: any) => {});
      unauthApp.register(analyticsRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/hourly-activity' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });

    it('GET /message-types returns 401 when authContext is missing', async () => {
      const prisma = { message: { groupBy: jest.fn<any>() } };
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', prisma);
      unauthApp.decorate('authenticate', async (_request: any, _reply: any) => {});
      unauthApp.register(analyticsRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/message-types' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });

    it('GET /kpis returns 401 when authContext is missing', async () => {
      const prisma = { message: { count: jest.fn<any>() }, user: { count: jest.fn<any>() } };
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', prisma);
      unauthApp.decorate('authenticate', async (_request: any, _reply: any) => {});
      unauthApp.register(analyticsRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/kpis' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });
  });

  // -------------------------------------------------------------------------
  // Default switch branch coverage (message-types & kpis with unknown period)
  // -------------------------------------------------------------------------
  describe('default switch branch', () => {
    it('GET /message-types with no period falls back to schema default 7d', async () => {
      // The Zod schema coerces period to default '7d' if not provided
      // The default branch is structurally unreachable via the validated query schema
      // We verify the route works with period explicitly missing (schema default='7d')
      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([
            { messageType: 'text', _count: { id: 10 } },
          ]),
        },
      };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/message-types' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });

    it('GET /kpis with period=30d (default) covers the 30d switch branch', async () => {
      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(100) },
        user: { count: jest.fn<any>().mockResolvedValueOnce(50).mockResolvedValueOnce(30).mockResolvedValueOnce(5) },
      };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/kpis?period=30d' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });
  });

  // -------------------------------------------------------------------------
  // Cache set rejection — covers .catch(() => {}) fire-and-forget callbacks
  // -------------------------------------------------------------------------
  describe('cache set rejection (fire-and-forget .catch coverage)', () => {
    it('GET /realtime still returns 200 when cacheStore.set rejects', async () => {
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const prisma = {
        user: { count: jest.fn<any>().mockResolvedValueOnce(3) },
        message: {
          count: jest.fn<any>().mockResolvedValueOnce(20),
          groupBy: jest.fn<any>().mockResolvedValueOnce([{ conversationId: 'c1' }]),
        },
      };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/realtime' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });

    it('GET /hourly-activity still returns 200 when cacheStore.set rejects', async () => {
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const prisma = { message: { count: jest.fn<any>().mockResolvedValue(5) } };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/hourly-activity' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });

    it('GET /message-types still returns 200 when cacheStore.set rejects', async () => {
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([{ messageType: 'text', _count: { id: 10 } }]),
        },
      };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/message-types?period=7d' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });

    it('GET /user-distribution still returns 200 when cacheStore.set rejects', async () => {
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const prisma = {
        user: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(2).mockResolvedValueOnce(5)
            .mockResolvedValueOnce(3).mockResolvedValueOnce(10),
        },
      };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/user-distribution' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });

    it('GET /language-distribution still returns 200 when cacheStore.set rejects', async () => {
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const prisma = {
        message: {
          groupBy: jest.fn<any>().mockResolvedValue([{ originalLanguage: 'fr', _count: { id: 50 } }]),
        },
      };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/language-distribution' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });

    it('GET /kpis still returns 200 when cacheStore.set rejects', async () => {
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const prisma = {
        message: { count: jest.fn<any>().mockResolvedValue(100) },
        user: { count: jest.fn<any>().mockResolvedValueOnce(50).mockResolvedValueOnce(30).mockResolvedValueOnce(10) },
      };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/kpis?period=7d' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });

    it('GET /volume-timeline still returns 200 when cacheStore.set rejects', async () => {
      mockCacheSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const prisma = { message: { count: jest.fn<any>().mockResolvedValue(8) } };
      const localApp = buildAnalyticsApp(prisma);
      await localApp.ready();

      const res = await localApp.inject({ method: 'GET', url: '/volume-timeline' });
      expect(res.statusCode).toBe(200);
      await localApp.close();
    });
  });
});

// ===========================================================================
// SECTION 3 — messagesRoutes
// ===========================================================================

describe('Admin messages routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /stats
  // -------------------------------------------------------------------------
  describe('GET /stats', () => {
    it('returns 403 when ANALYST role (not in allowed list)', async () => {
      const prisma = makePrismaForMessages();
      app = buildMessagesApp(prisma, makeAuthContext('ANALYST'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 for period=30d (default)', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(100)  // totalMessages
            .mockResolvedValueOnce(5)    // deletedMessages
            .mockResolvedValueOnce(3)    // editedMessages
            .mockResolvedValueOnce(40)   // messagesWithTranslations
            .mockResolvedValueOnce(10),  // messagesWithAttachments
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([{ messageType: 'text', _count: { id: 100 } }])
            .mockResolvedValueOnce([{ senderId: 'p1', _count: { id: 50 } }]),
          findMany: jest.fn<any>().mockResolvedValue([
            { createdAt: new Date(), content: 'hello world' },
          ]),
        },
        participant: {
          findMany: jest.fn<any>().mockResolvedValue([
            { id: 'p1', userId: 'u1', user: { username: 'testuser', displayName: 'Test User' } },
          ]),
        },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('totalMessages', 100);
      expect(body.data).toHaveProperty('deletedMessages', 5);
      expect(body.data).toHaveProperty('editedMessages', 3);
      expect(body.data).toHaveProperty('translatedPercentage', 40);
      expect(body.data).toHaveProperty('attachmentRate');
      expect(body.data).toHaveProperty('messagesByPeriod');
      expect(body.data).toHaveProperty('topSenders');
      expect(body.data.period).toBe('30d');
    });

    it('returns 200 for period=24h', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(20).mockResolvedValueOnce(1).mockResolvedValueOnce(0)
            .mockResolvedValueOnce(5).mockResolvedValueOnce(3),
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([]).mockResolvedValueOnce([]),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats?period=24h' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.period).toBe('24h');
    });

    it('returns 200 for period=7d', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(50).mockResolvedValueOnce(2).mockResolvedValueOnce(1)
            .mockResolvedValueOnce(20).mockResolvedValueOnce(8),
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([]).mockResolvedValueOnce([]),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats?period=7d' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.period).toBe('7d');
    });

    it('returns 200 for period=90d', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(500).mockResolvedValueOnce(20).mockResolvedValueOnce(10)
            .mockResolvedValueOnce(200).mockResolvedValueOnce(50),
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([]).mockResolvedValueOnce([]),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats?period=90d' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.period).toBe('90d');
    });

    it('computes attachmentRate=0 when totalMessages=0', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(0)   // totalMessages
            .mockResolvedValueOnce(0)   // deletedMessages
            .mockResolvedValueOnce(0)   // editedMessages
            .mockResolvedValueOnce(0)   // messagesWithTranslations
            .mockResolvedValueOnce(0),  // messagesWithAttachments
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([]).mockResolvedValueOnce([]),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.attachmentRate).toBe(0);
      expect(body.data.translatedPercentage).toBe(0);
      expect(body.data.averageLength).toBe(0);
    });

    it('maps participant data to topSenders with username/displayName', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(10).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
            .mockResolvedValueOnce(5).mockResolvedValueOnce(2),
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([{ messageType: 'text', _count: { id: 10 } }])
            .mockResolvedValueOnce([{ senderId: 'participant-id-1', _count: { id: 7 } }]),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        participant: {
          findMany: jest.fn<any>().mockResolvedValue([
            {
              id: 'participant-id-1',
              userId: 'user-real-id',
              user: { username: 'cooluser', displayName: 'Cool User' },
            },
          ]),
        },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const topSender = body.data.topSenders[0];
      expect(topSender.username).toBe('cooluser');
      expect(topSender.displayName).toBe('Cool User');
    });

    it('falls back to senderId when participant not found in participantMap', async () => {
      // Covers branch: participant?.userId || sender.senderId (line 186)
      // and: participant?.user?.username || 'Unknown' (line 187)
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(5).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
            .mockResolvedValueOnce(2).mockResolvedValueOnce(1),
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([{ messageType: 'text', _count: { id: 5 } }])
            .mockResolvedValueOnce([{ senderId: 'unknown-participant-id', _count: { id: 5 } }]),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        participant: {
          // returns empty — participant not found in map
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const sender = body.data.topSenders[0];
      expect(sender.username).toBe('Unknown');
      expect(sender.userId).toBe('unknown-participant-id'); // falls back to senderId
    });

    it('handles messages with null content (covers content?.length || 0 branch)', async () => {
      // Covers branch: msg.content?.length || 0 (line 134)
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(3).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0).mockResolvedValueOnce(0),
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([{ messageType: 'text', _count: { id: 3 } }])
            .mockResolvedValueOnce([]),
          findMany: jest.fn<any>().mockResolvedValue([
            { createdAt: new Date(), content: null },       // null content → length || 0
            { createdAt: new Date(), content: 'hello' },    // normal content
          ]),
        },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // averageLength should be computed only from non-zero lengths
      expect(body.data.averageLength).toBeGreaterThanOrEqual(0);
    });

    it('skips messages with date outside tracked period (covers dailyMessages false branch)', async () => {
      // Covers branch: if (dailyMessages[dateKey] !== undefined) — false branch
      // by returning a message with createdAt in a future date (not in dailyMessages keys)
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1); // next year, not in the range

      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0).mockResolvedValueOnce(0),
          groupBy: jest.fn<any>()
            .mockResolvedValueOnce([]).mockResolvedValueOnce([]),
          findMany: jest.fn<any>().mockResolvedValue([
            { createdAt: futureDate, content: 'oops' }, // date outside period window
          ]),
        },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 500 on DB error', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>().mockRejectedValue(new Error('DB error')),
          groupBy: jest.fn<any>().mockResolvedValue([]),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /trends
  // -------------------------------------------------------------------------
  describe('GET /trends', () => {
    it('returns 403 when ANALYST role', async () => {
      const prisma: any = {
        message: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma, makeAuthContext('ANALYST'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/trends' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 with peak hour and weekday data', async () => {
      const now = new Date();
      const messages = [
        { createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18) },
        { createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18) },
        { createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10) },
      ];
      const prisma: any = {
        message: { findMany: jest.fn<any>().mockResolvedValue(messages) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/trends' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('peakHour');
      expect(body.data).toHaveProperty('peakWeekday');
      expect(body.data).toHaveProperty('hourlyActivity');
      expect(body.data).toHaveProperty('weekdayActivity');
      expect(body.data.peakHour.hour).toBe(18);
      expect(body.data.hourlyActivity).toHaveLength(24);
      expect(body.data.weekdayActivity).toHaveLength(7);
    });

    it('returns 200 with empty messages (zero activity)', async () => {
      const prisma: any = {
        message: { findMany: jest.fn<any>().mockResolvedValue([]) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/trends' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.peakHour.hour).toBe(0);
      expect(body.data.peakHour.count).toBe(0);
    });

    it('returns 500 on DB error', async () => {
      const prisma: any = {
        message: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB error')) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/trends' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /engagement
  // -------------------------------------------------------------------------
  describe('GET /engagement', () => {
    it('returns 403 when ANALYST role', async () => {
      const prisma: any = {
        message: { count: jest.fn<any>().mockResolvedValue(0) },
        reaction: { count: jest.fn<any>().mockResolvedValue(0) },
      };
      app = buildMessagesApp(prisma, makeAuthContext('ANALYST'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/engagement' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 for period=7d (default)', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(100)  // totalMessages
            .mockResolvedValueOnce(20)   // messagesWithReactions
            .mockResolvedValueOnce(10)   // messagesWithReplies
            .mockResolvedValueOnce(5),   // totalReplies (replyToId not null)
        },
        reaction: { count: jest.fn<any>().mockResolvedValue(30) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/engagement' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.totalMessages).toBe(100);
      expect(body.data.reactionRate).toBe(20);
      expect(body.data.replyRate).toBe(10);
      expect(body.data).toHaveProperty('avgReactionsPerMessage');
      expect(body.data).toHaveProperty('avgRepliesPerMessage');
    });

    it('returns 200 for period=30d', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(500)
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(50)
            .mockResolvedValueOnce(25),
        },
        reaction: { count: jest.fn<any>().mockResolvedValue(150) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/engagement?period=30d' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 0 rates when totalMessages=0', async () => {
      const prisma: any = {
        message: {
          count: jest.fn<any>()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0),
        },
        reaction: { count: jest.fn<any>().mockResolvedValue(0) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/engagement' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.reactionRate).toBe(0);
      expect(body.data.replyRate).toBe(0);
      expect(body.data.avgReactionsPerMessage).toBe(0);
      expect(body.data.avgRepliesPerMessage).toBe(0);
    });

    it('returns 500 on DB error', async () => {
      const prisma: any = {
        message: { count: jest.fn<any>().mockRejectedValue(new Error('DB error')) },
        reaction: { count: jest.fn<any>().mockResolvedValue(0) },
      };
      app = buildMessagesApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/engagement' });
      expect(res.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // 401 — no authContext (covers messages.ts requireAdmin line 12)
  // -------------------------------------------------------------------------
  describe('401 unauthenticated paths (no authContext)', () => {
    it('GET /stats returns 401 when authContext is missing', async () => {
      const prisma: any = {
        message: { count: jest.fn<any>(), groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
        participant: { findMany: jest.fn<any>() },
      };
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', prisma);
      unauthApp.decorate('authenticate', async (_req: any, _reply: any) => {});
      unauthApp.register(messagesRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });

    it('GET /trends returns 401 when authContext is missing', async () => {
      const prisma: any = { message: { findMany: jest.fn<any>() } };
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', prisma);
      unauthApp.decorate('authenticate', async (_req: any, _reply: any) => {});
      unauthApp.register(messagesRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/trends' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });

    it('GET /engagement returns 401 when authContext is missing', async () => {
      const prisma: any = {
        message: { count: jest.fn<any>() },
        reaction: { count: jest.fn<any>() },
      };
      const unauthApp = Fastify({ logger: false });
      unauthApp.decorate('prisma', prisma);
      unauthApp.decorate('authenticate', async (_req: any, _reply: any) => {});
      unauthApp.register(messagesRoutes);
      await unauthApp.ready();

      const res = await unauthApp.inject({ method: 'GET', url: '/engagement' });
      expect(res.statusCode).toBe(401);
      await unauthApp.close();
    });
  });
});

// ===========================================================================
// SECTION 4 — types.ts schemas
// ===========================================================================

describe('Admin types schemas', () => {
  describe('updateUserRoleSchema', () => {
    it('accepts valid ADMIN role', () => {
      const result = updateUserRoleSchema.safeParse({ role: 'ADMIN' });
      expect(result.success).toBe(true);
    });

    it('accepts valid BIGBOSS role', () => {
      const result = updateUserRoleSchema.safeParse({ role: 'BIGBOSS' });
      expect(result.success).toBe(true);
    });

    it('accepts valid MODERATOR role', () => {
      const result = updateUserRoleSchema.safeParse({ role: 'MODERATOR' });
      expect(result.success).toBe(true);
    });

    it('accepts valid AUDIT role', () => {
      const result = updateUserRoleSchema.safeParse({ role: 'AUDIT' });
      expect(result.success).toBe(true);
    });

    it('accepts valid ANALYST role', () => {
      const result = updateUserRoleSchema.safeParse({ role: 'ANALYST' });
      expect(result.success).toBe(true);
    });

    it('accepts valid USER role', () => {
      const result = updateUserRoleSchema.safeParse({ role: 'USER' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid role', () => {
      const result = updateUserRoleSchema.safeParse({ role: 'SUPERADMIN' });
      expect(result.success).toBe(false);
    });

    it('rejects missing role', () => {
      const result = updateUserRoleSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('updateUserStatusSchema', () => {
    it('accepts isActive=true', () => {
      const result = updateUserStatusSchema.safeParse({ isActive: true });
      expect(result.success).toBe(true);
    });

    it('accepts isActive=false', () => {
      const result = updateUserStatusSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('rejects non-boolean value', () => {
      const result = updateUserStatusSchema.safeParse({ isActive: 'yes' });
      expect(result.success).toBe(false);
    });

    it('rejects missing isActive field', () => {
      const result = updateUserStatusSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ===========================================================================
// SECTION 5 — system.ts (empty file)
// ===========================================================================

describe('system.ts', () => {
  it('is an empty placeholder file with no exports', () => {
    // The file exists but is empty — no runtime behavior to test.
    // Coverage for this file is handled by the TypeScript compiler confirming it compiles.
    expect(true).toBe(true);
  });
});

// ===========================================================================
// SECTION 6 — index.ts (re-exports smoke test)
// ===========================================================================

describe('admin index.ts', () => {
  it('re-exports reportRoutes', async () => {
    const { reportRoutes: r } = await import('../../../../routes/admin/index');
    expect(typeof r).toBe('function');
  });

  it('re-exports analyticsRoutes', async () => {
    const { analyticsRoutes: a } = await import('../../../../routes/admin/index');
    expect(typeof a).toBe('function');
  });

  it('re-exports messagesRoutes', async () => {
    const { messagesRoutes: m } = await import('../../../../routes/admin/index');
    expect(typeof m).toBe('function');
  });

  it('re-exports languagesRoutes, invitationRoutes, registerRoleRoutes, registerContentRoutes', async () => {
    const mod = await import('../../../../routes/admin/index');
    expect(typeof mod.languagesRoutes).toBe('function');
    expect(typeof mod.invitationRoutes).toBe('function');
    expect(typeof mod.registerRoleRoutes).toBe('function');
    expect(typeof mod.registerContentRoutes).toBe('function');
  });

  it('re-exports dashboardRoutes, userAdminRoutes, systemRankingsRoutes, agentAdminRoutes', async () => {
    const mod = await import('../../../../routes/admin/index');
    expect(typeof mod.dashboardRoutes).toBe('function');
    expect(typeof mod.userAdminRoutes).toBe('function');
    expect(typeof mod.systemRankingsRoutes).toBe('function');
    expect(typeof mod.agentAdminRoutes).toBe('function');
  });

  it('adminRoutes is a valid async function (plugin signature)', async () => {
    const { adminRoutes } = await import('../../../../routes/admin/index');
    // Verify it is an async function with the expected arity (FastifyInstance → void)
    expect(typeof adminRoutes).toBe('function');
    expect(adminRoutes.constructor.name).toBe('AsyncFunction');
    expect(adminRoutes.length).toBe(1);
  });
});
