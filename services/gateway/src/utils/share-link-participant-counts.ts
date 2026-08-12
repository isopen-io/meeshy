import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Le modèle unifié `Participant` a remplacé la relation
 * `ConversationShareLink.anonymousParticipants` : le rattachement se fait
 * désormais par `Participant.shareLinkId` (+ `type: "anonymous"`), sans
 * back-relation Prisma. Ce helper reconstruit la forme `_count` que les
 * clients admin consomment (`link._count.anonymousParticipants`).
 */
export async function withAnonymousParticipantCounts<T extends { id: string }>(
  prisma: PrismaClient,
  shareLinks: T[]
): Promise<Array<T & { _count: { anonymousParticipants: number } }>> {
  if (shareLinks.length === 0) return [];

  const grouped = await prisma.participant.groupBy({
    by: ['shareLinkId'],
    where: {
      shareLinkId: { in: shareLinks.map((link) => link.id) },
      type: 'anonymous',
    },
    _count: { _all: true },
  });
  const countByLink = new Map(
    grouped.map((group) => [group.shareLinkId, group._count._all])
  );

  return shareLinks.map((link) => ({
    ...link,
    _count: { anonymousParticipants: countByLink.get(link.id) ?? 0 },
  }));
}
