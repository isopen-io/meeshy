import { isBlockedBetween } from '../../../utils/blocking';

function makePrisma(returnValue: unknown) {
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue(returnValue),
    },
  } as any;
}

describe('isBlockedBetween', () => {
  it('returns false without querying DB when both ids are equal', async () => {
    const prisma = makePrisma({ id: 'u1' });
    const result = await isBlockedBetween(prisma, 'u1', 'u1');
    expect(result).toBe(false);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns true when A blocked B (DB returns a match)', async () => {
    const prisma = makePrisma({ id: 'u1' });
    const result = await isBlockedBetween(prisma, 'u1', 'u2');
    expect(result).toBe(true);
  });

  it('returns false when neither user blocked the other (DB returns null)', async () => {
    const prisma = makePrisma(null);
    const result = await isBlockedBetween(prisma, 'u1', 'u2');
    expect(result).toBe(false);
  });

  it('passes the correct OR clause to prisma', async () => {
    const prisma = makePrisma(null);
    await isBlockedBetween(prisma, 'alice', 'bob');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: 'alice', blockedUserIds: { has: 'bob' } },
          { id: 'bob', blockedUserIds: { has: 'alice' } },
        ],
      },
      select: { id: true },
    });
  });
});
