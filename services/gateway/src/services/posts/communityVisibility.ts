import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CacheStore } from '../CacheStore';

const COMMUNITY_COMEMBERS_CACHE_TTL = 300; // 5 min — miroir des listes amis/contacts

/**
 * Tous les membres actifs des communautés auxquelles `userId` appartient activement,
 * self exclu. Miroir de PostFeedService.getDirectConversationContactIds : résolution
 * d'appartenance en deux temps, cache Redis optionnel, dégradation sûre en [].
 */
export async function getCommunityCoMemberIds(
  prisma: PrismaClient,
  userId: string,
  cache?: CacheStore,
): Promise<string[]> {
  const cacheKey = `feed:comembers:${userId}`;
  if (cache) {
    const cached = await cache.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as string[];
  }
  try {
    const memberships = await prisma.communityMember.findMany({
      where: { userId, isActive: true },
      select: { communityId: true },
    });
    const communityIds = memberships.map((m) => m.communityId);
    if (communityIds.length === 0) {
      if (cache) await cache.set(cacheKey, '[]', COMMUNITY_COMEMBERS_CACHE_TTL).catch(() => undefined);
      return [];
    }
    const coMembers = await prisma.communityMember.findMany({
      where: { communityId: { in: communityIds }, userId: { not: userId }, isActive: true },
      select: { userId: true },
    });
    const result = [...new Set(coMembers.map((m) => m.userId))];
    if (cache) await cache.set(cacheKey, JSON.stringify(result), COMMUNITY_COMEMBERS_CACHE_TTL).catch(() => undefined);
    return result;
  } catch {
    return [];
  }
}

/**
 * Vrai ssi `a` et `b` partagent au moins une appartenance active à une communauté.
 * Pour le check ACL d'un post unitaire (canUserViewPost) — évite de matérialiser
 * toute la liste de co-membres.
 */
export async function doUsersShareCommunity(
  prisma: PrismaClient,
  a: string,
  b: string,
): Promise<boolean> {
  try {
    const aMemberships = await prisma.communityMember.findMany({
      where: { userId: a, isActive: true },
      select: { communityId: true },
    });
    if (aMemberships.length === 0) return false;
    const shared = await prisma.communityMember.findFirst({
      where: { userId: b, isActive: true, communityId: { in: aMemberships.map((m) => m.communityId) } },
      select: { id: true },
    });
    return shared !== null;
  } catch {
    return false;
  }
}

/**
 * Vrai ssi `userId` est membre actif de `communityId`. Utilisé par le gate ACL
 * du feed de communauté.
 */
export async function isActiveCommunityMember(
  prisma: PrismaClient,
  userId: string,
  communityId: string,
): Promise<boolean> {
  try {
    const membership = await prisma.communityMember.findFirst({
      where: { userId, communityId, isActive: true },
      select: { id: true },
    });
    return membership !== null;
  } catch {
    return false;
  }
}
