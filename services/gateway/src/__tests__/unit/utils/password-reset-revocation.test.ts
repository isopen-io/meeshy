/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  revokePasswordResetTokensForEmailChange,
  EMAIL_CHANGED_REVOKE_REASON,
} from '../../../utils/password-reset-revocation';

describe('revokePasswordResetTokensForEmailChange', () => {
  it('revokes only still-valid, unconsumed tokens of the account, with an explicit reason', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { passwordResetToken: { updateMany } };

    await revokePasswordResetTokensForEmailChange(tx as never, 'user-1');

    expect(updateMany).toHaveBeenCalledTimes(1);
    const call = updateMany.mock.calls[0][0];
    expect(call.where.userId).toBe('user-1');
    expect(call.where.isRevoked).toBe(false);
    expect(call.where.expiresAt).toEqual({ gt: expect.any(Date) });
    // `usedAt` absent (jamais renseigné au `create`) OU explicitement `null`
    // désignent tous deux « pas encore consommé » sur MongoDB (`prisma-unset.ts`).
    expect(call.where.OR).toEqual([
      { usedAt: null },
      { usedAt: { isSet: false } },
    ]);
    expect(call.data).toEqual({
      isRevoked: true,
      revokedReason: EMAIL_CHANGED_REVOKE_REASON,
    });
  });
});
