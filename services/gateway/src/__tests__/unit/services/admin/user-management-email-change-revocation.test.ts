/**
 * UserManagementService.updateUser — révocation des liens de réinitialisation (#6661, #8215)
 * @jest-environment node
 *
 * Un `PasswordResetToken` encore valide émis vers l'ANCIENNE adresse ne doit
 * plus permettre de réinitialiser le compte une fois l'adresse changée par un
 * administrateur — même règle que les deux chemins self-service
 * (`routes/users/contact-change.ts`, `contact-changes.ts`), dans la MÊME
 * écriture que le changement d'adresse.
 *
 * La règle vivait sur `updateEmail`, qu'aucune route n'appelait : la seule
 * porte admin qui change réellement une adresse est le PATCH de la fiche
 * (`updateUser`). #8215 a retiré la méthode morte et porté la révocation là
 * où l'adresse change.
 */

import { describe, it, expect } from '@jest/globals';

import { makeUser, makePrisma, makeService } from './user-management-mocks';

describe('UserManagementService.updateUser — révocation des jetons de réinitialisation', () => {
  it('revokes still-valid password reset tokens in the same transaction when the address changes', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'old@ex.com' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'new@ex.com' }));
    const passwordResetTokenUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({ findUnique, update, passwordResetTokenUpdateMany });
    const svc = makeService(prisma);

    await svc.updateUser('user-id', { email: 'new@ex.com' } as never);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(passwordResetTokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-id', isRevoked: false }),
      data: expect.objectContaining({ isRevoked: true, revokedReason: 'EMAIL_CHANGED' }),
    }));
  });

  it('revokes nothing when the submitted address is the current one up to case', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ email: 'same@ex.com' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'same@ex.com' }));
    const passwordResetTokenUpdateMany = jest.fn();
    const svc = makeService(makePrisma({ findUnique, update, passwordResetTokenUpdateMany }));

    await svc.updateUser('user-id', { email: 'Same@Ex.com' } as never);

    expect(passwordResetTokenUpdateMany).not.toHaveBeenCalled();
  });

  it('revokes nothing when the patch does not touch the address', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ bio: 'x' }));
    const passwordResetTokenUpdateMany = jest.fn();
    const svc = makeService(makePrisma({ update, passwordResetTokenUpdateMany }));

    await svc.updateUser('user-id', { bio: 'x' } as never);

    expect(passwordResetTokenUpdateMany).not.toHaveBeenCalled();
  });
});
