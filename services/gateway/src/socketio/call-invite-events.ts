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
import type { CallInvitationLifecycle, PendingCallInvitation } from './call-invite-lifecycle';
import { rebranchCall, type RebranchInput, type RebranchOutcome } from '../services/calls/callConversationRebranch';
import { admitConversationMember, type ParticipantAdmissionVerdict } from '../services/conversations/memberAdmission';
import { noticeActor } from '../services/conversations/conversationNotice';
import { newMemberRefusal } from '../services/conversations/newMemberAdmission';
import { loadSalonCommunity, type SalonCommunity } from '../services/conversations/communityMembershipSync';
import { announceConversationNew } from '../services/conversations/obsoleteCapability';
import { admitUserToConversationRoom } from './midSessionRoomAdmission';
import type { NotificationService } from '../services/notifications/NotificationService';

/**
 * `call:invite-participant` (#8433) — un participant connecté fait sonner un
 * ami dans l'appel en cours.
 *
 * L'invité sonne par le chemin de l'appel entrant (`call:initiated` sur ses
 * sockets, push VoIP / APNs / FCM sinon), enrichi de `invitedBy` et
 * `isGroup: true`. Les participants apprennent l'invitation par
 * `call:participant-invited` : un duo devient un appel de groupe, et le client
 * bascule sa présentation. Décrocher passe par le `call:join` /
 * `POST /calls/:callId/participants` ordinaire.
 *
 * #19650 (décision porteur 2026-11-18) — inviter, c'est faire entrer dans la
 * conversation de l'appel (`callInvitationRoute`) :
 * - appel de GROUPE : l'invité y devient membre (la porte d'ajout,
 *   `admitConversationMember`, sans sa notification : la sonnerie en tient lieu) ;
 * - appel en TÊTE-À-TÊTE lisible : l'appel bascule vers le groupe des présents
 *   et de l'invité, trouvé ou créé (`rebranchCall`), qui émet
 *   `call:conversation-changed` AVANT `call:participant-invited` ; une course
 *   perdue fait entrer l'invité dans le groupe gagnant ;
 * - tête-à-tête CHIFFRÉ de bout en bout : l'invité reste l'invité de CET appel
 *   (`resolveInvitedGuestParticipantId`), comme avant (D3).
 * Sonnerie, push et échéance portent la conversation où l'appel vit.
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
  /** #19650 — l'appel en tête-à-tête rejoint son groupe (`rebranchCall`). */
  readonly rebranch: (input: RebranchInput) => Promise<RebranchOutcome>;
  /** #19650 — l'invité entre dans le groupe de l'appel (`admitConversationMember`). */
  readonly admit: (input: {
    readonly conversationId: string;
    readonly inviterUserId: string;
    readonly inviteeUserId: string;
    readonly community?: SalonCommunity | null;
  }) => Promise<ParticipantAdmissionVerdict['outcome'] | 'refused'>;
  /** `true` quand l'invitation est nouvelle (`recordCallInvitation`). */
  readonly record: (session: CallInvitationGrant['session'], inviteeUserId: string) => Promise<boolean>;
  /** #8959 `conversation.call_participant_added` — l'inviteur, sur une invitation nouvelle. */
  readonly credit: (invitation: { readonly inviterUserId: string; readonly callId: string; readonly conversationId: string }) => void;
  readonly ring: (ring: CallInviteRing) => Promise<void>;
  /** #8470 · #8467 — l'échéance de l'invitation : sans réponse, elle se solde (`call-invite-lifecycle.ts`). */
  readonly armExpiry: (invitation: PendingCallInvitation) => void;
};

export function callInviteDependencies(input: {
  readonly io: MeeshyIOServer;
  readonly prisma: PrismaClient;
  readonly callService: Pick<CallService, 'getCallSession' | 'generateIceServers' | 'activeCallClaim' | 'createLiveCallMessage'>;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly pushService: () => PushNotificationService | null;
  readonly invitations: CallInvitationLifecycle;
  /** Le diffuseur `message:new` des messages d'appel (`wireCallMessageBroadcasters`). */
  readonly broadcastMessage?: () => ((message: unknown, conversationId: string) => Promise<void>) | null;
  readonly notificationService?: () => Pick<NotificationService, 'createAddedToConversationNotification' | 'createMemberJoinedNotificationsBatch'> | null;
}): CallInviteEventDeps {
  const { io, prisma, callService } = input;
  let engagement: EngagementService | null = null;
  const joinRoom = (userId: string, conversationId: string): Promise<void> =>
    admitUserToConversationRoom({ io, userSockets: new Map(), socketById: () => undefined, connectedUsers: new Map() }, userId, conversationId);
  const broadcastMessage = (message: unknown, conversationId: string): Promise<void> =>
    input.broadcastMessage?.()?.(message, conversationId) ?? Promise.resolve();
  return {
    io,
    rateLimiter: input.rateLimiter,
    authorize: (request) =>
      authorizeCallInvitation({ prisma, callService, ringingInviteeIds: (callId) => input.invitations.pendingFor(callId) }, request),
    rebranch: (request) =>
      rebranchCall(
        {
          prisma,
          io,
          claim: (conversationId, callId) => callService.activeCallClaim.claim(conversationId, callId),
          notify: (conversationId, callId) => callService.activeCallClaim.notifyChanged(conversationId, callId),
          postLiveMessage: async (callId) => {
            const message = await callService.createLiveCallMessage(callId);
            if (message) await broadcastMessage(message, message.conversationId);
          },
          joinRoom,
          announceNew: (payload, recipientIds) =>
            announceConversationNew(prisma, {
              io,
              recipientIds,
              payload,
              onError: (error) => logger.warn('call-invite: conversation:new failed', { conversationId: payload.conversationId, error }),
            }),
        },
        request
      ),
    admit: async (request) => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: request.conversationId },
        select: { isActive: true, closedAt: true, type: true, encryptionMode: true, communityId: true },
      });
      if (!conversation || newMemberRefusal(conversation)) return 'refused';
      const inviter = await prisma.participant.findFirst({
        where: { conversationId: request.conversationId, userId: request.inviterUserId, isActive: true },
        select: { id: true, displayName: true },
      });
      if (!inviter) return 'refused';
      const community = request.community !== undefined
        ? request.community
        : await loadSalonCommunity(prisma, { communityId: conversation.communityId, actorId: request.inviterUserId });
      const verdict = await admitConversationMember(
        {
          prisma,
          io,
          joinRoom,
          broadcastMessage,
          notificationService: input.notificationService?.() ?? null,
          engagement: (engagement ??= new EngagementService(prisma)),
        },
        {
          conversationId: request.conversationId,
          conversation,
          userId: request.inviteeUserId,
          currentUserId: request.inviterUserId,
          addedBy: noticeActor(inviter),
          community,
          notifyInvitee: false,
        }
      );
      return verdict.outcome;
    },
    record: (session, inviteeUserId) => recordCallInvitation(prisma, session, inviteeUserId),
    credit: (invitation) =>
      creditCallInvitation({
        engagement: (engagement ??= new EngagementService(prisma)),
        ...invitation,
        onError: (error) => logger.warn('call-invite: engagement credit failed', { callId: invitation.callId, error }),
      }),
    armExpiry: (invitation) => input.invitations.arm(io, invitation),
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
          conversationType: ring.event.conversationType ?? 'direct',
          isGroup: true,
          invitedByUserId: ring.inviterUserId,
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

        const home = await joinCallConversation(deps, grant, { callId, inviterUserId, inviteeUserId });
        if ('code' in home) return refused(home.code);

        if (await deps.record(grant.session, inviteeUserId)) {
          deps.credit({ inviterUserId, callId, conversationId: home.conversationId });
        }
        deps.io.to(ROOMS.call(callId)).emit(SERVER_EVENTS.CALL_PARTICIPANT_INVITED, {
          callId,
          invitedBy: grant.inviter.userId,
          invitee: grant.invitee,
          participantCount: grant.activeCount,
          isGroup: true,
        });

        const event: CallInitiatedEvent = {
          ...buildCallInitiatedEvent(grant.session, home.conversationId),
          ...(home.moved ? { conversationType: 'group', conversationTitle: home.title } : {}),
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
            conversationId: home.conversationId,
            inviterUserId,
            inviterName: grant.inviter.displayName ?? grant.inviter.username,
            inviterAvatar: grant.inviter.avatar ?? undefined,
            inviteeUserId,
            event,
          })
          .catch((error: unknown) => logger.error('call-invite: ring failed', { callId, inviteeUserId, error }));
        deps.armExpiry({
          callId,
          conversationId: home.conversationId,
          inviterUserId,
          inviteeUserId,
          callType: event.type === 'video' ? 'video' : 'audio',
        });
        return ACCEPTED;
      },
    })
  );
}

type CallHome =
  | { readonly conversationId: string; readonly moved: boolean; readonly title: string | null }
  | CallInvitationRefusal;

const ADMITTED: ReadonlySet<string> = new Set(['new', 'rejoin', 'already-member']);

/** La conversation où l'invité sonne — après l'avoir fait entrer, ou après la bascule de l'appel (#19650). */
async function joinCallConversation(
  deps: CallInviteEventDeps,
  grant: CallInvitationGrant,
  input: { readonly callId: string; readonly inviterUserId: string; readonly inviteeUserId: string }
): Promise<CallHome> {
  const conversationId = grant.session.conversationId;
  const stay: CallHome = { conversationId, moved: false, title: null };
  if (grant.route === 'legacy-guest') return stay;
  if (grant.route === 'admit-member') {
    if (grant.inviteeIsMember) return stay;
    const outcome = await deps.admit({
      conversationId,
      inviterUserId: input.inviterUserId,
      inviteeUserId: input.inviteeUserId,
      community: grant.community,
    });
    return ADMITTED.has(outcome) ? stay : { ok: false, code: 'PERMISSION_DENIED' };
  }

  const presentUserIds = grant.session.participants.flatMap((p) => (!p.leftAt && p.participant?.userId ? [p.participant.userId] : []));
  const outcome = await deps
    .rebranch({ callId: input.callId, fromConversationId: conversationId, presentUserIds, ...input })
    .catch((error: unknown): RebranchOutcome => {
      logger.error('call-invite: rebranch failed', { callId: input.callId, error });
      return { kind: 'failed' };
    });
  if (outcome.kind === 'failed') return { ok: false, code: 'INTERNAL_ERROR' };
  if (outcome.kind === 'rebranched') return { conversationId: outcome.conversationId, moved: true, title: outcome.title };
  const admitted = await deps.admit({ conversationId: outcome.conversationId, inviterUserId: input.inviterUserId, inviteeUserId: input.inviteeUserId });
  return ADMITTED.has(admitted) ? { conversationId: outcome.conversationId, moved: true, title: null } : { ok: false, code: 'PERMISSION_DENIED' };
}
