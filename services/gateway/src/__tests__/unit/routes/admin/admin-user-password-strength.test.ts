/**
 * `POST /admin/users` et `POST /admin/users/:userId/reset-password` gagnent le
 * même gate de force de mot de passe que les autres surfaces authentifiées
 * (#3629, `utils/password-strength.ts`). Extrait de `admin-user-routes.test.ts`
 * (#4531, budget de taille) — ce fichier n'est qu'un harnais MINIMAL pour ces
 * deux routes, pas un doublon de la suite complète.
 */
import Fastify, { FastifyInstance } from 'fastify';

const mockUMS: Record<string, jest.Mock> = {
  createUser: jest.fn(),
  resetPassword: jest.fn(),
};

const mockAudit: Record<string, jest.Mock> = {
  createAuditLog: jest.fn(),
  logCreateUser: jest.fn(),
  logResetPassword: jest.fn(),
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

import { userAdminRoutes } from '../../../../routes/admin/users';
import * as adminUserValidation from '@meeshy/shared/types/validation/admin-user';

const mockUser = { id: 'user123', username: 'testuser', email: 'test@example.com', role: 'USER' };

const mockPrisma: Record<string, Record<string, jest.Mock>> = {
  conversationShareLink: { findMany: jest.fn().mockResolvedValue([]) },
  trackingLink: { findMany: jest.fn().mockResolvedValue([]) },
  affiliateToken: { findMany: jest.fn().mockResolvedValue([]) },
  friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findUnique: jest.fn().mockResolvedValue({ role: 'USER' }) },
};

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      registeredUser: { id: 'admin123', role: 'ADMIN', username: 'admin', email: 'admin@example.com' },
    };
  });
  app.register(userAdminRoutes);
  return app;
}

function resetMocks() {
  jest.clearAllMocks();
  mockUMS.createUser.mockResolvedValue(mockUser);
  mockUMS.resetPassword.mockResolvedValue(mockUser);
  mockAudit.createAuditLog.mockResolvedValue(undefined);
  mockAudit.logCreateUser.mockResolvedValue(undefined);
  mockAudit.logResetPassword.mockResolvedValue(undefined);
  mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' });
  (adminUserValidation.createUserValidationSchema.parse as jest.Mock).mockImplementation((b: unknown) => b);
  (adminUserValidation.resetPasswordValidationSchema.parse as jest.Mock).mockImplementation((b: unknown) => b);
}

describe('POST /admin/users — weak password (#3629)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 400 when the password is weak', async () => {
    // 12+ chars (passes the Zod length gate) but all-lowercase, no digit —
    // exactly what the schema alone let an admin create before this fix.
    const weakBody = { username: 'newuser', email: 'new@example.com', password: 'aaaaaaaaaaaa' };
    (adminUserValidation.createUserValidationSchema.parse as jest.Mock).mockReturnValue(weakBody);
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: weakBody });
    expect(res.statusCode).toBe(400);
    expect(mockUMS.createUser).not.toHaveBeenCalled();
  });
});

describe('POST /admin/users/:userId/reset-password — weak password (#3629)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('returns 400 when the new password is weak', async () => {
    const weakBody = { newPassword: 'aaaaaaaaaaaa' };
    (adminUserValidation.resetPasswordValidationSchema.parse as jest.Mock).mockReturnValue(weakBody);
    const res = await app.inject({ method: 'POST', url: '/admin/users/user123/reset-password', payload: weakBody });
    expect(res.statusCode).toBe(400);
    expect(mockUMS.resetPassword).not.toHaveBeenCalled();
  });
});
