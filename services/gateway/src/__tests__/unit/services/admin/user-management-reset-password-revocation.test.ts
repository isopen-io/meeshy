/**
 * UserManagementService.resetPassword — révocation des sessions actives (#5569)
 * @jest-environment node
 *
 * Extrait de user-management.service.test.ts pour ne pas le faire grossir
 * au-delà du budget de taille des suites (`gateway-test-file-size-budget.test.ts`).
 *
 * Un mot de passe réinitialisé par un admin (ex: réponse à un incident,
 * compte compromis signalé) doit couper les sessions déjà ouvertes ; sans
 * cela le compte garde son accès REST jusqu'à expiration du JWT (jusqu'à
 * 24h) malgré le nouveau mot de passe. Même patron que la garde existante
 * sur `updateStatus` (`user-management.service.test.ts` §
 * « révocation des sockets du compte désactivé »).
 */

import { describe, it, expect } from '@jest/globals';

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn().mockResolvedValue('hashed_password'),
  verifyPassword: jest.fn().mockResolvedValue(true),
}));

import { UserManagementService } from '../../../../services/admin/user-management.service';
import { logger } from '../../../../utils/logger';
import { makeUser, makePrisma, makeService } from './user-management-mocks';

describe('UserManagementService.resetPassword — révocation des sessions actives', () => {
  it("réinitialiser le mot de passe appelle la révocation avec l'id, APRÈS que l'écriture a abouti", async () => {
    const order: string[] = [];
    const update = jest.fn(() => new Promise((resolve) => setTimeout(() => {
      order.push('written');
      resolve(makeUser());
    }, 5)));
    const revokeSessions = jest.fn(async (userId: string) => { order.push(`revoked:${userId}`); return 1; });
    const svc = new UserManagementService(makePrisma({ update }), { revokeSessions });

    await svc.resetPassword('user-id', { newPassword: 'newpass' });

    expect(revokeSessions).toHaveBeenCalledTimes(1);
    expect(revokeSessions).toHaveBeenCalledWith('user-id');
    expect(order).toEqual(['written', 'revoked:user-id']);
  });

  it("échec de la révocation ⇒ l'écriture est faite, l'utilisateur est rendu, l'échec est journalisé", async () => {
    const written = makeUser();
    const update = jest.fn().mockResolvedValue(written);
    const revokeSessions = jest.fn(async (_userId: string) => { throw new Error('adapter down'); });
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const svc = new UserManagementService(makePrisma({ update }), { revokeSessions });

    const result = await svc.resetPassword('user-id', { newPassword: 'newpass' });

    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toBe(written);
    expect(revokeSessions).toHaveBeenCalledWith('user-id');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('user-id'));
    warn.mockRestore();
  });

  it('sans révocateur injecté, réinitialiser écrit et rend l\'utilisateur', async () => {
    const written = makeUser();
    const update = jest.fn().mockResolvedValue(written);
    const svc = makeService(makePrisma({ update }));

    await expect(svc.resetPassword('user-id', { newPassword: 'newpass' })).resolves.toBe(written);
  });
});
