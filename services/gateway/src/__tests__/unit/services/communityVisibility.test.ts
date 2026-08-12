/**
 * Unit tests for services/posts/communityVisibility.
 * Covers getCommunityCoMemberIds (no cache, cache hit, no communities,
 * co-members, cache set, error fallback), doUsersShareCommunity (shared,
 * not shared, a has no memberships, error), isActiveCommunityMember
 * (member, not member, error).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  getCommunityCoMemberIds,
  doUsersShareCommunity,
  isActiveCommunityMember,
} from '../../../services/posts/communityVisibility';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(opts: {
  memberFindMany?: object[][];
  memberFindFirst?: object | null;
} = {}) {
  let findManyIdx = 0;
  return {
    communityMember: {
      findMany: jest.fn<any>().mockImplementation(() => {
        const result = (opts.memberFindMany ?? [[]])[findManyIdx] ?? [];
        findManyIdx++;
        return Promise.resolve(result);
      }),
      findFirst: jest.fn<any>().mockResolvedValue(opts.memberFindFirst ?? null),
    },
  } as any;
}

function makeCache(opts: { cached?: string | null } = {}) {
  return {
    get: jest.fn<any>().mockResolvedValue(opts.cached ?? null),
    set: jest.fn<any>().mockResolvedValue(undefined),
  } as any;
}

// ─── getCommunityCoMemberIds ──────────────────────────────────────────────────

describe('getCommunityCoMemberIds', () => {
  it('returns [] when the user belongs to no communities', async () => {
    const prisma = makePrisma({ memberFindMany: [[]] });
    const result = await getCommunityCoMemberIds(prisma, 'u-1');
    expect(result).toEqual([]);
  });

  it('caches and returns the empty result when user has no communities', async () => {
    const prisma = makePrisma({ memberFindMany: [[]] });
    const cache = makeCache();
    await getCommunityCoMemberIds(prisma, 'u-1', cache);
    expect(cache.set).toHaveBeenCalledWith(expect.stringContaining('u-1'), '[]', expect.any(Number));
  });

  it('returns co-members when the user belongs to a community', async () => {
    const prisma = makePrisma({
      memberFindMany: [
        [{ communityId: 'c-1' }],                                  // memberships
        [{ userId: 'u-2' }, { userId: 'u-3' }, { userId: 'u-2' }], // co-members (with dup)
      ],
    });
    const result = await getCommunityCoMemberIds(prisma, 'u-1');
    expect(result).toContain('u-2');
    expect(result).toContain('u-3');
    expect(result.filter(id => id === 'u-2').length).toBe(1); // deduped
  });

  it('caches the co-member result when a cache store is provided', async () => {
    const prisma = makePrisma({
      memberFindMany: [
        [{ communityId: 'c-1' }],
        [{ userId: 'u-2' }],
      ],
    });
    const cache = makeCache();
    await getCommunityCoMemberIds(prisma, 'u-1', cache);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('u-1'),
      JSON.stringify(['u-2']),
      expect.any(Number),
    );
  });

  it('returns the cached result without querying when cache hits', async () => {
    const prisma = makePrisma();
    const cached = JSON.stringify(['u-cached']);
    const cache = makeCache({ cached });
    const result = await getCommunityCoMemberIds(prisma, 'u-1', cache);
    expect(result).toEqual(['u-cached']);
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
  });

  it('returns [] when prisma throws', async () => {
    const prisma = { communityMember: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB')) } } as any;
    const result = await getCommunityCoMemberIds(prisma, 'u-1');
    expect(result).toEqual([]);
  });
});

// ─── doUsersShareCommunity ────────────────────────────────────────────────────

describe('doUsersShareCommunity', () => {
  it('returns true when both users belong to the same community', async () => {
    const prisma = makePrisma({
      memberFindMany: [[{ communityId: 'c-1' }]],
      memberFindFirst: { id: 'member-row' },
    });
    const result = await doUsersShareCommunity(prisma, 'u-a', 'u-b');
    expect(result).toBe(true);
  });

  it('returns false when user a has no memberships', async () => {
    const prisma = makePrisma({ memberFindMany: [[]] });
    const result = await doUsersShareCommunity(prisma, 'u-a', 'u-b');
    expect(result).toBe(false);
    expect(prisma.communityMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns false when no shared community is found', async () => {
    const prisma = makePrisma({
      memberFindMany: [[{ communityId: 'c-1' }]],
      memberFindFirst: null,
    });
    const result = await doUsersShareCommunity(prisma, 'u-a', 'u-b');
    expect(result).toBe(false);
  });

  it('returns false when prisma throws', async () => {
    const prisma = { communityMember: { findMany: jest.fn<any>().mockRejectedValue(new Error('boom')) } } as any;
    const result = await doUsersShareCommunity(prisma, 'u-a', 'u-b');
    expect(result).toBe(false);
  });
});

// ─── isActiveCommunityMember ─────────────────────────────────────────────────

describe('isActiveCommunityMember', () => {
  it('returns true when the membership row exists', async () => {
    const prisma = makePrisma({ memberFindFirst: { id: 'mem-1' } });
    const result = await isActiveCommunityMember(prisma, 'u-1', 'c-1');
    expect(result).toBe(true);
    expect(prisma.communityMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-1', communityId: 'c-1', isActive: true } }),
    );
  });

  it('returns false when the membership row does not exist', async () => {
    const prisma = makePrisma({ memberFindFirst: null });
    const result = await isActiveCommunityMember(prisma, 'u-1', 'c-1');
    expect(result).toBe(false);
  });

  it('returns false when prisma throws', async () => {
    const prisma = { communityMember: { findFirst: jest.fn<any>().mockRejectedValue(new Error('fail')) } } as any;
    const result = await isActiveCommunityMember(prisma, 'u-1', 'c-1');
    expect(result).toBe(false);
  });
});
