/**
 * Une écriture sur un membre sert la FICHE relue, pas la ligne nue de
 * `prisma.user.update` : le web lit `_count` et `adminMetadata` dans la
 * réponse de chaque geste pour rafraîchir la fiche sans la recharger. Le
 * `update` ne charge aucun `_count` — la réponse sortait sans, et la fiche
 * affichait zéro partout après chaque geste (audit de contrat du 2026-10-04).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const service: Record<string, jest.Mock<any>> = {
  getUserById: jest.fn<any>(),
  updateUser: jest.fn<any>(),
  updateRole: jest.fn<any>(),
  updateStatus: jest.fn<any>(),
  verifyEmail: jest.fn<any>(),
  verifyPhone: jest.fn<any>(),
  verifyAge: jest.fn<any>(),
  unlockAccount: jest.fn<any>(),
  enable2FA: jest.fn<any>(),
  disable2FA: jest.fn<any>(),
  toggleVoiceConsent: jest.fn<any>(),
  createUser: jest.fn<any>(),
  resetPassword: jest.fn<any>(),
  deleteUser: jest.fn<any>(),
  getUsers: jest.fn<any>(),
  restoreUser: jest.fn<any>(),
};

const createAuditLog = jest.fn<any>();

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => service),
}));

jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => ({ createAuditLog, logCreateUser: createAuditLog, logRestoreUser: createAuditLog, logResetPassword: createAuditLog })),
}));

// `permissionsService` n'est PAS doublé : c'est la loi que ces témoins
// exercent. Un double la remplacerait par ce qu'on croit qu'elle dit.

import { userAdminRoutes } from '../../../../routes/admin/users';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const CIBLE_ID = '507f1f77bcf86cd799439022';

const CIBLE = {
  id: CIBLE_ID,
  username: 'testeur',
  email: 'testeur@meeshy.me',
  displayName: 'Avant',
  role: 'USER',
  isActive: true,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  lockedUntil: null,
  voiceProfileConsentAt: null,
};

async function buildApp(role = 'ADMIN'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
    };
  });
  // `requireHierarchy` lit le RANG de la cible en base — c'est là qu'il est
  // déclaré, donc le seul endroit où il ne peut pas manquer.
  app.decorate('prisma', {
    user: { findUnique: async () => ({ role: (await service.getUserById()).role }) },
  } as any);
  await app.register(userAdminRoutes);
  await app.ready();
  return app;
}

function derniereTrace(action: string) {
  const appels = createAuditLog.mock.calls.map((c) => c[0] as Record<string, unknown>);
  return appels.find((a) => a.action === action);
}


const COMPTES = { participations: 7, createdShareLinks: 1, createdTrackingLinks: 0, createdAffiliateTokens: 0, affiliateRelations: 0, referredRelations: 0, sentFriendRequests: 2, receivedFriendRequests: 3 };
const RELUE = { ...CIBLE, displayName: 'Relue', _count: COMPTES };

function lectures() {
  // 1re lecture : l'admission (la cible avant le geste) ; les suivantes : la relecture.
  service.getUserById.mockReset();
  service.getUserById.mockResolvedValueOnce(CIBLE).mockResolvedValue(RELUE);
}

describe('une écriture sert la fiche relue (avec _count et adminMetadata)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lectures();
    for (const m of ['updateUser', 'updateRole', 'updateStatus', 'verifyEmail', 'verifyPhone', 'verifyAge', 'unlockAccount', 'enable2FA', 'disable2FA', 'toggleVoiceConsent']) {
      service[m].mockResolvedValue({ ...CIBLE });
    }
    createAuditLog.mockResolvedValue(undefined);
  });

  it.each([
    ['PATCH /admin/users/:id', 'ADMIN', `/admin/users/${CIBLE_ID}`, { displayName: 'Relue' }],
    ['PATCH /admin/users/:id/security', 'ADMIN', `/admin/users/${CIBLE_ID}/security`, { unlock: true }],
    ['PATCH /admin/users/:id/verifications', 'ADMIN', `/admin/users/${CIBLE_ID}/verifications`, { emailVerified: true }],
    ['PATCH /admin/users/:id/consents', 'BIGBOSS', `/admin/users/${CIBLE_ID}/consents`, { voiceProfile: true }],
  ])('%s', async (_nom, role, url, payload) => {
    const app = await buildApp(role);
    const res = await app.inject({ method: 'PATCH', url, payload });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data._count).toEqual(COMPTES);
    expect(data.adminMetadata).toBeDefined();
    expect(data.displayName).toBe('Relue');
    await app.close();
  });

  it('POST /admin/users sert le compte créé, relu', async () => {
    service.getUserById.mockReset();
    service.getUserById.mockResolvedValue(RELUE);
    service.createUser.mockResolvedValue({ ...CIBLE });
    const app = await buildApp('BIGBOSS');
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users',
      payload: { username: 'testeur', email: 'testeur@meeshy.me', password: 'Un-Mot-De-Passe-Solide-42!', firstName: 'Te', lastName: 'Steur' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data._count).toEqual(COMPTES);
    expect(res.json().data.adminMetadata).toBeDefined();
    await app.close();
  });

  it('POST /admin/users/:id/restore sert le compte restauré, relu', async () => {
    service.restoreUser.mockResolvedValue({ ...CIBLE });
    const app = await buildApp('BIGBOSS');
    const res = await app.inject({ method: 'POST', url: `/admin/users/${CIBLE_ID}/restore` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data._count).toEqual(COMPTES);
    expect(res.json().data.adminMetadata).toBeDefined();
    await app.close();
  });
});

describe('POST /admin/users/:id/reset-password — le motif reçu est consigné', () => {
  it('passe le motif à la trace (il était reçu, puis perdu)', async () => {
    jest.clearAllMocks();
    service.getUserById.mockResolvedValue(CIBLE);
    service.resetPassword.mockResolvedValue(CIBLE);
    const app = await buildApp('BIGBOSS');
    const res = await app.inject({
      method: 'POST',
      url: `/admin/users/${CIBLE_ID}/reset-password`,
      payload: { newPassword: 'Xk9$mQ2vLp8#nR4wZ', reason: 'demande écrite du membre' },
    });
    expect(res.statusCode).toBe(200);
    const appel = createAuditLog.mock.calls[0] as unknown[];
    expect(appel[4]).toBe('demande écrite du membre');
    await app.close();
  });
});

describe('GET /admin/users — la ligne de journal désigne un membre', () => {
  it("entity 'User' porte un id de membre (le lecteur), jamais la chaîne 'users'", async () => {
    jest.clearAllMocks();
    service.getUsers.mockResolvedValue({ users: [], total: 0 });
    const app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(res.statusCode).toBe(200);
    expect(derniereTrace('VIEW_USER_LIST')).toMatchObject({ entityId: ADMIN_ID, userId: ADMIN_ID });
    await app.close();
  });
});
