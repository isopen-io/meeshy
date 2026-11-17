/**
 * « Mes cercles » (#19375) : combien de personnes j'atteins à CHAQUE cercle, et combien de demandes
 * attendent ma réponse. Un AGRÉGAT sans identité : aucun identifiant, aucun nom, aucune présence.
 *
 * - Connaissance … Sang : la répartition des liens que `GET /relations` sert (`listRelationLinks`),
 *   la même source, donc jamais un autre nombre que la liste.
 * - Communauté : les co-membres actifs d'une communauté active que je partage (la même lecture que
 *   « En commun », `inCommon.ts`), comptes utilisables, hors blocage dans un sens ou dans l'autre,
 *   et hors personnes déjà comptées à Connaissance ou plus : chacun se compte UNE fois.
 * - Les demandes : reçues, en attente, hors blocage (la loi des listes de demandes,
 *   `clauseHorsBlocage`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationCirclesSummary } from '@meeshy/shared/types/relation-circles-summary';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { listRelationLinks, type RelationLinksDb } from './relationLinks';
import { ACCOUNT_STATE_SELECT, isUsableAccount } from './usableAccount';

export type CirclesSummaryDb = RelationLinksDb & Pick<PrismaClient, 'community' | 'communityMember'>;

/** Plafond d'une lecture de co-membres : il borne le coût d'une très grande communauté sans paginer. */
export const MAX_COMMUNITY_PEERS = 10_000;

async function communityPeers(prisma: CirclesSummaryDb, viewerId: string): Promise<ReadonlySet<string>> {
  const own = await prisma.communityMember.findMany({ where: { userId: viewerId, isActive: true }, select: { communityId: true } });
  if (own.length === 0) return new Set();
  const open = await prisma.community.findMany({
    where: { id: { in: [...new Set(own.map((m) => m.communityId))] }, isActive: true },
    select: { id: true },
  });
  if (open.length === 0) return new Set();
  const peers = await prisma.communityMember.findMany({
    where: { communityId: { in: open.map((c) => c.id) }, isActive: true },
    select: { userId: true },
    take: MAX_COMMUNITY_PEERS,
  });
  return new Set(peers.map((m) => m.userId).filter((id) => id !== viewerId));
}

async function usableAmong(prisma: CirclesSummaryDb, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, ...ACCOUNT_STATE_SELECT } });
  return rows.filter(isUsableAccount).length;
}

export async function summarizeRelationCircles(
  prisma: CirclesSummaryDb,
  params: { readonly viewerId: string; readonly now: Date },
): Promise<RelationCirclesSummary> {
  const { viewerId } = params;
  const [links, peers, blocked] = await Promise.all([
    listRelationLinks(prisma, params),
    communityPeers(prisma, viewerId),
    getBlockRelatedUserIds(prisma, viewerId),
  ]);

  const linked = new Set(links.map((link) => link.userId));
  const communityOnly = [...peers].filter((id) => !linked.has(id) && !blocked.has(id));
  const [community, pendingRequests] = await Promise.all([
    usableAmong(prisma, communityOnly),
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
