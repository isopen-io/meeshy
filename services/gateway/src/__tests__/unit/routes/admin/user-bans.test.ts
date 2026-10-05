import Fastify, { FastifyInstance } from 'fastify';

// ── Service mocks (must be hoisted before imports) ──────────────────────────
const mockUMS: Record<string, jest.Mock> = {
  getUserById: jest.fn(),
  updateStatus: jest.fn(),
};

const mockAudit: Record<string, jest.Mock> = {
  createAuditLog: jest.fn(),
};

const mockBan: Record<string, jest.Mock> = {
  createBan: jest.fn(),
  liftBan: jest.fn(),
  listBans: jest.fn(),
  listActiveBans: jest.fn(),
};

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => mockUMS),
}));

jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => mockAudit),
}));

// `estEnVigueur` (fonction pure) doit rester la VRAIE implémentation — c'est
// elle que le témoin de `GET .../bans` (« active » calculé) vérifie.
jest.mock('../../../../services/admin/ban.service', () => {
  const reel = jest.requireActual('../../../../services/admin/ban.service');
  return {
    ...reel,
    BanService: jest.fn().mockImplementation(() => mockBan),
  };
});

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

// ── Now import after mocks ───────────────────────────────────────────────────
import { userAdminRoutes } from '../../../../routes/admin/users';
import { permissionsService } from '../../../../services/admin/permissions.service';
import { UserAuditAction } from '@meeshy/shared/types';

const mockUser = {
  id: 'user123',
  username: 'testuser',
  role: 'USER',
  isActive: true,
};

const mockPrisma: Record<string, Record<string, jest.Mock>> = {
  conversationShareLink: { findMany: jest.fn().mockResolvedValue([]) },
  trackingLink: { findMany: jest.fn().mockResolvedValue([]) },
  affiliateToken: { findMany: jest.fn().mockResolvedValue([]) },
  friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
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
  (permissionsService.canManageUser as jest.Mock).mockReturnValue(true);

  // `requireHierarchy` lit le rang de la cible en base.
  mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' });
  // #8876 — `GET …/bans` nomme ses deux acteurs en UNE lecture de comptes.
  mockPrisma.user.findMany.mockResolvedValue([]);

  mockUMS.getUserById.mockResolvedValue(mockUser);
  mockUMS.updateStatus.mockResolvedValue({ ...mockUser, isActive: false });

  mockAudit.createAuditLog.mockResolvedValue(undefined);
}

const BAN = {
  id: 'ban1',
  userId: 'user123',
  bannedById: 'admin123',
  reason: 'Harcèlement répété',
  expiresAt: null,
  createdAt: new Date('2026-09-01'),
  liftedAt: null,
  liftedById: null,
  liftReason: null,
};

describe('POST /admin/users/:userId/ban', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('crée un ban, désactive le compte et journalise BAN_USER', async () => {
    mockBan.createBan.mockResolvedValue(BAN);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/ban',
      payload: { reason: 'Harcèlement répété' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('ban1');

    expect(mockBan.createBan).toHaveBeenCalledWith({
      userId: 'user123',
      bannedById: 'admin123',
      reason: 'Harcèlement répété',
      expiresAt: null,
    });

    expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        adminId: 'admin123',
        action: UserAuditAction.BAN_USER,
        entityId: 'ban1',
      })
    );
  });

  it('refuse un motif trop court, sans écrire de ban', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/ban',
      payload: { reason: 'x' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockBan.createBan).not.toHaveBeenCalled();
    expect(mockAudit.createAuditLog).not.toHaveBeenCalled();
  });

  it('refuse une échéance déjà passée', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/ban',
      payload: { reason: 'Motif valide', expiresAt: new Date('2020-01-01').toISOString() },
    });

    expect(res.statusCode).toBe(400);
    expect(mockBan.createBan).not.toHaveBeenCalled();
  });

  it('404 sur une cible inexistante', async () => {
    mockUMS.getUserById.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/ghost/ban',
      payload: { reason: 'Motif valide' },
    });

    expect(res.statusCode).toBe(404);
    expect(mockBan.createBan).not.toHaveBeenCalled();
  });

  it('403 quand la cible surclasse l’appelant (hiérarchie)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'BIGBOSS' });
    (permissionsService.canManageUser as jest.Mock).mockReturnValue(false);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/ban',
      payload: { reason: 'Motif valide' },
    });

    expect(res.statusCode).toBe(403);
    expect(mockBan.createBan).not.toHaveBeenCalled();
  });
});

describe('POST /admin/users/:userId/bans/:banId/lift', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('lève un ban en vigueur et journalise UNBAN_USER', async () => {
    mockBan.listBans.mockResolvedValue([BAN]);
    mockBan.liftBan.mockResolvedValue({ ...BAN, liftedAt: new Date(), liftedById: 'admin123', liftReason: 'Erreur' });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/bans/ban1/lift',
      payload: { reason: 'Erreur' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockBan.liftBan).toHaveBeenCalledWith({ banId: 'ban1', liftedById: 'admin123', liftReason: 'Erreur' });
    expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user123', action: UserAuditAction.UNBAN_USER, entityId: 'ban1' })
    );
  });

  it('400 sur un ban déjà levé, sans rejouer le lever', async () => {
    mockBan.listBans.mockResolvedValue([{ ...BAN, liftedAt: new Date('2026-09-02') }]);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/bans/ban1/lift',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(mockBan.liftBan).not.toHaveBeenCalled();
  });

  it('404 quand le ban ne correspond à aucune ligne de cet utilisateur', async () => {
    mockBan.listBans.mockResolvedValue([]);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/user123/bans/inconnu/lift',
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(mockBan.liftBan).not.toHaveBeenCalled();
  });
});

describe('GET /admin/users/:userId/bans', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    resetMocks();
    app = buildApp();
    await app.ready();
  });
  afterAll(() => app.close());
  beforeEach(resetMocks);

  it('rend chaque ban avec son statut EN VIGUEUR calculé', async () => {
    const permanent = { ...BAN, id: 'ban-perm', expiresAt: null, liftedAt: null };
    const expire = { ...BAN, id: 'ban-expire', expiresAt: new Date('2020-01-01'), liftedAt: null };
    const leve = { ...BAN, id: 'ban-leve', expiresAt: null, liftedAt: new Date('2026-09-02') };
    mockBan.listBans.mockResolvedValue([permanent, expire, leve]);

    const res = await app.inject({ method: 'GET', url: '/admin/users/user123/bans' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const parActif = Object.fromEntries(body.data.map((b: { id: string; active: boolean }) => [b.id, b.active]));
    expect(parActif).toEqual({ 'ban-perm': true, 'ban-expire': false, 'ban-leve': false });
  });

  // #8876 — le bannissement dit QUI a banni et QUI a levé, par leur nom.
  describe('les acteurs sont nommés', () => {
    const AWA = '507f1f77bcf86cd799439021';
    const JEAN = '507f1f77bcf86cd799439022';
    const awa = { id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: null };
    const jean = { id: JEAN, username: 'jean', displayName: null, avatar: 'https://cdn/j.png' };

    beforeEach(() => {
      mockPrisma.user.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
        [awa, jean].filter((p) => args.where.id.in.includes(p.id))
      );
    });

    it('sert bannedBy et liftedBy comme des personnes, en une seule lecture de comptes', async () => {
      mockBan.listBans.mockResolvedValue([
        { ...BAN, id: 'b1', bannedById: AWA, liftedAt: new Date('2026-09-05'), liftedById: JEAN },
        { ...BAN, id: 'b2', bannedById: JEAN, liftedAt: null, liftedById: null },
      ]);

      const res = await app.inject({ method: 'GET', url: '/admin/users/user123/bans' });
      const [lifted, running] = JSON.parse(res.body).data;

      expect(lifted.bannedBy).toEqual(awa);
      expect(lifted.liftedBy).toEqual(jean);
      expect(lifted.liftedBySystem).toBe(false);
      expect(running.bannedBy).toEqual(jean);
      expect(running.liftedBy).toBeNull();
      expect(running.liftedBySystem).toBe(false);
      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
    });

    it('une levée sans administrateur est une levée du SYSTÈME', async () => {
      mockBan.listBans.mockResolvedValue([
        { ...BAN, id: 'b3', bannedById: AWA, liftedAt: new Date('2026-09-05'), liftedById: null },
      ]);

      const res = await app.inject({ method: 'GET', url: '/admin/users/user123/bans' });
      const [ban] = JSON.parse(res.body).data;

      expect(ban.liftedBySystem).toBe(true);
      expect(ban.liftedBy).toBeNull();
    });

    it('un administrateur dont le compte a disparu est servi null, sans erreur', async () => {
      mockBan.listBans.mockResolvedValue([{ ...BAN, id: 'b4', bannedById: '507f1f77bcf86cd7994390ee' }]);

      const res = await app.inject({ method: 'GET', url: '/admin/users/user123/bans' });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data[0].bannedBy).toBeNull();
    });

    it('ne lit que l’identité publique des acteurs', async () => {
      mockBan.listBans.mockResolvedValue([{ ...BAN, bannedById: AWA }]);

      await app.inject({ method: 'GET', url: '/admin/users/user123/bans' });

      const select = mockPrisma.user.findMany.mock.calls[0][0].select;
      expect(Object.keys(select).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);
    });
  });

  it('404 sur une cible inexistante', async () => {
    mockUMS.getUserById.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/admin/users/ghost/bans' });

    expect(res.statusCode).toBe(404);
    expect(mockBan.listBans).not.toHaveBeenCalled();
  });
});
