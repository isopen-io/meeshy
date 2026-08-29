/**
 * Les quatre adresses d'écriture d'un compte administré (#4154).
 *
 * Elles remplacent dix routes qui portaient chacune SA garde. Ces témoins
 * vérifient ce que la carte des champs ne peut pas dire toute seule :
 *
 *   - un lot MIXTE (profil + rôle + statut) passe par TROIS lois en une requête ;
 *   - le rôle pose une TROISIÈME question, le rang VISÉ (`canChangeRole`) ;
 *   - chaque écriture laisse une ligne d'audit qui NOMME le champ, l'avant,
 *     l'après et le motif ;
 *   - le lot entier est refusé dès qu'un champ l'est — jamais à moitié écrit.
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
};

const createAuditLog = jest.fn<any>();

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => service),
}));

jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => ({ createAuditLog })),
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

describe('PATCH /admin/users/:userId — un lot, trois lois', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.getUserById.mockResolvedValue(CIBLE);
    service.updateUser.mockResolvedValue({ ...CIBLE, displayName: 'Apres' });
    service.updateRole.mockResolvedValue({ ...CIBLE, role: 'MODERATOR' });
    service.updateStatus.mockResolvedValue({ ...CIBLE, isActive: false });
    createAuditLog.mockResolvedValue(undefined);
  });

  it('écrit profil, rôle et statut en une requête, chacun sous SA loi', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}`,
      payload: { displayName: 'Apres', role: 'MODERATOR', isActive: false, reason: 'reorganisation equipe' },
    });

    expect(res.statusCode).toBe(200);
    expect(service.updateUser).toHaveBeenCalledTimes(1);
    expect(service.updateRole).toHaveBeenCalledTimes(1);
    expect(service.updateStatus).toHaveBeenCalledTimes(1);

    // Le profil ne reçoit QUE ses champs : `role` et `isActive` ne voyagent pas
    // dans l'épandage de `updateUser` (`data: { ...body }`).
    expect(service.updateUser.mock.calls[0][1]).toEqual({ displayName: 'Apres' });

    await app.close();
  });

  it('laisse une ligne d’audit par famille, nommant le champ, l’avant, l’après et le motif', async () => {
    const app = await buildApp();

    await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}`,
      payload: { displayName: 'Apres', role: 'MODERATOR', reason: 'reorganisation equipe' },
    });

    const profil = derniereTrace('UPDATE_PROFILE');
    expect(profil?.changes).toEqual({ displayName: { before: 'Avant', after: 'Apres' } });
    expect(profil?.metadata).toEqual({ reason: 'reorganisation equipe' });

    const role = derniereTrace('UPDATE_ROLE');
    expect(role?.changes).toEqual({ role: { before: 'USER', after: 'MODERATOR' } });
    expect(role?.adminId).toBe(ADMIN_ID);
    expect(role?.userId).toBe(CIBLE_ID);

    await app.close();
  });

  it('refuse le lot ENTIER quand un champ n’a pas de loi — rien n’est écrit', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}`,
      payload: { displayName: 'Apres', password: 'contournement' },
    });

    expect(res.statusCode).toBe(400);
    expect(service.updateUser).not.toHaveBeenCalled();

    await app.close();
  });

  it('refuse une promotion vers un rang que l’acteur ne surclasse pas', async () => {
    // La TROISIÈME question du rôle : ni la permission ni la hiérarchie sur la
    // CIBLE ne la posent — un ADMIN surclasse un USER et peut écrire `role`,
    // mais il ne peut pas le hisser au-dessus de lui-même.
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}`,
      payload: { role: 'BIGBOSS' },
    });

    expect(res.statusCode).toBe(403);
    expect(service.updateRole).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('PATCH /admin/users/:userId/security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.getUserById.mockResolvedValue(CIBLE);
    service.unlockAccount.mockResolvedValue(CIBLE);
    service.disable2FA.mockResolvedValue(CIBLE);
    createAuditLog.mockResolvedValue(undefined);
  });

  it('déverrouille et désarme le second facteur, avec sa trace', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}/security`,
      payload: { unlock: true, twoFactorEnabled: false, reason: 'appareil perdu, identite verifiee' },
    });

    expect(res.statusCode).toBe(200);
    expect(service.unlockAccount).toHaveBeenCalledTimes(1);
    expect(service.disable2FA).toHaveBeenCalledTimes(1);
    expect(derniereTrace('DISABLE_2FA')?.metadata).toEqual({ reason: 'appareil perdu, identite verifiee' });

    await app.close();
  });

  it('refuse un ADMIN qui vise un souverain — la hiérarchie précède la loi du champ', async () => {
    service.getUserById.mockResolvedValue({ ...CIBLE, role: 'BIGBOSS' });
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}/security`,
      payload: { twoFactorEnabled: false },
    });

    expect(res.statusCode).toBe(403);
    expect(service.disable2FA).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('PATCH /admin/users/:userId/verifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.getUserById.mockResolvedValue(CIBLE);
    service.verifyEmail.mockResolvedValue(CIBLE);
    service.verifyAge.mockResolvedValue(CIBLE);
    createAuditLog.mockResolvedValue(undefined);
  });

  it('pose deux vérifications en une requête', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}/verifications`,
      payload: { emailVerified: true, ageVerified: true, reason: 'piece justificative recue' },
    });

    expect(res.statusCode).toBe(200);
    expect(service.verifyEmail).toHaveBeenCalledWith(CIBLE_ID, true, ADMIN_ID);
    expect(service.verifyAge).toHaveBeenCalledWith(CIBLE_ID, true, ADMIN_ID);
    // L'âge était journalisé en UPDATE_PROFILE : la ligne ne disait pas quel
    // geste avait eu lieu.
    expect(derniereTrace('VERIFY_AGE')).toBeDefined();

    await app.close();
  });
});

describe('PATCH /admin/users/:userId/consents — le rang souverain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.getUserById.mockResolvedValue(CIBLE);
    service.toggleVoiceConsent.mockResolvedValue(CIBLE);
    createAuditLog.mockResolvedValue(undefined);
  });

  it('refuse un ADMIN, quelle que soit sa permission', async () => {
    const app = await buildApp('ADMIN');

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}/consents`,
      payload: { voiceProfile: true, reason: 'demande RGPD ecrite du 2026-08-29' },
    });

    expect(res.statusCode).toBe(403);
    expect(service.toggleVoiceConsent).not.toHaveBeenCalled();

    await app.close();
  });

  it('refuse un souverain SANS motif écrit', async () => {
    const app = await buildApp('BIGBOSS');

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}/consents`,
      payload: { voiceProfile: true },
    });

    expect(res.statusCode).toBe(400);
    expect(service.toggleVoiceConsent).not.toHaveBeenCalled();

    await app.close();
  });

  it('admet un souverain motivé, et journalise la preuve sous son propre nom', async () => {
    const app = await buildApp('BIGBOSS');

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}/consents`,
      payload: { voiceProfile: true, reason: 'demande RGPD ecrite du 2026-08-29' },
    });

    expect(res.statusCode).toBe(200);
    expect(service.toggleVoiceConsent).toHaveBeenCalledWith(CIBLE_ID, 'voiceProfile', true, ADMIN_ID);
    const trace = derniereTrace('UPDATE_CONSENT');
    expect(trace?.changes).toEqual({ voiceProfile: { before: null, after: true } });
    expect(trace?.metadata).toEqual({ reason: 'demande RGPD ecrite du 2026-08-29' });

    await app.close();
  });
});
