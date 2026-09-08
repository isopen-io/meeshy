import { sweepExpiredSessions } from '../../../jobs/session-expiry-sweep';

describe('sweepExpiredSessions()', () => {
  it('invalide les sessions expirées encore marquées valides', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 140 });
    const prisma = { userSession: { updateMany } } as never;

    expect(await sweepExpiredSessions(prisma)).toBe(140);

    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.isValid).toBe(true);
    expect(arg.where.expiresAt.lt).toBeInstanceOf(Date);
    expect(arg.data.isValid).toBe(false);
    expect(arg.data.invalidatedReason).toBe('expired');
    expect(arg.data.invalidatedAt).toBeInstanceOf(Date);
  });

  it('ne touche pas les sessions encore valides', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = { userSession: { updateMany } } as never;

    expect(await sweepExpiredSessions(prisma)).toBe(0);
  });

  it('borne la coupure sur MAINTENANT, jamais sur une date fixe', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = { userSession: { updateMany } } as never;
    const avant = Date.now();

    await sweepExpiredSessions(prisma);

    const lt = (updateMany.mock.calls[0][0].where.expiresAt.lt as Date).getTime();
    expect(lt).toBeGreaterThanOrEqual(avant - 5_000);
    expect(lt).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});
