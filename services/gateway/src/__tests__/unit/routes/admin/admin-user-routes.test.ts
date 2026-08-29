import Fastify, { FastifyInstance } from 'fastify';

// ── Service mocks (must be hoisted before imports) ──────────────────────────
const mockUMS: Record<string, jest.Mock> = {
  getUsers: jest.fn(),
  getUserById: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  updateRole: jest.fn(),
  updateStatus: jest.fn(),
  resetPassword: jest.fn(),
  deleteUser: jest.fn(),
  unlockAccount: jest.fn(),
  enable2FA: jest.fn(),
  disable2FA: jest.fn(),
  verifyEmail: jest.fn(),
  verifyPhone: jest.fn(),
  toggleVoiceConsent: jest.fn(),
  verifyAge: jest.fn(),
};

const mockAudit: Record<string, jest.Mock> = {
  createAuditLog: jest.fn(),
  logViewUser: jest.fn(),
  logCreateUser: jest.fn(),
  logUpdateUser: jest.fn(),
  logUpdateRole: jest.fn(),
  logUpdateStatus: jest.fn(),
  logResetPassword: jest.fn(),
  logDeleteUser: jest.fn(),
};

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => mockUMS),
}));

jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => mockAudit),
}));

jest.mock('../../../../services/admin/user-sanitization.service', () => ({
  sanitizationService: {
    sanitizeUser: jest.fn((user: unknown) => user),
    sanitizeUsers: jest.fn((users: unknown) => users),
  },
}));

jest.mock('../../../../services/admin/permissions.service', () => ({
  permissionsService: {
    hasPermission: jest.fn().mockReturnValue(true),
    canManageUser: jest.fn().mockReturnValue(true),
    canModifyUser: jest.fn().mockReturnValue(true),
    canChangeRole: jest.fn().mockReturnValue(true),
    canViewPresence: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    del: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: (userId: string) => `auth:user:${userId}`,
  UnifiedAuthContext: {},
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/validation/admin-user', () => ({
  createUserValidationSchema: { parse: jest.fn((b: unknown) => b) },
  updateUserProfileValidationSchema: { parse: jest.fn((b: unknown) => b) },
  updateEmailValidationSchema: { parse: jest.fn((b: unknown) => b) },
  updateRoleValidationSchema: { parse: jest.fn((b: unknown) => b) },
  updateStatusValidationSchema: { parse: jest.fn((b: unknown) => b) },
  resetPasswordValidationSchema: { parse: jest.fn((b: unknown) => b) },
}));

// ── Now import after mocks ───────────────────────────────────────────────────
import { userAdminRoutes } from '../../../../routes/admin/users';
import { permissionsService } from '../../../../services/admin/permissions.service';
import { sanitizationService } from '../../../../services/admin/user-sanitization.service';
import * as adminUserValidation from '@meeshy/shared/types/validation/admin-user';
import { z } from 'zod';
import { UserManagementService } from '../../../../services/admin/user-management.service';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ── Shared fixtures ──────────────────────────────────────────────────────────
const mockUser = {
  id: 'user123',
  username: 'testuser',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'USER',
  isActive: true,
  emailVerified: new Date(),
  phoneVerified: null,
  twoFactorEnabled: null,
  avatar: null,
  createdAt: new Date('2024-01-01'),
  lastActiveAt: null,
};

const mockPrisma: Record<string, Record<string, jest.Mock>> = {
  conversationShareLink: { findMany: jest.fn() },
  trackingLink: { findMany: jest.fn() },
  affiliateToken: { findMany: jest.fn() },
  friendRequest: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  conversation: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  postMedia: { findMany: jest.fn(), count: jest.fn() },
  messageAttachment: { findMany: jest.fn(), count: jest.fn() },
  report: { findMany: jest.fn(), count: jest.fn() },
  participant: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  message: { findMany: jest.fn() },
};

const makeAuthContext = (role = 'ADMIN') => ({
  isAuthenticated: true,
  isAnonymous: false,
  registeredUser: { id: 'admin123', role, username: 'admin', email: 'admin@example.com' },
});

function buildApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(userAdminRoutes);
  return app;
}

function buildNoAuthApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (_request: unknown) => { /* no authContext */ });
  app.register(userAdminRoutes);
  return app;
}

function resetMocks() {
  jest.clearAllMocks();
  (permissionsService.hasPermission as jest.Mock).mockReturnValue(true);
  (permissionsService.canManageUser as jest.Mock).mockReturnValue(true);
  (permissionsService.canModifyUser as jest.Mock).mockReturnValue(true);
  (permissionsService.canChangeRole as jest.Mock).mockReturnValue(true);
  (permissionsService.canViewPresence as jest.Mock).mockReturnValue(true);
  (sanitizationService.sanitizeUser as jest.Mock).mockImplementation((u: unknown) => u);
  (sanitizationService.sanitizeUsers as jest.Mock).mockImplementation((u: unknown) => u);

  mockAudit.createAuditLog.mockResolvedValue(undefined);
  mockAudit.logViewUser.mockResolvedValue(undefined);
  mockAudit.logCreateUser.mockResolvedValue(undefined);
  mockAudit.logUpdateUser.mockResolvedValue(undefined);
  mockAudit.logUpdateRole.mockResolvedValue(undefined);
  mockAudit.logUpdateStatus.mockResolvedValue(undefined);
  mockAudit.logResetPassword.mockResolvedValue(undefined);
  mockAudit.logDeleteUser.mockResolvedValue(undefined);

  // `requireHierarchy` (#4154) lit le RANG de la cible en base : sans ce
  // défaut, le double rend `undefined`, la garde échoue FERMÉ et tous les
  // témoins d'écriture liraient 403 pour une raison qui n'est pas la leur.
  mockPrisma.user.findUnique.mockResolvedValue({ role: mockUser.role } as never);

  mockUMS.getUsers.mockResolvedValue({ users: [], total: 0 });
  mockUMS.getUserById.mockResolvedValue(mockUser);
  mockUMS.createUser.mockResolvedValue(mockUser);
  mockUMS.updateUser.mockResolvedValue(mockUser);
  mockUMS.updateRole.mockResolvedValue(mockUser);
  mockUMS.updateStatus.mockResolvedValue(mockUser);
  mockUMS.resetPassword.mockResolvedValue(mockUser);
  mockUMS.deleteUser.mockResolvedValue(undefined);
  mockUMS.unlockAccount.mockResolvedValue(mockUser);
  mockUMS.enable2FA.mockResolvedValue(mockUser);
  mockUMS.disable2FA.mockResolvedValue(mockUser);
  mockUMS.verifyEmail.mockResolvedValue(mockUser);
  mockUMS.verifyPhone.mockResolvedValue(mockUser);
  mockUMS.toggleVoiceConsent.mockResolvedValue(mockUser);
  mockUMS.verifyAge.mockResolvedValue(mockUser);

  (adminUserValidation.createUserValidationSchema.parse as jest.Mock).mockImplementation((b: unknown) => b);
  (adminUserValidation.updateUserProfileValidationSchema.parse as jest.Mock).mockImplementation((b: unknown) => b);
  (adminUserValidation.updateRoleValidationSchema.parse as jest.Mock).mockImplementation((b: unknown) => b);
  (adminUserValidation.updateStatusValidationSchema.parse as jest.Mock).mockImplementation((b: unknown) => b);
  (adminUserValidation.resetPasswordValidationSchema.parse as jest.Mock).mockImplementation((b: unknown) => b);

  mockPrisma.conversationShareLink.findMany.mockResolvedValue([]);
  mockPrisma.trackingLink.findMany.mockResolvedValue([]);
  mockPrisma.affiliateToken.findMany.mockResolvedValue([]);
  mockPrisma.friendRequest.findMany.mockResolvedValue([]);
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'user123' });
  mockPrisma.conversation.findMany.mockResolvedValue([]);
  mockPrisma.conversation.findUnique.mockResolvedValue({ id: 'conv123' });
  mockPrisma.conversation.count.mockResolvedValue(0);
  mockPrisma.postMedia.findMany.mockResolvedValue([]);
  mockPrisma.postMedia.count.mockResolvedValue(0);
  mockPrisma.messageAttachment.findMany.mockResolvedValue([]);
  mockPrisma.messageAttachment.count.mockResolvedValue(0);
  mockPrisma.report.findMany.mockResolvedValue([]);
  mockPrisma.report.count.mockResolvedValue(0);
  mockPrisma.participant.findMany.mockResolvedValue([]);
  mockPrisma.participant.count.mockResolvedValue(0);
  mockPrisma.message.findMany.mockResolvedValue([]);
}

// ── GET /admin/users ─────────────────────────────────────────────────────────
describe('GET /admin/users', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 401 when no authContext is set', async () => {
    const noAuth = buildNoAuthApp();
    await noAuth.ready();
    const res = await noAuth.inject({ method: 'GET', url: '/admin/users' });
    await noAuth.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when hasPermission is false', async () => {
    (permissionsService.hasPermission as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with users list', async () => {
    mockUMS.getUsers.mockResolvedValue({ users: [mockUser], total: 1 });
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('passes filters to getUsers', async () => {
    await app.inject({
      method: 'GET',
      url: '/admin/users?search=foo&role=USER&sortBy=username&sortOrder=asc'
    });
    expect(mockUMS.getUsers).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'foo', role: 'USER', sortBy: 'username', sortOrder: 'asc' }),
      expect.any(Object)
    );
  });

  // Directive produit 2026-08-25 (revue adversariale F4) : une SÉLECTION ou un
  // ORDRE qui dépend de lastActiveAt révèle la présence autant que le champ.
  // Sans canViewPresence, les bornes sont IGNORÉES en silence (jamais 403,
  // qui confirmerait l'existence du filtre) et le tri retombe sur createdAt.
  describe('presence-gated filters and sort (canViewPresence)', () => {
    const presenceQuery = '/admin/users?lastActiveAfter=2026-08-01T00:00:00.000Z&lastActiveBefore=2026-08-25T00:00:00.000Z&sortBy=lastActiveAt&sortOrder=asc';
    const forwardedFilters = () => mockUMS.getUsers.mock.calls[0][0] as Record<string, unknown>;

    it('forwards lastActiveAfter/lastActiveBefore and sortBy=lastActiveAt when the viewer can view presence', async () => {
      const res = await app.inject({ method: 'GET', url: presenceQuery });
      expect(res.statusCode).toBe(200);
      expect(forwardedFilters()).toEqual(expect.objectContaining({
        lastActiveAfter: new Date('2026-08-01T00:00:00.000Z'),
        lastActiveBefore: new Date('2026-08-25T00:00:00.000Z'),
        sortBy: 'lastActiveAt',
        sortOrder: 'asc',
      }));
    });

    it('silently drops lastActiveAfter/lastActiveBefore when the viewer cannot view presence', async () => {
      (permissionsService.canViewPresence as jest.Mock).mockReturnValue(false);
      const res = await app.inject({ method: 'GET', url: presenceQuery });
      expect(res.statusCode).toBe(200);
      expect(mockUMS.getUsers).toHaveBeenCalledTimes(1);
      expect(forwardedFilters().lastActiveAfter).toBeUndefined();
      expect(forwardedFilters().lastActiveBefore).toBeUndefined();
    });

    it('falls sortBy=lastActiveAt back to createdAt when the viewer cannot view presence', async () => {
      (permissionsService.canViewPresence as jest.Mock).mockReturnValue(false);
      const res = await app.inject({ method: 'GET', url: presenceQuery });
      expect(res.statusCode).toBe(200);
      expect(forwardedFilters()).toEqual(expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'asc' }));
    });

    it('falls sortBy=isOnline back to createdAt when the viewer cannot view presence', async () => {
      (permissionsService.canViewPresence as jest.Mock).mockReturnValue(false);
      const res = await app.inject({ method: 'GET', url: '/admin/users?sortBy=isOnline' });
      expect(res.statusCode).toBe(200);
      expect(forwardedFilters()).toEqual(expect.objectContaining({ sortBy: 'createdAt' }));
    });

    it('keeps a non-presence sortBy untouched when the viewer cannot view presence', async () => {
      (permissionsService.canViewPresence as jest.Mock).mockReturnValue(false);
      await app.inject({ method: 'GET', url: '/admin/users?sortBy=username' });
      expect(forwardedFilters()).toEqual(expect.objectContaining({ sortBy: 'username' }));
    });

    it('asks canViewPresence with the viewer role', async () => {
      const moderatorApp = buildApp('MODERATOR');
      await moderatorApp.ready();
      await moderatorApp.inject({ method: 'GET', url: presenceQuery });
      await moderatorApp.close();
      expect(permissionsService.canViewPresence).toHaveBeenCalledWith('MODERATOR');
    });
  });

  it('returns 500 when getUsers throws', async () => {
    mockUMS.getUsers.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /admin/users/:userId ─────────────────────────────────────────────────
describe('GET /admin/users/:userId', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 401 when no authContext', async () => {
    const noAuth = buildNoAuthApp();
    await noAuth.ready();
    const res = await noAuth.inject({ method: 'GET', url: '/admin/users/user123' });
    await noAuth.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when hasPermission is false', async () => {
    (permissionsService.hasPermission as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with user data', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/users/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when getUserById throws', async () => {
    mockUMS.getUserById.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users ────────────────────────────────────────────────────────
describe('POST /admin/users', () => {
  let app: FastifyInstance;
  const validBody = { username: 'newuser', email: 'new@example.com', password: 'Pass1234!' };

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 401 when no authContext', async () => {
    const noAuth = buildNoAuthApp();
    await noAuth.ready();
    const res = await noAuth.inject({ method: 'POST', url: '/admin/users', payload: validBody });
    await noAuth.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when hasPermission (modify) is false', async () => {
    (permissionsService.hasPermission as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: validBody });
    expect(res.statusCode).toBe(403);
  });

  it('returns 201 on happy path (no role in body)', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: validBody });
    expect(res.statusCode).toBe(201);
  });

  it('returns 201 when role in body and canManageUser is true', async () => {
    const bodyWithRole = { ...validBody, role: 'USER' };
    (adminUserValidation.createUserValidationSchema.parse as jest.Mock).mockReturnValue(bodyWithRole);
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: bodyWithRole });
    expect(res.statusCode).toBe(201);
  });

  it('returns 403 when role in body and canManageUser is false', async () => {
    const bodyWithRole = { ...validBody, role: 'ADMIN' };
    (adminUserValidation.createUserValidationSchema.parse as jest.Mock).mockReturnValue(bodyWithRole);
    (permissionsService.canManageUser as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: bodyWithRole });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when validation schema throws ZodError', async () => {
    (adminUserValidation.createUserValidationSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new z.ZodError([{ code: 'custom', message: 'Invalid', path: ['email'] }]);
    });
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when createUser throws', async () => {
    mockUMS.createUser.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: validBody });
    expect(res.statusCode).toBe(500);
  });
});

// ── PATCH /admin/users/:userId ───────────────────────────────────────────────
describe('PATCH /admin/users/:userId', () => {
  let app: FastifyInstance;
  const validBody = { displayName: 'Updated Name' };

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 403 when hasPermission is false', async () => {
    (permissionsService.hasPermission as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123', payload: validBody });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on happy path', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123', payload: validBody });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123', payload: validBody });
    expect(res.statusCode).toBe(404);
  });

  // La loi de ROUTE (`canModifyUser`) a cédé la place à DEUX questions posées
  // séparément (#4154) : la permission du CHAMP, et le RANG de la cible.
  // Un témoin qui n'exercerait que la première ne verrait pas l'escalade.
  it('returns 403 when the caller does not outrank the target', async () => {
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123', payload: validBody });
    expect(res.statusCode).toBe(403);
    expect(mockUMS.updateUser).not.toHaveBeenCalled();
  });

  it('returns 400 for a field that carries no law', async () => {
    // Fail-closed sur l'inconnu : un champ absent de `LOI_PAR_CHAMP` n'est pas
    // écrit sous une loi par défaut, il est REFUSÉ. C'est cette branche-là qui
    // ferme la classe, pas la correction des champs connus.
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/users/user123',
      payload: { password: 'contournement' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockUMS.updateUser).not.toHaveBeenCalled();
  });

  it('returns 400 when validation throws ZodError', async () => {
    (adminUserValidation.updateUserProfileValidationSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new z.ZodError([{ code: 'custom', message: 'Invalid', path: ['displayName'] }]);
    });
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123', payload: validBody });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when updateUser throws', async () => {
    mockUMS.updateUser.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123', payload: validBody });
    expect(res.statusCode).toBe(500);
  });
});

// ── PATCH /admin/users/:userId/role ─────────────────────────────────────────
describe('PATCH /admin/users/:userId/role', () => {
  let app: FastifyInstance;
  const validBody = { role: 'USER' };

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 on happy path', async () => {
    (adminUserValidation.updateRoleValidationSchema.parse as jest.Mock).mockReturnValue(validBody);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/role', payload: validBody });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/role', payload: validBody });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when canChangeRole is false', async () => {
    (permissionsService.canChangeRole as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/role', payload: validBody });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when validation throws ZodError', async () => {
    (adminUserValidation.updateRoleValidationSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new z.ZodError([{ code: 'custom', message: 'Invalid', path: ['role'] }]);
    });
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/role', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when updateRole throws', async () => {
    mockUMS.updateRole.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/role', payload: validBody });
    expect(res.statusCode).toBe(500);
  });
});

// ── PATCH /admin/users/:userId/status ───────────────────────────────────────
describe('PATCH /admin/users/:userId/status', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 with isActive=true (activated)', async () => {
    (adminUserValidation.updateStatusValidationSchema.parse as jest.Mock).mockReturnValue({ isActive: true });
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/status', payload: { isActive: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('activated');
  });

  it('returns 200 with isActive=false (deactivated)', async () => {
    (adminUserValidation.updateStatusValidationSchema.parse as jest.Mock).mockReturnValue({ isActive: false });
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/status', payload: { isActive: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('deactivated');
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/status', payload: { isActive: true } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the caller does not outrank the target', async () => {
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/status', payload: { isActive: true } });
    expect(res.statusCode).toBe(403);
    expect(mockUMS.updateStatus).not.toHaveBeenCalled();
  });

  it('returns 400 when isActive is not a boolean', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/status', payload: { isActive: 'peut-etre' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when updateStatus throws', async () => {
    mockUMS.updateStatus.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'PATCH', url: '/admin/users/user123/status', payload: { isActive: true } });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/reset-password ─────────────────────────────────
describe('POST /admin/users/:userId/reset-password', () => {
  let app: FastifyInstance;
  const validBody = { newPassword: 'NewPass123!' };

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 on happy path', async () => {
    (adminUserValidation.resetPasswordValidationSchema.parse as jest.Mock).mockReturnValue(validBody);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/reset-password', payload: validBody });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/reset-password', payload: validBody });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when canModifyUser is false', async () => {
    (permissionsService.canModifyUser as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/reset-password', payload: validBody });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when validation throws ZodError', async () => {
    (adminUserValidation.resetPasswordValidationSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new z.ZodError([{ code: 'custom', message: 'Invalid', path: ['newPassword'] }]);
    });
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/reset-password', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when resetPassword throws', async () => {
    mockUMS.resetPassword.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/reset-password', payload: validBody });
    expect(res.statusCode).toBe(500);
  });
});

// ── DELETE /admin/users/:userId ──────────────────────────────────────────────
describe('DELETE /admin/users/:userId', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 401 when no authContext', async () => {
    const noAuth = buildNoAuthApp();
    await noAuth.ready();
    const res = await noAuth.inject({ method: 'DELETE', url: '/admin/users/user123' });
    await noAuth.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when hasPermission (delete) is false', async () => {
    (permissionsService.hasPermission as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on happy path', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when canModifyUser is false', async () => {
    (permissionsService.canModifyUser as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when deleteUser throws', async () => {
    mockUMS.deleteUser.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123' });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/unlock ─────────────────────────────────────────
describe('POST /admin/users/:userId/unlock', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 on happy path', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/unlock' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ message: 'Account unlocked successfully' });
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/unlock' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when unlockAccount throws', async () => {
    mockUMS.unlockAccount.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/unlock' });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/enable-2fa ─────────────────────────────────────
describe('POST /admin/users/:userId/enable-2fa', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 on happy path', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/enable-2fa' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ message: '2FA enabled successfully' });
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/enable-2fa' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when enable2FA throws', async () => {
    mockUMS.enable2FA.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/enable-2fa' });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/disable-2fa ────────────────────────────────────
describe('POST /admin/users/:userId/disable-2fa', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 on happy path', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/disable-2fa' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ message: '2FA disabled successfully' });
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/disable-2fa' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when disable2FA throws', async () => {
    mockUMS.disable2FA.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/disable-2fa' });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/verify-email ───────────────────────────────────
describe('POST /admin/users/:userId/verify-email', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 with verified=true', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-email', payload: { verified: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Email verified');
  });

  it('returns 200 with verified=false (unverify branch)', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-email', payload: { verified: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Email unverified');
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-email', payload: { verified: true } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the caller does not outrank the target', async () => {
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-email', payload: { verified: true } });
    expect(res.statusCode).toBe(403);
    expect(mockUMS.verifyEmail).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid body (local Zod schema)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/verify-email',
      payload: { verified: 'not-a-boolean' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when verifyEmail throws', async () => {
    mockUMS.verifyEmail.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-email', payload: { verified: true } });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/verify-phone ───────────────────────────────────
describe('POST /admin/users/:userId/verify-phone', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 with verified=true', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-phone', payload: { verified: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Phone verified');
  });

  it('returns 200 with verified=false (unverify branch)', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-phone', payload: { verified: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Phone unverified');
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-phone', payload: { verified: true } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the caller does not outrank the target', async () => {
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-phone', payload: { verified: true } });
    expect(res.statusCode).toBe(403);
    expect(mockUMS.verifyPhone).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid body (local Zod schema)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/verify-phone',
      payload: { verified: 'not-a-boolean' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when verifyPhone throws', async () => {
    mockUMS.verifyPhone.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-phone', payload: { verified: true } });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/voice-consent ──────────────────────────────────
//
// L'adresse historique du consentement PASSE désormais par la loi SOUVERAINE
// (#4154) : poser au nom d'autrui la preuve qu'il a consenti à l'usage de sa
// voix fabrique une pièce légale. Elle coûte le rang le plus haut ET un motif
// écrit. C'est le seul alias dont le CONTRAT change — il existe pour ne pas
// rendre 404, pas pour conserver une porte que l'issue ferme.
describe('POST /admin/users/:userId/voice-consent', () => {
  let appSouverain: FastifyInstance;
  let appAdmin: FastifyInstance;
  const MOTIF = 'demande RGPD ecrite du 2026-08-29';

  beforeAll(async () => {
    resetMocks();
    appSouverain = buildApp('BIGBOSS');
    appAdmin = buildApp('ADMIN');
    await appSouverain.ready();
    await appAdmin.ready();
  });
  afterAll(async () => { await appSouverain.close(); await appAdmin.close(); });
  beforeEach(resetMocks);

  it('returns 200 with enabled=true (enabled branch)', async () => {
    const res = await appSouverain.inject({
      method: 'POST',
      url: '/admin/users/user123/voice-consent',
      payload: { consentType: 'voiceProfile', enabled: true, reason: MOTIF }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('enabled');
  });

  it('returns 200 with enabled=false (disabled branch)', async () => {
    const res = await appSouverain.inject({
      method: 'POST',
      url: '/admin/users/user123/voice-consent',
      payload: { consentType: 'voiceData', enabled: false, reason: MOTIF }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('disabled');
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await appSouverain.inject({
      method: 'POST',
      url: '/admin/users/user123/voice-consent',
      payload: { consentType: 'voiceProfile', enabled: true, reason: MOTIF }
    });
    expect(res.statusCode).toBe(404);
  });

  it('refuse un ADMIN — le rang souverain ne se délègue pas par une permission', async () => {
    // `hasPermission` rend `true` dans ce double : si la garde passait par la
    // matrice, ce témoin ne tomberait pas. Elle interroge le RANG, que rien
    // dans le double ne peut accorder.
    const res = await appAdmin.inject({
      method: 'POST',
      url: '/admin/users/user123/voice-consent',
      payload: { consentType: 'voiceProfile', enabled: true, reason: MOTIF }
    });
    expect(res.statusCode).toBe(403);
    expect(mockUMS.toggleVoiceConsent).not.toHaveBeenCalled();
  });

  it('refuse un souverain SANS motif écrit — la trace est une condition, pas un ornement', async () => {
    const res = await appSouverain.inject({
      method: 'POST',
      url: '/admin/users/user123/voice-consent',
      payload: { consentType: 'voiceProfile', enabled: true }
    });
    expect(res.statusCode).toBe(400);
    expect(mockUMS.toggleVoiceConsent).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid consentType (aucune loi ne porte ce champ)', async () => {
    const res = await appSouverain.inject({
      method: 'POST',
      url: '/admin/users/user123/voice-consent',
      payload: { consentType: 'invalid_type', enabled: true, reason: MOTIF }
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when toggleVoiceConsent throws', async () => {
    mockUMS.toggleVoiceConsent.mockRejectedValue(new Error('DB error'));
    const res = await appSouverain.inject({
      method: 'POST',
      url: '/admin/users/user123/voice-consent',
      payload: { consentType: 'voiceProfile', enabled: true, reason: MOTIF }
    });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /admin/users/:userId/verify-age ─────────────────────────────────────
describe('POST /admin/users/:userId/verify-age', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 with verified=true (age verified branch)', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-age', payload: { verified: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Age verified');
  });

  it('returns 200 with verified=false (age unverified branch)', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-age', payload: { verified: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Age unverified');
  });

  it('refuse un corps VIDE — un PATCH qui n’écrit rien n’est pas un succès', async () => {
    // L'ancien schéma local déclarait tous ses champs optionnels : la route
    // rendait donc 200 en n'écrivant RIEN, et le client ne pouvait pas
    // distinguer « c'est fait » de « je n'ai rien compris à ta demande ».
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-age', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(mockUMS.verifyAge).not.toHaveBeenCalled();
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-age', payload: { verified: true } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the caller does not outrank the target', async () => {
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-age', payload: { verified: true } });
    expect(res.statusCode).toBe(403);
    expect(mockUMS.verifyAge).not.toHaveBeenCalled();
  });

  it('returns 400 when the body names no verification at all', async () => {
    // `isAdult` n'a JAMAIS été un champ de vérification : le schéma local
    // l'acceptait, la route ne l'écrivait nulle part. Traduit vers la loi des
    // champs, un tel corps ne présente aucun champ — et un PATCH qui n'écrit
    // rien est une requête malformée, pas un succès silencieux.
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/verify-age',
      payload: { isAdult: 'not-a-boolean' }
    });
    expect(res.statusCode).toBe(400);
    expect(mockUMS.verifyAge).not.toHaveBeenCalled();
  });

  it('returns 500 when verifyAge throws', async () => {
    mockUMS.verifyAge.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/verify-age', payload: { verified: true } });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /admin/users/:userId/activity ────────────────────────────────────────
describe('GET /admin/users/:userId/activity', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 200 with all activity data', async () => {
    const shareLink = { id: 'sl1', linkId: 'link1', conversation: { id: 'c1', identifier: 'conv1' } };
    const trackingLink = { id: 'tl1', token: 'tok1' };
    const affiliateToken = { id: 'at1', token: 'aff1', _count: { affiliations: 3 } };
    const friendReq = { id: 'fr1', status: 'PENDING' };

    mockPrisma.conversationShareLink.findMany.mockResolvedValue([shareLink]);
    mockPrisma.trackingLink.findMany.mockResolvedValue([trackingLink]);
    mockPrisma.affiliateToken.findMany.mockResolvedValue([affiliateToken]);
    mockPrisma.friendRequest.findMany.mockResolvedValueOnce([friendReq]).mockResolvedValueOnce([]);
    mockPrisma.participant.groupBy.mockResolvedValue([{ shareLinkId: 'sl1', _count: { _all: 2 } }]);

    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/activity' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ shareLinks: [shareLink], trackingLinks: [trackingLink] });
  });

  it('attaches _count.anonymousParticipants to each share link (unified Participant model)', async () => {
    const shareLinks = [
      { id: 'sl1', linkId: 'link1', conversation: null },
      { id: 'sl2', linkId: 'link2', conversation: null },
    ];
    mockPrisma.conversationShareLink.findMany.mockResolvedValue(shareLinks);
    mockPrisma.trackingLink.findMany.mockResolvedValue([]);
    mockPrisma.affiliateToken.findMany.mockResolvedValue([]);
    mockPrisma.friendRequest.findMany.mockResolvedValue([]);
    mockPrisma.participant.groupBy.mockResolvedValue([{ shareLinkId: 'sl1', _count: { _all: 4 } }]);

    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/activity' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.shareLinks[0]._count).toEqual({ anonymousParticipants: 4 });
    expect(body.data.shareLinks[1]._count).toEqual({ anonymousParticipants: 0 });
    expect(mockPrisma.participant.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['shareLinkId'],
        where: expect.objectContaining({
          shareLinkId: { in: ['sl1', 'sl2'] },
          type: 'anonymous',
        }),
      })
    );
  });

  it('skips the participant count query when the user has no share links', async () => {
    mockPrisma.conversationShareLink.findMany.mockResolvedValue([]);
    mockPrisma.trackingLink.findMany.mockResolvedValue([]);
    mockPrisma.affiliateToken.findMany.mockResolvedValue([]);
    mockPrisma.friendRequest.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/activity' });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.participant.groupBy).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.conversationShareLink.findMany.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/activity' });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /admin/users/:userId/conversations ───────────────────────────────────
describe('GET /admin/users/:userId/conversations', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/conversations' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with conversations', async () => {
    // `_count` et non la colonne `memberCount` : celle-ci n'est écrite par
    // personne, l'écran admin affichait « 0 membres » partout.
    const conv = { id: 'c1', identifier: 'conv1', title: 'Test', participants: [], _count: { participants: 0 } };
    mockPrisma.conversation.findMany.mockResolvedValue([conv]);
    mockPrisma.conversation.count.mockResolvedValue(1);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/conversations' });
    expect(res.statusCode).toBe(200);
  });

  it('adds type to where when type query param is provided', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.conversation.count.mockResolvedValue(0);
    await app.inject({ method: 'GET', url: '/admin/users/user123/conversations?type=group' });
    const callArgs = mockPrisma.conversation.findMany.mock.calls[0][0] as { where: { type?: string } };
    expect(callArgs.where.type).toBe('group');
  });

  it('maps membership for participant matching userId', async () => {
    const conv = {
      id: 'c1',
      identifier: 'conv1',
      participants: [
        { userId: 'user123', role: 'MEMBER', joinedAt: new Date() },
        { userId: 'other456', role: 'MEMBER', joinedAt: new Date() }
      ],
      _count: { participants: 2 }
    };
    mockPrisma.conversation.findMany.mockResolvedValue([conv]);
    mockPrisma.conversation.count.mockResolvedValue(1);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/conversations' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data[0];
    expect(data.membership).toMatchObject({ userId: 'user123' });
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/conversations' });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /admin/users/:userId/media ───────────────────────────────────────────
describe('GET /admin/users/:userId/media', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/media' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 merging and sorting by recency', async () => {
    const older = { id: 'pm1', originalName: 'img.jpg', mimeType: 'image/jpeg', fileUrl: 'http://x', thumbnailUrl: null, fileSize: 100, width: 10, height: 10, duration: null, createdAt: new Date('2024-01-01'), postId: 'p1' };
    const newer = { id: 'ma1', originalName: 'file.mp4', mimeType: 'video/mp4', fileUrl: 'http://y', thumbnailUrl: null, fileSize: 200, width: null, height: null, duration: 60, createdAt: new Date('2024-06-01'), messageId: 'm1' };
    mockPrisma.postMedia.findMany.mockResolvedValue([older]);
    mockPrisma.messageAttachment.findMany.mockResolvedValue([newer]);
    mockPrisma.postMedia.count.mockResolvedValue(1);
    mockPrisma.messageAttachment.count.mockResolvedValue(1);

    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/media' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{ source: string }>;
    expect(data[0].source).toBe('message');
    expect(data[1].source).toBe('post');
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/media' });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /admin/users/:userId/reports ─────────────────────────────────────────
describe('GET /admin/users/:userId/reports', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reports' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with reports', async () => {
    mockPrisma.report.findMany.mockResolvedValue([{ id: 'r1', status: 'PENDING' }]);
    mockPrisma.report.count.mockResolvedValue(1);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reports' });
    expect(res.statusCode).toBe(200);
  });

  it('adds status to where when status query param provided', async () => {
    mockPrisma.report.findMany.mockResolvedValue([]);
    mockPrisma.report.count.mockResolvedValue(0);
    await app.inject({ method: 'GET', url: '/admin/users/user123/reports?status=RESOLVED' });
    const callArgs = mockPrisma.report.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.status).toBe('RESOLVED');
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reports' });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /admin/users/:userId/reported-messages ───────────────────────────────
describe('GET /admin/users/:userId/reported-messages', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reported-messages' });
    expect(res.statusCode).toBe(404);
  });

  it('returns empty page when no participants (early return)', async () => {
    mockPrisma.participant.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reported-messages' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
  });

  it('returns empty page when no messages (second early return)', async () => {
    mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reported-messages' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
    expect(mockPrisma.report.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with reported messages joined to reports', async () => {
    const msg = { id: 'msg1', content: 'Hello', conversationId: 'c1', messageType: 'text', createdAt: new Date(), deletedAt: null };
    const report = { id: 'rep1', reportedEntityId: 'msg1', reportType: 'spam', reason: 'Spam', status: 'PENDING', reporterId: 'r1', reporterName: 'Reporter', createdAt: new Date(), resolvedAt: null };

    mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
    mockPrisma.message.findMany
      .mockResolvedValueOnce([{ id: 'msg1' }])
      .mockResolvedValueOnce([msg]);
    mockPrisma.report.findMany.mockResolvedValue([report]);
    mockPrisma.report.count.mockResolvedValue(1);

    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reported-messages' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{ id: string; message: { id: string } | null }>;
    expect(data[0].id).toBe('rep1');
    expect(data[0].message?.id).toBe('msg1');
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/reported-messages' });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /admin/conversations/:conversationId/participants ─────────────────────
describe('GET /admin/conversations/:conversationId/participants', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 404 when conversation not found', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/conversations/conv123/participants' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with participants', async () => {
    const participant = { id: 'p1', userId: 'user123', type: 'user', role: 'MEMBER', isActive: true };
    mockPrisma.participant.findMany.mockResolvedValue([participant]);
    mockPrisma.participant.count.mockResolvedValue(1);
    const res = await app.inject({ method: 'GET', url: '/admin/conversations/conv123/participants' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.conversation.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/admin/conversations/conv123/participants' });
    expect(res.statusCode).toBe(500);
  });

  // Directive produit 2026-08-25 : présence masquée sans canViewPresence.
  it('masks isOnline when the viewer lacks canViewPresence', async () => {
    (permissionsService.canViewPresence as jest.Mock).mockReturnValue(false);
    const participant = { id: 'p1', userId: 'user123', type: 'user', role: 'MEMBER', isActive: true, isOnline: true };
    mockPrisma.participant.findMany.mockResolvedValue([participant]);
    mockPrisma.participant.count.mockResolvedValue(1);
    const res = await app.inject({ method: 'GET', url: '/admin/conversations/conv123/participants' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].isOnline).toBe(false);
  });
});

// ── F9 — la désactivation révoque les sockets du compte ─────────────────────
//
// Le service est mocké ici : ce que cette suite vérifie est le CÂBLAGE —
// `userAdminRoutes` injecte dans `UserManagementService` un révocateur qui
// atteint Socket.IO par le même chemin que `revoke-all-sessions.ts`
// (`fastify.socketIOHandler.getManager().getIO()`), résolu À L'APPEL parce
// que le manager naît après l'enregistrement des routes.

function makeSocketIOHandler(
  sockets: Array<{ emit: jest.Mock; disconnect: jest.Mock }>,
  fetchError?: Error,
) {
  const rooms: string[] = [];
  const io = {
    in: (room: string) => {
      rooms.push(room);
      return {
        fetchSockets: async () => {
          if (fetchError) throw fetchError;
          return sockets;
        },
      };
    },
  };
  return { rooms, io, handler: { getManager: () => ({ getIO: () => io }) } };
}

type SessionRevoker = (userId: string) => Promise<unknown>;

function revokerWiredIntoService(): SessionRevoker {
  const ctor = UserManagementService as unknown as jest.Mock;
  const deps = ctor.mock.calls.at(-1)?.[1] as { revokeSessions?: SessionRevoker } | undefined;
  if (!deps?.revokeSessions) {
    throw new Error("userAdminRoutes n'injecte aucun révocateur de sessions dans UserManagementService");
  }
  return deps.revokeSessions;
}

describe('userAdminRoutes — révocation des sockets du compte désactivé (F9)', () => {
  beforeEach(resetMocks);

  it('injecte un révocateur qui émet auth:session-revoked (reason admin_revoke) puis ferme chaque socket de la room du compte', async () => {
    const socket = { emit: jest.fn(), disconnect: jest.fn() };
    const { rooms, handler } = makeSocketIOHandler([socket]);
    const app = buildApp();
    app.decorate('socketIOHandler', handler);
    await app.ready();
    try {
      const revoke = revokerWiredIntoService();
      await expect(revoke('user123')).resolves.toBe(1);
      expect(rooms).toEqual([ROOMS.user('user123')]);
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.AUTH_SESSION_REVOKED,
        expect.objectContaining({ code: 'session_revoked', reason: 'admin_revoke' }),
      );
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    } finally {
      await app.close();
    }
  });

  it("résout le manager Socket.IO À L'APPEL : un manager né après l'enregistrement des routes est atteint", async () => {
    const socket = { emit: jest.fn(), disconnect: jest.fn() };
    const { io } = makeSocketIOHandler([socket]);
    let manager: { getIO: () => typeof io } | null = null;
    const app = buildApp();
    app.decorate('socketIOHandler', { getManager: () => manager });
    await app.ready();
    try {
      const revoke = revokerWiredIntoService();
      await expect(revoke('user123')).resolves.toBe(0);
      manager = { getIO: () => io };
      await expect(revoke('user123')).resolves.toBe(1);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    } finally {
      await app.close();
    }
  });

  it('ne lève jamais : manager absent ⇒ 0 socket coupé ; fetchSockets qui échoue ⇒ 0, sans rejet', async () => {
    const { handler } = makeSocketIOHandler([{ emit: jest.fn(), disconnect: jest.fn() }], new Error('adapter down'));
    const bare = buildApp();
    await bare.ready();
    try {
      await expect(revokerWiredIntoService()('user123')).resolves.toBe(0);
    } finally {
      await bare.close();
    }

    const failing = buildApp();
    failing.decorate('socketIOHandler', handler);
    await failing.ready();
    try {
      await expect(revokerWiredIntoService()('user123')).resolves.toBe(0);
    } finally {
      await failing.close();
    }
  });
});
