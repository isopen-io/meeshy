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
import type { PushNotificationService } from '../services/PushNotificationService';
import { buildCallSilentPush } from '../services/call-push-mirroring';
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

/**
 * Sonnerie fantôme (app suspendue) — le fanout socket `call:ended` n'atteint
 * pas un appelé dont le socket n'est JAMAIS monté (réseau pauvre : la push
 * VoIP passe par APNs mais le WebSocket ne s'établit pas ; le freshness
 * check REST a déjà validé l'appel au moment du push). Quand l'appel se
 * termine SANS avoir été décroché (missed/rejected), on envoie aux membres
 * n'ayant jamais rejoint la call room une push **background** `call_cancel`
 * qui coupe CallKit. JAMAIS en type voip : chaque push VoIP exige un
 * reportNewIncomingCall (sinon kill) — c'est précisément pourquoi la
 * cancellation passe par une push standard silencieuse. Best-effort : aucun
 * échec ne doit casser le chemin terminal. Les personnes INVITÉES non membres
 * ont leur propre annulation (`call-invite-lifecycle.ts`, #8467).
 */
export async function sendNeverJoinedCancellationPushes(
  deps: {
    readonly prisma: Pick<PrismaClient, 'participant' | 'callParticipant'>;
    readonly pushService: Pick<PushNotificationService, 'sendToUser'>;
  },
  call: { readonly callId: string; readonly conversationId: string; readonly endedBy?: string }
): Promise<void> {
  const { callId, conversationId } = call;
  try {
    const [members, joined] = await Promise.all([
      deps.prisma.participant.findMany({
        where: { conversationId, isActive: true, userId: { not: null } },
        select: { userId: true },
      }),
      deps.prisma.callParticipant.findMany({
        where: { callSessionId: callId },
        select: { participant: { select: { userId: true } } },
      }),
    ]);

    const excluded = new Set<string>(
      joined.map((p) => p.participant?.userId).filter((uid): uid is string => !!uid)
    );
    if (call.endedBy) excluded.add(call.endedBy);

    const targets = members
      .map((m) => m.userId)
      .filter((uid): uid is string => !!uid && !excluded.has(uid));
    if (targets.length === 0) return;

    // Cross-platform mobile (audit 2026-07-11 #2) — le hardcode apns/ios
    // laissait un Android backgrounded (socket mort) sonner dans le vide.
    await Promise.all(
      targets.map((uid) =>
        deps.pushService.sendToUser(buildCallSilentPush({ userId: uid, type: 'call_cancel', callId })).catch((error) => {
          logger.error('call_cancel push failed', { callId, userId: uid, error });
        })
      )
    );

    logger.info('📲 call_cancel background push sent to never-joined members', { callId, targets });
  } catch (error) {
    logger.error('call_cancel push fanout failed — terminal path unaffected', { callId, error });
  }
}
