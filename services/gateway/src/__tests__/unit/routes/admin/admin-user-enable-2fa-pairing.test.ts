import Fastify, { FastifyInstance } from 'fastify';

/**
 * `POST /admin/users/:userId/enable-2fa` n'arme un second facteur que sur une
 * application DÉJÀ appairée (#8289) : sans secret, la connexion suivante
 * exigerait un code que personne ne peut vérifier.
 *
 * Fichier SÉPARÉ de `admin-user-routes.test.ts`, dans la dette héritée du
 * cliquet de taille des suites (#4531), dont la règle 3 interdit toute croissance.
 */

// ── Service mocks (must be hoisted before imports) ──────────────────────────
const mockUMS: Record<string, jest.Mock> = {
  getUserById: jest.fn(),
  enable2FA: jest.fn(),
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
  mockUMS.enable2FA.mockResolvedValue({ ...mockUser, twoFactorEnabledAt: new Date() });

  mockAudit.createAuditLog.mockResolvedValue(undefined);
  mockAudit.logDeleteUser.mockResolvedValue(undefined);
  mockAudit.logRestoreUser.mockResolvedValue(undefined);
}

describe('POST /admin/users/:userId/enable-2fa — application appairée (#8289)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('refuse 409 TWO_FACTOR_NOT_ENROLLED quand le membre n’a jamais appairé d’application', async () => {
    mockUMS.getUserById.mockResolvedValue({ ...mockUser, twoFactorSecret: null, twoFactorEnabledAt: null });
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/enable-2fa' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('TWO_FACTOR_NOT_ENROLLED');
    expect(mockUMS.enable2FA).not.toHaveBeenCalled();
  });

  it('arme le second facteur quand une application est appairée', async () => {
    mockUMS.getUserById.mockResolvedValue({ ...mockUser, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/enable-2fa' });
    expect(res.statusCode).toBe(200);
    expect(mockUMS.enable2FA).toHaveBeenCalled();
  });
});
