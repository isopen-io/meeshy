/**
 * `POST /admin/users/:userId/password-proposals` (#8051) — la route qui sert
 * les quatre niveaux de mot de passe à la feuille d'administration, sous les
 * gardes de `reset-password`. Harnais minimal, sur le modèle de
 * `admin-user-password-strength.test.ts`.
 */
import Fastify, { FastifyInstance } from 'fastify';

const mockUMS: Record<string, jest.Mock> = {
  createUser: jest.fn(),
  resetPassword: jest.fn(),
};

const mockAudit: Record<string, jest.Mock> = {
  createAuditLog: jest.fn(),
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

import { userAdminRoutes } from '../../../../routes/admin/users';
import { permissionsService } from '../../../../services/admin/permissions.service';
import { validatePasswordStrength } from '../../../../utils/password-strength';
import { PASSWORD_PROPOSAL_LEVELS } from '@meeshy/shared/types/admin-password-proposal';

const target = { role: 'USER', username: 'alice', displayName: 'Alice Martin', firstName: 'Alice' };

const mockPrisma: Record<string, Record<string, jest.Mock>> = {
  conversationShareLink: { findMany: jest.fn().mockResolvedValue([]) },
  trackingLink: { findMany: jest.fn().mockResolvedValue([]) },
  affiliateToken: { findMany: jest.fn().mockResolvedValue([]) },
  friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findUnique: jest.fn().mockResolvedValue(target) },
};

function buildApp(role: string = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      registeredUser: { id: 'admin123', role, username: 'admin', email: 'admin@example.com' },
    };
  });
  app.register(userAdminRoutes);
  return app;
}

const propose = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: '/admin/users/user123/password-proposals' });

describe('POST /admin/users/:userId/password-proposals (#8051)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(target);
    (permissionsService.hasPermission as jest.Mock).mockReturnValue(true);
    (permissionsService.canModifyUser as jest.Mock).mockReturnValue(true);
  });

  it('sert les quatre niveaux, dérivés du pseudo et déjà acceptés par la politique de robustesse', async () => {
    const response = await propose(app);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual([...PASSWORD_PROPOSAL_LEVELS].sort());
    expect(body.data.simple).toMatch(/^alice[2-9]{3}$/);
    for (const level of PASSWORD_PROPOSAL_LEVELS) {
      expect(validatePasswordStrength(body.data[level]).isValid).toBe(true);
    }
  });

  it('ne lit que ce que la composition demande — jamais la ligne entière', async () => {
    await propose(app);

    const selects = mockPrisma.user.findUnique.mock.calls
      .map(([args]) => (args as { select?: Record<string, boolean> }).select)
      .filter((select): select is Record<string, boolean> => select !== undefined && 'username' in select);
    expect(selects).toHaveLength(1);
    expect(Object.keys(selects[0]!).sort()).toEqual(['displayName', 'firstName', 'role', 'username']);
  });

  it('rend 404 quand le membre n’existe pas', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await propose(app);

    expect([404, 403]).toContain(response.statusCode);
    expect(response.json().success).toBe(false);
  });

  it('rend 403 quand le rang ne permet pas d’agir sur la cible', async () => {
    (permissionsService.canModifyUser as jest.Mock).mockReturnValue(false);

    const response = await propose(app);

    expect(response.statusCode).toBe(403);
    expect(response.json().success).toBe(false);
  });

  it('rend 403 sans la permission canResetPasswords', async () => {
    (permissionsService.hasPermission as jest.Mock).mockImplementation(
      (_role: string, permission: string) => permission !== 'canResetPasswords',
    );

    const response = await propose(app);

    expect(response.statusCode).toBe(403);
  });
});
