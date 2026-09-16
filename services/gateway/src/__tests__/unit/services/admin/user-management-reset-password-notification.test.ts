/**
 * UserManagementService.resetPassword — notification e-mail (#6831)
 *
 * `sendEmail` traversait la validation sans jamais être lu : un admin qui
 * posait `sendEmail: true` recevait un 200 et personne n'était prévenu. Cette
 * suite couvre les trois faces du correctif — opt-in explicite, silence par
 * défaut, et best-effort (un envoi qui échoue ne fait pas échouer la
 * réinitialisation, exactement comme `revokeSessionsBestEffort`).
 */

import { describe, it, expect } from '@jest/globals';

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn().mockResolvedValue('hashed_password'),
  verifyPassword: jest.fn().mockResolvedValue(true),
}));

import { UserManagementService } from '../../../../services/admin/user-management.service';
import { logger } from '../../../../utils/logger';
import { makeUser, makePrisma } from './user-management-mocks';

describe('UserManagementService.resetPassword — notification e-mail', () => {
  it('sendEmail: true ⇒ notifie la cible AVEC la ligne écrite', async () => {
    const written = makeUser({ email: 'target@example.com' });
    const update = jest.fn().mockResolvedValue(written);
    const notifyPasswordReset = jest.fn().mockResolvedValue(undefined);
    const svc = new UserManagementService(makePrisma({ update }), { notifyPasswordReset });

    await svc.resetPassword('user-id', { newPassword: 'newpass', sendEmail: true });

    expect(notifyPasswordReset).toHaveBeenCalledTimes(1);
    expect(notifyPasswordReset).toHaveBeenCalledWith(written);
  });

  it('sendEmail omis ⇒ aucune notification (opt-in, jamais le défaut)', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const notifyPasswordReset = jest.fn().mockResolvedValue(undefined);
    const svc = new UserManagementService(makePrisma({ update }), { notifyPasswordReset });

    await svc.resetPassword('user-id', { newPassword: 'newpass' } as never);

    expect(notifyPasswordReset).not.toHaveBeenCalled();
  });

  it('sendEmail: false ⇒ aucune notification', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const notifyPasswordReset = jest.fn().mockResolvedValue(undefined);
    const svc = new UserManagementService(makePrisma({ update }), { notifyPasswordReset });

    await svc.resetPassword('user-id', { newPassword: 'newpass', sendEmail: false });

    expect(notifyPasswordReset).not.toHaveBeenCalled();
  });

  it("échec de la notification ⇒ le mot de passe reste réinitialisé, l'échec est journalisé", async () => {
    const written = makeUser();
    const update = jest.fn().mockResolvedValue(written);
    const notifyPasswordReset = jest.fn().mockRejectedValue(new Error('provider down'));
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const svc = new UserManagementService(makePrisma({ update }), { notifyPasswordReset });

    const result = await svc.resetPassword('user-id', { newPassword: 'newpass', sendEmail: true });

    expect(result).toBe(written);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(written.id)));
    warn.mockRestore();
  });

  it('sans notificateur injecté, sendEmail: true ne fait pas échouer la réinitialisation', async () => {
    const written = makeUser();
    const update = jest.fn().mockResolvedValue(written);
    const svc = new UserManagementService(makePrisma({ update }));

    await expect(svc.resetPassword('user-id', { newPassword: 'newpass', sendEmail: true })).resolves.toBe(written);
  });
});
