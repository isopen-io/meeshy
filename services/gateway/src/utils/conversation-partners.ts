/**
 * Resolves, in two queries (no N+1), the distinct registered userIds sharing
 * at least one active conversation with a given user. Used to fan out
 * user-level realtime events (e.g. `USER_UPDATED`) to exactly the users who
 * have this profile cached, instead of a full broadcast.
 *
 * Same two-query dedupe shape as `MeeshySocketIOManager._emitPresenceSnapshot`,
 * scoped to registered users only (anonymous participants have no profile to
 * propagate).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export async function getDistinctConversationPartnerUserIds(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  const participantRows = await prisma.participant.findMany({
    where: { userId, isActive: true },
    select: { conversationId: true },
  });

  if (participantRows.length === 0) {
    return [];
  }

  const conversationIds = participantRows.map(p => p.conversationId);

  const partners = await prisma.participant.findMany({
    where: {
      conversationId: { in: conversationIds },
      isActive: true,
      userId: { not: userId },
    },
    select: { userId: true },
  });

  const seen = new Set<string>();
  for (const p of partners) {
    if (p.userId) {
      seen.add(p.userId);
    }
  }

  return Array.from(seen);
}
