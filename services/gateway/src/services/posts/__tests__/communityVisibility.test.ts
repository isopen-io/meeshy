import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getCommunityCoMemberIds,
  doUsersShareCommunity,
  isActiveCommunityMember,
} from '../communityVisibility';

const makePrisma = () => ({
  communityMember: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
});

describe('getCommunityCoMemberIds', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => { prisma = makePrisma(); });

  it('returns [] when the user belongs to no community', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([]);
    expect(await getCommunityCoMemberIds(prisma as any, 'u1')).toEqual([]);
  });

  it('returns deduplicated active co-members excluding self', async () => {
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }, { communityId: 'c2' }])
      .mockResolvedValueOnce([{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }]);
    const result = await getCommunityCoMemberIds(prisma as any, 'u1');
    expect([...result].sort()).toEqual(['a', 'b']);
    expect(prisma.communityMember.findMany).toHaveBeenLastCalledWith({
      where: { communityId: { in: ['c1', 'c2'] }, userId: { not: 'u1' }, isActive: true },
      select: { userId: true },
    });
  });

  it('degrades to [] on prisma error', async () => {
    prisma.communityMember.findMany.mockRejectedValueOnce(new Error('db down'));
    expect(await getCommunityCoMemberIds(prisma as any, 'u1')).toEqual([]);
  });
});

describe('doUsersShareCommunity', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => { prisma = makePrisma(); });

  it('false when a has no community', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([]);
    expect(await doUsersShareCommunity(prisma as any, 'a', 'b')).toBe(false);
  });

  it('true when b is in one of a\'s communities', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([{ communityId: 'c1' }]);
    prisma.communityMember.findFirst.mockResolvedValueOnce({ id: 'm1' });
    expect(await doUsersShareCommunity(prisma as any, 'a', 'b')).toBe(true);
  });

  it('false when b shares no community with a', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([{ communityId: 'c1' }]);
    prisma.communityMember.findFirst.mockResolvedValueOnce(null);
    expect(await doUsersShareCommunity(prisma as any, 'a', 'b')).toBe(false);
  });
});

describe('isActiveCommunityMember', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => { prisma = makePrisma(); });

  it('true when an active membership exists', async () => {
    prisma.communityMember.findFirst.mockResolvedValueOnce({ id: 'm1' });
    expect(await isActiveCommunityMember(prisma as any, 'u1', 'c1')).toBe(true);
  });

  it('false when no membership', async () => {
    prisma.communityMember.findFirst.mockResolvedValueOnce(null);
    expect(await isActiveCommunityMember(prisma as any, 'u1', 'c1')).toBe(false);
  });
});
