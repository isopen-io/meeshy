import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CacheStore } from '../CacheStore';

/**
 * Les CONTACTS DIRECTS du lecteur pour le fil : les autres membres actifs de
 * ses conversations directes, qui élargissent l'audience `FRIENDS`/`EXCEPT`
 * (G5, `feedVisibility.ts`). Extrait de `PostFeedService` (hors budget) pour
 * que la recherche de posts (#14620) pose la MÊME audience que le fil, sans
 * ajouter une ligne au fichier d'origine. Cache `feed:contacts:<id>` de 5 min ;
 * une lecture en échec rend une liste vide — l'audience se resserre, jamais ne
 * s'ouvre.
 */

const FEED_CONTACTS_CACHE_TTL_SECONDS = 300;

export async function loadFeedDirectContactIds(params: {
  readonly prisma: Pick<PrismaClient, 'participant'>;
  readonly cache?: CacheStore;
  readonly userId: string;
}): Promise<string[]> {
  const { prisma, cache, userId } = params;
  const cacheKey = `feed:contacts:${userId}`;
  if (cache) {
    const cached = await cache.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as string[];
  }
  try {
    const myMemberships = await prisma.participant.findMany({
      where: { userId, isActive: true, conversation: { type: 'direct' } },
      select: { conversationId: true },
    });
    const conversationIds = myMemberships.map((m) => m.conversationId);
    const otherMembers = conversationIds.length === 0
      ? []
      : await prisma.participant.findMany({
          where: { conversationId: { in: conversationIds }, userId: { not: userId }, isActive: true },
          select: { userId: true },
        });
    const result = [...new Set(otherMembers.map((m) => m.userId).filter((id): id is string => Boolean(id)))];
    if (cache) await cache.set(cacheKey, JSON.stringify(result), FEED_CONTACTS_CACHE_TTL_SECONDS).catch(() => undefined);
    return result;
  } catch {
    return [];
  }
}
