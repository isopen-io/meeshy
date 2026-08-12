/**
 * Tests for admin-permissions.middleware.ts
 *
 * Covers:
 * - createAdminPermissionMiddleware factory (auth checks + permission checks + custom error)
 * - Named permission middlewares (requireAdminAccess, requireUserViewPermission, etc.)
 * - requireRole (single role, array of roles, auth failures)
 * - canManageTargetUser (all branches)
 * - logAdminAction (success, no-auth, DB error)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockHasPermission = jest.fn() as jest.Mock<any>;
const mockCanManageUser = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/admin/permissions.service', () => ({
  permissionsService: {
    hasPermission: (...args: unknown[]) => mockHasPermission(...args),
    canManageUser: (...args: unknown[]) => mockCanManageUser(...args),
  },
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Import after mocks are registered
import {
  createAdminPermissionMiddleware,
  requireAdminAccess,
  requireUserViewPermission,
  requireUserManagePermission,
  requireCommunityManagePermission,
  requireConversationManagePermission,
  requireAnalyticsPermission,
  requireModerateContentPermission,
  requireAuditLogPermission,
  requireRole,
  canManageTargetUser,
  logAdminAction,
} from '../../../middleware/admin-permissions.middleware';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockReply() {
  const reply = {
    status: jest.fn<() => typeof reply>(),
    send: jest.fn<() => typeof reply>(),
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as any;
}

function createAuthContext(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isAnonymous: false,
    registeredUser: {
      id: 'admin-user-1',
      username: 'admin',
      email: 'admin@example.com',
      role: 'ADMIN',
    },
    ...overrides,
  };
}

function createMockRequest(authContext?: Record<string, unknown> | null) {
  return {
    authContext: authContext === undefined ? createAuthContext() : authContext,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    server: {
      prisma: {
        user: { findUnique: jest.fn() as jest.Mock<any> },
        adminAuditLog: { create: jest.fn() as jest.Mock<any> },
      },
    },
  } as any;
}

// ─── createAdminPermissionMiddleware ─────────────────────────────────────────

describe('createAdminPermissionMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when authContext is missing', async () => {
    const middleware = createAdminPermissionMiddleware('canAccessAdmin');
    const req = createMockRequest(null);
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns 401 when user is not authenticated', async () => {
    const middleware = createAdminPermissionMiddleware('canAccessAdmin');
    const req = createMockRequest({ isAuthenticated: false, isAnonymous: false, registeredUser: null });
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when user is anonymous', async () => {
    const middleware = createAdminPermissionMiddleware('canAccessAdmin');
    const req = createMockRequest({
      isAuthenticated: true,
      isAnonymous: true,
      registeredUser: { role: 'USER' },
    });
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when user lacks permission', async () => {
    mockHasPermission.mockReturnValue(false);
    const middleware = createAdminPermissionMiddleware('canAccessAdmin');
    const req = createMockRequest();
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('canAccessAdmin'),
      })
    );
  });

  it('returns 403 with custom error message when provided', async () => {
    mockHasPermission.mockReturnValue(false);
    const middleware = createAdminPermissionMiddleware('canAccessAdmin', 'Custom permission error');
    const req = createMockRequest();
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Custom permission error' })
    );
  });

  it('passes through when user has permission', async () => {
    mockHasPermission.mockReturnValue(true);
    const middleware = createAdminPermissionMiddleware('canAccessAdmin');
    const req = createMockRequest();
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});

// ─── Named permission middlewares ─────────────────────────────────────────────

describe('named permission middlewares', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
  });

  const namedMiddlewares = [
    { name: 'requireAdminAccess', fn: requireAdminAccess },
    { name: 'requireUserViewPermission', fn: requireUserViewPermission },
    { name: 'requireUserManagePermission', fn: requireUserManagePermission },
    { name: 'requireCommunityManagePermission', fn: requireCommunityManagePermission },
    { name: 'requireConversationManagePermission', fn: requireConversationManagePermission },
    { name: 'requireAnalyticsPermission', fn: requireAnalyticsPermission },
    { name: 'requireModerateContentPermission', fn: requireModerateContentPermission },
    { name: 'requireAuditLogPermission', fn: requireAuditLogPermission },
  ];

  for (const { name, fn } of namedMiddlewares) {
    it(`${name} allows request when hasPermission returns true`, async () => {
      const req = createMockRequest();
      const reply = createMockReply();

      await fn(req, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it(`${name} blocks request when not authenticated`, async () => {
      const req = createMockRequest(null);
      const reply = createMockReply();

      await fn(req, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  }
});

// ─── requireRole ──────────────────────────────────────────────────────────────

describe('requireRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const middleware = requireRole('ADMIN' as any);
    const req = createMockRequest(null);
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when user is anonymous', async () => {
    const middleware = requireRole('ADMIN' as any);
    const req = createMockRequest({
      isAuthenticated: true,
      isAnonymous: true,
      registeredUser: { role: 'ADMIN' },
    });
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when role is not in allowed roles (string)', async () => {
    const middleware = requireRole('BIGBOSS' as any);
    const req = createMockRequest(createAuthContext({ registeredUser: { id: '1', role: 'USER' } }));
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('BIGBOSS') })
    );
  });

  it('returns 403 when role is not in allowed roles (array)', async () => {
    const middleware = requireRole(['BIGBOSS', 'ADMIN'] as any);
    const req = createMockRequest(createAuthContext({ registeredUser: { id: '1', role: 'USER' } }));
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('passes when role matches single allowed role', async () => {
    const middleware = requireRole('ADMIN' as any);
    const req = createMockRequest(createAuthContext({ registeredUser: { id: '1', role: 'ADMIN' } }));
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('passes when role is in allowed roles array', async () => {
    const middleware = requireRole(['BIGBOSS', 'ADMIN'] as any);
    const req = createMockRequest(createAuthContext({ registeredUser: { id: '1', role: 'ADMIN' } }));
    const reply = createMockReply();

    await middleware(req, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});

// ─── canManageTargetUser ──────────────────────────────────────────────────────

describe('canManageTargetUser', () => {
  let mockUserFindUnique: jest.Mock<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique = jest.fn() as jest.Mock<any>;
  });

  it('returns canManage: false when not authenticated', async () => {
    const req = createMockRequest(null);

    const result = await canManageTargetUser(req, 'target-user-1');

    expect(result.canManage).toBe(false);
    expect(result.error).toContain('Authentication required');
  });

  it('returns canManage: false when target user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const req = createMockRequest();
    (req.server.prisma.user.findUnique as any) = mockUserFindUnique;

    const result = await canManageTargetUser(req, 'nonexistent-user');

    expect(result.canManage).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns canManage: false when lacking canManageUser permission', async () => {
    mockUserFindUnique.mockResolvedValue({ role: 'BIGBOSS' });
    mockCanManageUser.mockReturnValue(false);
    const req = createMockRequest();
    (req.server.prisma.user.findUnique as any) = mockUserFindUnique;

    const result = await canManageTargetUser(req, 'target-user-1');

    expect(result.canManage).toBe(false);
    expect(result.error).toContain('Insufficient permissions');
  });

  it('returns canManage: true when user can manage target', async () => {
    mockUserFindUnique.mockResolvedValue({ role: 'USER' });
    mockCanManageUser.mockReturnValue(true);
    const req = createMockRequest();
    (req.server.prisma.user.findUnique as any) = mockUserFindUnique;

    const result = await canManageTargetUser(req, 'target-user-1');

    expect(result.canManage).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns canManage: false when DB throws', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    const req = createMockRequest();
    (req.server.prisma.user.findUnique as any) = mockUserFindUnique;

    const result = await canManageTargetUser(req, 'target-user-1');

    expect(result.canManage).toBe(false);
    expect(result.error).toContain('Failed to verify');
  });
});

// ─── logAdminAction ───────────────────────────────────────────────────────────

describe('logAdminAction', () => {
  let mockAuditCreate: jest.Mock<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditCreate = (jest.fn() as jest.Mock<any>).mockResolvedValue({});
  });

  it('does nothing when not authenticated', async () => {
    const req = createMockRequest(null);
    (req.server.prisma.adminAuditLog.create as any) = mockAuditCreate;

    await logAdminAction(req, 'BAN_USER', 'User', 'user-123');

    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('creates audit log entry with required fields', async () => {
    const req = createMockRequest();
    (req.server.prisma.adminAuditLog.create as any) = mockAuditCreate;

    await logAdminAction(req, 'BAN_USER', 'User', 'user-123');

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BAN_USER',
        entity: 'User',
        entityId: 'user-123',
        adminId: 'admin-user-1',
        ipAddress: '127.0.0.1',
      }),
    });
  });

  it('serializes changes and metadata as JSON strings', async () => {
    const req = createMockRequest();
    (req.server.prisma.adminAuditLog.create as any) = mockAuditCreate;

    await logAdminAction(req, 'UPDATE_USER', 'User', 'user-123', { role: 'MODERATOR' }, { reason: 'promotion' });

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: JSON.stringify({ role: 'MODERATOR' }),
        metadata: JSON.stringify({ reason: 'promotion' }),
      }),
    });
  });

  it('uses null for missing changes and metadata', async () => {
    const req = createMockRequest();
    (req.server.prisma.adminAuditLog.create as any) = mockAuditCreate;

    await logAdminAction(req, 'VIEW_USER', 'User', 'user-123');

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ changes: null, metadata: null }),
    });
  });

  it('uses null for missing user-agent header', async () => {
    const req = createMockRequest();
    req.headers = {};
    (req.server.prisma.adminAuditLog.create as any) = mockAuditCreate;

    await logAdminAction(req, 'VIEW_USER', 'User', 'user-123');

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userAgent: null }),
    });
  });

  it('silently swallows DB errors (does not throw)', async () => {
    mockAuditCreate.mockRejectedValue(new Error('DB error'));
    const req = createMockRequest();
    (req.server.prisma.adminAuditLog.create as any) = mockAuditCreate;

    await expect(logAdminAction(req, 'BAN_USER', 'User', 'user-123')).resolves.toBeUndefined();
  });
});
