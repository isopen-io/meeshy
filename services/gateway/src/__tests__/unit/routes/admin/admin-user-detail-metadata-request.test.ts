/**
 * La FICHE d'un membre demande le bloc `adminMetadata` ; la LISTE ne le demande pas
 * (#8876, § 6.8).
 *
 * Dix-neuf champs de plus par ligne ne servent à personne dans une liste ; la fiche,
 * elle, est l'endroit où l'administrateur COMPREND un compte. La décision vit à
 * UN endroit — l'option `withAdminMetadata` de `sanitizeUser` — et ce témoin garde
 * que la route de fiche la pose et que celle de liste ne la pose pas. Le contenu
 * du bloc et sa garde par `canViewSensitiveData` sont couverts par
 * `services/admin/user-sanitization-admin-metadata.test.ts`.
 *
 * Fichier séparé : `admin-user-routes.test.ts` est hors budget de taille (dette
 * héritée gelée) et n'a pas le droit de grossir.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';

const mockUMS: Record<string, jest.Mock> = { getUsers: jest.fn(), getUserById: jest.fn() };
const mockAudit: Record<string, jest.Mock> = { createAuditLog: jest.fn(), logViewUser: jest.fn() };

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
import { sanitizationService } from '../../../../services/admin/user-sanitization.service';

const mockUser = { id: 'user123', username: 'awa', email: 'awa@exemple.fr', role: 'USER', isActive: true };

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', { user: { findUnique: jest.fn() } } as never);
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

describe('la fiche demande adminMetadata, la liste non', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUMS.getUserById.mockResolvedValue(mockUser);
    mockUMS.getUsers.mockResolvedValue({ users: [mockUser], total: 1 });
    mockAudit.logViewUser.mockResolvedValue(undefined);
    mockAudit.createAuditLog.mockResolvedValue(undefined);
  });

  it('GET /admin/users/:userId pose withAdminMetadata', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123' });

    expect(res.statusCode).toBe(200);
    expect(sanitizationService.sanitizeUser).toHaveBeenCalledWith(mockUser, 'ADMIN', { withAdminMetadata: true });
    await app.close();
  });

  it('GET /admin/users ne la pose pas', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/admin/users' });

    expect(res.statusCode).toBe(200);
    expect(sanitizationService.sanitizeUsers).toHaveBeenCalledWith([mockUser], 'ADMIN');
    expect(sanitizationService.sanitizeUser).not.toHaveBeenCalled();
    await app.close();
  });
});
