import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports that reference these modules
// ---------------------------------------------------------------------------

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

// Flags to allow bypassing validation in specific tests
let bypassQueryValidation = false;
let bypassBodyValidation = false;
let bypassParamsValidation = false;

jest.mock('../../../../validation/helpers.js', () => ({
  validateQuery: (schema: any) => async (request: any, reply: any) => {
    if (bypassQueryValidation) return; // skip Zod validation
    try {
      const validated = await schema.parseAsync(request.query);
      request.query = validated;
    } catch (error: any) {
      if (error?.name === 'ZodError' || error?.errors) {
        return reply.status(400).send({
          success: false,
          message: 'Validation failed',
          errors: error.errors?.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code
          })) ?? []
        });
      }
      return reply.status(500).send({ success: false, message: 'Validation error' });
    }
  },
  validateBody: (schema: any) => async (request: any, reply: any) => {
    if (bypassBodyValidation) return; // skip Zod validation
    try {
      const validated = await schema.parseAsync(request.body);
      request.body = validated;
    } catch (error: any) {
      if (error?.name === 'ZodError' || error?.errors) {
        return reply.status(400).send({
          success: false,
          message: 'Validation failed',
          errors: error.errors?.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code
          })) ?? []
        });
      }
      return reply.status(500).send({ success: false, message: 'Validation error' });
    }
  },
  validateParams: (schema: any) => async (request: any, reply: any) => {
    if (bypassParamsValidation) return; // skip Zod validation
    try {
      const validated = await schema.parseAsync(request.params);
      request.params = validated;
    } catch (error: any) {
      if (error?.name === 'ZodError' || error?.errors) {
        return reply.status(400).send({
          success: false,
          message: 'Validation failed',
          errors: error.errors?.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code
          })) ?? []
        });
      }
      return reply.status(500).send({ success: false, message: 'Validation error' });
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { PermissionsService } from '../../../../routes/admin/services/PermissionsService';
import { dashboardRoutes } from '../../../../routes/admin/dashboard';
import { anonymousUsersAdminRoutes } from '../../../../routes/admin/anonymous-users';
import { registerRoleRoutes } from '../../../../routes/admin/roles';
import { invitationRoutes } from '../../../../routes/admin/invitations';
import { getCacheStore } from '../../../../services/CacheStore';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const makeAuthContext = (role = 'ADMIN') => ({
  isAuthenticated: true,
  registeredUser: {
    id: '507f1f77bcf86cd799439011',
    role,
    username: 'admin',
  },
});

const VALID_MONGO_ID = '507f1f77bcf86cd799439012';

// ---------------------------------------------------------------------------
// PermissionsService — direct unit tests (no Fastify)
// ---------------------------------------------------------------------------

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(() => {
    service = new PermissionsService();
  });

  // getUserPermissions
  describe('getUserPermissions', () => {
    it('returns full permissions for BIGBOSS', () => {
      const perms = service.getUserPermissions('BIGBOSS');
      expect(perms.canAccessAdmin).toBe(true);
      expect(perms.canManageUsers).toBe(true);
      expect(perms.canViewAuditLogs).toBe(true);
      expect(perms.canManageTranslations).toBe(true);
    });

    it('returns ADMIN permissions (no audit logs, no translations)', () => {
      const perms = service.getUserPermissions('ADMIN');
      expect(perms.canAccessAdmin).toBe(true);
      expect(perms.canManageUsers).toBe(true);
      expect(perms.canViewAuditLogs).toBe(false);
      expect(perms.canManageTranslations).toBe(false);
    });

    it('returns MODERATOR permissions (no manage users, no analytics)', () => {
      const perms = service.getUserPermissions('MODERATOR');
      expect(perms.canAccessAdmin).toBe(true);
      expect(perms.canManageUsers).toBe(false);
      expect(perms.canViewAnalytics).toBe(false);
      expect(perms.canModerateContent).toBe(true);
    });

    it('returns AUDIT permissions (analytics + audit logs, no management)', () => {
      const perms = service.getUserPermissions('AUDIT');
      expect(perms.canAccessAdmin).toBe(true);
      expect(perms.canManageUsers).toBe(false);
      expect(perms.canViewAnalytics).toBe(true);
      expect(perms.canViewAuditLogs).toBe(true);
    });

    it('returns ANALYST permissions (analytics only, no admin access)', () => {
      const perms = service.getUserPermissions('ANALYST');
      expect(perms.canAccessAdmin).toBe(false);
      expect(perms.canViewAnalytics).toBe(true);
      expect(perms.canManageUsers).toBe(false);
    });

    it('returns all-false permissions for USER', () => {
      const perms = service.getUserPermissions('USER');
      expect(perms.canAccessAdmin).toBe(false);
      expect(perms.canManageUsers).toBe(false);
      expect(perms.canViewAnalytics).toBe(false);
    });

    it('falls back to USER permissions for unknown role', () => {
      const perms = service.getUserPermissions('UNKNOWN' as any);
      expect(perms.canAccessAdmin).toBe(false);
      expect(perms.canManageUsers).toBe(false);
    });
  });

  // hasPermission
  describe('hasPermission', () => {
    it('returns true when BIGBOSS checks canViewAuditLogs', () => {
      expect(service.hasPermission('BIGBOSS', 'canViewAuditLogs')).toBe(true);
    });

    it('returns false when ADMIN checks canViewAuditLogs', () => {
      expect(service.hasPermission('ADMIN', 'canViewAuditLogs')).toBe(false);
    });

    it('returns true when MODERATOR checks canModerateContent', () => {
      expect(service.hasPermission('MODERATOR', 'canModerateContent')).toBe(true);
    });

    it('returns false when USER checks canAccessAdmin', () => {
      expect(service.hasPermission('USER', 'canAccessAdmin')).toBe(false);
    });
  });

  // canManageUser
  describe('canManageUser', () => {
    it('BIGBOSS can manage ADMIN', () => {
      expect(service.canManageUser('BIGBOSS', 'ADMIN')).toBe(true);
    });

    it('ADMIN can manage USER', () => {
      expect(service.canManageUser('ADMIN', 'USER')).toBe(true);
    });

    it('ADMIN cannot manage BIGBOSS', () => {
      expect(service.canManageUser('ADMIN', 'BIGBOSS')).toBe(false);
    });

    it('same role returns false (no self-management at same level)', () => {
      expect(service.canManageUser('ADMIN', 'ADMIN')).toBe(false);
    });

    it('USER cannot manage MODERATOR', () => {
      expect(service.canManageUser('USER', 'MODERATOR')).toBe(false);
    });
  });

  // getRoleLevel
  describe('getRoleLevel', () => {
    it('returns 7 for BIGBOSS', () => expect(service.getRoleLevel('BIGBOSS')).toBe(7));
    it('returns 5 for ADMIN', () => expect(service.getRoleLevel('ADMIN')).toBe(5));
    it('returns 4 for MODERATOR', () => expect(service.getRoleLevel('MODERATOR')).toBe(4));
    it('returns 3 for AUDIT', () => expect(service.getRoleLevel('AUDIT')).toBe(3));
    it('returns 2 for ANALYST', () => expect(service.getRoleLevel('ANALYST')).toBe(2));
    it('returns 1 for USER', () => expect(service.getRoleLevel('USER')).toBe(1));
    it('returns 0 for unknown role', () => expect(service.getRoleLevel('UNKNOWN' as any)).toBe(0));
  });
});

// ---------------------------------------------------------------------------
// dashboard.ts
// ---------------------------------------------------------------------------

describe('Admin dashboard routes', () => {
  const mockPrisma: any = {
    user: { count: jest.fn<any>() },
    participant: { count: jest.fn<any>() },
    message: { count: jest.fn<any>() },
    community: { count: jest.fn<any>() },
    conversationShareLink: { count: jest.fn<any>() },
    report: { count: jest.fn<any>() },
    communityMember: { count: jest.fn<any>() },
    conversation: { count: jest.fn<any>() },
  };

  function buildDashboardApp(role = 'ADMIN'): FastifyInstance {
    const app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('authenticate', async (request: any) => {
      request.authContext = makeAuthContext(role);
    });
    app.register(dashboardRoutes);
    return app;
  }

  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset getCacheStore mock to default (no cache)
    (getCacheStore as jest.Mock<any>).mockReturnValue({
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockResolvedValue(undefined),
      del: jest.fn<any>().mockResolvedValue(undefined),
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /dashboard', () => {
    it('returns 401 when authenticate sets no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // do NOT set authContext
      });
      noAuthApp.register(dashboardRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({ method: 'GET', url: '/dashboard' });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when user has USER role', async () => {
      app = buildDashboardApp('USER');
      await app.ready();
      const response = await app.inject({ method: 'GET', url: '/dashboard' });
      expect(response.statusCode).toBe(403);
    });

    it('returns 200 with cached data on cache hit', async () => {
      const cachedStats = JSON.stringify({
        statistics: { totalUsers: 42 },
        recentActivity: { newUsers: 5 }
      });
      (getCacheStore as jest.Mock<any>).mockReturnValue({
        get: jest.fn<any>().mockResolvedValue(cachedStats),
        set: jest.fn<any>().mockResolvedValue(undefined),
        del: jest.fn<any>().mockResolvedValue(undefined),
      });

      app = buildDashboardApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/dashboard' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.statistics.totalUsers).toBe(42);
      expect(body.data.userPermissions.role).toBe('ADMIN');
    });

    it('returns 200 with DB data on cache miss and stores in cache', async () => {
      // Set up mock to return a value for all 18 count calls
      let callCount = 0;
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.participant.count.mockResolvedValue(5);
      mockPrisma.message.count.mockResolvedValue(100);
      mockPrisma.community.count.mockResolvedValue(3);
      mockPrisma.conversationShareLink.count.mockResolvedValue(7);
      mockPrisma.report.count.mockResolvedValue(2);
      mockPrisma.communityMember.count.mockResolvedValue(15);
      mockPrisma.conversation.count.mockResolvedValue(8);

      const mockSet = jest.fn<any>().mockResolvedValue(undefined);
      (getCacheStore as jest.Mock<any>).mockReturnValue({
        get: jest.fn<any>().mockResolvedValue(null),
        set: mockSet,
        del: jest.fn<any>().mockResolvedValue(undefined),
      });

      app = buildDashboardApp('BIGBOSS');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/dashboard' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.statistics).toBeDefined();
      expect(body.data.recentActivity).toBeDefined();
      expect(body.data.userPermissions.canManageUsers).toBe(true);
      expect(mockSet).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when DB query throws', async () => {
      mockPrisma.user.count.mockRejectedValue(new Error('DB error'));

      app = buildDashboardApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/dashboard' });
      expect(response.statusCode).toBe(500);
    });
  });

  describe('POST /dashboard/invalidate-cache', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(dashboardRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when MODERATOR role (not BIGBOSS/ADMIN)', async () => {
      app = buildDashboardApp('MODERATOR');
      await app.ready();
      const response = await app.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 when AUDIT role', async () => {
      const auditApp = buildDashboardApp('AUDIT');
      await auditApp.ready();
      const response = await auditApp.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
      expect(response.statusCode).toBe(403);
      await auditApp.close();
    });

    it('returns 200 when ADMIN invalidates cache', async () => {
      const mockDel = jest.fn<any>().mockResolvedValue(undefined);
      (getCacheStore as jest.Mock<any>).mockReturnValue({
        get: jest.fn<any>().mockResolvedValue(null),
        set: jest.fn<any>().mockResolvedValue(undefined),
        del: mockDel,
      });

      app = buildDashboardApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
      expect(response.statusCode).toBe(200);
      expect(mockDel).toHaveBeenCalledWith('admin:dashboard:stats');
    });

    it('returns 200 when BIGBOSS invalidates cache', async () => {
      const mockDel = jest.fn<any>().mockResolvedValue(undefined);
      (getCacheStore as jest.Mock<any>).mockReturnValue({
        get: jest.fn<any>().mockResolvedValue(null),
        set: jest.fn<any>().mockResolvedValue(undefined),
        del: mockDel,
      });

      const bigbossApp = buildDashboardApp('BIGBOSS');
      await bigbossApp.ready();

      const response = await bigbossApp.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
      expect(response.statusCode).toBe(200);
      await bigbossApp.close();
    });

    it('returns 500 when del throws', async () => {
      (getCacheStore as jest.Mock<any>).mockReturnValue({
        get: jest.fn<any>().mockResolvedValue(null),
        set: jest.fn<any>().mockResolvedValue(undefined),
        del: jest.fn<any>().mockRejectedValue(new Error('Redis down')),
      });

      const adminApp = buildDashboardApp('ADMIN');
      await adminApp.ready();

      const response = await adminApp.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
      expect(response.statusCode).toBe(500);
      await adminApp.close();
    });
  });
});

// ---------------------------------------------------------------------------
// anonymous-users.ts
// ---------------------------------------------------------------------------

describe('Admin anonymous-users routes', () => {
  const mockPrisma: any = {
    participant: {
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
    },
  };

  function buildAnonApp(role = 'ADMIN'): FastifyInstance {
    const app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('authenticate', async (request: any) => {
      request.authContext = makeAuthContext(role);
    });
    app.register(anonymousUsersAdminRoutes);
    return app;
  }

  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.participant.findMany.mockResolvedValue([]);
    mockPrisma.participant.count.mockResolvedValue(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /anonymous-users', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(anonymousUsersAdminRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({ method: 'GET', url: '/anonymous-users' });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when USER role', async () => {
      app = buildAnonApp('USER');
      await app.ready();
      const response = await app.inject({ method: 'GET', url: '/anonymous-users' });
      expect(response.statusCode).toBe(403);
    });

    it('returns 200 with no filters (ADMIN)', async () => {
      const fakeUser = { id: VALID_MONGO_ID, displayName: 'Guest', isActive: true };
      mockPrisma.participant.findMany.mockResolvedValue([fakeUser]);
      mockPrisma.participant.count.mockResolvedValue(1);

      app = buildAnonApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/anonymous-users' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.anonymousUsers).toHaveLength(1);
      expect(body.data.pagination.total).toBe(1);
    });

    it('returns 200 with search filter applied', async () => {
      app = buildAnonApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/anonymous-users?search=guest'
      });
      expect(response.statusCode).toBe(200);

      // Check that findMany was called with the OR search filter
      const findManyCall = mockPrisma.participant.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.OR[0].displayName.contains).toBe('guest');
    });

    it('returns 200 with status=active filter', async () => {
      app = buildAnonApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/anonymous-users?status=active'
      });
      expect(response.statusCode).toBe(200);

      const findManyCall = mockPrisma.participant.findMany.mock.calls[0][0];
      expect(findManyCall.where.isActive).toBe(true);
    });

    it('returns 200 with status=inactive filter', async () => {
      app = buildAnonApp('AUDIT');
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/anonymous-users?status=inactive'
      });
      expect(response.statusCode).toBe(200);

      const findManyCall = mockPrisma.participant.findMany.mock.calls[0][0];
      expect(findManyCall.where.isActive).toBe(false);
    });

    it('returns 400 when status is invalid (schema validation)', async () => {
      app = buildAnonApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/anonymous-users?status=banned'
      });
      // Zod validation in preHandler rejects unknown status value
      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.participant.findMany.mockRejectedValue(new Error('DB error'));

      app = buildAnonApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/anonymous-users' });
      expect(response.statusCode).toBe(500);
    });

    it('uses default offset/limit when query params are absent (bypass schema defaults)', async () => {
      // Bypass Zod transform so default values '0' and '20' kick in
      bypassQueryValidation = true;
      app = buildAnonApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/anonymous-users' });
      expect(response.statusCode).toBe(200);

      const findManyCall = mockPrisma.participant.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(0);
      expect(findManyCall.take).toBe(20);

      bypassQueryValidation = false;
    });
  });
});

// ---------------------------------------------------------------------------
// roles.ts
// ---------------------------------------------------------------------------

describe('Admin role routes', () => {
  const mockPrisma: any = {
    user: {
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
    },
  };

  function buildRolesApp(role = 'ADMIN'): FastifyInstance {
    const app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('authenticate', async (request: any) => {
      request.authContext = makeAuthContext(role);
    });
    app.register(registerRoleRoutes);
    return app;
  }

  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (getCacheStore as jest.Mock<any>).mockReturnValue({
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockResolvedValue(undefined),
      del: jest.fn<any>().mockResolvedValue(undefined),
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // PATCH /users/:id/role
  // -------------------------------------------------------------------------

  describe('PATCH /users/:id/role', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(registerRoleRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'USER' }
      });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when role has no canAccessAdmin (ANALYST)', async () => {
      app = buildRolesApp('ANALYST');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'USER' }
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 when role has canAccessAdmin but not canManageUsers (MODERATOR)', async () => {
      app = buildRolesApp('MODERATOR');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: VALID_MONGO_ID,
        role: 'USER',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'USER' }
      });
      // MODERATOR has canAccessAdmin but not canManageUsers → 403 "Permission insuffisante"
      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when target user not found', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'USER' }
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 403 when ADMIN tries to change role of another ADMIN (same level)', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: VALID_MONGO_ID,
        role: 'ADMIN',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'USER' }
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      // Fastify schema serialization only exposes "message" for 403 responses (per schema)
      expect(body.message ?? body.error).toContain('modifier le role');
    });

    it('returns 403 when ADMIN tries to assign ADMIN role (cannot assign same-level role)', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      // Target user is USER (can be managed), but new role ADMIN cannot be assigned by ADMIN
      mockPrisma.user.findUnique.mockResolvedValue({
        id: VALID_MONGO_ID,
        role: 'USER',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'ADMIN' }
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.message ?? body.error).toContain('attribuer ce role');
    });

    it('returns 200 and updates role when valid (BIGBOSS changes USER to ADMIN)', async () => {
      app = buildRolesApp('BIGBOSS');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: VALID_MONGO_ID,
        role: 'USER',
      });

      const updatedUser = {
        id: VALID_MONGO_ID,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
        updatedAt: new Date().toISOString(),
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'ADMIN' }
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.role).toBe('ADMIN');
    });

    it('returns 400 for invalid role value via Zod', async () => {
      app = buildRolesApp('BIGBOSS');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'SUPERUSER' }
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when DB update throws', async () => {
      app = buildRolesApp('BIGBOSS');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: VALID_MONGO_ID,
        role: 'USER',
      });
      mockPrisma.user.update.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/role`,
        payload: { role: 'MODERATOR' }
      });
      expect(response.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /users/:id/status
  // -------------------------------------------------------------------------

  describe('PATCH /users/:id/status', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(registerRoleRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: true }
      });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when ANALYST role (no canAccessAdmin)', async () => {
      const analystApp = buildRolesApp('ANALYST');
      await analystApp.ready();

      const response = await analystApp.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: true }
      });
      expect(response.statusCode).toBe(403);
      await analystApp.close();
    });

    it('returns 403 when MODERATOR (canAccessAdmin but no canManageUsers)', async () => {
      const modApp = buildRolesApp('MODERATOR');
      await modApp.ready();

      mockPrisma.user.findUnique.mockResolvedValue({ id: VALID_MONGO_ID, role: 'USER' });

      const response = await modApp.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: true }
      });
      expect(response.statusCode).toBe(403);
      await modApp.close();
    });

    it('returns 404 when user not found', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: false }
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 403 when ADMIN cannot manage target (same/higher level)', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({ id: VALID_MONGO_ID, role: 'BIGBOSS' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: false }
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 200 with activate message when isActive=true', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({ id: VALID_MONGO_ID, role: 'USER' });
      mockPrisma.user.update.mockResolvedValue({
        id: VALID_MONGO_ID,
        username: 'testuser',
        isActive: true,
        deactivatedAt: null,
        updatedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: true }
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('active');
    });

    it('returns 200 with deactivate message when isActive=false', async () => {
      app = buildRolesApp('BIGBOSS');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({ id: VALID_MONGO_ID, role: 'ADMIN' });
      mockPrisma.user.update.mockResolvedValue({
        id: VALID_MONGO_ID,
        username: 'adminuser',
        isActive: false,
        deactivatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: false }
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('desactive');
    });

    it('returns 400 when isActive is not a boolean', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: 'yes' }
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when DB update throws', async () => {
      app = buildRolesApp('ADMIN');
      await app.ready();

      mockPrisma.user.findUnique.mockResolvedValue({ id: VALID_MONGO_ID, role: 'USER' });
      mockPrisma.user.update.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${VALID_MONGO_ID}/status`,
        payload: { isActive: false }
      });
      expect(response.statusCode).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// invitations.ts
// ---------------------------------------------------------------------------

describe('Admin invitation routes', () => {
  const mockPrisma: any = {
    friendRequest: {
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      count: jest.fn<any>(),
      update: jest.fn<any>(),
      groupBy: jest.fn<any>(),
    },
  };

  function buildInvApp(role = 'ADMIN'): FastifyInstance {
    const app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('authenticate', async (request: any) => {
      request.authContext = makeAuthContext(role);
    });
    // invitationRoutes is registered with a prefix in real app, but here we test raw paths
    app.register(invitationRoutes);
    return app;
  }

  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.friendRequest.findMany.mockResolvedValue([]);
    mockPrisma.friendRequest.count.mockResolvedValue(0);
    mockPrisma.friendRequest.groupBy.mockResolvedValue([]);
    mockPrisma.friendRequest.findUnique.mockResolvedValue(null);
    mockPrisma.friendRequest.update.mockResolvedValue({});
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(invitationRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when USER role', async () => {
      app = buildInvApp('USER');
      await app.ready();
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 when MODERATOR role (not in BIGBOSS/ADMIN)', async () => {
      const modApp = buildInvApp('MODERATOR');
      await modApp.ready();
      const response = await modApp.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(403);
      await modApp.close();
    });

    it('returns 200 with invitations list when no filters', async () => {
      const fakeFR = {
        id: VALID_MONGO_ID,
        senderId: '507f1f77bcf86cd799439013',
        receiverId: '507f1f77bcf86cd799439014',
        status: 'pending',
        message: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: { id: '507f1f77bcf86cd799439013', username: 'alice', displayName: 'Alice', avatar: null },
        receiver: { id: '507f1f77bcf86cd799439014', username: 'bob', displayName: 'Bob', avatar: null },
      };
      mockPrisma.friendRequest.findMany.mockResolvedValue([fakeFR]);
      mockPrisma.friendRequest.count.mockResolvedValue(1);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.invitations).toHaveLength(1);
      expect(body.data.invitations[0].type).toBe('friend');
      expect(body.data.pagination).toBeDefined();
    });

    it('returns 200 with status filter applied', async () => {
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/?status=pending' });
      expect(response.statusCode).toBe(200);

      const call = mockPrisma.friendRequest.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('pending');
    });

    it('returns 200 with communityId filter applied', async () => {
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: `/?communityId=${VALID_MONGO_ID}`
      });
      expect(response.statusCode).toBe(200);

      const call = mockPrisma.friendRequest.findMany.mock.calls[0][0];
      expect(call.where.communityId).toBe(VALID_MONGO_ID);
    });

    it('returns 400 when communityId is not a valid mongo id', async () => {
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/?communityId=invalid' });
      expect(response.statusCode).toBe(400);
    });

    it('returns 200 with senderId filter applied', async () => {
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: `/?senderId=${VALID_MONGO_ID}`
      });
      expect(response.statusCode).toBe(200);

      const call = mockPrisma.friendRequest.findMany.mock.calls[0][0];
      expect(call.where.senderId).toBe(VALID_MONGO_ID);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.friendRequest.findMany.mockRejectedValue(new Error('DB error'));

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /stats
  // -------------------------------------------------------------------------

  describe('GET /stats', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(invitationRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({ method: 'GET', url: '/stats' });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when MODERATOR role', async () => {
      const modApp = buildInvApp('MODERATOR');
      await modApp.ready();

      const response = await modApp.inject({ method: 'GET', url: '/stats' });
      expect(response.statusCode).toBe(403);
      await modApp.close();
    });

    it('returns 200 with computed acceptance rate and byType grouping', async () => {
      // Set up count mocks in order: total, pending, accepted, rejected, groupBy, recentCount
      mockPrisma.friendRequest.count
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(30)   // pending
        .mockResolvedValueOnce(60)   // accepted
        .mockResolvedValueOnce(10)   // rejected
        .mockResolvedValueOnce(15);  // recent (7 days)

      mockPrisma.friendRequest.groupBy.mockResolvedValue([
        { status: 'pending', _count: { id: 30 } },
        { status: 'accepted', _count: { id: 60 } },
        { status: 'rejected', _count: { id: 10 } },
      ]);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/stats' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(100);
      expect(body.data.accepted).toBe(60);
      expect(body.data.acceptanceRate).toBe(60);  // Math.round(60/100 * 100)
      expect(body.data.byType.pending).toBe(30);
      expect(body.data.byType.accepted).toBe(60);
      expect(body.data.recentInvitations).toBe(15);
    });

    it('returns acceptanceRate=0 when total invitations is 0', async () => {
      mockPrisma.friendRequest.count
        .mockResolvedValueOnce(0)  // total
        .mockResolvedValueOnce(0)  // pending
        .mockResolvedValueOnce(0)  // accepted
        .mockResolvedValueOnce(0)  // rejected
        .mockResolvedValueOnce(0); // recent

      mockPrisma.friendRequest.groupBy.mockResolvedValue([]);

      app = buildInvApp('BIGBOSS');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/stats' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.acceptanceRate).toBe(0);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.friendRequest.count.mockRejectedValue(new Error('DB error'));

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/stats' });
      expect(response.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------

  describe('GET /:id', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(invitationRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({ method: 'GET', url: `/${VALID_MONGO_ID}` });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when USER role', async () => {
      const userApp = buildInvApp('USER');
      await userApp.ready();
      const response = await userApp.inject({ method: 'GET', url: `/${VALID_MONGO_ID}` });
      expect(response.statusCode).toBe(403);
      await userApp.close();
    });

    it('returns 200 with invitation details when message is present', async () => {
      const fakeInv = {
        id: VALID_MONGO_ID,
        senderId: '507f1f77bcf86cd799439013',
        receiverId: '507f1f77bcf86cd799439014',
        status: 'pending',
        message: 'Hi!',
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: { id: '507f1f77bcf86cd799439013', username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', avatar: null, email: 'alice@test.com' },
        receiver: { id: '507f1f77bcf86cd799439014', username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'Jones', avatar: null, email: 'bob@test.com' },
      };
      mockPrisma.friendRequest.findUnique.mockResolvedValue(fakeInv);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: `/${VALID_MONGO_ID}` });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(VALID_MONGO_ID);
      expect(body.data.type).toBe('friend');
      expect(body.data.message).toBe('Hi!');
    });

    it('returns 200 with undefined message when invitation has null message', async () => {
      const fakeInv = {
        id: VALID_MONGO_ID,
        senderId: '507f1f77bcf86cd799439013',
        receiverId: '507f1f77bcf86cd799439014',
        status: 'accepted',
        message: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: { id: '507f1f77bcf86cd799439013', username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', avatar: null, email: 'alice@test.com' },
        receiver: { id: '507f1f77bcf86cd799439014', username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'Jones', avatar: null, email: 'bob@test.com' },
      };
      mockPrisma.friendRequest.findUnique.mockResolvedValue(fakeInv);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: `/${VALID_MONGO_ID}` });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // null message should become undefined (not included in JSON)
      expect(body.data.message).toBeUndefined();
    });

    it('returns 404 when invitation not found', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue(null);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: `/${VALID_MONGO_ID}` });
      expect(response.statusCode).toBe(404);
    });

    it('returns 400 when id is not a valid mongo id', async () => {
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/not-a-valid-id' });
      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.friendRequest.findUnique.mockRejectedValue(new Error('DB error'));

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: `/${VALID_MONGO_ID}` });
      expect(response.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /:id
  // -------------------------------------------------------------------------

  describe('PATCH /:id', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(invitationRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'accepted' }
      });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when MODERATOR role', async () => {
      const modApp = buildInvApp('MODERATOR');
      await modApp.ready();

      const response = await modApp.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'accepted' }
      });
      expect(response.statusCode).toBe(403);
      await modApp.close();
    });

    it('returns 200 when status set to accepted', async () => {
      const updatedInv = {
        id: VALID_MONGO_ID,
        status: 'accepted',
        sender: { id: '507f1f77bcf86cd799439013', username: 'alice', displayName: 'Alice' },
        receiver: { id: '507f1f77bcf86cd799439014', username: 'bob', displayName: 'Bob' },
      };
      mockPrisma.friendRequest.update.mockResolvedValue(updatedInv);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'accepted' }
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('acceptée');
    });

    it('returns 200 when status set to rejected', async () => {
      const updatedInv = {
        id: VALID_MONGO_ID,
        status: 'rejected',
        sender: { id: '507f1f77bcf86cd799439013', username: 'alice', displayName: 'Alice' },
        receiver: { id: '507f1f77bcf86cd799439014', username: 'bob', displayName: 'Bob' },
      };
      mockPrisma.friendRequest.update.mockResolvedValue(updatedInv);

      app = buildInvApp('BIGBOSS');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'rejected' }
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('rejetée');
    });

    it('returns 200 when status set to pending', async () => {
      const updatedInv = {
        id: VALID_MONGO_ID,
        status: 'pending',
        sender: { id: '507f1f77bcf86cd799439013', username: 'alice', displayName: 'Alice' },
        receiver: { id: '507f1f77bcf86cd799439014', username: 'bob', displayName: 'Bob' },
      };
      mockPrisma.friendRequest.update.mockResolvedValue(updatedInv);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'pending' }
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('mise à jour');
    });

    it('returns 400 when status is "cancelled" (invalid per UpdateInvitationBodySchema)', async () => {
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'cancelled' }
      });
      // validateBody rejects unknown enum value before handler is reached
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 from in-handler check when body validation bypassed with invalid status', async () => {
      // Bypass both body and params validation to let an invalid status reach the handler's
      // defensive guard (invitations.ts line 247-248)
      bypassBodyValidation = true;
      bypassParamsValidation = true;
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'cancelled' }
      });
      expect(response.statusCode).toBe(400);

      bypassBodyValidation = false;
      bypassParamsValidation = false;
    });

    it('returns 400 when id is invalid mongo id', async () => {
      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: '/bad-id',
        payload: { status: 'accepted' }
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when DB update throws', async () => {
      mockPrisma.friendRequest.update.mockRejectedValue(new Error('DB error'));

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({
        method: 'PATCH',
        url: `/${VALID_MONGO_ID}`,
        payload: { status: 'accepted' }
      });
      expect(response.statusCode).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /timeline/daily
  // -------------------------------------------------------------------------

  describe('GET /timeline/daily', () => {
    it('returns 401 when no authContext', async () => {
      const noAuthApp = Fastify({ logger: false });
      noAuthApp.decorate('prisma', mockPrisma);
      noAuthApp.decorate('authenticate', async (request: any) => {
        // no authContext
      });
      noAuthApp.register(invitationRoutes);
      await noAuthApp.ready();

      const response = await noAuthApp.inject({ method: 'GET', url: '/timeline/daily' });
      expect(response.statusCode).toBe(401);
      await noAuthApp.close();
    });

    it('returns 403 when MODERATOR role', async () => {
      const modApp = buildInvApp('MODERATOR');
      await modApp.ready();

      const response = await modApp.inject({ method: 'GET', url: '/timeline/daily' });
      expect(response.statusCode).toBe(403);
      await modApp.close();
    });

    it('returns 200 with 7 days of empty timeline when no invitations', async () => {
      mockPrisma.friendRequest.findMany.mockResolvedValue([]);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/timeline/daily' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(7);
      body.data.forEach((entry: any) => {
        expect(entry.sent).toBe(0);
        expect(entry.accepted).toBe(0);
        expect(entry.rejected).toBe(0);
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('returns 200 with aggregated counts per day when invitations exist', async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      mockPrisma.friendRequest.findMany.mockResolvedValue([
        { createdAt: today, status: 'accepted' },
        { createdAt: today, status: 'rejected' },
        { createdAt: today, status: 'pending' },
      ]);

      app = buildInvApp('BIGBOSS');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/timeline/daily' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const todayEntry = body.data.find((e: any) => e.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.sent).toBe(3);
      expect(todayEntry.accepted).toBe(1);
      expect(todayEntry.rejected).toBe(1);
    });

    it('ignores invitations with a date outside the 7-day dailyData window', async () => {
      // An invitation created 30 days ago won't match any key in dailyData (7 days)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);

      mockPrisma.friendRequest.findMany.mockResolvedValue([
        { createdAt: oldDate, status: 'accepted' },
      ]);

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/timeline/daily' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // All 7 days should show 0 since the old invitation doesn't match any daily bucket
      body.data.forEach((entry: any) => {
        expect(entry.sent).toBe(0);
      });
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.friendRequest.findMany.mockRejectedValue(new Error('DB error'));

      app = buildInvApp('ADMIN');
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/timeline/daily' });
      expect(response.statusCode).toBe(500);
    });
  });
});
