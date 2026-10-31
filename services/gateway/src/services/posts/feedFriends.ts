import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CacheStore } from '../CacheStore';
import { amisAcceptes } from '../friendship';

/**
 * Les AMIS du lecteur pour le fil (posts, stories, status) : les comptes liés à
 * lui par un niveau d'au moins Ami, lus par `friendship.ts` — le site unique du
 * niveau effectif (#13927). Extrait de `PostFeedService` (hors budget : 1176
 * lignes) avant d'être remplacé, sans rien ajouter au fichier d'origine.
 *
 * Le cache `feed:friends:<id>` vit 5 minutes, et ne se rafraîchissait JAMAIS à
 * l'acceptation d'une demande : une amitié née à l'instant restait invisible du
 * fil jusqu'à l'expiration. Chaque changement de lien appelle
 * {@link invalidateFeedFriends}.
 */

const FEED_FRIENDS_CACHE_TTL_SECONDS = 300;

export const feedFriendsCacheKey = (userId: string): string => `feed:friends:${userId}`;

export async function loadFeedFriendIds(params: {
  readonly prisma: Pick<PrismaClient, 'friendRequest' | 'userRelation'>;
  readonly cache?: CacheStore;
  readonly userId: string;
}): Promise<string[]> {
  const { prisma, cache, userId } = params;
  const key = feedFriendsCacheKey(userId);
  if (cache) {
    const cached = await cache.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as string[];
  }
  try {
    const friendIds = await amisAcceptes(prisma, userId);
    if (cache) await cache.set(key, JSON.stringify(friendIds), FEED_FRIENDS_CACHE_TTL_SECONDS).catch(() => undefined);
    return friendIds;
  } catch {
    return [];
  }
}

/** Best-effort : un cache indisponible ne fait jamais échouer le changement de lien qu'il suit. */
export async function invalidateFeedFriends(cache: CacheStore, userIds: ReadonlyArray<string>): Promise<void> {
  await Promise.all(userIds.map((id) => cache.del(feedFriendsCacheKey(id)).catch(() => undefined)));
}
