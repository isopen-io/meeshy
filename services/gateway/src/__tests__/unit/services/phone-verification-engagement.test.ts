/**
 * #8959 — saisir le code SMS qui vérifie son numéro crédite
 * `profile.phone_verified`, seulement quand le numéro devient vérifié.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../services/SmsService', () => ({ smsService: { sendVerificationCode: jest.fn() } }));

import { verifyPhoneCode } from '../../../services/auth/phone-verification';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

async function verifier(ligne: Record<string, unknown> | null) {
  const engagement = { recordActivity: jest.fn<any>(async () => undefined) };
  const prisma = {
    user: {
      findFirst: jest.fn<any>(async () => ligne),
      update: jest.fn<any>(async () => ligne),
    },
  };
  const resultat = await verifyPhoneCode(prisma as never, '+33611223344', '123456', { engagement });
  return { resultat, engagement };
}

const ligne = (phoneVerifiedAt: Date | null) => ({
  id: 'user-1',
  phoneNumber: '+33611223344',
  phoneVerificationCode: sha256('123456'),
  phoneVerifiedAt,
});

describe('#8959 — `profile.phone_verified`', () => {
  it('un numéro NEUVEMENT vérifié crédite le compte', async () => {
    const { resultat, engagement } = await verifier(ligne(null));

    expect(resultat).toEqual({ success: true, verifiedUserId: 'user-1' });
    expect(engagement.recordActivity).toHaveBeenCalledWith('user-1', 'profile.phone_verified');
  });

  it('un numéro déjà vérifié ne recrédite rien', async () => {
    const { engagement } = await verifier(ligne(new Date(0)));

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('un code faux ne crédite rien', async () => {
    const { resultat, engagement } = await verifier(null);

    expect(resultat.success).toBe(false);
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });
});
