import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import type { CacheStore } from '../CacheStore';

const COMMUNITY_COMEMBERS_CACHE_TTL = 300; // 5 min — miroir des listes amis/contacts
const COMMUNITY_ROWS_PER_MEMBER = 4;

/**
 * La seule surface Prisma que la résolution touche. Déclarée en `Pick` plutôt
 * qu'en `PrismaClient` entier pour que les appelants qui ne portent eux-mêmes
 * qu'une tranche du client (`filterPostConsumers`) puissent la passer sans
 * assertion de type — un `as PrismaClient` sur un sous-type structurel est
 * exactement le genre d'assertion que ce dépôt refuse.
 */
export type CommunityVisibilityPrisma = Pick<PrismaClient, 'communityMember'>;

/**
 * Tous les membres actifs des communautés auxquelles `userId` appartient activement,
 * self exclu. Miroir de PostFeedService.getDirectConversationContactIds : résolution
 * d'appartenance en deux temps, cache Redis optionnel, dégradation sûre en [].
 */
export async function getCommunityCoMemberIds(
  prisma: CommunityVisibilityPrisma,
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
 * Au plus `limit` co-membres actifs de `userId` — la lecture BORNÉE des éventails
 * d'entourage au cran Communauté ou Public (#13929) : une grande communauté ne se
 * charge jamais entière en mémoire pour une notification. Self exclu, sans cache
 * (la borne en ferait une liste tronquée partagée). Panne ⇒ `[]`.
 */
export async function getCommunityCoMemberIdsBounded(
  prisma: CommunityVisibilityPrisma,
  userId: string,
  limit: number,
): Promise<string[]> {
  try {
    const memberships = await prisma.communityMember.findMany({
      where: { userId, isActive: true },
      select: { communityId: true },
    });
    if (memberships.length === 0) return [];
    // Pas de `distinct` : sur Mongo, Prisma le résout en mémoire APRÈS lecture,
    // ce qui rendrait `take` inopérant. Une marge de lignes (un membre peut être
    // co-membre par plusieurs communautés), puis dédoublonnage et borne.
    const coMembers = await prisma.communityMember.findMany({
      where: { communityId: { in: memberships.map((m) => m.communityId) }, userId: { not: userId }, isActive: true },
      select: { userId: true },
      take: limit * COMMUNITY_ROWS_PER_MEMBER,
    });
    return [...new Set(coMembers.map((m) => m.userId))].slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Les co-membres actifs de `userId` PARMI `candidates` — l'intersection, jamais la
 * communauté entière (#14081) : les appartenances de `userId`, puis, dans ses
 * communautés, celles des seuls candidats. Coût en O(candidats × communautés de
 * `userId`), quelle que soit la taille des communautés ; aucun `take`, qui
 * couperait un candidat présent dans plusieurs d'entre elles. Panne ⇒ ensemble
 * vide (personne n'est admis).
 */
export async function filterCommunityCoMembersAmong(
  prisma: CommunityVisibilityPrisma,
  userId: string,
  candidates: readonly string[],
): Promise<Set<string>> {
  const others = [...new Set(candidates)].filter((id) => id !== userId);
  if (others.length === 0) return new Set();
  try {
    const memberships = await prisma.communityMember.findMany({
      where: { userId, isActive: true },
      select: { communityId: true },
    });
    if (memberships.length === 0) return new Set();
    const coMembers = await prisma.communityMember.findMany({
      where: { communityId: { in: memberships.map((m) => m.communityId) }, userId: { in: others }, isActive: true },
      select: { userId: true },
    });
    return new Set(coMembers.map((m) => m.userId));
  } catch {
    return new Set();
  }
}

/**
 * Vrai ssi `a` et `b` partagent au moins une appartenance active à une communauté.
 * Pour le check ACL d'un post unitaire (canUserViewPost) — évite de matérialiser
 * toute la liste de co-membres.
 */
export async function doUsersShareCommunity(
  prisma: CommunityVisibilityPrisma,
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

export type CommunityReadPrisma = Pick<PrismaClient, 'community' | 'communityMember'>;

/**
 * Les communautés dont `userId` peut lire les publications `COMMUNITY` qui y sont
 * posées (#16892) : vivantes, et dont il est membre actif ou créateur — la loi du
 * détail et du fil de la communauté (`communityFeedAccess`). Sans cache : quitter ou
 * être retiré d'une communauté ferme ses publications à la requête suivante.
 * Panne ⇒ `[]` (aucune publication rattachée n'est servie).
 */
export async function getReadableCommunityIds(prisma: CommunityReadPrisma, userId: string): Promise<string[]> {
  try {
    const [memberships, created] = await Promise.all([
      prisma.communityMember.findMany({
        where: { userId, isActive: true, community: { isActive: true } },
        select: { communityId: true },
      }),
      prisma.community.findMany({
        where: { createdBy: userId, isActive: true },
        select: { id: true },
      }),
    ]);
    return [...new Set([...memberships.map((m) => m.communityId), ...created.map((c) => c.id)])];
  } catch {
    return [];
  }
}

/**
 * Forme unitaire de {@link getReadableCommunityIds} : `userId` lit-il les
 * publications `COMMUNITY` posées dans `communityId` ? Panne ⇒ non.
 */
export async function isCommunityReadableBy(
  prisma: CommunityReadPrisma,
  communityId: string,
  userId: string,
): Promise<boolean> {
  if (!isValidObjectId(communityId)) return false;
  try {
    const community = await prisma.community.findFirst({
      where: { id: communityId, isActive: true },
      select: { createdBy: true },
    });
    if (community === null) return false;
    if (community.createdBy === userId) return true;
    const membership = await prisma.communityMember.findFirst({
      where: { userId, communityId, isActive: true },
      select: { id: true },
    });
    return membership !== null;
  } catch {
    return false;
  }
}

/** Borne de l'énumération d'une communauté pour une diffusion — même borne que les cercles. */
const COMMUNITY_AUDIENCE_LIMIT = 5000;

/**
 * Les lecteurs d'une publication `COMMUNITY` PARMI `candidates` (#17178) : quand
 * elle est posée dans une communauté, ses membres actifs et son créateur, la
 * communauté vivante (la loi de {@link isCommunityReadableBy}) ; sans communauté,
 * les co-membres de l'auteur, comme avant. L'auteur n'y est jamais compté (son
 * appelant l'admet de lui-même). Communauté absente, désactivée, identifiant
 * malformé ou panne ⇒ ensemble vide.
 */
export async function filterCommunityPostReadersAmong(
  prisma: CommunityReadPrisma,
  params: { readonly authorId: string; readonly communityId: string | null; readonly candidates: readonly string[] },
): Promise<Set<string>> {
  const { authorId, communityId } = params;
  if (communityId === null) return filterCommunityCoMembersAmong(prisma, authorId, params.candidates);
  const others = [...new Set(params.candidates)].filter((id) => id !== authorId);
  if (others.length === 0 || !isValidObjectId(communityId)) return new Set();
  try {
    const community = await prisma.community.findFirst({
      where: { id: communityId, isActive: true },
      select: { createdBy: true },
    });
    if (community === null) return new Set();
    const members = await prisma.communityMember.findMany({
      where: { communityId, userId: { in: others }, isActive: true },
      select: { userId: true },
    });
    const creator = others.includes(community.createdBy) ? [community.createdBy] : [];
    return new Set([...members.map((m) => m.userId), ...creator]);
  } catch {
    return new Set();
  }
}

/**
 * L'ÉNUMÉRATEUR des diffusions d'une publication `COMMUNITY` (#17178) — « à qui
 * pousser ? » pour le temps réel et les traductions de story. Posée dans une
 * communauté : ses membres actifs et son créateur (au plus
 * `COMMUNITY_AUDIENCE_LIMIT`), la communauté vivante ; sans communauté : les
 * co-membres de l'auteur, comme avant. Auteur exclu. Panne ⇒ `[]` : une
 * diffusion en panne n'atteint personne.
 */
export async function communityPostAudienceIds(
  prisma: CommunityReadPrisma,
  params: { readonly authorId: string; readonly communityId: string | null },
): Promise<string[]> {
  const { authorId, communityId } = params;
  if (communityId === null) return getCommunityCoMemberIds(prisma, authorId);
  if (!isValidObjectId(communityId)) return [];
  try {
    const community = await prisma.community.findFirst({
      where: { id: communityId, isActive: true },
      select: { createdBy: true },
    });
    if (community === null) return [];
    const members = await prisma.communityMember.findMany({
      where: { communityId, userId: { not: authorId }, isActive: true },
      select: { userId: true },
      take: COMMUNITY_AUDIENCE_LIMIT,
    });
    return [...new Set([community.createdBy, ...members.map((m) => m.userId)])].filter((id) => id !== authorId);
  } catch {
    return [];
  }
}

export type CommunityPostLookupPrisma = CommunityReadPrisma & Pick<PrismaClient, 'post'>;

/**
 * La référence d'une publication pour une diffusion : son identifiant, et sa
 * communauté quand l'appelant la tient déjà. `undefined` = inconnue, relue.
 */
export type CommunityPostRef = { readonly postId: string; readonly communityId?: string | null };

/**
 * {@link communityPostAudienceIds} pour une diffusion qui ne tient que
 * l'identifiant du post (commentaire, j'aime, traduction) : sa communauté est
 * relue. Post introuvable ou panne ⇒ `[]`, jamais les co-membres de l'auteur.
 */
export async function communityPostAudienceIdsOf(
  prisma: CommunityPostLookupPrisma,
  authorId: string,
  ref: CommunityPostRef,
): Promise<string[]> {
  if (ref.communityId !== undefined) return communityPostAudienceIds(prisma, { authorId, communityId: ref.communityId });
  if (!isValidObjectId(ref.postId)) return [];
  try {
    const post = await prisma.post.findUnique({ where: { id: ref.postId }, select: { communityId: true } });
    if (post === null) return [];
    return communityPostAudienceIds(prisma, { authorId, communityId: post.communityId ?? null });
  } catch {
    return [];
  }
}
