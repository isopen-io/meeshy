/**
 * UserManagementService.updateEmail — révocation des liens de réinitialisation (#6661)
 * @jest-environment node
 *
 * Un `PasswordResetToken` encore valide émis vers l'ANCIENNE adresse ne doit
 * plus permettre de réinitialiser le compte une fois l'adresse changée par un
 * administrateur — même règle que les deux chemins self-service
 * (`routes/users/contact-change.ts`, `contact-changes.ts`), dans la MÊME
 * écriture que le changement d'adresse.
 */

import { describe, it, expect } from '@jest/globals';

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn().mockResolvedValue('hashed_password'),
  verifyPassword: jest.fn().mockResolvedValue(true),
}));

import { makeUser, makePrisma, makeService } from './user-management-mocks';

describe('UserManagementService.updateEmail — révocation des jetons de réinitialisation', () => {
  it('revokes still-valid password reset tokens for the account in the same transaction', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ password: 'hashed' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'new@ex.com' }));
    const passwordResetTokenUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({ findUnique, update, passwordResetTokenUpdateMany });
    const svc = makeService(prisma);

    await svc.updateEmail('user-id', { password: 'correct', newEmail: 'new@ex.com' });

    expect(passwordResetTokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-id', isRevoked: false }),
      data: expect.objectContaining({ isRevoked: true, revokedReason: 'EMAIL_CHANGED' }),
    }));
  });

  it('does not revoke anything when the password check fails and the email is left unchanged', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeUser({ password: 'hashed' }));
    const passwordResetTokenUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const { verifyPassword } = jest.requireMock('../../../../utils/password-hash') as { verifyPassword: jest.Mock };
    verifyPassword.mockResolvedValueOnce(false);
    const prisma = makePrisma({ findUnique, passwordResetTokenUpdateMany });
    const svc = makeService(prisma);

    await expect(svc.updateEmail('user-id', { password: 'wrong', newEmail: 'new@ex.com' }))
      .rejects.toThrow('Invalid password');

    expect(passwordResetTokenUpdateMany).not.toHaveBeenCalled();
  });
});
