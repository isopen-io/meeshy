/**
 * LE TÉLÉPHONE SUIVI de l'injoignabilité (#18737) — le même que celui de la batterie, sans son repli :
 * un compte sans téléphone reconnu n'a rien à surveiller.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { isTrackedPhone } from '../../../../services/phoneReachability/phoneReachabilityDeps';

const USER = '6800000000000000000000e1';
const NOW = new Date('2026-11-15T14:00:00.000Z');
const LATER = new Date('2026-12-15T14:00:00.000Z');

const session = (id: string, over: Record<string, unknown>, minutes: number) => ({
  id,
  userId: USER,
  isValid: true,
  expiresAt: LATER,
  lastActivityAt: new Date(NOW.getTime() - minutes * 60_000),
  deviceType: null,
  platform: null,
  deviceModel: null,
  ...over,
});

const prismaOf = (rows: ReadonlyArray<Record<string, unknown>>) =>
  ({
    userSession: {
      findMany: async () =>
        [...rows]
          .sort((a, b) => (b.lastActivityAt as Date).getTime() - (a.lastActivityAt as Date).getTime())
          .map(({ id, deviceType, platform, deviceModel }) => ({ id, deviceType, platform, deviceModel })),
    },
  }) as never;

describe('isTrackedPhone', () => {
  it('le téléphone le plus récemment actif est suivi ; un ordinateur ne l\'est pas', async () => {
    const prisma = prismaOf([session('phone', { platform: 'ios', deviceType: 'mobile' }, 5), session('mac', { platform: 'web', deviceType: 'desktop' }, 1)]);
    expect(await isTrackedPhone(prisma, { userId: USER, sessionId: 'phone', now: NOW })).toBe(true);
    expect(await isTrackedPhone(prisma, { userId: USER, sessionId: 'mac', now: NOW })).toBe(false);
  });

  it('un compte sans téléphone reconnu n\'a rien de suivi', async () => {
    const prisma = prismaOf([session('mac', { platform: 'web', deviceType: 'desktop' }, 1)]);
    expect(await isTrackedPhone(prisma, { userId: USER, sessionId: 'mac', now: NOW })).toBe(false);
  });

  it('une tablette n\'est pas un téléphone', async () => {
    const prisma = prismaOf([session('ipad', { platform: 'ios', deviceType: 'mobile', deviceModel: 'iPad13,1' }, 1)]);
    expect(await isTrackedPhone(prisma, { userId: USER, sessionId: 'ipad', now: NOW })).toBe(false);
  });
});
