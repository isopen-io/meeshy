/**
 * UserManagementService.updateUser — une coordonnée CHANGÉE par
 * l'administration perd son état « vérifié » (spec 2026-10-04 § 7) : une
 * adresse ou un numéro nouveaux n'ont pas été prouvés.
 *
 * Seul un changement RÉEL efface la preuve : resoumettre la même adresse (à la
 * casse près) ou le même numéro ne touche pas à la vérification.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import { makeUser, makePrisma, makeService } from './user-management-mocks';

function ecrit(update: jest.Mock): Record<string, unknown> {
  return (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
}

describe('updateUser — la vérification suit la coordonnée', () => {
  it('une adresse changée remet emailVerifiedAt à null', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'old@ex.com', phoneNumber: '+33600000000' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'new@ex.com' }));
    const svc = makeService(makePrisma({ findUnique, update, passwordResetTokenUpdateMany: jest.fn().mockResolvedValue({ count: 0 }) }));

    await svc.updateUser('user-id', { email: 'new@ex.com' } as never);

    expect(ecrit(update).emailVerifiedAt).toBeNull();
    expect(ecrit(update)).not.toHaveProperty('phoneVerifiedAt');
  });

  it('la même adresse à la casse près garde la vérification', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'same@ex.com' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'same@ex.com' }));
    const svc = makeService(makePrisma({ findUnique, update }));

    await svc.updateUser('user-id', { email: 'Same@Ex.com' } as never);

    expect(ecrit(update)).not.toHaveProperty('emailVerifiedAt');
  });

  it('un numéro changé remet phoneVerifiedAt à null', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    const update = jest.fn().mockResolvedValue(makeUser({ phoneNumber: '+33611111111' }));
    const svc = makeService(makePrisma({ findUnique, update }));

    await svc.updateUser('user-id', { phoneNumber: '+33611111111' } as never);

    expect(ecrit(update).phoneVerifiedAt).toBeNull();
    expect(ecrit(update)).not.toHaveProperty('emailVerifiedAt');
  });

  it('le même numéro garde la vérification', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    const update = jest.fn().mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    const svc = makeService(makePrisma({ findUnique, update }));

    await svc.updateUser('user-id', { phoneNumber: '+33600000000' } as never);

    expect(ecrit(update)).not.toHaveProperty('phoneVerifiedAt');
  });
});
