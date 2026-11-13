/**
 * Un compte désactivé ou supprimé ne partage plus sa position (#16987) : le partage en
 * cours s'éteint et ceux qui le voyaient en sont prévenus. Après l'écriture, jamais avant,
 * et sans faire échouer le geste ; une réactivation ne rallume rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { UserManagementService } from '../../../../services/admin/user-management.service';
import { logger } from '../../../../utils/logger';
import { makeUser, makePrisma } from './user-management-mocks';

const service = (endSharedLocation: (userId: string) => Promise<void>, order: string[] = []) => {
  const update = jest.fn(async () => {
    order.push('written');
    return makeUser({});
  });
  return new UserManagementService(makePrisma({ update }), { endSharedLocation });
};

describe('UserManagementService — le partage de position s\'éteint avec le compte', () => {
  it.each([
    ['updateStatus (désactivation)', (svc: UserManagementService) => svc.updateStatus('user-id', { isActive: false })],
    ['deleteUser', (svc: UserManagementService) => svc.deleteUser('user-id', 'admin-id')],
  ] as const)('%s éteint le partage APRÈS l\'écriture', async (_name, gesture) => {
    const order: string[] = [];
    const end = jest.fn(async (userId: string) => {
      order.push(`ended:${userId}`);
    });
    await gesture(service(end, order));
    expect(order).toEqual(['written', 'ended:user-id']);
  });

  it('réactiver, restaurer ou changer un rôle n\'éteint rien', async () => {
    const end = jest.fn(async () => undefined);
    const svc = service(end);
    await svc.updateStatus('user-id', { isActive: true });
    await svc.restoreUser('user-id');
    await svc.updateRole('user-id', { role: 'USER' } as never);
    expect(end).not.toHaveBeenCalled();
  });

  it('une extinction qui échoue ne fait pas échouer la désactivation, et se journalise', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const end = jest.fn(async () => {
      throw new Error('redis down');
    });
    await expect(service(end).updateStatus('user-id', { isActive: false })).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('user-id'), expect.anything());
    warn.mockRestore();
  });
});
