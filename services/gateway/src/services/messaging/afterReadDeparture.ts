import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AFTER_READ_CONSUME_MAX_IDS } from '@meeshy/shared/types/api-schemas';
import { isAfterReadEphemeral } from '@meeshy/shared/utils/ephemeral-countdown';
import { unsetOrNull } from '../../utils/prisma-unset';

export type AfterReadDeparturePrisma = Pick<PrismaClient, 'message' | 'messageStatusEntry'>;

/**
 * Ce qu'un lecteur qui QUITTE a vu et doit voir disparaître (#18556) : les
 * flammes-œil d'un autre, encore servies dans la conversation, dont il porte un
 * `readAt` posé PENDANT la période d'ouverture constatée (`openedAt`), et que
 * rien n'a encore consommées. Un `readAt` antérieur vient d'un accusé de
 * fenêtre (`POST /mark-read` sans `messageIds` : réponse depuis une
 * notification, widget) qui fige tout jusqu'à maintenant sans rien afficher :
 * il ne prouve pas que la flamme a été vue, et la ligne ne dit pas le mode. Bornée à la même fournée que la
 * route du client ; le reste attend le départ suivant ou le plafond de
 * rétention, jamais une supposition.
 */
export async function readAfterReadIdsAtDeparture(
  prisma: AfterReadDeparturePrisma,
  params: {
    readonly conversationId: string;
    readonly participantId: string;
    readonly openedAt: Date;
    readonly now: Date;
  },
): Promise<string[]> {
  const { conversationId, participantId, openedAt, now } = params;
  const candidates = (await prisma.message.findMany({
    where: {
      conversationId,
      senderId: { not: participantId },
      expiresAt: { gt: now },
      ...unsetOrNull('deletedAt'),
    },
    select: { id: true, effectFlags: true },
    orderBy: { createdAt: 'desc' },
    take: AFTER_READ_CONSUME_MAX_IDS,
  })) as Array<{ id: string; effectFlags: number | null }>;

  const flames = candidates.filter((row) => isAfterReadEphemeral(row.effectFlags)).map((row) => row.id);
  if (flames.length === 0) return [];

  const seen = (await prisma.messageStatusEntry.findMany({
    where: {
      messageId: { in: flames },
      participantId,
      readAt: { gte: openedAt },
      ...unsetOrNull('ephemeralExpiresAt'),
    },
    select: { messageId: true },
  })) as Array<{ messageId: string }>;

  const seenIds = new Set(seen.map((entry) => entry.messageId));
  return flames.filter((id) => seenIds.has(id));
}
