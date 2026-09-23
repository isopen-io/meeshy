import { describe, it, expect, jest } from '@jest/globals';
import { ActiveCallClaim } from '../activeCallClaim';

const LIVE = ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'] as const;

const makePrisma = (opts: { claimCount?: number; holderId?: string | null; holderStatus?: string | null; swapCount?: number; releaseCount?: number } = {}) => {
  const updateMany = jest.fn(async (args: { where: { activeCallId?: unknown } }) => {
    const where = args.where;
    if ('OR' in where) return { count: opts.claimCount ?? 1 };
    if (where.activeCallId === opts.holderId && opts.swapCount !== undefined) return { count: opts.swapCount };
    return { count: opts.releaseCount ?? 1 };
  });
  return {
    conversation: {
      updateMany,
      findUnique: jest.fn(async () => ({ activeCallId: opts.holderId ?? null })),
    },
    callSession: {
      findUnique: jest.fn(async () => (opts.holderStatus ? { status: opts.holderStatus } : null)),
    },
  };
};

describe('ActiveCallClaim — la réservation d’appel dit à la liste qu’elle a changé (#7545)', () => {
  it('une réservation gagnée notifie la conversation', async () => {
    const listener = jest.fn();
    const claim = new ActiveCallClaim(makePrisma() as never, LIVE);
    claim.setListener(listener);

    await expect(claim.claim('c1', 'k1')).resolves.toBe(true);
    expect(listener).toHaveBeenCalledWith('c1', 'k1');
  });

  it('perdue face à un appel vivant : false, aucune notification', async () => {
    const listener = jest.fn();
    const claim = new ActiveCallClaim(makePrisma({ claimCount: 0, holderId: 'k0', holderStatus: 'active' }) as never, LIVE);
    claim.setListener(listener);

    await expect(claim.claim('c1', 'k1')).resolves.toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reprise sur un détenteur terminé : gagnée et notifiée', async () => {
    const listener = jest.fn();
    const claim = new ActiveCallClaim(makePrisma({ claimCount: 0, holderId: 'k0', holderStatus: 'ended', swapCount: 1 }) as never, LIVE);
    claim.setListener(listener);

    await expect(claim.claim('c1', 'k1')).resolves.toBe(true);
    expect(listener).toHaveBeenCalledWith('c1', 'k1');
  });

  it('une libération effective notifie ; une libération sans effet non', async () => {
    const listener = jest.fn();
    const released = new ActiveCallClaim(makePrisma({ releaseCount: 1 }) as never, LIVE);
    released.setListener(listener);
    await released.release('c1', 'k1');
    expect(listener).toHaveBeenCalledWith('c1', 'k1');

    const noop = jest.fn();
    const untouched = new ActiveCallClaim(makePrisma({ releaseCount: 0 }) as never, LIVE);
    untouched.setListener(noop);
    await untouched.release('c1', 'k1');
    expect(noop).not.toHaveBeenCalled();
  });

  it('un écouteur qui lève ne casse ni la réservation ni la libération', async () => {
    const claim = new ActiveCallClaim(makePrisma() as never, LIVE);
    claim.setListener(() => {
      throw new Error('boom');
    });
    await expect(claim.claim('c1', 'k1')).resolves.toBe(true);
    await expect(claim.release('c1', 'k1')).resolves.toBeUndefined();
  });

  it('une libération dont l’écriture échoue ne lève pas', async () => {
    const prisma = makePrisma();
    prisma.conversation.updateMany.mockRejectedValueOnce(new Error('down') as never);
    await expect(new ActiveCallClaim(prisma as never, LIVE).release('c1', 'k1')).resolves.toBeUndefined();
  });
});
