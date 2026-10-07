/**
 * #9613, #9643 — l'administration voit TOUT d'une session, chaque lecture est
 * journalisée, elle ferme toutes les sessions d'un membre d'un geste, et le
 * membre en est TOUJOURS informé sans que l'administrateur soit nommé.
 *
 * Séparé de `user-sessions.test.ts` : ce harnais double en plus `EmailService`
 * et la révocation de TOUTES les sessions.
 */
import Fastify, { FastifyInstance } from 'fastify';

const mockAudit: Record<string, jest.Mock> = { createAuditLog: jest.fn() };
const mockSessionService: Record<string, jest.Mock> = {
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
};
const mockEmail: Record<string, jest.Mock> = { sendSecurityAlertEmail: jest.fn() };

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => ({ getUserById: jest.fn() })),
}));
jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => mockAudit),
}));
jest.mock('../../../../services/admin/user-sanitization.service', () => ({
  sanitizationService: { sanitizeUser: jest.fn((u: unknown) => u), sanitizeUsers: jest.fn((u: unknown) => u) },
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
  getCacheStore: jest.fn(() => ({ del: jest.fn(), get: jest.fn().mockResolvedValue(null), set: jest.fn() })),
}));
jest.mock('../../../../services/SessionService', () => ({
  invalidateSession: (...args: unknown[]) => mockSessionService.invalidateSession(...args),
  invalidateAllSessions: (...args: unknown[]) => mockSessionService.invalidateAllSessions(...args),
}));
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => mockEmail),
}));

import { userAdminRoutes } from '../../../../routes/admin/users';
import { permissionsService } from '../../../../services/admin/permissions.service';
import { UserAuditAction } from '@meeshy/shared/types';

const MEMBER = {
  id: 'user123', role: 'USER', email: 'ada@example.com', username: 'ada', firstName: 'Ada', displayName: 'Ada',
  systemLanguage: 'de', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  userSession: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  securityEvent: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
};

function buildApp(sockets: Array<{ emit: jest.Mock; disconnect: jest.Mock; data?: Record<string, unknown> }> = []): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      registeredUser: { id: 'admin123', role: 'ADMIN', username: 'admin', email: 'admin@example.com' },
    };
  });
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => ({ in: () => ({ fetchSockets: async () => sockets }) }) }) });
  app.register(userAdminRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  (permissionsService.hasPermission as jest.Mock).mockReturnValue(true);
  (permissionsService.canManageUser as jest.Mock).mockReturnValue(true);
  mockPrisma.user.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
    args?.select?.email ? MEMBER : { id: MEMBER.id, role: 'USER' });
  mockPrisma.userSession.findMany.mockResolvedValue([]);
  mockPrisma.userSession.count.mockResolvedValue(0);
  mockPrisma.userSession.findFirst.mockResolvedValue({ id: 'sess-1' });
  mockPrisma.securityEvent.findMany.mockResolvedValue([]);
  mockPrisma.securityEvent.count.mockResolvedValue(0);
  mockPrisma.securityEvent.create.mockResolvedValue({});
  mockAudit.createAuditLog.mockResolvedValue(undefined);
  mockSessionService.invalidateSession.mockResolvedValue(true);
  mockSessionService.invalidateAllSessions.mockResolvedValue(3);
  mockEmail.sendSecurityAlertEmail.mockResolvedValue({ success: true });
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('GET /admin/users/:userId/sessions — tout est affiché, et la lecture est journalisée', () => {
  it('lit version, build, plateforme, nom d’appareil, moyen de connexion, agent et fuseau — jamais jeton, empreinte ni coordonnées', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/sessions' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const { select } = mockPrisma.userSession.findMany.mock.calls[0][0];
    for (const field of ['appVersion', 'appBuild', 'platform', 'deviceName', 'loginMethod', 'userAgent', 'timezone', 'ipAddress', 'city', 'country']) {
      expect(select[field]).toBe(true);
    }
    for (const field of ['latitude', 'longitude', 'sessionToken', 'refreshToken', 'deviceFingerprint']) {
      expect(select).not.toHaveProperty(field);
    }
  });

  it('sert l’attribution de la géolocalisation', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/sessions' });
    await app.close();

    expect(res.json().meta.geolocation).toEqual({
      provider: 'DB-IP', text: 'IP Geolocation by DB-IP', url: 'https://db-ip.com', license: 'CC-BY-4.0', approximate: true,
    });
  });

  it('journalise CHAQUE lecture : VIEW_USER, surface « sessions »', async () => {
    const app = buildApp();
    await app.inject({ method: 'GET', url: '/admin/users/user123/sessions?offset=20' });
    await app.close();

    expect(mockAudit.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123', adminId: 'admin123', action: UserAuditAction.VIEW_USER, entityId: 'user123',
      metadata: { surface: 'sessions', offset: 20 },
    }));
  });

  it('les événements de sécurité aussi : VIEW_USER, surface « security-events »', async () => {
    const app = buildApp();
    await app.inject({ method: 'GET', url: '/admin/users/user123/security-events' });
    await app.close();

    expect(mockAudit.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123', adminId: 'admin123', action: UserAuditAction.VIEW_USER,
      metadata: expect.objectContaining({ surface: 'security-events' }),
    }));
  });
});

describe('DELETE /admin/users/:userId/sessions — tout fermer d’un geste', () => {
  it('ferme toutes les sessions, coupe toutes les sockets avec le motif admin_revoke, et journalise', async () => {
    const socket = { emit: jest.fn(), disconnect: jest.fn(), data: { sessionId: 'sess-1' } };
    const app = buildApp([socket]);

    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions' });
    await settle();
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ revokedCount: 3 });
    expect(mockSessionService.invalidateAllSessions).toHaveBeenCalledWith('user123', undefined, 'admin_revoke');
    expect(socket.emit).toHaveBeenCalledWith('auth:session-revoked', expect.objectContaining({ reason: 'admin_revoke' }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(mockAudit.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123', adminId: 'admin123', action: UserAuditAction.REVOKE_SESSION,
      metadata: { scope: 'all', revokedCount: 3 },
    }));
  });

  it('informe le membre : un événement de sécurité « par l’équipe Meeshy », sans nommer l’administrateur', async () => {
    const app = buildApp();
    await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions' });
    await settle();
    await app.close();

    const { data } = mockPrisma.securityEvent.create.mock.calls[0][0];
    expect(data).toMatchObject({
      userId: 'user123',
      eventType: 'SESSIONS_CLOSED_BY_TEAM',
      description: 'Toutes les sessions ont été fermées par l’équipe Meeshy',
    });
    expect(JSON.stringify(data)).not.toMatch(/admin123|admin@example\.com/);
    expect(data.ipAddress ?? null).toBeNull();
  });

  it('et par e-mail, dans SA langue, puisque plus aucune session ne vit', async () => {
    const app = buildApp();
    await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions' });
    await settle();
    await app.close();

    expect(mockEmail.sendSecurityAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ada@example.com', alertType: 'sessions_closed_by_team', language: 'de',
    }));
    expect(JSON.stringify(mockEmail.sendSecurityAlertEmail.mock.calls[0][0])).not.toMatch(/admin/);
  });

  it('403 quand la hiérarchie ne surclasse pas la cible', async () => {
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions' });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(mockSessionService.invalidateAllSessions).not.toHaveBeenCalled();
  });
});

describe('DELETE /admin/users/:userId/sessions/:sessionId — le membre est informé', () => {
  it('un événement de sécurité « Session fermée par l’équipe Meeshy »', async () => {
    mockPrisma.userSession.count.mockResolvedValue(2);
    const app = buildApp();
    await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-1' });
    await settle();
    await app.close();

    expect(mockPrisma.securityEvent.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user123', eventType: 'SESSION_CLOSED_BY_TEAM', description: 'Session fermée par l’équipe Meeshy',
    });
  });

  it('pas d’e-mail tant qu’une autre session vit encore', async () => {
    mockPrisma.userSession.count.mockResolvedValue(2);
    const app = buildApp();
    await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-1' });
    await settle();
    await app.close();

    expect(mockEmail.sendSecurityAlertEmail).not.toHaveBeenCalled();
  });

  it('un e-mail quand c’était la dernière session vivante', async () => {
    mockPrisma.userSession.count.mockResolvedValue(0);
    const app = buildApp();
    await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-1' });
    await settle();
    await app.close();

    expect(mockEmail.sendSecurityAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ alertType: 'sessions_closed_by_team' }));
  });
});
