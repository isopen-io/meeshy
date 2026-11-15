import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';

/**
 * Le feu anticipé d'une flamme-œil dit à l'expéditeur QUAND le dernier lecteur
 * a lu puis quitté : c'est un accusé de lecture. Il n'a lieu que si aucun
 * destinataire vivant n'a coupé les siens (`showReadReceipts === false`, même
 * résolveur et même cache que `MessageReadStatusService`). Une lecture qui lève
 * le retient : l'expéditeur garde alors le comportement d'avant (#18556).
 */
export async function earlyBurnMayReachSender(params: {
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly senderParticipantId: string;
  readonly onError?: (error: unknown) => void;
}): Promise<boolean> {
  try {
    const rows = await params.prisma.participant.findMany({
      where: { conversationId: params.conversationId, ...PARTICIPATION_VIVANTE },
      select: { id: true, userId: true },
    });
    const userIds = [
      ...new Set(
        rows
          .filter((row) => row.id !== params.senderParticipantId)
          .flatMap((row) => (row.userId ? [row.userId] : [])),
      ),
    ];
    if (userIds.length === 0) return true;
    const stored = await loadPrivacyPreferencesCached(params.prisma, userIds);
    return userIds.every((userId) => stored.get(userId)?.showReadReceipts !== false);
  } catch (error) {
    params.onError?.(error);
    return false;
  }
}
