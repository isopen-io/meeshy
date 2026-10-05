import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { CALL_RING_TIMEOUT_MS } from '@meeshy/shared/types/call-rules';
import { CALL_EVENTS, CALL_TERMINAL_STATUSES, type CallEndedEvent } from '@meeshy/shared/types/video-call';
import type { MeeshyIOServer } from './typed-socket';
import type { PushNotificationService } from '../services/PushNotificationService';
import type { NotificationService } from '../services/notifications/NotificationService';
import { buildCallSilentPush } from '../services/call-push-mirroring';
import { logger } from '../utils/logger';

/**
 * LA VIE D'UNE INVITATION D'APPEL (#8470, #8467) — une personne invitée dans un
 * appel en cours (`call-invite-events.ts`) en sort par l'une de TROIS portes :
 *
 * - elle DÉCROCHE : elle rejoint la grille (`call:participant-joined`), et
 *   l'invitation n'a plus rien à dire ;
 * - elle REFUSE (`call:end` `reason: 'rejected'`) : l'appel apprend
 *   `call:invite-declined`, ses autres appareils se taisent ;
 * - elle NE RÉPOND PAS : au bout de la sonnerie d'un appel
 *   (`CALL_RING_TIMEOUT_MS`), l'appel apprend `call:invite-expired`, sa
 *   sonnerie est annulée (socket et push silencieux, comme un membre) et elle
 *   trouve un appel MANQUÉ.
 *
 * UN SEUL minuteur par invitation sert les deux dernières : l'appel qui finit
 * avant l'échéance le solde aussitôt, par le même chemin.
 */

export type PendingCallInvitation = {
  readonly callId: string;
  readonly conversationId: string;
  readonly inviterUserId: string;
  readonly inviteeUserId: string;
  readonly callType: 'audio' | 'video';
};

export type CallInvitationLifecycleDeps = {
  readonly prisma: Pick<PrismaClient, 'callSession' | 'participant' | 'conversation'>;
  readonly pushService: () => Pick<PushNotificationService, 'sendToUser'> | null;
  readonly notificationService: () => Pick<NotificationService, 'createMissedCallNotification'> | null;
  readonly ringMs?: number;
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
};

type InvitationSession = {
  readonly status: string;
  readonly invitedUserIds?: readonly string[] | null;
  readonly participants?: readonly { readonly participant: { readonly userId: string | null } | null }[];
};

const TERMINAL: ReadonlySet<string> = new Set(CALL_TERMINAL_STATUSES);
const UNANSWERED_ENDINGS: ReadonlySet<string> = new Set(['missed', 'rejected']);

const keyOf = (callId: string, userId: string): string => `${callId}:${userId}`;

const answered = (session: InvitationSession, userId: string): boolean =>
  (session.participants ?? []).some((p) => p.participant?.userId === userId);

const defaultSchedule = (fn: () => void, ms: number): unknown => setTimeout(fn, ms).unref();
const defaultCancel = (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>);

export function createCallInvitationLifecycle(deps: CallInvitationLifecycleDeps) {
  const ringMs = deps.ringMs ?? CALL_RING_TIMEOUT_MS;
  const schedule = deps.schedule ?? defaultSchedule;
  const cancel = deps.cancel ?? defaultCancel;
  const pending = new Map<string, { readonly invitation: PendingCallInvitation; readonly handle: unknown }>();

  const take = (callId: string, userId: string): PendingCallInvitation | null => {
    const entry = pending.get(keyOf(callId, userId));
    if (!entry) return null;
    cancel(entry.handle);
    pending.delete(keyOf(callId, userId));
    return entry.invitation;
  };

  const readSession = (callId: string): Promise<InvitationSession | null> =>
    deps.prisma.callSession.findUnique({
      where: { id: callId },
      select: { status: true, invitedUserIds: true, participants: { select: { participant: { select: { userId: true } } } } },
    });

  const silenceDevices = (io: MeeshyIOServer, callId: string, userId: string, reason: CallEndedEvent['reason']): void => {
    io.to(ROOMS.user(userId)).emit(CALL_EVENTS.ENDED, { callId, duration: 0, reason });
  };

  const cancelPush = async (callId: string, userId: string): Promise<void> => {
    await deps.pushService()?.sendToUser(buildCallSilentPush({ userId, type: 'call_cancel', callId }));
  };

  const isMember = async (invitation: PendingCallInvitation): Promise<boolean> =>
    (await deps.prisma.participant.findFirst({
      where: { conversationId: invitation.conversationId, userId: invitation.inviteeUserId, isActive: true },
      select: { id: true },
    })) !== null;

  /** Un membre actif d'un appel jamais décroché a déjà son annulation et son appel manqué par le chemin des membres. */
  const coveredAsMember = async (session: InvitationSession, invitation: PendingCallInvitation): Promise<boolean> =>
    UNANSWERED_ENDINGS.has(session.status) && (await isMember(invitation));

  /**
   * Où mène l'appel manqué (#9115). Une invitée NON membre n'a, dans la
   * conversation de l'appel, qu'une participation `call-guest` inactive : y
   * mener ouvrirait un fil qu'elle ne peut pas lire, et la notification en
   * porterait le titre. Elle est menée à sa conversation directe avec
   * l'inviteur — une amie acceptée, condition de l'invitation —, la plus
   * récemment active ; sans elle, la notification ne nomme aucune conversation.
   */
  const missedCallConversationId = async (invitation: PendingCallInvitation): Promise<string | null> => {
    if (await isMember(invitation)) return invitation.conversationId;
    const direct = await deps.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { participants: { some: { userId: invitation.inviteeUserId, isActive: true } } },
          { participants: { some: { userId: invitation.inviterUserId, isActive: true } } },
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    return direct?.id ?? null;
  };

  const settleUnanswered = async (io: MeeshyIOServer, invitation: PendingCallInvitation): Promise<void> => {
    const { callId, inviteeUserId } = invitation;
    const session = await readSession(callId);
    if (!session || answered(session, inviteeUserId)) return;
    if (!TERMINAL.has(session.status)) {
      io.to(ROOMS.call(callId)).emit(SERVER_EVENTS.CALL_INVITE_EXPIRED, { callId, userId: inviteeUserId });
      silenceDevices(io, callId, inviteeUserId, 'missed');
    } else if (await coveredAsMember(session, invitation)) {
      return;
    }
    await cancelPush(callId, inviteeUserId);
    await deps.notificationService()?.createMissedCallNotification({
      recipientUserId: inviteeUserId,
      callerId: invitation.inviterUserId,
      conversationId: await missedCallConversationId(invitation),
      callSessionId: callId,
      callType: invitation.callType,
    });
  };

  const reportSettlementFailure =
    (invitation: PendingCallInvitation) =>
    (error: unknown): void =>
      logger.error('call-invite: unanswered invitation settlement failed', {
        callId: invitation.callId,
        inviteeUserId: invitation.inviteeUserId,
        error,
      });

  return {
    /** L'invitation sonne : son échéance est celle de la sonnerie d'un appel. Ré-inviter la réarme. */
    arm(io: MeeshyIOServer, invitation: PendingCallInvitation): void {
      take(invitation.callId, invitation.inviteeUserId);
      const handle = schedule(() => {
        pending.delete(keyOf(invitation.callId, invitation.inviteeUserId));
        void settleUnanswered(io, invitation).catch(reportSettlementFailure(invitation));
      }, ringMs);
      pending.set(keyOf(invitation.callId, invitation.inviteeUserId), { invitation, handle });
    },

    /** `true` quand `userId` refusait une invitation de cet appel ; `false` laisse `call:end` trancher. */
    async decline(io: MeeshyIOServer, input: { readonly callId: string; readonly userId: string }): Promise<boolean> {
      const { callId, userId } = input;
      const session = await readSession(callId).catch(() => null);
      if (!session || TERMINAL.has(session.status) || !(session.invitedUserIds ?? []).includes(userId) || answered(session, userId)) {
        return false;
      }
      take(callId, userId);
      io.to(ROOMS.call(callId)).emit(SERVER_EVENTS.CALL_INVITE_DECLINED, { callId, userId });
      silenceDevices(io, callId, userId, 'rejected');
      await cancelPush(callId, userId).catch((error: unknown) =>
        logger.error('call-invite: decline cancel push failed', { callId, userId, error })
      );
      return true;
    },

    /** L'appel est fini : chaque invitation encore en attente se solde tout de suite, sans attendre son échéance. */
    async callEnded(io: MeeshyIOServer, callId: string): Promise<void> {
      const due = [...pending.values()]
        .filter((entry) => entry.invitation.callId === callId)
        .flatMap((entry) => take(entry.invitation.callId, entry.invitation.inviteeUserId) ?? []);
      await Promise.all(
        due.map((invitation) => settleUnanswered(io, invitation).catch(reportSettlementFailure(invitation)))
      );
    },
  };
}

export type CallInvitationLifecycle = ReturnType<typeof createCallInvitationLifecycle>;
