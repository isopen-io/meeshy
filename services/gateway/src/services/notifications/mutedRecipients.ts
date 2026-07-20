import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * GW3 — per-conversation mute, single rule site.
 *
 * Removes from `userIds` every recipient whose
 * `UserConversationPreferences.isMuted` is true for `conversationId`.
 * Applied to the new_message / message_reply / message_reaction fan-out.
 * user_mentioned deliberately does NOT go through this filter: mentions
 * pierce the mute (WhatsApp convention).
 */
export async function filterMutedRecipients(
  prisma: PrismaClient,
  conversationId: string,
  userIds: readonly string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const mutedRows = await prisma.userConversationPreferences.findMany({
    where: { conversationId, userId: { in: [...userIds] }, isMuted: true },
    select: { userId: true },
  });

  const mutedIds = new Set(mutedRows.map((row) => row.userId));
  return userIds.filter((id) => !mutedIds.has(id));
}
