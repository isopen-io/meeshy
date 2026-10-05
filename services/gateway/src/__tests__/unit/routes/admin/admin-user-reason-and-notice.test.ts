/**
 * Deux contrats de l'administration web (fiche membre) :
 *
 * 1. `DELETE /admin/users/:userId` et `POST …/restore` acceptent un motif
 *    facultatif `{ reason }` : obligatoire (3 caractères) pour un non-souverain,
 *    validé s'il est écrit, consigné au journal. Un corps ABSENT reste accepté
 *    pour le souverain — le web n'envoie aucun corps sans motif.
 * 2. `POST …/reset-password` accepte `sendEmail` (case « Prévenir le membre »)
 *    à travers le VRAI schéma partagé (aucun double de validation ici) et le
 *    transmet au service, seul juge de la notification.
 */
import Fastify, { FastifyInstance } from 'fastify';

// ── Service mocks (must be hoisted before imports) ──────────────────────────
const mockUMS: Record<string, jest.Mock> = {
  getUserById: jest.fn(),
  deleteUser: jest.fn(),
  restoreUser: jest.fn(),
  resetPassword: jest.fn(),
};

const mockAudit: Record<string, jest.Mock> = {
  createAuditLog: jest.fn(),
  logDeleteUser: jest.fn(),
  logRestoreUser: jest.fn(),
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

const cible = { id: 'user123', username: 'cible', email: 'c@example.com', role: 'USER', isActive: true };
const mockPrisma = { user: { findUnique: jest.fn() } };

function buildApp(role: string): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma as never);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      registeredUser: { id: 'admin123', role, username: 'admin', email: 'a@example.com' },
    };
  });
  app.register(userAdminRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' });
  mockUMS.getUserById.mockResolvedValue(cible);
  mockUMS.deleteUser.mockResolvedValue(undefined);
  mockUMS.restoreUser.mockResolvedValue(cible);
  mockUMS.resetPassword.mockResolvedValue(cible);
  for (const f of Object.values(mockAudit)) f.mockResolvedValue(undefined);
});

const GESTES = [
  { nom: 'DELETE', method: 'DELETE' as const, url: '/admin/users/user123', service: 'deleteUser', journal: 'logDeleteUser' },
  { nom: 'restore', method: 'POST' as const, url: '/admin/users/user123/restore', service: 'restoreUser', journal: 'logRestoreUser' },
];

describe.each(GESTES)('$nom — motif du geste', ({ method, url, service, journal }) => {
  it('consigne le motif écrit par un ADMIN', async () => {
    const app = buildApp('ADMIN');
    const res = await app.inject({ method, url, payload: { reason: 'Compte de spam confirmé' } });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(mockAudit[journal]).toHaveBeenCalledWith('admin123', 'user123', 'Compte de spam confirmé', expect.anything(), expect.anything());
  });

  it('refuse un ADMIN sans motif, sans agir', async () => {
    const app = buildApp('ADMIN');
    const res = await app.inject({ method, url });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(mockUMS[service]).not.toHaveBeenCalled();
    expect(mockAudit[journal]).not.toHaveBeenCalled();
  });

  it('refuse un motif trop court, même du souverain', async () => {
    const app = buildApp('BIGBOSS');
    const res = await app.inject({ method, url, payload: { reason: 'ok' } });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(mockUMS[service]).not.toHaveBeenCalled();
  });

  it('accepte le souverain sans AUCUN corps', async () => {
    const app = buildApp('BIGBOSS');
    const res = await app.inject({ method, url });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(mockUMS[service]).toHaveBeenCalled();
    expect(mockAudit[journal]).toHaveBeenCalledWith('admin123', 'user123', undefined, expect.anything(), expect.anything());
  });
});

describe('POST /admin/users/:userId/reset-password — sendEmail', () => {
  const MOT_DE_PASSE = 'Xq7!vLp2#rTz9@wK';

  it.each([true, false])('transmet sendEmail: %p au service', async (sendEmail) => {
    const app = buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/reset-password',
      payload: { newPassword: MOT_DE_PASSE, sendEmail },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(mockUMS.resetPassword).toHaveBeenCalledWith('user123', expect.objectContaining({ sendEmail }));
  });

  it('sans sendEmail, le service ne reçoit aucune demande de notification', async () => {
    const app = buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/reset-password',
      payload: { newPassword: MOT_DE_PASSE },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(mockUMS.resetPassword.mock.calls[0][1].sendEmail).toBeUndefined();
  });
});
