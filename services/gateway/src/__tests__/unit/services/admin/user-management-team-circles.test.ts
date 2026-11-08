/**
 * Un changement de rôle ou d'état de compte se lit TOUT DE SUITE dans les cercles de
 * l'équipe (#16623, audit du 2026-11-08) : `feed:circles:<id>` (5 min) et l'audience
 * temps réel du social (30 s) rangeaient les collègues d'un modérateur rétrogradé, qui
 * voyait encore leurs publications Proches et Sang. Le service appelle l'oubli des
 * cercles de l'équipe APRÈS chaque écriture qui change ce que la loi lit (rôle, actif,
 * désactivé, supprimé) — best-effort, comme la révocation des sessions.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { UserManagementService } from '../../../../services/admin/user-management.service';
import { logger } from '../../../../utils/logger';
import { makeUser, makePrisma } from './user-management-mocks';

const service = (forgetTeamCircles: (userId: string) => Promise<void>, order: string[] = []) => {
  const update = jest.fn(async () => {
    order.push('written');
    return makeUser({});
  });
  return new UserManagementService(makePrisma({ update }), { forgetTeamCircles });
};

describe('UserManagementService — les cercles de l\'équipe oublient un rôle ou un compte qui change', () => {
  const gestures: ReadonlyArray<readonly [string, (svc: UserManagementService) => Promise<unknown>]> = [
    ['updateRole', (svc) => svc.updateRole('user-id', { role: 'USER' } as never)],
    ['updateStatus (désactivation)', (svc) => svc.updateStatus('user-id', { isActive: false })],
    ['updateStatus (réactivation)', (svc) => svc.updateStatus('user-id', { isActive: true })],
    ['deleteUser', (svc) => svc.deleteUser('user-id', 'admin-id')],
    ['restoreUser', (svc) => svc.restoreUser('user-id')],
  ];

  it.each(gestures)('%s oublie les cercles de l\'équipe du compte, APRÈS l\'écriture', async (_name, gesture) => {
    const order: string[] = [];
    const forgetTeamCircles = jest.fn(async (userId: string) => {
      order.push(`forgotten:${userId}`);
    });
    await gesture(service(forgetTeamCircles, order));
    expect(forgetTeamCircles).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['written', 'forgotten:user-id']);
  });

  it('un oubli qui échoue ne fait pas échouer le changement de rôle, et se journalise', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const forgetTeamCircles = jest.fn(async () => {
      throw new Error('cache down');
    });
    await expect(service(forgetTeamCircles).updateRole('user-id', { role: 'USER' } as never)).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('user-id'), expect.anything());
    warn.mockRestore();
  });
});
