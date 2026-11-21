/**
 * « Mes cercles » (#19375) : combien de personnes j'atteins à CHAQUE cercle, et combien de demandes
 * attendent ma réponse. Un AGRÉGAT sans identité : aucun identifiant, aucun nom, aucune présence.
 *
 * - Connaissance … Sang : la répartition des liens que `GET /relations` sert (`listRelationLinks`),
 *   la même source, donc jamais un autre nombre que la liste.
 * - Communauté : les co-membres actifs d'une communauté active que je partage (la même lecture que
 *   « En commun », `inCommon.ts`), comptes utilisables, hors blocage dans un sens ou dans l'autre,
 *   et hors personnes déjà comptées à Connaissance ou plus : chacun se compte UNE fois. Le compte
 *   se fait DANS LA BASE (dédoublonnage, exclusions, état du compte, puis `$count`) : exact quelle
 *   que soit la taille des communautés, sans charger une ligne de membre.
 * - Les demandes : reçues, en attente, hors blocage (la loi des listes de demandes,
 *   `clauseHorsBlocage`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationCirclesSummary } from '@meeshy/shared/types/relation-circles-summary';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { listRelationLinks, type RelationLinksDb } from './relationLinks';

export type CirclesSummaryDb = RelationLinksDb & Pick<PrismaClient, 'community' | 'communityMember'>;

const oid = (id: string) => ({ $oid: id });

/** Les communautés ACTIVES où le lecteur est membre actif. */
async function sharedCommunityIds(prisma: CirclesSummaryDb, viewerId: string): Promise<readonly string[]> {
  const own = await prisma.communityMember.findMany({ where: { userId: viewerId, isActive: true }, select: { communityId: true } });
  if (own.length === 0) return [];
  const open = await prisma.community.findMany({
    where: { id: { in: [...new Set(own.map((m) => m.communityId))] }, isActive: true },
    select: { id: true },
  });
  return open.map((c) => c.id);
}

/**
 * Les personnes distinctes, membres actifs de ces communautés, hors `excluded`, dont le compte
 * est utilisable (`isUsableAccount` : actif, ni supprimé, ni désactivé) — comptées par la base.
 */
async function countCommunityOnlyPeers(
  prisma: CirclesSummaryDb,
  communityIds: readonly string[],
  excluded: ReadonlySet<string>,
): Promise<number> {
  if (communityIds.length === 0) return 0;
  const rows = (await prisma.communityMember.aggregateRaw({
    pipeline: [
      { $match: { communityId: { $in: communityIds.map(oid) }, isActive: true, userId: { $nin: [...excluded].map(oid) } } },
      { $group: { _id: '$userId' } },
      {
        $lookup: {
          from: 'User',
          localField: '_id',
          foreignField: '_id',
          pipeline: [{ $project: { isActive: 1, deletedAt: 1, deactivatedAt: 1 } }],
          as: 'u',
        },
      },
      { $unwind: '$u' },
      { $match: { 'u.isActive': true, 'u.deletedAt': null, 'u.deactivatedAt': null } },
      { $count: 'n' },
    ],
    options: { allowDiskUse: true },
  })) as unknown as ReadonlyArray<{ n?: unknown }>;
  const n = rows?.[0]?.n;
  return typeof n === 'number' ? n : 0;
}

export async function summarizeRelationCircles(
  prisma: CirclesSummaryDb,
  params: { readonly viewerId: string; readonly now: Date },
): Promise<RelationCirclesSummary> {
  const { viewerId } = params;
  const [links, communityIds, blocked] = await Promise.all([
    listRelationLinks(prisma, params),
    sharedCommunityIds(prisma, viewerId),
    getBlockRelatedUserIds(prisma, viewerId),
  ]);

  const excluded = new Set([viewerId, ...links.map((link) => link.userId), ...blocked]);
  const [community, pendingRequests] = await Promise.all([
    countCommunityOnlyPeers(prisma, communityIds, excluded),
    prisma.friendRequest.count({
      where: { AND: [{ receiverId: viewerId }, { status: 'pending' }, ...(blocked.size === 0 ? [] : [{ senderId: { notIn: [...blocked] } }])] },
    }),
  ]);

  const levelCount = (level: RelationLevel): number => links.filter((link) => link.effectiveLevel === level).length;
  const counts: RelationCirclesSummary['counts'] = {
    COMMUNITY: community,
    ACQUAINTANCE: levelCount('ACQUAINTANCE'),
    FRIEND: levelCount('FRIEND'),
    CLOSE: levelCount('CLOSE'),
    BLOOD: levelCount('BLOOD'),
  };
  return { counts, pendingRequests };
}
