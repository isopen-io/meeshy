/**
 * Les amis du fil — `loadFeedFriendIds` (extrait de `PostFeedService.getFriendIds`,
 * #13927) lit le NIVEAU (`amisAcceptes`) et non plus une requête qui lui est
 * propre, et son cache `feed:friends:` (TTL 300 s) est INVALIDÉ quand le lien
 * change : une amitié acceptée à l'instant apparaît au fil sans attendre 5 minutes.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { feedFriendsCacheKey, invalidateFeedFriends, loadFeedFriendIds } from '../../../../services/posts/feedFriends';
import { relationStore } from '../../../helpers/user-relation-store';
import type { CacheStore } from '../../../../services/CacheStore';

const ME = 'a'.repeat(24);
const PAL = 'b'.repeat(24);
const ACQUAINTANCE = 'c'.repeat(24);
const BLOOD = 'd'.repeat(24);

const cacheDouble = (seed: Record<string, string> = {}) => {
  const store = new Map(Object.entries(seed));
  const cache = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    del: jest.fn(async (key: string) => void store.delete(key)),
  };
  return { cache: cache as unknown as CacheStore, store, spies: cache };
};

const world = () =>
  relationStore({
    friendRequests: [{ id: 'fr-1', senderId: ME, receiverId: PAL, status: 'accepted', updatedAt: new Date('2026-10-01T00:00:00Z') }],
    relations: [
      { id: 'r-1', userLowId: ME, userHighId: ACQUAINTANCE, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', transitions: [], updatedAt: new Date() },
      { id: 'r-2', userLowId: ME, userHighId: BLOOD, grantedByLow: 'BLOOD', grantedByHigh: 'BLOOD', transitions: [], updatedAt: new Date('2026-10-05T00:00:00Z') },
    ],
  });

describe('loadFeedFriendIds', () => {
  it('rend les liens >= Ami — lignes de niveau ET repli sur les demandes acceptées — et pas les Connaissances', async () => {
    const ids = await loadFeedFriendIds({ prisma: world().prisma as never, userId: ME });
    expect(ids.sort()).toEqual([PAL, BLOOD].sort());
  });

  it('sert le cache sans interroger la base', async () => {
    const { cache } = cacheDouble({ [feedFriendsCacheKey(ME)]: JSON.stringify([PAL]) });
    const prisma = { friendRequest: { findMany: jest.fn() }, userRelation: { findMany: jest.fn() } };
    await expect(loadFeedFriendIds({ prisma: prisma as never, cache, userId: ME })).resolves.toEqual([PAL]);
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.userRelation.findMany).not.toHaveBeenCalled();
  });

  it('range le résultat sous la clé feed:friends:<id> avec un TTL', async () => {
    const { cache, spies } = cacheDouble();
    await loadFeedFriendIds({ prisma: world().prisma as never, cache, userId: ME });
    expect(spies.set).toHaveBeenCalledWith('feed:friends:' + ME, expect.any(String), 300);
  });

  it('ferme l\'audience quand la lecture échoue : aucun ami, jamais une exception', async () => {
    const prisma = { friendRequest: { findMany: jest.fn<any>().mockRejectedValue(new Error('down')) }, userRelation: { findMany: jest.fn<any>().mockRejectedValue(new Error('down')) } };
    await expect(loadFeedFriendIds({ prisma: prisma as never, userId: ME })).resolves.toEqual([]);
  });
});

describe('invalidateFeedFriends', () => {
  it('retire le cache des DEUX comptes d\'un lien qui change, et seulement ceux-là', async () => {
    const { cache, store } = cacheDouble({
      [feedFriendsCacheKey(ME)]: '[]',
      [feedFriendsCacheKey(PAL)]: '[]',
      [feedFriendsCacheKey(BLOOD)]: '[]',
    });
    await invalidateFeedFriends(cache, [ME, PAL]);
    expect([...store.keys()]).toEqual([feedFriendsCacheKey(BLOOD)]);
  });

  it('ne casse pas l\'acte qu\'il suit quand le cache est indisponible', async () => {
    const cache = { del: jest.fn<any>().mockRejectedValue(new Error('redis down')) } as unknown as CacheStore;
    await expect(invalidateFeedFriends(cache, [ME, PAL])).resolves.toBeUndefined();
  });
});
