/**
 * Unit tests for ReferralCodeService.ensureReferralCode.
 * Covers: lazy generation, idempotency, collision retry, unknown user.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { ensureReferralCode, REFERRAL_CODE_PREFIX } from '../../../services/ReferralCodeService';

function makePrisma(overrides: {
  user?: { id: string; referralCode: string | null } | null;
  takenCodes?: Set<string>;
}) {
  const { user = null, takenCodes = new Set<string>() } = overrides;
  let stored = user;

  return {
    user: {
      findUnique: jest.fn(async (args: any) => {
        if (args.where.id) {
          return stored && stored.id === args.where.id ? { ...stored } : null;
        }
        if (args.where.referralCode) {
          return takenCodes.has(args.where.referralCode) ? { id: 'someone-else' } : null;
        }
        return null;
      }),
      update: jest.fn(async (args: any) => {
        stored = { id: args.where.id, referralCode: args.data.referralCode };
        return { referralCode: args.data.referralCode };
      }),
    },
  };
}

describe('ensureReferralCode', () => {
  it('génère un code préfixé quand le compte n’en a pas encore', async () => {
    const prisma = makePrisma({ user: { id: 'u1', referralCode: null } });

    const code = await ensureReferralCode(prisma, 'u1');

    expect(code.startsWith(REFERRAL_CODE_PREFIX)).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('est idempotent — un second appel rend le MÊME code, sans écrire', async () => {
    const prisma = makePrisma({ user: { id: 'u1', referralCode: null } });

    const first = await ensureReferralCode(prisma, 'u1');
    const second = await ensureReferralCode(prisma, 'u1');

    expect(second).toBe(first);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('rend directement le code déjà enregistré, sans jamais générer', async () => {
    const prisma = makePrisma({ user: { id: 'u1', referralCode: 'ref_existant' } });

    const code = await ensureReferralCode(prisma, 'u1');

    expect(code).toBe('ref_existant');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('réessaie sous collision jusqu’à trouver un code libre', async () => {
    const prisma = makePrisma({
      user: { id: 'u1', referralCode: null },
      takenCodes: new Set(['placeholder']),
    });
    // Force une collision sur la PREMIÈRE tentative, quelle que soit sa valeur.
    let calls = 0;
    prisma.user.findUnique.mockImplementation(async (args: any) => {
      if (args.where.id) return { id: 'u1', referralCode: null };
      if (args.where.referralCode) {
        calls += 1;
        return calls === 1 ? { id: 'someone-else' } : null;
      }
      return null;
    });

    const code = await ensureReferralCode(prisma, 'u1');

    expect(code.startsWith(REFERRAL_CODE_PREFIX)).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('lève pour un compte inconnu', async () => {
    const prisma = makePrisma({ user: null });

    await expect(ensureReferralCode(prisma, 'ghost')).rejects.toThrow(/unknown user/i);
  });
});
