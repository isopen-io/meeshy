/**
 * #16814 — un rôle retiré, un compte désactivé ou supprimé par l'administration éteint les
 * partages accordés hors rituel entre collègues de l'équipe (`revokeTeamSharesOf`), APRÈS
 * l'écriture qui fait perdre l'équipe, en best-effort comme l'oubli des cercles. La
 * réactivation et la restauration ne rallument rien : un accord éteint se redonne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { UserManagementService } from '../../../../services/admin/user-management.service';
import { logger } from '../../../../utils/logger';
import { makeUser, makePrisma } from './user-management-mocks';

const service = (revokeTeamShares: (userId: string) => Promise<void>, order: string[] = []) => {
  const update = jest.fn(async () => {
    order.push('written');
    return makeUser({});
  });
  return new UserManagementService(makePrisma({ update }), { revokeTeamShares });
};

describe('UserManagementService — les partages entre collègues tombent avec l\'équipe', () => {
  it.each<readonly [string, (svc: UserManagementService) => Promise<unknown>]>([
    ['updateRole', (svc) => svc.updateRole('user-id', { role: 'USER' } as never)],
    ['updateStatus (désactivation)', (svc) => svc.updateStatus('user-id', { isActive: false })],
    ['deleteUser', (svc) => svc.deleteUser('user-id', 'admin-id')],
  ])('%s éteint les partages hors rituel du compte, APRÈS l\'écriture', async (_name, gesture) => {
    const order: string[] = [];
    const revokeTeamShares = jest.fn(async (userId: string) => {
      order.push(`revoked:${userId}`);
    });
    await gesture(service(revokeTeamShares, order));
    expect(order).toEqual(['written', 'revoked:user-id']);
  });

  it.each<readonly [string, (svc: UserManagementService) => Promise<unknown>]>([
    ['updateStatus (réactivation)', (svc) => svc.updateStatus('user-id', { isActive: true })],
    ['restoreUser', (svc) => svc.restoreUser('user-id')],
  ])('%s ne touche à aucun partage', async (_name, gesture) => {
    const revokeTeamShares = jest.fn(async () => undefined);
    await gesture(service(revokeTeamShares));
    expect(revokeTeamShares).not.toHaveBeenCalled();
  });

  it('une extinction qui échoue ne fait pas échouer le changement de rôle, et se journalise', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const revokeTeamShares = jest.fn(async () => {
      throw new Error('base injoignable');
    });
    await expect(service(revokeTeamShares).updateRole('user-id', { role: 'USER' } as never)).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('user-id'), expect.anything());
    warn.mockRestore();
  });
});
