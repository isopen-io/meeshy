import { describe, expect, it, jest } from '@jest/globals';

import { mayReadCallSession } from '../../../../services/calls/callSessionReadAccess';

const USER = '507f1f77bcf86cd799439301';

const call = (overrides: Partial<Parameters<typeof mayReadCallSession>[1]> = {}): Parameters<typeof mayReadCallSession>[1] => ({
  conversationId: 'conv-1',
  status: 'active',
  invitedUserIds: [],
  participants: [],
  ...overrides,
});

const prismaWith = (rows: { member?: object | null; standing?: { bannedAt: Date | null } | null }) => {
  const findFirst = jest.fn<any>(async (args: { where: { isActive?: boolean } }) =>
    args.where.isActive === true ? (rows.member ?? null) : (rows.standing ?? null)
  );
  return { prisma: { participant: { findFirst } } as never, findFirst };
};

describe('mayReadCallSession', () => {
  it('admits a participant of the call without any membership query', async () => {
    const { prisma, findFirst } = prismaWith({});

    await expect(mayReadCallSession(prisma, call({ participants: [{ participant: { userId: USER } }] }), USER)).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('admits an active member of the conversation', async () => {
    const { prisma } = prismaWith({ member: { id: 'p-1' } });

    await expect(mayReadCallSession(prisma, call(), USER)).resolves.toBe(true);
  });

  it('admits a person invited into the call who has not answered yet', async () => {
    const { prisma } = prismaWith({});

    await expect(mayReadCallSession(prisma, call({ invitedUserIds: [USER] }), USER)).resolves.toBe(true);
  });

  it('admits an invitee whose earlier guest row is inactive but not banned', async () => {
    const { prisma } = prismaWith({ standing: { bannedAt: null } });

    await expect(mayReadCallSession(prisma, call({ invitedUserIds: [USER] }), USER)).resolves.toBe(true);
  });

  it('refuses a stranger who is neither in the call, nor a member, nor invited', async () => {
    const { prisma } = prismaWith({});

    await expect(mayReadCallSession(prisma, call({ invitedUserIds: ['507f1f77bcf86cd799439399'] }), USER)).resolves.toBe(false);
  });

  it('refuses an invitee once the call is over', async () => {
    const { prisma } = prismaWith({});

    for (const status of ['ended', 'missed', 'rejected', 'failed'] as const) {
      await expect(mayReadCallSession(prisma, call({ status, invitedUserIds: [USER] }), USER)).resolves.toBe(false);
    }
  });

  it('refuses an invitee banned from the conversation', async () => {
    const { prisma } = prismaWith({ standing: { bannedAt: new Date() } });

    await expect(mayReadCallSession(prisma, call({ invitedUserIds: [USER] }), USER)).resolves.toBe(false);
  });

  it('refuses when the session carries no invitation list at all', async () => {
    const { prisma } = prismaWith({});

    await expect(mayReadCallSession(prisma, call({ invitedUserIds: null }), USER)).resolves.toBe(false);
  });
});
