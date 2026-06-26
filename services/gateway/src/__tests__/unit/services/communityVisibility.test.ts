/**
 * Unit tests for services/posts/communityVisibility.ts
 * Covers: getCommunityCoMemberIds, doUsersShareCommunity, isActiveCommunityMember
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  getCommunityCoMemberIds,
  doUsersShareCommunity,
  isActiveCommunityMember,
} from '../../../services/posts/communityVisibility';

function makePrisma(): any {
  return {
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

function makeCache(): any {
  return {
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue('OK'),
  };
}

// ── getCommunityCoMemberIds ────────────────────────────────────────────────

describe('getCommunityCoMemberIds', () => {
  it('returns cached result when available', async () => {
    const prisma = makePrisma();
    const cache = makeCache();
    cache.get.mockResolvedValueOnce(JSON.stringify(['user-a', 'user-b']));

    const result = await getCommunityCoMemberIds(prisma, 'user-1', cache);

    expect(result).toEqual(['user-a', 'user-b']);
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
  });

  it('returns [] and caches empty when user has no memberships', async () => {
    const prisma = makePrisma();
    const cache = makeCache();
    prisma.communityMember.findMany.mockResolvedValueOnce([]);

    const result = await getCommunityCoMemberIds(prisma, 'user-1', cache);

    expect(result).toEqual([]);
    expect(cache.set).toHaveBeenCalledWith('feed:comembers:user-1', '[]', expect.any(Number));
  });

  it('returns deduplicated co-member ids and caches them', async () => {
    const prisma = makePrisma();
    const cache = makeCache();

    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'comm-1' }, { communityId: 'comm-2' }])
      .mockResolvedValueOnce([{ userId: 'user-a' }, { userId: 'user-b' }, { userId: 'user-a' }]);

    const result = await getCommunityCoMemberIds(prisma, 'user-1', cache);

    expect(result).toEqual(['user-a', 'user-b']);
    expect(cache.set).toHaveBeenCalledWith(
      'feed:comembers:user-1',
      JSON.stringify(['user-a', 'user-b']),
      expect.any(Number),
    );
  });

  it('works without a cache argument', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'comm-1' }])
      .mockResolvedValueOnce([{ userId: 'user-a' }]);

    const result = await getCommunityCoMemberIds(prisma, 'user-1');
    expect(result).toEqual(['user-a']);
  });

  it('returns [] when prisma throws', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockRejectedValueOnce(new Error('DB error'));

    const result = await getCommunityCoMemberIds(prisma, 'user-1');
    expect(result).toEqual([]);
  });

  it('handles cache.get throwing by continuing to DB', async () => {
    const prisma = makePrisma();
    const cache = makeCache();
    cache.get.mockRejectedValueOnce(new Error('cache down'));
    prisma.communityMember.findMany.mockResolvedValueOnce([]);

    const result = await getCommunityCoMemberIds(prisma, 'user-1', cache);
    expect(result).toEqual([]);
  });

  it('handles cache.set throwing without crashing', async () => {
    const prisma = makePrisma();
    const cache = makeCache();
    cache.set.mockRejectedValue(new Error('cache write failed'));
    prisma.communityMember.findMany.mockResolvedValueOnce([]);

    const result = await getCommunityCoMemberIds(prisma, 'user-1', cache);
    expect(result).toEqual([]);
  });
});

// ── doUsersShareCommunity ─────────────────────────────────────────────────

describe('doUsersShareCommunity', () => {
  it('returns false when user a has no memberships', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValueOnce([]);

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');
    expect(result).toBe(false);
  });

  it('returns false when no shared community exists', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValueOnce([{ communityId: 'comm-1' }]);
    prisma.communityMember.findFirst.mockResolvedValueOnce(null);

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');
    expect(result).toBe(false);
  });

  it('returns true when users share a community', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValueOnce([{ communityId: 'comm-1' }]);
    prisma.communityMember.findFirst.mockResolvedValueOnce({ id: 'member-1' });

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');
    expect(result).toBe(true);
  });

  it('returns false when prisma throws', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockRejectedValueOnce(new Error('DB error'));

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');
    expect(result).toBe(false);
  });
});

// ── isActiveCommunityMember ────────────────────────────────────────────────

describe('isActiveCommunityMember', () => {
  it('returns true when membership found', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findFirst.mockResolvedValueOnce({ id: 'member-1' });

    const result = await isActiveCommunityMember(prisma, 'user-1', 'comm-1');
    expect(result).toBe(true);
    expect(prisma.communityMember.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', communityId: 'comm-1', isActive: true },
      select: { id: true },
    });
  });

  it('returns false when membership not found', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findFirst.mockResolvedValueOnce(null);

    const result = await isActiveCommunityMember(prisma, 'user-1', 'comm-1');
    expect(result).toBe(false);
  });

  it('returns false when prisma throws', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findFirst.mockRejectedValueOnce(new Error('DB error'));

    const result = await isActiveCommunityMember(prisma, 'user-1', 'comm-1');
    expect(result).toBe(false);
  });
});
