// @jest-environment node

import { describe, it, expect, jest } from '@jest/globals';
import {
  getCommunityCoMemberIds,
  doUsersShareCommunity,
  isActiveCommunityMember,
} from '../../../../services/posts/communityVisibility';
import type { CacheStore } from '../../../../services/CacheStore';

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------

type FindManyMock = jest.MockedFunction<() => Promise<unknown[]>>;
type FindFirstMock = jest.MockedFunction<() => Promise<unknown>>;

function makePrisma(overrides: {
  findMany?: () => Promise<unknown[]>;
  findFirst?: () => Promise<unknown>;
} = {}) {
  return {
    communityMember: {
      findMany: jest.fn().mockImplementation(overrides.findMany ?? (() => Promise.resolve([]))),
      findFirst: jest.fn().mockImplementation(overrides.findFirst ?? (() => Promise.resolve(null))),
    },
  } as unknown as Parameters<typeof getCommunityCoMemberIds>[0];
}

// ---------------------------------------------------------------------------
// Cache mock factory
// ---------------------------------------------------------------------------

function makeCache(overrides: Partial<CacheStore> = {}): CacheStore {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockResolvedValue([]),
    setnx: jest.fn().mockResolvedValue(false),
    expire: jest.fn().mockResolvedValue(false),
    publish: jest.fn().mockResolvedValue(0),
    info: jest.fn().mockResolvedValue(''),
    isAvailable: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    getNativeClient: jest.fn().mockReturnValue(null),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getCommunityCoMemberIds
// ---------------------------------------------------------------------------

describe('getCommunityCoMemberIds', () => {
  describe('with cache', () => {
    it('returns parsed result from cache on hit without querying prisma', async () => {
      const cached = JSON.stringify(['user-b', 'user-c']);
      const cache = makeCache({ get: jest.fn().mockResolvedValue(cached) });
      const prisma = makePrisma();

      const result = await getCommunityCoMemberIds(prisma, 'user-a', cache);

      expect(result).toEqual(['user-b', 'user-c']);
      const cm = (prisma as unknown as { communityMember: { findMany: FindManyMock } })
        .communityMember.findMany;
      expect(cm).not.toHaveBeenCalled();
    });

    it('falls through to DB when cache.get rejects', async () => {
      const cache = makeCache({
        get: jest.fn().mockRejectedValue(new Error('redis down')),
      });
      const memberships = [{ communityId: 'c1' }];
      const coMembers = [{ userId: 'user-b' }];
      let callCount = 0;
      const prisma = makePrisma({
        findMany: () => {
          callCount += 1;
          if (callCount === 1) return Promise.resolve(memberships);
          return Promise.resolve(coMembers);
        },
      });

      const result = await getCommunityCoMemberIds(prisma, 'user-a', cache);

      expect(result).toEqual(['user-b']);
    });

    it('returns [] and caches "[]" when user has no memberships', async () => {
      const cache = makeCache({ get: jest.fn().mockResolvedValue(null) });
      const prisma = makePrisma({ findMany: () => Promise.resolve([]) });

      const result = await getCommunityCoMemberIds(prisma, 'user-a', cache);

      expect(result).toEqual([]);
      const cacheSet = cache.set as jest.MockedFunction<CacheStore['set']>;
      expect(cacheSet).toHaveBeenCalledWith(
        'feed:comembers:user-a',
        '[]',
        expect.any(Number),
      );
    });

    it('deduplicates co-members across multiple communities and caches result', async () => {
      const cache = makeCache({ get: jest.fn().mockResolvedValue(null) });
      // user-a is in two communities; user-b appears in both
      const memberships = [{ communityId: 'c1' }, { communityId: 'c2' }];
      const coMembers = [
        { userId: 'user-b' },
        { userId: 'user-c' },
        { userId: 'user-b' }, // duplicate
      ];
      let callCount = 0;
      const prisma = makePrisma({
        findMany: () => {
          callCount += 1;
          if (callCount === 1) return Promise.resolve(memberships);
          return Promise.resolve(coMembers);
        },
      });

      const result = await getCommunityCoMemberIds(prisma, 'user-a', cache);

      expect(result).toHaveLength(2);
      expect(result).toContain('user-b');
      expect(result).toContain('user-c');
      const cacheSet = cache.set as jest.MockedFunction<CacheStore['set']>;
      expect(cacheSet).toHaveBeenCalledWith(
        'feed:comembers:user-a',
        JSON.stringify(result),
        expect.any(Number),
      );
    });

    it('returns [] when prisma throws', async () => {
      const cache = makeCache({ get: jest.fn().mockResolvedValue(null) });
      const prisma = makePrisma({
        findMany: () => Promise.reject(new Error('DB error')),
      });

      const result = await getCommunityCoMemberIds(prisma, 'user-a', cache);

      expect(result).toEqual([]);
    });
  });

  describe('without cache param', () => {
    it('queries DB directly and returns co-members', async () => {
      const memberships = [{ communityId: 'c1' }];
      const coMembers = [{ userId: 'user-b' }, { userId: 'user-c' }];
      let callCount = 0;
      const prisma = makePrisma({
        findMany: () => {
          callCount += 1;
          if (callCount === 1) return Promise.resolve(memberships);
          return Promise.resolve(coMembers);
        },
      });

      const result = await getCommunityCoMemberIds(prisma, 'user-a');

      expect(result).toEqual(['user-b', 'user-c']);
    });

    it('returns [] when user has no memberships', async () => {
      const prisma = makePrisma({ findMany: () => Promise.resolve([]) });

      const result = await getCommunityCoMemberIds(prisma, 'user-a');

      expect(result).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// doUsersShareCommunity
// ---------------------------------------------------------------------------

describe('doUsersShareCommunity', () => {
  it('returns false when user a has no memberships', async () => {
    const prisma = makePrisma({ findMany: () => Promise.resolve([]) });

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');

    expect(result).toBe(false);
  });

  it('returns false when a has memberships but no shared community with b', async () => {
    const prisma = makePrisma({
      findMany: () => Promise.resolve([{ communityId: 'c1' }]),
      findFirst: () => Promise.resolve(null),
    });

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');

    expect(result).toBe(false);
  });

  it('returns true when users share at least one community', async () => {
    const prisma = makePrisma({
      findMany: () => Promise.resolve([{ communityId: 'c1' }]),
      findFirst: () => Promise.resolve({ id: 'member-id' }),
    });

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');

    expect(result).toBe(true);
  });

  it('returns false when prisma throws', async () => {
    const prisma = makePrisma({
      findMany: () => Promise.reject(new Error('DB error')),
    });

    const result = await doUsersShareCommunity(prisma, 'user-a', 'user-b');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isActiveCommunityMember
// ---------------------------------------------------------------------------

describe('isActiveCommunityMember', () => {
  it('returns true when membership is found', async () => {
    const prisma = makePrisma({
      findFirst: () => Promise.resolve({ id: 'member-id' }),
    });

    const result = await isActiveCommunityMember(prisma, 'user-a', 'community-1');

    expect(result).toBe(true);
  });

  it('returns false when findFirst returns null', async () => {
    const prisma = makePrisma({ findFirst: () => Promise.resolve(null) });

    const result = await isActiveCommunityMember(prisma, 'user-a', 'community-1');

    expect(result).toBe(false);
  });

  it('returns false when prisma throws', async () => {
    const prisma = makePrisma({
      findFirst: () => Promise.reject(new Error('DB error')),
    });

    const result = await isActiveCommunityMember(prisma, 'user-a', 'community-1');

    expect(result).toBe(false);
  });
});
