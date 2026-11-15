import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * A participation is live while its `leftAt` is null OR was never written
 * (pre-C5 rows, audit 2026-07-02).
 */
export const LIVE_CALL_PARTICIPATION = {
  OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
} satisfies Prisma.CallParticipantWhereInput;

/**
 * Every Participant.id an account holds, across all its conversations.
 *
 * A CallParticipant query keyed on these ids walks `[participantId]`; the
 * relation filter `participant: { userId }` it replaces is rendered by Prisma
 * as a `$lookup` over the WHOLE collection (COLLSCAN, #10831).
 */
export async function accountParticipantIds(
  prisma: Pick<PrismaClient, 'participant'>,
  userId: string
): Promise<string[]> {
  const rows = await prisma.participant.findMany({ where: { userId }, select: { id: true } });
  return rows.map((row) => row.id);
}
