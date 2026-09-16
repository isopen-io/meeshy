import Fastify, { FastifyInstance } from 'fastify';

/**
 * `DELETE /admin/users/:userId` (le `deletedBy` qu'il pose) et
 * `POST /admin/users/:userId/restore`, sa jumelle (#6822).
 *
 * Fichier SÉPARÉ de `admin-user-routes.test.ts` — celui-ci est dans la dette
 * héritée du cliquet de taille des suites (#4531, `gateway-test-file-size-budget.test.ts`),
 * dont la règle 3 interdit toute croissance. Ajouter ces témoins là-bas aurait
 * fait rougir le cliquet sans rapport avec ce qu'il garde.
 */

// ── Service mocks (must be hoisted before imports) ──────────────────────────
const mockUMS: Record<string, jest.Mock> = {
  getUserById: jest.fn(),
  deleteUser: jest.fn(),
  restoreUser: jest.fn(),
};

const mockAudit: Record<string, jest.Mock> = {
  createAuditLog: jest.fn(),
  logDeleteUser: jest.fn(),
  logRestoreUser: jest.fn(),
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

// ── Shared fixtures ──────────────────────────────────────────────────────────
const mockUser = {
  id: 'user123',
  username: 'testuser',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'USER',
  isActive: true,
};

const mockPrisma: Record<string, Record<string, jest.Mock>> = {
  user: { findUnique: jest.fn() },
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
  (permissionsService.canModifyUser as jest.Mock).mockReturnValue(true);
  (sanitizationService.sanitizeUser as jest.Mock).mockImplementation((u: unknown) => u);

  // `requireHierarchy` (#4154) lit le RANG de la cible en base : sans ce
  // défaut, le double rend `undefined`, la garde échoue FERMÉ et tous les
  // témoins d'écriture liraient 403 pour une raison qui n'est pas la leur.
  mockPrisma.user.findUnique.mockResolvedValue({ role: mockUser.role } as never);

  mockUMS.getUserById.mockResolvedValue(mockUser);
  mockUMS.deleteUser.mockResolvedValue(undefined);
  mockUMS.restoreUser.mockResolvedValue(mockUser);

  mockAudit.createAuditLog.mockResolvedValue(undefined);
  mockAudit.logDeleteUser.mockResolvedValue(undefined);
  mockAudit.logRestoreUser.mockResolvedValue(undefined);
}

// ── DELETE /admin/users/:userId — deletedBy ──────────────────────────────────
describe('DELETE /admin/users/:userId — deletedBy (#6822)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  // Un compte supprimé doit porter QUI l'a supprimé, pas seulement
  // isActive:false : sans deletedBy la console ne peut pas le distinguer
  // d'une désactivation.
  it('passes the acting admin id as deletedBy', async () => {
    await app.inject({ method: 'DELETE', url: '/admin/users/user123' });
    expect(mockUMS.deleteUser).toHaveBeenCalledWith('user123', 'admin123');
  });
});

// ── POST /admin/users/:userId/restore ────────────────────────────────────────
// La jumelle du DELETE ci-dessus : `restoreUser` existait côté service sans
// aucune route pour l'appeler.
describe('POST /admin/users/:userId/restore', () => {
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
    const res = await noAuth.inject({ method: 'POST', url: '/admin/users/user123/restore' });
    await noAuth.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when hasPermission (delete) is false', async () => {
    (permissionsService.hasPermission as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/restore' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on happy path and calls restoreUser', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/restore' });
    expect(res.statusCode).toBe(200);
    expect(mockUMS.restoreUser).toHaveBeenCalledWith('user123');
    expect(mockAudit.logRestoreUser).toHaveBeenCalledWith(
      'admin123',
      'user123',
      undefined,
      expect.anything(),
      expect.anything()
    );
  });

  it('returns 404 when user not found', async () => {
    mockUMS.getUserById.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/restore' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when canModifyUser is false', async () => {
    (permissionsService.canModifyUser as jest.Mock).mockReturnValueOnce(false);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/restore' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when restoreUser throws', async () => {
    mockUMS.restoreUser.mockRejectedValue(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/restore' });
    expect(res.statusCode).toBe(500);
  });
});
