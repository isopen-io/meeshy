import { describe, it, expect, jest } from '@jest/globals';
import { reconcileCommunityMembership } from '../communityMembershipSync';

function makePrisma(existingMembers: ReadonlyArray<{ id: string; userId: string; isActive: boolean }>) {
  return {
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue(existingMembers),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  };
}

const COMMUNITY_ID = 'comm-1';

describe('reconcileCommunityMembership', () => {
  it('creates rows only for users with no existing membership at all', async () => {
    const prisma = makePrisma([]);
    await reconcileCommunityMembership(prisma as any, COMMUNITY_ID, ['u1', 'u2']);
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({
      data: [
        { communityId: COMMUNITY_ID, userId: 'u1' },
        { communityId: COMMUNITY_ID, userId: 'u2' },
      ],
    });
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing for a user who is already an active member', async () => {
    const prisma = makePrisma([{ id: 'cm-1', userId: 'u1', isActive: true }]);
    await reconcileCommunityMembership(prisma as any, COMMUNITY_ID, ['u1']);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('reactivates a row left by a departure (#5760) instead of leaving the user excluded forever', async () => {
    const prisma = makePrisma([{ id: 'cm-1', userId: 'u1', isActive: false }]);
    await reconcileCommunityMembership(prisma as any, COMMUNITY_ID, ['u1']);
    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cm-1'] } },
      data: { isActive: true, leftAt: null },
    });
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('never opens a second row for a pair that already has one, active or not', async () => {
    const prisma = makePrisma([
      { id: 'cm-1', userId: 'u1', isActive: true },
      { id: 'cm-2', userId: 'u2', isActive: false },
    ]);
    await reconcileCommunityMembership(prisma as any, COMMUNITY_ID, ['u1', 'u2', 'u3']);
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({
      data: [{ communityId: COMMUNITY_ID, userId: 'u3' }],
    });
    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cm-2'] } },
      data: { isActive: true, leftAt: null },
    });
  });
});
