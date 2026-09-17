import Fastify, { FastifyInstance } from 'fastify';

// ── Service mocks (must be hoisted before imports) ──────────────────────────
const mockUMS: Record<string, jest.Mock> = {
  getUserById: jest.fn(),
};

const mockAudit: Record<string, jest.Mock> = {
  createAuditLog: jest.fn(),
};

const mockSessionService: Record<string, jest.Mock> = {
  invalidateSession: jest.fn(),
};

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => mockUMS),
}));

jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => mockAudit),
}));

jest.mock('../../../../services/admin/user-sanitization.service', () => ({
  sanitizationService: {
    sanitizeUser: jest.fn((u: unknown) => u),
    sanitizeUsers: jest.fn((u: unknown) => u),
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

// `invalidateSession` est le SEUL symbole de `SessionService` que ce fichier
// consomme (`routes/admin/user-sessions.ts`) — le mocker isole la route de la
// couche de persistance réelle sans affecter les autres suites du dépôt.
jest.mock('../../../../services/SessionService', () => ({
  invalidateSession: (...args: unknown[]) => mockSessionService.invalidateSession(...args),
}));

// ── Now import after mocks ───────────────────────────────────────────────────
import { userAdminRoutes } from '../../../../routes/admin/users';
import { permissionsService } from '../../../../services/admin/permissions.service';
import { UserAuditAction } from '@meeshy/shared/types';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const mockUser = { id: 'user123', username: 'testuser', role: 'USER', isActive: true };

const mockPrisma: Record<string, Record<string, jest.Mock>> = {
  user: { findUnique: jest.fn() },
  userSession: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  securityEvent: { findMany: jest.fn(), count: jest.fn() },
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

function makeSocketIOHandler(sockets: Array<{ emit: jest.Mock; disconnect: jest.Mock; data?: Record<string, unknown> }>) {
  const rooms: string[] = [];
  const io = {
    in: (room: string) => {
      rooms.push(room);
      return { fetchSockets: async () => sockets };
    },
  };
  return { rooms, handler: { getManager: () => ({ getIO: () => io }) } };
}

function resetMocks() {
  jest.clearAllMocks();
  (permissionsService.hasPermission as jest.Mock).mockReturnValue(true);
  (permissionsService.canManageUser as jest.Mock).mockReturnValue(true);

  // `requireHierarchy` lit le rang de la cible en base.
  mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' });
  mockPrisma.userSession.findMany.mockResolvedValue([]);
  mockPrisma.userSession.count.mockResolvedValue(0);
  mockPrisma.userSession.findFirst.mockResolvedValue(null);
  mockPrisma.securityEvent.findMany.mockResolvedValue([]);
  mockPrisma.securityEvent.count.mockResolvedValue(0);

  mockUMS.getUserById.mockResolvedValue(mockUser);
  mockAudit.createAuditLog.mockResolvedValue(undefined);
  mockSessionService.invalidateSession.mockResolvedValue(true);
}

const SESSION_ROW = {
  id: 'sess-1',
  deviceType: 'mobile',
  deviceVendor: 'Apple',
  deviceModel: 'iPhone',
  osName: 'iOS',
  osVersion: '18.0',
  browserName: null,
  browserVersion: null,
  isMobile: true,
  ipAddress: '203.0.113.7',
  country: 'FR',
  city: 'Paris',
  location: 'Paris, France',
  latitude: 48.85,
  longitude: 2.35,
  timezone: 'Europe/Paris',
  isTrusted: false,
  expiresAt: new Date('2027-01-01'),
  isValid: true,
  invalidatedAt: null,
  invalidatedReason: null,
  createdAt: new Date('2026-09-01'),
  lastActivityAt: new Date('2026-09-15'),
};

// ── GET /admin/users/:userId/sessions ────────────────────────────────────────

describe('GET /admin/users/:userId/sessions', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it("404 quand l'utilisateur n'existe pas", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/users/ghost/sessions' });
    expect(res.statusCode).toBe(404);
  });

  it('rend la page de sessions, toutes valides ou révoquées, triée par activité récente', async () => {
    mockPrisma.userSession.findMany.mockResolvedValue([SESSION_ROW]);
    mockPrisma.userSession.count.mockResolvedValue(1);

    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/sessions' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([JSON.parse(JSON.stringify(SESSION_ROW))]);
    expect(body.pagination).toEqual({ total: 1, offset: 0, limit: 20, hasMore: false });

    const call = mockPrisma.userSession.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'user123' });
    expect(call.orderBy).toEqual({ lastActivityAt: 'desc' });
    // Ni le jeton, ni son renouvellement, ni l'empreinte d'appareil ne sortent.
    expect(call.select.sessionToken).toBeUndefined();
    expect(call.select.refreshToken).toBeUndefined();
    expect(call.select.deviceFingerprint).toBeUndefined();
    expect(call.select.ipAddress).toBe(true);
    expect(call.select.invalidatedReason).toBe(true);
  });

  it('pagine sur offset/limit', async () => {
    await app.inject({ method: 'GET', url: '/admin/users/user123/sessions?offset=10&limit=5' });
    const call = mockPrisma.userSession.findMany.mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(5);
  });

  it('403 sans canViewSensitiveData (MODERATOR)', async () => {
    (permissionsService.hasPermission as jest.Mock).mockImplementation(
      (_role: string, perm: string) => perm !== 'canViewSensitiveData'
    );
    const modApp = buildApp('MODERATOR');
    await modApp.ready();
    try {
      const res = await modApp.inject({ method: 'GET', url: '/admin/users/user123/sessions' });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.userSession.findMany).not.toHaveBeenCalled();
    } finally {
      await modApp.close();
    }
  });
});

// ── DELETE /admin/users/:userId/sessions/:sessionId ─────────────────────────

describe('DELETE /admin/users/:userId/sessions/:sessionId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it("403 quand l'utilisateur cible n'existe pas (requireHierarchy fail-CLOSED sur une cible introuvable)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/ghost/sessions/sess-1' });
    expect(res.statusCode).toBe(403);
    expect(mockSessionService.invalidateSession).not.toHaveBeenCalled();
  });

  it("404 quand la session n'appartient pas à ce compte", async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-other' });
    expect(res.statusCode).toBe(404);
    expect(mockSessionService.invalidateSession).not.toHaveBeenCalled();
    // La requête d'appartenance filtre sur LES DEUX colonnes — sinon l'id de
    // session d'un AUTRE compte serait révocable via ce chemin.
    const call = mockPrisma.userSession.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sess-other', userId: 'user123' });
  });

  it('révoque la session, coupe le SEUL socket qui la porte, et journalise REVOKE_SESSION', async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue({ id: 'sess-1' });
    const targeted = { emit: jest.fn(), disconnect: jest.fn(), data: { sessionId: 'sess-1' } };
    const other = { emit: jest.fn(), disconnect: jest.fn(), data: { sessionId: 'sess-2' } };
    const { rooms, handler } = makeSocketIOHandler([targeted, other]);
    const withSocket = buildApp();
    withSocket.decorate('socketIOHandler', handler);
    await withSocket.ready();
    try {
      const res = await withSocket.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-1' });

      expect(res.statusCode).toBe(200);
      expect(mockSessionService.invalidateSession).toHaveBeenCalledWith('sess-1', 'admin_revoke');
      expect(rooms).toEqual([ROOMS.user('user123')]);

      expect(targeted.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.AUTH_SESSION_REVOKED,
        expect.objectContaining({ code: 'session_revoked', reason: 'admin_revoke' })
      );
      expect(targeted.disconnect).toHaveBeenCalledWith(true);
      // Le socket d'une AUTRE session du même compte reste connecté.
      expect(other.emit).not.toHaveBeenCalled();
      expect(other.disconnect).not.toHaveBeenCalled();

      expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          adminId: 'admin123',
          action: UserAuditAction.REVOKE_SESSION,
          entityId: 'sess-1',
        })
      );
    } finally {
      await withSocket.close();
    }
  });

  it('404 quand la révocation en base échoue', async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue({ id: 'sess-1' });
    mockSessionService.invalidateSession.mockResolvedValue(false);
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-1' });
    expect(res.statusCode).toBe(404);
    expect(mockAudit.createAuditLog).not.toHaveBeenCalled();
  });

  it('403 sans canViewSensitiveData', async () => {
    (permissionsService.hasPermission as jest.Mock).mockImplementation(
      (_role: string, perm: string) => perm !== 'canViewSensitiveData'
    );
    const modApp = buildApp('MODERATOR');
    await modApp.ready();
    try {
      const res = await modApp.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-1' });
      expect(res.statusCode).toBe(403);
      expect(mockSessionService.invalidateSession).not.toHaveBeenCalled();
    } finally {
      await modApp.close();
    }
  });

  it('403 quand la hiérarchie ne surclasse pas la cible', async () => {
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'BIGBOSS' });
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user123/sessions/sess-1' });
    expect(res.statusCode).toBe(403);
    expect(mockSessionService.invalidateSession).not.toHaveBeenCalled();
  });
});

// ── GET /admin/users/:userId/security-events ─────────────────────────────────

const SECURITY_EVENT_ROW = {
  id: 'sec-1',
  eventType: 'PASSWORD_RESET_SUCCESS',
  severity: 'MEDIUM',
  status: 'SUCCESS',
  description: 'Password reset completed',
  metadata: null,
  ipAddress: '203.0.113.7',
  userAgent: 'Meeshy-iOS/1.0.0',
  deviceFingerprint: null,
  geoLocation: 'Paris, FR',
  createdAt: new Date('2026-09-10'),
};

describe('GET /admin/users/:userId/security-events', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it("404 quand l'utilisateur n'existe pas", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/admin/users/ghost/security-events' });
    expect(res.statusCode).toBe(404);
  });

  it('rend la page filtrée par eventType/severity/période', async () => {
    mockPrisma.securityEvent.findMany.mockResolvedValue([SECURITY_EVENT_ROW]);
    mockPrisma.securityEvent.count.mockResolvedValue(1);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users/user123/security-events?eventType=PASSWORD_RESET_SUCCESS&severity=MEDIUM&createdAfter=2026-09-01T00:00:00.000Z&createdBefore=2026-09-30T00:00:00.000Z'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([JSON.parse(JSON.stringify(SECURITY_EVENT_ROW))]);

    const call = mockPrisma.securityEvent.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      userId: 'user123',
      eventType: 'PASSWORD_RESET_SUCCESS',
      severity: 'MEDIUM',
      createdAt: { gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-30T00:00:00.000Z') }
    });
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('sans filtre, ne contraint que userId', async () => {
    await app.inject({ method: 'GET', url: '/admin/users/user123/security-events' });
    const call = mockPrisma.securityEvent.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'user123' });
  });

  it('403 sans canViewSensitiveData (AUDIT)', async () => {
    (permissionsService.hasPermission as jest.Mock).mockImplementation(
      (_role: string, perm: string) => perm !== 'canViewSensitiveData'
    );
    const auditApp = buildApp('AUDIT');
    await auditApp.ready();
    try {
      const res = await auditApp.inject({ method: 'GET', url: '/admin/users/user123/security-events' });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.securityEvent.findMany).not.toHaveBeenCalled();
    } finally {
      await auditApp.close();
    }
  });
});
