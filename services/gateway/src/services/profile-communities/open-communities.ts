/**
 * « Ses communautés ouvertes » sur la fiche d'un autre (#19274, chantier #18857).
 *
 * Une communauté s'y lit quand elle est PUBLIQUE (`isPrivate: false`), active, non effacée,
 * que la personne en est membre ACTIF, et qu'elle ne l'a pas cachée de sa propre liste
 * (`UserCommunityPreferences.isHidden`, sa seule préférence d'affichage d'une appartenance).
 * Une communauté publique montre déjà ses membres : la fiche ne dit rien que la communauté
 * ne dise elle-même, et rien d'une communauté privée ne part — ni nom, ni identifiant.
 *
 * L'effectif est celui des membres ACTIFS (`COMMUNITY_ACTIVE_COUNTS`, #16603) ; `isMember`
 * dit si le LECTEUR en est membre actif (« Rejoindre » / « Tu en fais partie »).
 * Une lecture qui échoue LÈVE : l'appelant ferme.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { activeMembershipOf } from '../../routes/communities/serialization';

/** Plafond de la face : la fiche montre une rangée, pas l'annuaire. */
export const OPEN_COMMUNITIES_MAX = 12;
/** Plafond de PROTECTION des lectures, jamais une pagination produit. */
const SCAN_LIMIT = 500;

export type OpenCommunity = {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly memberCount: number;
  readonly isMember: boolean;
};

type OpenCommunitiesDb = Pick<PrismaClient, 'communityMember' | 'community' | 'userCommunityPreferences'>;

const communityIdsOf = (rows: ReadonlyArray<{ communityId: string }>): string[] => [...new Set(rows.map((row) => row.communityId))];

export async function readOpenCommunities(
  prisma: OpenCommunitiesDb,
  params: { readonly viewerId: string | undefined; readonly targetId: string },
): Promise<OpenCommunity[]> {
  const { viewerId, targetId } = params;
  const memberships = communityIdsOf(await prisma.communityMember.findMany({
    where: activeMembershipOf(targetId),
    select: { communityId: true },
    take: SCAN_LIMIT,
  }));
  if (memberships.length === 0) return [];
  const hidden = new Set(communityIdsOf(await prisma.userCommunityPreferences.findMany({
    where: { userId: targetId, isHidden: true, communityId: { in: memberships } },
    select: { communityId: true },
  })));
  const listed = memberships.filter((id) => !hidden.has(id));
  if (listed.length === 0) return [];
  const rows = await prisma.community.findMany({
    where: { id: { in: listed }, isPrivate: false, isActive: true },
    select: { id: true, identifier: true, name: true, avatar: true, deletedAt: true, _count: { select: { members: { where: { isActive: true } } } } },
    take: SCAN_LIMIT,
  });
  const open = rows
    .filter((row) => !row.deletedAt)
    .sort((a, b) => b._count.members - a._count.members || a.name.localeCompare(b.name))
    .slice(0, OPEN_COMMUNITIES_MAX);
  if (open.length === 0) return [];
  const viewerIn = await viewerMemberships(prisma, viewerId, targetId, open.map((row) => row.id));
  return open.map((row) => ({
    id: row.id,
    identifier: row.identifier,
    name: row.name,
    avatar: row.avatar ?? null,
    memberCount: row._count.members,
    isMember: viewerIn.has(row.id),
  }));
}

async function viewerMemberships(
  prisma: OpenCommunitiesDb,
  viewerId: string | undefined,
  targetId: string,
  ids: readonly string[],
): Promise<ReadonlySet<string>> {
  if (!viewerId) return new Set();
  if (viewerId === targetId) return new Set(ids);
  return new Set(communityIdsOf(await prisma.communityMember.findMany({
    where: { ...activeMembershipOf(viewerId), communityId: { in: [...ids] } },
    select: { communityId: true },
    take: SCAN_LIMIT,
  })));
}
