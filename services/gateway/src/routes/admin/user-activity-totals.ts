import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Les TOTAUX des cinq listes de `GET /admin/users/:userId/activity`.
 *
 * Chaque liste est bornée à cinquante lignes (`take: 50`) ; sans son total, la
 * fiche ne pouvait pas dire « 50 sur 212 » et laissait croire que la liste
 * était complète (audit de contrat du 2026-10-04). Les filtres sont ceux des
 * listes, exactement : un total qui ne compte pas la même population que sa
 * liste ment autrement.
 */
export type UserActivityTotals = {
  readonly shareLinks: number;
  readonly trackingLinks: number;
  readonly affiliateTokens: number;
  readonly contactsSent: number;
  readonly contactsReceived: number;
};

export async function countUserActivity(prisma: PrismaClient, userId: string): Promise<UserActivityTotals> {
  const [shareLinks, trackingLinks, affiliateTokens, contactsSent, contactsReceived] = await Promise.all([
    prisma.conversationShareLink.count({ where: { createdBy: userId } }),
    prisma.trackingLink.count({ where: { createdBy: userId } }),
    prisma.affiliateToken.count({ where: { createdBy: userId } }),
    prisma.friendRequest.count({ where: { senderId: userId } }),
    prisma.friendRequest.count({ where: { receiverId: userId } }),
  ]);
  return { shareLinks, trackingLinks, affiliateTokens, contactsSent, contactsReceived };
}
