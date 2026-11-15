/**
 * #8959 — armer son second facteur (premier code TOTP juste) crédite
 * `profile.two_factor` ; un code faux ou un facteur déjà armé ne crédite rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

const mockTotpVerify = jest.fn<any>();
jest.mock('speakeasy', () => ({
  default: { generateSecret: jest.fn(), totp: { verify: (...args: unknown[]) => mockTotpVerify(...args) } },
  generateSecret: jest.fn(),
  totp: { verify: (...args: unknown[]) => mockTotpVerify(...args) },
}));
jest.mock('qrcode', () => ({ default: { toDataURL: jest.fn() }, toDataURL: jest.fn() }));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { TwoFactorService } from '../../../services/TwoFactorService';

const USER_ID = 'user-1';

async function activer(options: { readonly codeJuste: boolean; readonly dejaArme: boolean }) {
  mockTotpVerify.mockReturnValue(options.codeJuste);
  const engagement = { recordActivity: jest.fn<any>(async () => undefined) };
  const prisma = {
    user: {
      findUnique: jest.fn<any>(async () => ({
        id: USER_ID,
        username: 'alice',
        twoFactorPendingSecret: 'SECRET',
        twoFactorEnabledAt: options.dejaArme ? new Date(0) : null,
      })),
      update: jest.fn<any>(async () => ({})),
    },
  };
  const resultat = await new TwoFactorService(prisma as never, engagement).enable(USER_ID, '123456');
  return { resultat, engagement };
}

describe('#8959 — `profile.two_factor`', () => {
  it('crédite le compte quand le second facteur est armé', async () => {
    const { resultat, engagement } = await activer({ codeJuste: true, dejaArme: false });

    expect(resultat.success).toBe(true);
    expect(engagement.recordActivity).toHaveBeenCalledWith(USER_ID, 'profile.two_factor');
  });

  it('ne crédite rien pour un code faux', async () => {
    const { resultat, engagement } = await activer({ codeJuste: false, dejaArme: false });

    expect(resultat.success).toBe(false);
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite rien quand le facteur est déjà armé', async () => {
    const { engagement } = await activer({ codeJuste: true, dejaArme: true });

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });
});
