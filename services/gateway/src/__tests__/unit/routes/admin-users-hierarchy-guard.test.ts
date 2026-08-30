/**
 * Un ADMIN ne peut pas désarmer le second facteur d'un BIGBOSS (#4144).
 *
 * `routes/admin/users.ts` applique une garde de HIÉRARCHIE — « puis-je agir sur
 * quelqu'un de ce rang ? » — sur dix de ses routes d'écriture :
 * `permissionsService.canModifyUser(adminRole, targetUser.role)`. Trois routes
 * chargeaient bien leur `targetUser`, avaient donc son rôle sous la main, et
 * omettaient l'appel :
 *
 *   POST /admin/users/:userId/unlock       → déverrouiller le compte d'un souverain
 *   POST /admin/users/:userId/enable-2fa   → lui imposer un second facteur
 *   POST /admin/users/:userId/disable-2fa  → LUI RETIRER son second facteur
 *
 * `requireUserModifyAccess` ne couvre pas ce trou : il vérifie que l'appelant a
 * la permission `canUpdateUsers` — vraie pour ADMIN — jamais qu'il a le rang
 * pour agir sur CETTE cible.
 *
 * La chaîne complète : retirer la double authentification d'un BIGBOSS, puis
 * lui réinitialiser son mot de passe.
 *
 * POURQUOI L'APPELANT EST « ADMIN » ET LA CIBLE « BIGBOSS » : un témoin où
 * l'appelant est BIGBOSS ne peut pas tomber — au rang le plus haut, la garde
 * présente et la garde absente rendent le même verdict. Un témoin de hiérarchie
 * s'écrit sur un rang AUTRE que le sommet.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const unlockAccount = jest.fn<any>();
const enable2FA = jest.fn<any>();
const disable2FA = jest.fn<any>();
const resetPassword = jest.fn<any>();
const getUserById = jest.fn<any>();

jest.mock('../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => ({
    getUserById: (...a: any[]) => getUserById(...a),
    unlockAccount: (...a: any[]) => unlockAccount(...a),
    enable2FA: (...a: any[]) => enable2FA(...a),
    disable2FA: (...a: any[]) => disable2FA(...a),
    resetPassword: (...a: any[]) => resetPassword(...a),
  })),
}));

jest.mock('../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => ({
    createAuditLog: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

// `permissionsService` n'est PAS doublé : c'est la loi que ces témoins
// exercent. Un double la remplacerait par ce qu'on croit qu'elle dit.

import { userAdminRoutes } from '../../../routes/admin/users';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const SOUVERAIN_ID = '507f1f77bcf86cd799439099';

/** L'appelant est ADMIN ; la cible est BIGBOSS, donc d'un rang STRICTEMENT supérieur. */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN' },
    };
  });
  // `requireHierarchy` (#4154) lit le RANG de la cible en base — c'est là, et
  // nulle part ailleurs, qu'il est déclaré. Un double `prisma` vide serait plus
  // pauvre que la production : la garde y lèverait au lieu de refuser, et le
  // témoin lirait 500 là où il croit lire 403.
  app.decorate('prisma', {
    user: {
      findUnique: async () => ({ role: (await getUserById()).role }),
    },
  } as any);
  await app.register(userAdminRoutes);
  await app.ready();
  return app;
}

const CIBLE_SOUVERAINE = {
  id: SOUVERAIN_ID,
  username: 'patron',
  email: 'patron@meeshy.me',
  role: 'BIGBOSS',
  isActive: true,
};

describe('routes/admin/users — un ADMIN n’agit pas sur un BIGBOSS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserById.mockResolvedValue(CIBLE_SOUVERAINE);
    unlockAccount.mockResolvedValue(CIBLE_SOUVERAINE);
    enable2FA.mockResolvedValue(CIBLE_SOUVERAINE);
    disable2FA.mockResolvedValue(CIBLE_SOUVERAINE);
  });

  const cas = [
    { url: `/admin/users/${SOUVERAIN_ID}/unlock`, service: () => unlockAccount, nom: 'déverrouiller son compte' },
    { url: `/admin/users/${SOUVERAIN_ID}/enable-2fa`, service: () => enable2FA, nom: 'lui imposer un second facteur' },
    { url: `/admin/users/${SOUVERAIN_ID}/disable-2fa`, service: () => disable2FA, nom: 'lui RETIRER son second facteur' },
  ];

  it.each(cas)('refuse de $nom', async ({ url, service }) => {
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url });

    expect(res.statusCode).toBe(403);
    // L'écriture ne doit pas seulement être refusée en réponse : elle ne doit
    // pas AVOIR LIEU. Un témoin qui n'observe que le statut ne verrait pas une
    // garde posée après l'appel au service.
    expect(service()).not.toHaveBeenCalled();

    await app.close();
  });

  it('réinitialise un mot de passe sous `canResetPasswords`, pas sous `canUpdateUsers`', async () => {
    // Les deux permissions valent `true` pour ADMIN, donc ce témoin ne prouve
    // pas un refus : il prouve que la route CONSULTE la permission qui la
    // nomme. `canResetPasswords` était déclarée dans la matrice et lue par
    // aucun site — le jour où un rôle reçoit `canUpdateUsers` sans elle, c'est
    // cette lecture-là qui le retiendra.
    const { permissionsService } = await import('../../../services/admin/permissions.service');
    const espion = jest.spyOn(permissionsService, 'hasPermission');
    getUserById.mockResolvedValue({ ...CIBLE_SOUVERAINE, role: 'USER' });
    resetPassword.mockResolvedValue({ ...CIBLE_SOUVERAINE, role: 'USER' });
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: `/admin/users/${SOUVERAIN_ID}/reset-password`,
      payload: { newPassword: 'unMotDePasseAssezLong1!', forceChange: false },
    });

    expect(espion).toHaveBeenCalledWith('ADMIN', 'canResetPasswords');

    espion.mockRestore();
    await app.close();
  });

  it('laisse un ADMIN agir sur un utilisateur ordinaire — la garde ne bloque pas tout', async () => {
    getUserById.mockResolvedValue({ ...CIBLE_SOUVERAINE, role: 'USER' });
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: `/admin/users/${SOUVERAIN_ID}/unlock` });

    expect(res.statusCode).toBe(200);
    expect(unlockAccount).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
