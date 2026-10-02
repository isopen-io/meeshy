import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { callInviteParticipantSchema } from '@meeshy/shared/types/call-controls';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';
import type { MeeshyIOServer, MeeshySocket } from './typed-socket';
import type { CallService } from '../services/CallService';
import type { PushNotificationService } from '../services/PushNotificationService';
import { SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import {
  authorizeCallInvitation,
  recordCallInvitation,
  type CallInvitationGrant,
  type CallInvitationRefusal,
} from '../services/calls/callInvitation';
import { buildCallInitiatedEvent, pushIncomingCall, ringCalleeSockets } from './call-ring';
import { ACCEPTED, gatedCallControl, refused } from './call-control-gate';
import { logger } from '../utils/logger';
import { EngagementService } from '../services/engagement/EngagementService';
import { creditCallInvitation } from '../services/calls/callEngagementCredits';

/**
 * `call:invite-participant` (#8433) — un participant connecté fait sonner un
 * ami dans l'appel en cours.
 *
 * L'invité sonne par le chemin de l'appel entrant (`call:initiated` sur ses
 * sockets, push VoIP / APNs / FCM sinon), enrichi de `invitedBy` et
 * `isGroup: true`. Les participants apprennent l'invitation par
 * `call:participant-invited` : un duo devient un appel de groupe, et le client
 * bascule sa présentation. Décrocher passe par le `call:join` /
 * `POST /calls/:callId/participants` ordinaire, qui admet l'invité pour CET
 * appel seulement (`resolveInvitedGuestParticipantId`).
 */

export type CallInviteRing = {
  readonly callId: string;
  readonly conversationId: string;
  readonly inviterUserId: string;
  readonly inviterName: string;
  readonly inviterAvatar?: string;
  readonly inviteeUserId: string;
  readonly event: CallInitiatedEvent;
};

export type CallInviteEventDeps = {
  readonly io: MeeshyIOServer;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly authorize: (input: {
    readonly callId: string;
    readonly inviterUserId: string;
    readonly inviteeUserId: string;
  }) => Promise<CallInvitationGrant | CallInvitationRefusal>;
  /** `true` quand l'invitation est nouvelle (`recordCallInvitation`). */
  readonly record: (session: CallInvitationGrant['session'], inviteeUserId: string) => Promise<boolean>;
  /** #8959 `conversation.call_participant_added` — l'inviteur, sur une invitation nouvelle. */
  readonly credit: (invitation: { readonly inviterUserId: string; readonly callId: string; readonly conversationId: string }) => void;
  readonly ring: (ring: CallInviteRing) => Promise<void>;
};

export function callInviteDependencies(input: {
  readonly io: MeeshyIOServer;
  readonly prisma: PrismaClient;
  readonly callService: Pick<CallService, 'getCallSession' | 'generateIceServers'>;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly pushService: () => PushNotificationService | null;
}): CallInviteEventDeps {
  const { io, prisma, callService } = input;
  let engagement: EngagementService | null = null;
  return {
    io,
    rateLimiter: input.rateLimiter,
    authorize: (request) => authorizeCallInvitation({ prisma, callService }, request),
    record: (session, inviteeUserId) => recordCallInvitation(prisma, session, inviteeUserId),
    credit: (invitation) =>
      creditCallInvitation({
        engagement: (engagement ??= new EngagementService(prisma)),
        ...invitation,
        onError: (error) => logger.warn('call-invite: engagement credit failed', { callId: invitation.callId, error }),
      }),
    ring: async (ring) => {
      const { foregroundUserIds } = await ringCalleeSockets(
        { io, prisma, callService },
        { callerUserId: ring.inviterUserId, calleeUserIds: [ring.inviteeUserId], event: ring.event }
      );
      const pushService = input.pushService();
      if (!pushService) return;
      await pushIncomingCall(
        { prisma, callService, pushService },
        {
          callId: ring.callId,
          conversationId: ring.conversationId,
          callerUserId: ring.inviterUserId,
          callerName: ring.inviterName,
          callerAvatar: ring.inviterAvatar,
          isVideo: ring.event.type === 'video',
          calleeUserIds: [ring.inviteeUserId],
          foregroundUserIds,
        }
      );
    },
  };
}

export function registerCallInviteEvents(
  deps: CallInviteEventDeps,
  socket: MeeshySocket,
  getUserId: (socketId: string) => string | undefined
): void {
  socket.on(
    CLIENT_EVENTS.CALL_INVITE_PARTICIPANT,
    gatedCallControl({
      socket,
      getUserId,
      rateLimiter: deps.rateLimiter,
      limit: SOCKET_RATE_LIMITS.CALL_INVITE,
      schema: callInviteParticipantSchema,
      label: 'call-invite-participant',
      run: async (inviterUserId, { callId, userId: inviteeUserId }) => {
        const grant = await deps.authorize({ callId, inviterUserId, inviteeUserId });
        if ('code' in grant) return refused(grant.code);

        if (await deps.record(grant.session, inviteeUserId)) {
          deps.credit({ inviterUserId, callId, conversationId: grant.session.conversationId });
        }
        deps.io.to(ROOMS.call(callId)).emit(SERVER_EVENTS.CALL_PARTICIPANT_INVITED, {
          callId,
          invitedBy: grant.inviter.userId,
          invitee: grant.invitee,
          participantCount: grant.activeCount,
          isGroup: true,
        });

        const event: CallInitiatedEvent = {
          ...buildCallInitiatedEvent(grant.session, grant.session.conversationId),
          invitedBy: {
            userId: grant.inviter.userId,
            username: grant.inviter.username,
            displayName: grant.inviter.displayName ?? undefined,
            avatar: grant.inviter.avatar ?? undefined,
          },
          isGroup: true,
        };
        await deps
          .ring({
            callId,
            conversationId: grant.session.conversationId,
            inviterUserId,
            inviterName: grant.inviter.displayName ?? grant.inviter.username,
            inviterAvatar: grant.inviter.avatar ?? undefined,
            inviteeUserId,
            event,
          })
          .catch((error: unknown) => logger.error('call-invite: ring failed', { callId, inviteeUserId, error }));
        return ACCEPTED;
      },
    })
  );
}
