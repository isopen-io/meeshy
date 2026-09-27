/**
 * Les notifications « appel manqué » d'un appel qui n'a pas été décroché —
 * extrait de `CallEventsHandler.ts` (budget de taille).
 *
 * Seuls ceux que l'appel avait le droit de faire SONNER reçoivent un appel
 * manqué (#8073) : un membre qui a coupé « Appels hors contacts » n'a pas sonné,
 * et lui annoncer après coup qu'un inconnu l'a appelé rouvrirait la porte qu'il
 * a fermée.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../services/CallService';
import type { NotificationService } from '../services/notifications/NotificationService';
import { ringableCallees } from '../services/calls/callRingPolicy';
import { logger } from '../utils/logger';

export type MissedCallNotificationDeps = {
  readonly prisma: PrismaClient;
  readonly callService: Pick<CallService, 'getUnrespondedParticipants'>;
  readonly notificationService: Pick<NotificationService, 'createMissedCallNotification'>;
};

export async function sendMissedCallNotifications(
  deps: MissedCallNotificationDeps,
  callId: string
): Promise<void> {
  const callSession = await deps.prisma.callSession.findUnique({
    where: { id: callId },
    select: { id: true, initiatorId: true, conversationId: true, metadata: true },
  });

  if (!callSession) {
    logger.warn('⚠️ Call session not found for missed call notifications', { callId });
    return;
  }

  const unresponded = await deps.callService.getUnrespondedParticipants(callId);
  const recipients = await ringableCallees(deps.prisma, {
    callerUserId: callSession.initiatorId,
    calleeUserIds: unresponded,
  });

  if (recipients.length === 0) {
    logger.info('📢 No unresponded participants for missed call notifications', { callId });
    return;
  }

  const callType: 'audio' | 'video' =
    (callSession.metadata as { type?: string } | null)?.type === 'video' ? 'video' : 'audio';
  for (const recipientUserId of recipients) {
    await deps.notificationService.createMissedCallNotification({
      recipientUserId,
      callerId: callSession.initiatorId,
      conversationId: callSession.conversationId,
      callSessionId: callSession.id,
      callType,
    });
  }

  logger.info('📢 Missed call notifications created', { callId, recipientCount: recipients.length });
}
