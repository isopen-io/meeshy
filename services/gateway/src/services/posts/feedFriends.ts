import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CacheStore } from '../CacheStore';
import { relationLevelIfAtLeast, type RelationLevel } from '@meeshy/shared/types/relation';
import { amisAcceptes, comptesLies } from '../friendship';
import { NO_POST_CIRCLES, type PostCircles } from './postVisibility';

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

export const feedCirclesCacheKey = (userId: string): string => `feed:circles:${userId}`;

/** Borne de lecture des liens d'un lecteur pour ses cercles — au-delà, les liens les plus anciens ne sont plus servis. */
const FEED_CIRCLES_LIMIT = 5000;

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string');

const parseCircles = (raw: string): PostCircles | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { acquaintance, close, blood } = parsed as Record<string, unknown>;
    return isIdList(acquaintance) && isIdList(close) && isIdList(blood) ? { acquaintance, close, blood } : null;
  } catch {
    return null;
  }
};

const idsAtLeast = (linked: ReadonlyArray<{ readonly id: string; readonly niveau: RelationLevel }>, floor: RelationLevel): string[] =>
  linked.filter((link) => relationLevelIfAtLeast(link.niveau, floor) !== null).map((link) => link.id);

/**
 * Les CERCLES du lecteur pour le fil (#13931) : pour chaque cran Connaissance,
 * Proche, Sang, les auteurs dont le niveau effectif avec lui atteint AU MOINS ce
 * cran — la carte par niveau qui remplace, pour les audiences de cercle, le seul
 * ensemble `friendIds`. Une lecture (`comptesLies`, la même loi que partout), un
 * cache `feed:circles:<id>` de 5 minutes invalidé avec `feed:friends:<id>`.
 *
 * Une lecture en échec rend des cercles VIDES et ne les met pas en cache : une
 * panne ne sert aucune audience de cercle, elle n'ouvre jamais.
 */
export async function loadFeedCircles(params: {
  readonly prisma: Pick<PrismaClient, 'friendRequest' | 'userRelation'>;
  readonly cache?: CacheStore;
  readonly userId: string;
}): Promise<PostCircles> {
  const { prisma, cache, userId } = params;
  const key = feedCirclesCacheKey(userId);
  if (cache) {
    const cached = await cache.get(key).catch(() => null);
    const circles = cached ? parseCircles(cached) : null;
    if (circles) return circles;
  }
  try {
    const linked = await comptesLies(prisma, userId, { limit: FEED_CIRCLES_LIMIT });
    const circles: PostCircles = {
      acquaintance: idsAtLeast(linked, 'ACQUAINTANCE'),
      close: idsAtLeast(linked, 'CLOSE'),
      blood: idsAtLeast(linked, 'BLOOD'),
    };
    if (cache) await cache.set(key, JSON.stringify(circles), FEED_FRIENDS_CACHE_TTL_SECONDS).catch(() => undefined);
    return circles;
  } catch {
    return NO_POST_CIRCLES;
  }
}

/** Best-effort : un cache indisponible ne fait jamais échouer le changement de lien qu'il suit. */
export async function invalidateFeedFriends(cache: CacheStore, userIds: ReadonlyArray<string>): Promise<void> {
  await Promise.all(
    userIds.flatMap((id) => [
      cache.del(feedFriendsCacheKey(id)).catch(() => undefined),
      cache.del(feedCirclesCacheKey(id)).catch(() => undefined),
    ])
  );
}
