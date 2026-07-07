/**
 * CallEventsHandler - Socket.IO event handler for video/audio calls (Phase 1A: P2P MVP)
 *
 * Handles:
 * - Call initiation
 * - Participant joining/leaving
 * - WebRTC signaling (SDP, ICE candidates)
 * - Media state toggles (audio/video)
 * - Broadcasting events to participants
 */

import { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import { PrismaClient, CallStatus, CallEndReason } from '@meeshy/shared/prisma/client';
import { CallService } from '../services/CallService';
import { NotificationService } from '../services/notifications/NotificationService';
import { PushNotificationService } from '../services/PushNotificationService';
import { logger } from '../utils/logger';
import { CALL_EVENTS, CALL_ERROR_CODES, CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { resolveCallEndedRooms } from '../utils/callEndedFanout';
import { validateSocketEvent, isValidationFailure } from '../middleware/validation';
import {
  socketInitiateCallSchema,
  socketJoinCallSchema,
  socketLeaveCallSchema,
  socketSignalSchema,
  socketMediaToggleSchema,
  socketEndCallSchema,
  socketHeartbeatSchema,
  socketQualityReportSchema,
  socketReconnectingSchema,
  socketReconnectedSchema,
  socketForceLeaveSchema,
  socketTranscriptionSegmentSchema,
  socketRequestIceServersSchema,
  socketCallBackgroundedSchema,
  socketCallForegroundedSchema,
  socketCallScreenCaptureDetectedSchema,
  socketCallAnalyticsSchema
} from '../validation/call-schemas';
import { getSocketRateLimiter, checkSocketRateLimit, SOCKET_RATE_LIMITS } from '../utils/socket-rate-limiter';
import { ZmqTranslationClient } from '../services/zmq-translation';
import type {
  CallInitiateEvent,
  CallInitiatedEvent,
  CallJoinEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallSignalEvent,
  CallEndedEvent,
  CallMediaToggleEvent,
  CallError,
  CallHeartbeatEvent,
  CallQualityReportEvent,
  CallReconnectingEvent,
  CallReconnectedEvent,
  CallMissedEvent,
  CallInitiateAck,
  CallJoinAck,
  ConnectionQuality,
  // CallEndReason imported as value from @meeshy/shared/prisma/client above
  // (the Prisma generated enum is both a value AND a type, so we don't
  // need the type-only re-export from video-call.ts which duplicates it).
  CallTranscriptionSegmentEvent,
  CallIceServersRefreshedEvent,
  CallScreenCaptureEvent,
} from '@meeshy/shared/types/video-call';

/**
 * CALL-RESILIENCE — the shape of an active participation row read by the
 * disconnect handler (`callParticipant.findMany` with `include: callSession`),
 * threaded into the grace-window helpers.
 */
type DisconnectParticipation = {
  id: string;
  participantId: string;
  callSessionId: string;
  callSession: { mode: string; conversationId: string; status: string };
};

export class CallEventsHandler {
  private callService: CallService;
  private notificationService: NotificationService | null = null;
  private pushService: PushNotificationService | null = null;
  private zmqClient: ZmqTranslationClient | null = null;
  /** Periodic sweep handle for `bufferedOffers` TTL eviction. */
  private bufferCleanupInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * P3 — broadcaster for the call-summary system message. Injected by the
   * socket manager (which owns `broadcastMessage`) so this handler can post a
   * `message:new` into the conversation when a call ends, without reaching into
   * the manager's internals. Stays null in unit tests that don't exercise the
   * summary path.
   */
  private messageBroadcaster: ((message: unknown, conversationId: string) => Promise<void>) | null = null;
  private rateLimiter = getSocketRateLimiter();

  /**
   * Consecutive degraded quality-report streaks per `${callId}:${participantId}`.
   * The remote-quality alert only fires once a participant's link has been bad
   * for SUSTAINED consecutive reports (~10 s at the client's 5 s cadence) —
   * server-side mirror of the client's DegradedLinkTracker, so an isolated RTT
   * blip never flashes "your contact has a bad connection" at the other side.
   * A healthy report clears the streak; entries older than STREAK_STALE_MS
   * restart from zero (reports stopped flowing — not consecutive anymore).
   */
  private qualityDegradedStreaks = new Map<string, { streak: number; lastAt: number }>();
  private static readonly QUALITY_ALERT_SUSTAINED_REPORTS = 2;
  private static readonly QUALITY_STREAK_STALE_MS = 60_000;
  private static readonly QUALITY_STREAK_MAP_MAX = 5_000;

  /**
   * §4.6 — last-offer buffer per call. The signaling relay is otherwise
   * fire-and-forget: if the caller's offer arrives while the callee's socket
   * is not yet in the call room (PushKit wake, background/foreground churn,
   * 2nd device), the gateway drops it with TARGET_NOT_FOUND and the call hangs
   * (bug a/d). We buffer the most recent offer (or ice-restart) per call and
   * replay it to the destined participant when their socket (re)joins the
   * room. Replaying an out-of-date offer is harmless because the receiver
   * drops stale epochs via `negotiationId` (§3.5).
   */
  private bufferedOffers = new Map<string, { signal: CallSignalEvent; bufferedAt: number }>();
  private static readonly OFFER_BUFFER_TTL_MS = 150_000;

  /**
   * CALL-RESILIENCE 2026-07-02 — an ANSWERED call rides on a direct peer-to-peer
   * media connection (DTLS-SRTP) that the gateway never carries: a transient loss
   * of the signaling socket (network blip, single-instance restart/deploy) does
   * NOT sever the media. So a raw socket `disconnect` must NOT be treated as a
   * hangup for active calls. Two mechanisms cooperate:
   *
   *  1. `isShuttingDown` — flipped at the very start of the server's graceful
   *     `stop()` (BEFORE the HTTP/Socket.IO server closes and mass-drops every
   *     socket). Once set, the disconnect handler leaves active CallSession rows
   *     untouched (no leaveCall, no `call:ended`) so the media survives and clients
   *     transparently re-join the restarted instance. On a hard kill (SIGKILL) no
   *     handler runs at all, so the DB row also stays `active` — the restarted
   *     instance's CallCleanupService heartbeat GC (120s DB fallback) reaps it only
   *     if nobody reconnects.
   *
   *  2. `disconnectGraceTimers` — for an involuntary (non-shutdown) disconnect of an
   *     active/reconnecting call we arm a short per-(callId:userId) grace window
   *     instead of ending immediately. A re-join (`call:join`) cancels it; expiry
   *     runs the normal leave/end path. Pre-answer calls keep the immediate end.
   */
  private isShuttingDown = false;
  private disconnectGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly DISCONNECT_GRACE_MS = 30_000;
  // CALL-RESILIENCE (chaos-test prod 2026-07-02, callId 6a46713b…) — the
  // socket.io reconnect backoff can legitimately exceed the 30s grace (the
  // re-join landed 18s late on a call whose BOTH apps were alive and whose
  // P2P media was healthy). When the user still has ANY connected socket at
  // expiry, the re-join is coming: extend rather than kill, capped so the
  // total stays under the heartbeat GC tier (30s + 4×15s = 90s < 120s).
  private static readonly GRACE_EXTENSION_MS = 15_000;
  private static readonly MAX_GRACE_EXTENSIONS = 4;
  // Pre-answer disconnects: long enough to absorb a socket churn / transport
  // blip of the caller mid-ring, short enough that a real crash still resolves
  // the ring quickly (the 60s ringing timeout remains the hard cap).
  private static readonly PRE_ANSWER_GRACE_MS = 10_000;

  // RC-4 — accepts an externally-owned CallService so the socket manager,
  // AuthHandler disconnect cleanup, and CallCleanupService's heartbeat GC
  // all observe the same in-memory ringingTimeouts/heartbeats/
  // backgroundedParticipants maps. Falls back to a private instance when
  // omitted (unit tests construct this handler standalone).
  constructor(private prisma: PrismaClient, callService?: CallService) {
    this.callService = callService ?? new CallService(prisma);
    // Defensive TTL sweep: runs every 60s to evict stale offer entries whose
    // call ended via a path that skipped clearBufferedOffer (error branches,
    // GC teardown). Complements the inline sweep in bufferOffer which only
    // runs when a new offer arrives.
    this.bufferCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.bufferedOffers) {
        if (now - entry.bufferedAt > CallEventsHandler.OFFER_BUFFER_TTL_MS) {
          this.bufferedOffers.delete(key);
        }
      }
    }, 60_000).unref();
  }

  /** Release the periodic cleanup interval. Call when shutting down the handler. */
  destroy(): void {
    if (this.bufferCleanupInterval !== null) {
      clearInterval(this.bufferCleanupInterval);
      this.bufferCleanupInterval = null;
    }
    for (const timer of this.disconnectGraceTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectGraceTimers.clear();
  }

  /**
   * CALL-RESILIENCE — flip the handler into shutdown mode. MUST be called at the
   * very start of the server's graceful `stop()`, BEFORE the HTTP/Socket.IO
   * server is closed and every socket drops. Once set, the per-socket
   * `disconnect` handler stops interpreting the mass socket drop of a restart as
   * everyone hanging up: active CallSession rows are left untouched (status stays
   * `active`, no `call:ended` broadcast) so the peer-to-peer media survives and
   * clients transparently re-join the restarted instance. Any armed grace timers
   * are cleared — they would be lost on process exit anyway and must not fire a
   * spurious end mid-shutdown.
   */
  prepareForShutdown(): void {
    this.isShuttingDown = true;
    for (const timer of this.disconnectGraceTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectGraceTimers.clear();
    logger.info('📞 CallEventsHandler entering shutdown mode — active calls preserved for reconnect');
  }

  /**
   * CALL-RESILIENCE (item H) — a crash/restart wiped the in-process ringing
   * timers (CallService.ringingTimeouts). Re-arm them from MongoDB at boot so
   * a pre-answer call interrupted by the restart still resolves to `missed`
   * (broadcasts + summary + missed-call push) on its nominal ringing budget,
   * instead of ringing server-side until the 120s GC tier reaps it without
   * any missed-call notification. Answered calls need no rehydration: their
   * liveness is re-established by client re-joins and the heartbeat tier's
   * boot-grace floor (CallCleanupService). Never throws — a DB hiccup here
   * must not crash the boot.
   */
  async rehydrateActiveCalls(io: SocketIOServer): Promise<void> {
    try {
      const preAnswer = await this.prisma.callSession.findMany({
        where: { status: { in: [CallStatus.initiated, CallStatus.ringing] } },
        select: { id: true, startedAt: true }
      });
      for (const call of preAnswer) {
        this.callService.rescheduleRingingTimeout(
          call.id,
          call.startedAt,
          this.buildRingingTimeoutHandler(io, call.id)
        );
      }
      if (preAnswer.length > 0) {
        logger.info('📞 Boot rehydration — ringing timers re-armed for pre-answer calls', {
          count: preAnswer.length,
          callIds: preAnswer.map(c => c.id)
        });
      }
    } catch (error) {
      logger.error('❌ Boot rehydration failed — stale pre-answer calls will be reaped by GC instead', error);
    }
  }

  /**
   * Shared ringing-timeout handler — used by call:initiate (fresh 60s timer)
   * and by boot rehydration (remaining budget). Phase 1 fix P2 + audit
   * 2026-05-11 fixes: atomic status-guarded updateMany (TOCTOU-safe against
   * concurrent join/end/leave), CALL_EVENTS.ENDED + MISSED broadcasts,
   * call-summary system message, and the missed-call push pipeline.
   */
  /**
   * Broadcast `call:ended` to the FULL termination audience in one
   * deduplicated emit: the call room (joined participants), the conversation
   * room (members with the conversation open) AND the user room of every
   * active conversation member — the SAME audience as the `call:initiated`
   * invitation. A still-ringing callee has joined NEITHER of the first two
   * rooms: without the user-room fanout it never learns the call ended and
   * keeps ringing after the caller hung up (prod incident 2026-07-03 06:14 —
   * `call:join` arrived 25 s after "Call ended" and was rejected with
   * "This call has already ended"). Socket.IO deduplicates sockets present
   * in several of the targeted rooms, so clients receive the event once.
   */
  private async broadcastCallEnded(
    io: SocketIOServer,
    callId: string,
    conversationId: string | undefined,
    endedEvent: Omit<CallEndedEvent, 'endedBy'> & { endedBy?: string }
  ): Promise<void> {
    this.clearQualityDegradedStreaks(callId);
    const rooms = await resolveCallEndedRooms(this.prisma, callId, conversationId);
    io.to(rooms).emit(CALL_EVENTS.ENDED, endedEvent);
    await this.sendCallCancellationPushes(callId, conversationId, endedEvent);
  }

  /**
   * Sonnerie fantôme (app suspendue) — le fanout socket ci-dessus n'atteint
   * pas un appelé dont le socket n'est JAMAIS monté (réseau pauvre : la push
   * VoIP passe par APNs mais le WebSocket ne s'établit pas ; le freshness
   * check REST a déjà validé l'appel au moment du push). Quand l'appel se
   * termine SANS avoir été décroché (missed/rejected), on envoie aux membres
   * n'ayant jamais rejoint la call room une push APNs **background**
   * `call_cancel` qui coupe CallKit. JAMAIS en type voip : chaque push VoIP
   * exige un reportNewIncomingCall (sinon kill) — c'est précisément pourquoi
   * la cancellation passe par une push standard silencieuse. Best-effort :
   * aucun échec ne doit casser le chemin terminal.
   */
  private async sendCallCancellationPushes(
    callId: string,
    conversationId: string | undefined,
    endedEvent: Omit<CallEndedEvent, 'endedBy'> & { endedBy?: string }
  ): Promise<void> {
    if (!this.pushService || !conversationId) return;
    if (endedEvent.reason !== 'missed' && endedEvent.reason !== 'rejected') return;

    try {
      const [members, joined] = await Promise.all([
        this.prisma.participant.findMany({
          where: { conversationId, isActive: true, userId: { not: null } },
          select: { userId: true }
        }),
        this.prisma.callParticipant.findMany({
          where: { callSessionId: callId },
          select: { participant: { select: { userId: true } } }
        })
      ]);

      const excluded = new Set<string>(
        joined.map((p) => p.participant?.userId).filter((uid): uid is string => !!uid)
      );
      if (endedEvent.endedBy) excluded.add(endedEvent.endedBy);

      const targets = members
        .map((m) => m.userId)
        .filter((uid): uid is string => !!uid && !excluded.has(uid));
      if (targets.length === 0) return;

      await Promise.all(targets.map((uid) =>
        this.pushService!.sendToUser({
          userId: uid,
          payload: {
            title: '',
            body: '',
            silent: true,
            data: { type: 'call_cancel', callId }
          },
          types: ['apns'],
          platforms: ['ios']
        }).catch((error) => {
          logger.error('call_cancel push failed', { callId, userId: uid, error });
        })
      ));

      logger.info('📲 call_cancel background push sent to never-joined members', {
        callId,
        targets
      });
    } catch (error) {
      logger.error('call_cancel push fanout failed — terminal path unaffected', { callId, error });
    }
  }

  private buildRingingTimeoutHandler(io: SocketIOServer, callId: string): () => Promise<void> {
    return async () => {
      try {
        // Atomic conditional transition — count > 0 means we won the
        // race; count === 0 means another path (call:join, call:end,
        // call:leave) already moved the status off ringing/initiated.
        // Terminal write protocol: every terminal writer MUST bump `version`
        // so version-guarded writers (leaveCall, endCall, idempotent-leave)
        // that read the row BEFORE this transition no-op instead of rewriting
        // missed → ended/completed (probe prod 2026-07-02 22:41Z).
        const result = await this.prisma.callSession.updateMany({
          where: {
            id: callId,
            status: { in: [CallStatus.initiated, CallStatus.ringing] }
          },
          data: {
            status: CallStatus.missed,
            endReason: CallEndReason.missed,
            endedAt: new Date(),
            version: { increment: 1 }
          }
        });
        if (result.count === 0) {
          return; // already transitioned
        }
        const missedContext = await this.prisma.callSession.findUnique({
          where: { id: callId },
          select: {
            conversationId: true,
            initiatorId: true,
            initiator: { select: { displayName: true, username: true } }
          }
        });
        const conversationId = missedContext?.conversationId;
        // Release the conversation's active-call claim HERE, as close to the
        // won transition as possible — before any emit/summary/notification
        // step can throw. Delegating the release to handleMissedCall →
        // markCallAsMissed leaks the claim: its non-ringing guard sees the
        // row we just wrote as `missed` and returns early (prod incident
        // 2026-07-02 — conversation rejected CALL_ALREADY_ACTIVE ~5 min).
        if (conversationId) {
          await this.callService.releaseActiveCallClaim(conversationId, callId);
        }
        const endedEvent = {
          callId,
          duration: 0,
          endedBy: undefined,
          reason: 'missed' as CallEndReason,
        };
        await this.broadcastCallEnded(io, callId, conversationId, endedEvent);
        // Contract: CallMissedEvent requires all 4 fields — a `{ callId }`
        // only payload made the iOS decoder fail (keyNotFound conversationId).
        const missedEvent: CallMissedEvent = {
          callId,
          conversationId: conversationId ?? '',
          callerId: missedContext?.initiatorId ?? '',
          callerName: missedContext?.initiator?.displayName
            || missedContext?.initiator?.username
            || ''
        };
        io.to(ROOMS.call(callId)).emit(CALL_EVENTS.MISSED, missedEvent);

        // P3 — post the "Appel … manqué" system message into the conversation.
        await this.postCallSummary(callId);

        // Push notification for offline callees. The whole pipeline
        // (createMissedCallNotifications) was already wired but never
        // called from this path before audit 2026-05-11.
        /* istanbul ignore next -- handleMissedCall has its own internal catch and never rejects */
        await this.handleMissedCall(callId).catch((err: any) => {
          logger.error('handleMissedCall failed for ringing timeout', {
            callId, err: err?.message
          });
        });

        logger.info('Ringing timeout fired — call marked as missed', {
          callId,
        });
      } catch (err) {
        logger.error('Ringing timeout handler error', err);
      }
    };
  }

  private graceKey(callId: string, userId: string): string {
    return `${callId}:${userId}`;
  }

  /**
   * CALL-RESILIENCE — cancel a pending disconnect grace timer because the
   * participant re-joined. The call must not be ended by a stale timer armed
   * when their socket dropped.
   */
  private cancelDisconnectGrace(callId: string, userId: string): void {
    const key = this.graceKey(callId, userId);
    const timer = this.disconnectGraceTimers.get(key);
    if (!timer) return;
    clearTimeout(timer);
    this.disconnectGraceTimers.delete(key);
    logger.info('📞 Reconnect within grace window — active call preserved', { callId, userId });
  }

  /**
   * CALL-RESILIENCE — arm the reconnect grace window for an answered call whose
   * signaling socket just dropped involuntarily. The P2P media survives; the
   * participant gets DISCONNECT_GRACE_MS to re-join before the call is ended.
   */
  private armDisconnectGrace(opts: {
    io: SocketIOServer;
    getUserId: (socketId: string) => string | undefined;
    participation: DisconnectParticipation;
    userId: string;
  }, graceMs: number = CallEventsHandler.DISCONNECT_GRACE_MS): void {
    const { participation, userId } = opts;
    const callId = participation.callSessionId;
    const key = this.graceKey(callId, userId);
    const existing = this.disconnectGraceTimers.get(key);
    if (existing) clearTimeout(existing);
    logger.info('📞 Call socket dropped — arming reconnect grace window', {
      callId, userId, graceMs, status: participation.callSession.status
    });
    const timer = setTimeout(() => {
      this.disconnectGraceTimers.delete(key);
      void this.onDisconnectGraceExpired(opts);
    }, graceMs);
    timer.unref?.();
    this.disconnectGraceTimers.set(key, timer);
  }

  /**
   * CALL-RESILIENCE — grace window elapsed. End the call ONLY if the participant
   * truly did not come back: re-check the DB (still an active participant, call
   * not ended via another path) and confirm the user has no live socket back in
   * the call room. Otherwise the call rides on untouched.
   */
  private async onDisconnectGraceExpired(opts: {
    io: SocketIOServer;
    getUserId: (socketId: string) => string | undefined;
    participation: DisconnectParticipation;
    userId: string;
    extensionCount?: number;
  }): Promise<void> {
    const { io, getUserId, participation, userId } = opts;
    const callId = participation.callSessionId;
    if (this.isShuttingDown) return;
    try {
      const fresh = await this.prisma.callParticipant.findUnique({
        where: { id: participation.id },
        include: { callSession: { select: { status: true } } }
      });
      if (!fresh || fresh.leftAt) return;
      // ANY terminal status — not just 'ended'. A call resolved `missed` by
      // the ringing timeout during the grace window must not be re-ended:
      // leaveCall would rewrite the terminal row ended/completed and post a
      // second summary (probe prod 2026-07-02 22:41Z).
      const freshStatus = fresh.callSession?.status;
      if (freshStatus && (CALL_TERMINAL_STATUSES as readonly string[]).includes(freshStatus)) return;

      const socketsInRoom = await io.in(ROOMS.call(callId)).fetchSockets();
      const userBack = socketsInRoom.some(
        (s: { id: string }) => getUserId(s.id) === userId
      );
      if (userBack) {
        logger.info('📞 Grace expired but participant reconnected to room — call preserved', {
          callId, userId
        });
        return;
      }

      // Not in the call room yet — but if the user still has a live socket
      // anywhere (user room, joined at auth), the client is up and its
      // didReconnect re-join is on its way. Extend rather than end healthy
      // P2P media; a re-join cancels the extension via the same grace key.
      const extensions = opts.extensionCount ?? 0;
      if (extensions < CallEventsHandler.MAX_GRACE_EXTENSIONS) {
        const userSockets = await io.in(ROOMS.user(userId)).fetchSockets();
        if (userSockets.length > 0) {
          logger.info('📞 Grace expired but user still has a live socket — extending grace', {
            callId, userId, extension: extensions + 1,
            maxExtensions: CallEventsHandler.MAX_GRACE_EXTENSIONS
          });
          const key = this.graceKey(callId, userId);
          const timer = setTimeout(() => {
            this.disconnectGraceTimers.delete(key);
            void this.onDisconnectGraceExpired({ ...opts, extensionCount: extensions + 1 });
          }, CallEventsHandler.GRACE_EXTENSION_MS);
          timer.unref?.();
          this.disconnectGraceTimers.set(key, timer);
          return;
        }
      }

      logger.info('📞 Reconnect grace expired without re-join — ending call', { callId, userId });
      await this.leaveParticipationAndBroadcast({ io, participation, userId });
    } catch (error) {
      logger.error('📞 Error handling disconnect grace expiry', { callId, error });
    }
  }

  /**
   * CALL-RESILIENCE — the terminal leave+broadcast path shared by an immediate
   * (pre-answer) disconnect and an expired reconnect grace window. Extracted
   * verbatim from the disconnect handler's per-participation loop so both callers
   * behave identically: normal leaveCall + participant-left/ended broadcast +
   * call summary, with a force-cleanup fallback if leaveCall throws.
   */
  private async leaveParticipationAndBroadcast(opts: {
    io: SocketIOServer;
    participation: DisconnectParticipation;
    userId: string;
  }): Promise<void> {
    const { io, participation, userId } = opts;
    try {
      const leftSession = await this.callService.leaveCall({
        callId: participation.callSessionId,
        userId,
        participantId: participation.participantId
      });

      io.to(ROOMS.call(participation.callSessionId)).emit(
        CALL_EVENTS.PARTICIPANT_LEFT,
        {
          callId: participation.callSessionId,
          participantId: participation.id,
          mode: participation.callSession.mode
        } as CallParticipantLeftEvent
      );

      const dcStatus = leftSession.status as string;
      if (dcStatus === 'ended' || dcStatus === 'missed') {
        const dcEndedEvent: CallEndedEvent = {
          callId: leftSession.id,
          duration: leftSession.duration || 0,
          endedBy: userId,
          reason: (leftSession.endReason || 'completed') as CallEndReason
        };
        // CALL-RESILIENCE — use the shared fanout (call + conversation + every
        // active member's user room), not a narrow two-room emit: a still-ringing
        // callee has joined neither room yet and would otherwise keep ringing
        // until its own client-side timeout (see resolveCallEndedRooms).
        await this.broadcastCallEnded(io, leftSession.id, leftSession.conversationId, dcEndedEvent);
        await this.postCallSummary(leftSession.id);
        if (dcStatus === 'missed') {
          /* istanbul ignore next -- handleMissedCall has its own internal catch and never rejects */
          this.handleMissedCall(leftSession.id).catch((err) => {
            logger.error('❌ handleMissedCall failed after disconnect-grace leave', {
              callId: leftSession.id,
              err
            });
          });
        }
      }

      logger.info('✅ Socket: Auto-left call on disconnect', {
        callId: participation.callSessionId,
        userId
      });
    } catch (leaveError) {
      // IMPORTANT FIX: Force cleanup even if leaveCall fails
      // This prevents zombie calls when DB errors or validation fails
      logger.error('❌ Socket: Error in leaveCall, forcing direct cleanup', {
        callId: participation.callSessionId,
        userId,
        error: leaveError
      });

      try {
        const now = new Date();

        // Audit C5 (2026-07-02) — `{leftAt: null}` alone misses Mongo docs
        // whose leftAt field was never written (pre-C5 participants).
        const remainingParticipants = await this.prisma.$transaction(async (tx) => {
          await tx.callParticipant.update({
            where: { id: participation.id },
            data: { leftAt: now }
          });
          return tx.callParticipant.count({
            where: {
              callSessionId: participation.callSessionId,
              OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
            }
          });
        });

        io.to(ROOMS.call(participation.callSessionId)).emit(
          CALL_EVENTS.PARTICIPANT_LEFT,
          {
            callId: participation.callSessionId,
            participantId: participation.id,
            mode: participation.callSession.mode
          } as CallParticipantLeftEvent
        );

        if (remainingParticipants === 0) {
          // Terminal write protocol (see CallCleanupService.forceEndCall):
          // status-guarded + version-bumped, so this can never silently
          // clobber — or be clobbered by — a concurrent version-guarded
          // writer. Previously this did a raw, unguarded `callSession.update`
          // with no version bump and no endReason, which could stomp a call
          // another path had already resolved to missed/rejected/failed.
          const forceEnded = await this.callService.forceEndOrphanedCallSession(
            participation.callSessionId,
            CallEndReason.connectionLost
          );

          if (forceEnded) {
            logger.info('✅ Socket: Force-ended call after disconnect error', {
              callId: participation.callSessionId,
              duration: forceEnded.duration
            });

            const dcForceEndedEvent: CallEndedEvent = {
              callId: participation.callSessionId,
              duration: forceEnded.duration,
              endedBy: userId,
              reason: CallEndReason.connectionLost
            };
            await this.broadcastCallEnded(
              io,
              participation.callSessionId,
              participation.callSession.conversationId,
              dcForceEndedEvent
            );
            await this.postCallSummary(participation.callSessionId);
          }
        }

        logger.info('✅ Socket: Force cleanup successful on disconnect', {
          callId: participation.callSessionId,
          userId
        });
      } catch (forceError) {
        logger.error('❌ Socket: Force cleanup also failed', {
          callId: participation.callSessionId,
          userId,
          error: forceError
        });
      }
    }
  }

  /** §4.6 — store the latest offer for a call, sweeping expired entries. */
  private bufferOffer(callId: string, signal: CallSignalEvent): void {
    const now = Date.now();
    for (const [key, entry] of this.bufferedOffers) {
      if (now - entry.bufferedAt > CallEventsHandler.OFFER_BUFFER_TTL_MS) {
        this.bufferedOffers.delete(key);
      }
    }
    this.bufferedOffers.set(callId, { signal, bufferedAt: now });
  }

  /** §4.6 — drop a call's buffered offer (negotiation complete or terminated). */
  private clearBufferedOffer(callId: string): void {
    this.bufferedOffers.delete(callId);
  }

  /**
   * Drop every `qualityDegradedStreaks` entry for a terminated call. Entries
   * are keyed `${callId}:${participantId}`, so unlike `clearBufferedOffer`/
   * `clearRingingTimeout` (one entry per call) this sweeps all matching keys.
   * Without this, a call that ends while a participant's last report was
   * degraded leaks its entry forever — only the size-capped sweep in
   * call:quality-report ever reclaims it, and a moderate-traffic gateway can
   * run long enough to never hit that cap.
   *
   * Public: `CallCleanupService.forceEndCall` (GC tier — stale ringing/
   * connecting/active/heartbeat-timeout calls) is a 4th terminal path with no
   * reference to this handler's private map, wired in via
   * `CallCleanupService.setQualityStreakCleanupCallback` (mirrors
   * `setPostSummaryCallback`'s existing bridge for the same reason). GC-ended
   * calls are actually the MOST likely to leak here — an abandoned call
   * nobody explicitly hung up is exactly the "last report was degraded, call
   * then ends" scenario this cleanup targets.
   */
  clearQualityDegradedStreaks(callId: string): void {
    const prefix = `${callId}:`;
    for (const key of this.qualityDegradedStreaks.keys()) {
      if (key.startsWith(prefix)) {
        this.qualityDegradedStreaks.delete(key);
      }
    }
  }

  /**
   * §4.6 — returns the buffered offer for a call IF it is destined for the
   * (re)joining participant and not expired; otherwise null. Does NOT consume
   * the entry — a participant that churns again must be able to recover, and
   * re-delivery is epoch-safe.
   */
  private bufferedOfferFor(callId: string, joiningUserId: string, joiningParticipantId: string | null): CallSignalEvent | null {
    const entry = this.bufferedOffers.get(callId);
    if (!entry) return null;
    if (Date.now() - entry.bufferedAt > CallEventsHandler.OFFER_BUFFER_TTL_MS) {
      this.bufferedOffers.delete(callId);
      return null;
    }
    const to = entry.signal.signal.to;
    if (to === joiningUserId || (joiningParticipantId !== null && to === joiningParticipantId)) {
      return entry.signal;
    }
    return null;
  }

  /**
   * call:end's fast-path broadcast tells the room the call ended before the
   * authoritative endCall() write runs (see the comment at that call site).
   * If that write never completes — the ender doesn't resolve to a
   * participant, or endCall() itself throws — the CallSession would
   * otherwise be left ACTIVE, blocking every future call:initiate in the
   * conversation until CallCleanupService's GC tier reaps it (~120s).
   * Best-effort: a failure here is logged, not thrown — this handler's
   * listener isn't awaited by Socket.IO's emit() (see the gateway's
   * async-EventEmitter hazard note), so letting this reject would surface as
   * an unhandled rejection instead of the clean error response already sent.
   */
  private async forceEndOrphanedCallAfterOptimisticBroadcast(callId: string, reason?: string): Promise<void> {
    try {
      await this.callService.forceEndOrphanedCallSession(callId, (reason || 'completed') as CallEndReason);
    } catch (err) {
      logger.error('❌ Failed to force-end orphaned call after call:end failure', { callId, error: err });
    }
  }

  private async resolveParticipantId(userId: string, conversationId: string): Promise<string | null> {
    const participant = await this.prisma.participant.findFirst({
      where: { userId, conversationId, isActive: true },
      select: { id: true }
    });
    return participant?.id ?? null;
  }

  private async resolveParticipantIdFromCall(userId: string, callId: string): Promise<string | null> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      select: { conversationId: true }
    });
    if (!call) return null;
    return this.resolveParticipantId(userId, call.conversationId);
  }

  /**
   * Resolve the caller's own CallParticipant.participantId, verifying they
   * are an ACTIVE participant of THIS specific call — unlike
   * `resolveParticipantIdFromCall`, which only checks conversation
   * membership. Calls are capped at 2 participants (`CallService.joinCall`)
   * even inside group conversations, so a conversation member who never
   * joined (or already left) this call must not pass authorization checks
   * gating writes against call state/stats (quality reports, media toggles,
   * background/foreground, reconnect status).
   */
  private async resolveActiveCallParticipantId(userId: string, callId: string): Promise<string | null> {
    try {
      const callSession = await this.callService.getCallSession(callId);
      const activeParticipant = callSession.participants.find(
        (p) => ((p.participant?.userId ?? p.participantId) === userId) && !p.leftAt
      );
      return activeParticipant?.participantId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * CallService throws plain `Error`s formatted as `"<CODE>: <description>"`
   * (e.g. getCallSession's `CALL_NOT_FOUND: Call session not found`, thrown
   * when the peer ends the call in the same instant a toggle is in flight).
   * Relay the real code/message when it matches a known CALL_ERROR_CODES
   * value so the client can react appropriately (e.g. silently clean up on
   * CALL_NOT_FOUND instead of surfacing a generic toggle-failed toast);
   * fall back to the generic code for anything unrecognized (DB errors,
   * etc.) so raw internals are never leaked to the client.
   */
  private mapMediaToggleError(error: unknown, fallbackMessage: string): CallError {
    const message = error instanceof Error ? error.message : undefined;
    if (!message) {
      return { code: 'MEDIA_TOGGLE_FAILED', message: fallbackMessage } as CallError;
    }
    const match = message.match(/^([A-Z_]+):\s*(.+)$/);
    const knownCodes = new Set<string>(Object.values(CALL_ERROR_CODES));
    if (match && knownCodes.has(match[1])) {
      return { code: match[1], message: match[2] } as CallError;
    }
    return { code: message, message } as CallError;
  }

  /**
   * Resolve target userId to their socket IDs within a call room
   */
  private async resolveTargetSockets(
    io: SocketIOServer,
    callId: string,
    targetUserId: string,
    getUserId: (socketId: string) => string | undefined
  ): Promise<string[]> {
    const socketsInRoom = await io.in(ROOMS.call(callId)).fetchSockets();
    const targetSocketIds: string[] = [];
    for (const s of socketsInRoom) {
      const socketUserId = getUserId(s.id);
      if (socketUserId === targetUserId) {
        targetSocketIds.push(s.id);
      }
    }
    return targetSocketIds;
  }

  /**
   * Initialiser le service de notifications
   */
  setNotificationService(notificationService: NotificationService): void {
    this.notificationService = notificationService;
    logger.info('📢 CallEventsHandler: NotificationService initialized');
  }

  setPushNotificationService(pushService: PushNotificationService): void {
    this.pushService = pushService;
    logger.info('📢 CallEventsHandler: PushNotificationService initialized');
  }

  setZmqClient(zmqClient: ZmqTranslationClient): void {
    this.zmqClient = zmqClient;
    logger.info('📢 CallEventsHandler: ZmqTranslationClient initialized');
  }

  /**
   * P3 — inject the conversation message broadcaster (the manager's
   * `broadcastMessage`). Enables posting the call-summary system message.
   */
  setMessageBroadcaster(broadcaster: (message: unknown, conversationId: string) => Promise<void>): void {
    this.messageBroadcaster = broadcaster;
  }

  /**
   * Public entry point for external terminal paths (currently
   * `CallCleanupService`'s GC tiers) that end a call without going through
   * this handler's own socket events, but still need the "Appel … · MM:SS" /
   * "manqué" system message posted. Thin wrapper around the private
   * `postCallSummary` so callers outside this class don't need to know about
   * its retry bookkeeping.
   */
  async postCallSummaryForTerminatedCall(callId: string): Promise<void> {
    return this.postCallSummary(callId);
  }

  /**
   * Public entry point for `CallCleanupService`'s GC tier 1 (initiated/
   * ringing > 120s → missed) — the safety net that fires when the
   * in-process ringing timer (`buildRingingTimeoutHandler`) never runs, e.g.
   * a crash before `rehydrateActiveCalls` re-armed it, or the timer callback
   * itself threw. That normal path already reaches `sendCallCancellationPushes`
   * via `broadcastCallEnded`, sending the silent `call_cancel` APNs push that
   * stops CallKit ringing for a phantom-ringing callee — one whose VoIP push
   * was delivered but whose socket never joined the call room, so the
   * socket-fanout `call:ended` in `resolveCallEndedRooms` never reaches them.
   * Without this wrapper, the GC-tier fallback silently skipped that push and
   * such a callee's CallKit screen would ring until its own client-side
   * timeout.
   */
  async sendMissedCallCancellationPushForTerminatedCall(
    callId: string,
    conversationId: string | undefined,
    duration: number
  ): Promise<void> {
    return this.sendCallCancellationPushes(callId, conversationId, {
      callId,
      duration,
      reason: CallEndReason.missed
    });
  }

  /**
   * Translates a final transcription segment to each active participant's
   * preferred language and emits a `TRANSLATED_SEGMENT` event per language.
   * Only fires for final segments (isFinal=true) to avoid flooding ZMQ.
   * Falls back to emitting the original text if translation fails.
   */
  private async translateAndEmitSegment(
    socket: Socket,
    data: CallTranscriptionSegmentEvent,
    speakerUserId: string
  ): Promise<void> {
    const activeParticipants = await this.prisma.callParticipant.findMany({
      where: { callSessionId: data.callId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
      select: {
        participant: {
          select: {
            userId: true,
            user: { select: { systemLanguage: true } }
          }
        }
      }
    });

    const targetLanguages: string[] = [
      ...new Set<string>(
        activeParticipants
          .filter(p => p.participant.userId !== speakerUserId)
          .map(p => (p.participant.user?.systemLanguage as string | undefined) ?? 'fr')
          .filter((lang): lang is string => typeof lang === 'string' && lang !== data.segment.language)
      )
    ];

    if (targetLanguages.length === 0) {
      socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.TRANSLATED_SEGMENT, {
        callId: data.callId,
        segment: {
          text: data.segment.text,
          speakerId: data.segment.speakerId,
          startMs: data.segment.startMs,
          endMs: data.segment.endMs,
          isFinal: data.segment.isFinal,
          sourceLanguage: data.segment.language,
          targetLanguage: data.segment.language,
          confidence: data.segment.confidence
        }
      });
      return;
    }

    // Capture zmqClient once so TypeScript can narrow the type and inner
    // lambdas don't need force-unwrap (zmqClient could theoretically be
    // cleared between the outer check in handleTranscriptionSegment and the
    // async Promise execution inside Promise.allSettled).
    const zmqClient = this.zmqClient;
    if (!zmqClient) {
      logger.warn('[CallEventsHandler] translateAndEmitSegment called without zmqClient — relaying original', { callId: data.callId });
      socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.TRANSLATED_SEGMENT, {
        callId: data.callId,
        segment: {
          text: data.segment.text,
          speakerId: data.segment.speakerId,
          startMs: data.segment.startMs,
          endMs: data.segment.endMs,
          isFinal: data.segment.isFinal,
          sourceLanguage: data.segment.language,
          targetLanguage: data.segment.language,
          confidence: data.segment.confidence
        }
      });
      return;
    }

    await Promise.allSettled(
      targetLanguages.map(async (targetLanguage) => {
        try {
          const taskId = await zmqClient.translateText(
            data.segment.text,
            data.segment.language,
            targetLanguage,
            `call-${data.callId}-${data.segment.startMs}`,
            data.callId
          );

          logger.debug('Call transcription segment translation requested', { callId: data.callId, taskId, targetLanguage });

          return new Promise<void>((resolve) => {
            const TIMEOUT_MS = 10_000;
            const timer = setTimeout(() => {
              zmqClient.off('translationCompleted', onResult);
              socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.TRANSLATED_SEGMENT, {
                callId: data.callId,
                segment: {
                  text: data.segment.text,
                  speakerId: data.segment.speakerId,
                  startMs: data.segment.startMs,
                  endMs: data.segment.endMs,
                  isFinal: data.segment.isFinal,
                  sourceLanguage: data.segment.language,
                  targetLanguage,
                  confidence: data.segment.confidence
                }
              });
              resolve();
            }, TIMEOUT_MS);

            const onResult = (event: { taskId: string; result: { translatedText: string; targetLanguage: string } }) => {
              if (event.taskId !== taskId) return;
              clearTimeout(timer);
              zmqClient.off('translationCompleted', onResult);
              socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.TRANSLATED_SEGMENT, {
                callId: data.callId,
                segment: {
                  text: data.segment.text,
                  translatedText: event.result.translatedText,
                  speakerId: data.segment.speakerId,
                  startMs: data.segment.startMs,
                  endMs: data.segment.endMs,
                  isFinal: data.segment.isFinal,
                  sourceLanguage: data.segment.language,
                  targetLanguage,
                  confidence: data.segment.confidence
                }
              });
              resolve();
            };
            zmqClient.on('translationCompleted', onResult);
          });
        } catch (err) {
          logger.warn('Call transcription translation failed, relaying original', { callId: data.callId, targetLanguage, err });
          socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.TRANSLATED_SEGMENT, {
            callId: data.callId,
            segment: {
              text: data.segment.text,
              speakerId: data.segment.speakerId,
              startMs: data.segment.startMs,
              endMs: data.segment.endMs,
              isFinal: data.segment.isFinal,
              sourceLanguage: data.segment.language,
              targetLanguage,
              confidence: data.segment.confidence
            }
          });
        }
      })
    );
  }

  /**
   * P3 — create and broadcast the call-summary system message for a terminated
   * call. Safe to call from every terminal path: `createCallSummaryMessage`
   * is idempotent (deterministic clientMessageId + unique index), so only the
   * first call per `callId` posts a message. Failures are logged, never thrown,
   * so summary posting can never break call teardown.
   */
  private async postCallSummary(callId: string, attempt = 1): Promise<void> {
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 1000;
    try {
      const message = await this.callService.createCallSummaryMessage(callId);
      if (!message || !this.messageBroadcaster) {
        return;
      }
      await this.messageBroadcaster(message, message.conversationId);
    } catch (error) {
      logger.error('[CallEventsHandler] Failed to post call summary message', {
        callId,
        attempt,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt < MAX_ATTEMPTS) {
        await new Promise<void>(resolve => setTimeout(resolve, BASE_DELAY_MS * attempt));
        return this.postCallSummary(callId, attempt + 1);
      }
      logger.error('[CallEventsHandler] Giving up on call summary after max attempts', {
        callId,
        maxAttempts: MAX_ATTEMPTS
      });
    }
  }

  /**
   * Setup call-related event listeners on socket
   * CVE-004: Added getUserInfo callback to check if user is anonymous
   */
  setupCallEvents(
    socket: Socket,
    io: SocketIOServer,
    getUserId: (socketId: string) => string | undefined,
    getUserInfo?: (socketId: string) => { id: string; isAnonymous: boolean } | undefined
  ): void {
    // Audit P1-28 — Cache the userId at the moment we observe an authenticated
    // call event so the disconnect handler can still recover it even if the
    // upstream MeeshySocketIOManager has already deleted its socketToUser
    // entry by the time our async cleanup runs.
    let cachedUserId: string | undefined;
    const rememberAuth = (uid: string) => { cachedUserId = uid; };
    const recoverUserId = (): string | undefined => getUserId(socket.id) ?? cachedUserId;

    // Audit P1-20 — Anonymous (X-Session-Token) users must NOT be able to
    // initiate or join calls. The REST routes already enforce this with
    // `allowAnonymous: false`; this socket gate aligns the WS surface.
    const denyAnonymous = (): boolean => {
      const info = getUserInfo?.(socket.id);
      if (info?.isAnonymous) {
        socket.emit(CALL_EVENTS.ERROR, {
          code: CALL_ERROR_CODES.PERMISSION_DENIED,
          message: 'Anonymous users cannot initiate or join calls'
        } as CallError);
        return true;
      }
      return false;
    };

    // CALL-FIX 2026-06-06 — track app foreground/background so call:initiate can
    // choose socket delivery (in-app UI) vs VoIP push (CallKit) per callee. A
    // backgrounded iOS app keeps a live socket for ~45s (until ping timeout) but
    // CANNOT process socket events — without this signal the gateway treated it as
    // reachable and never sent the VoIP push, so incoming calls never rang unless
    // the app was foreground. iOS emits this on scenePhase transitions while the
    // socket is still alive (`.inactive` fires before suspension). Stored on the
    // socket so the per-user fanout (which uses fetchSockets) can read it.
    socket.on('presence:app-state', (data: { foreground?: boolean }) => {
      socket.data.appForeground = data?.foreground === true;
    });

    // CALL-FIX 2026-06-06 — replay any IN-PROGRESS (ringing) call to a socket that
    // just (re)connected. A user who was offline/backgrounded/app-closed when the
    // call started missed the original call:initiated; on reconnect the client emits
    // `call:check-active` and we re-send call:initiated so the incoming banner /
    // CallKit appears immediately ("I come online and a call started 20s ago → I see
    // it"; "I open the Mac app → the banner shows"). Scoped to the user's
    // conversations, the ringing window (<60s), calls they did NOT initiate, and only
    // if they haven't already left. The client dedups by callId.
    socket.on('call:check-active', async () => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        // Calling-stack audit 2026-07-05 (2) — this was the last call:*
        // handler with no rate limit at all; it fans out into 2-4 Prisma
        // queries plus a TURN-secret HMAC mint per matching call, with no
        // client payload required to trigger it (see SOCKET_RATE_LIMITS.CALL_CHECK_ACTIVE).
        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_CHECK_ACTIVE, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const myConvs = await this.prisma.participant.findMany({
          where: { userId, isActive: true },
          select: { conversationId: true }
        });
        const convIds = myConvs.map(p => p.conversationId);
        if (convIds.length === 0) return;
        const ringingWindowStart = new Date(Date.now() - 60_000);
        const activeCalls = await this.prisma.callSession.findMany({
          where: {
            conversationId: { in: convIds },
            endedAt: null,
            initiatorId: { not: userId },
            status: { in: [CallStatus.initiated, CallStatus.ringing, CallStatus.connecting] },
            startedAt: { gte: ringingWindowStart }
          },
          select: { id: true }
        });
        const callIds = activeCalls.map(c => c.id);
        const myParticipants = callIds.length > 0
          ? await this.prisma.callParticipant.findMany({
              where: { callSessionId: { in: callIds }, participant: { userId } }
            })
          : [];
        const myParticipantMap = new Map<string, { leftAt: Date | null }>(
          myParticipants.map(p => [p.callSessionId as string, p as { leftAt: Date | null }])
        );
        for (const c of activeCalls) {
          const myPart = myParticipantMap.get(c.id);
          if (myPart?.leftAt) continue;

          const full = await this.callService.getCallSession(c.id);
          const callType: 'audio' | 'video' = (full.metadata as { type?: string } | null)?.type === 'video' ? 'video' : 'audio';
          const event: CallInitiatedEvent = {
            callId: full.id,
            conversationId: full.conversationId,
            mode: full.mode,
            type: callType,
            initiator: {
              userId: full.initiator.id,
              username: full.initiator.username,
              displayName: full.initiator.displayName || undefined,
              avatar: full.initiator.avatar
            },
            participants: full.participants.map(p => ({
              id: p.id,
              callSessionId: p.callSessionId,
              userId: p.participant?.userId || p.participantId,
              role: p.role,
              joinedAt: p.joinedAt,
              leftAt: p.leftAt,
              isAudioEnabled: p.isAudioEnabled,
              isVideoEnabled: p.isVideoEnabled,
              connectionQuality: (p.connectionQuality as unknown as ConnectionQuality | null),
              username: p.participant?.user?.username || p.participant?.displayName,
              displayName: p.participant?.displayName || p.participant?.user?.displayName,
              avatar: p.participant?.user?.avatar || p.participant?.avatar
            }))
          };
          const iceServers = this.callService.generateIceServers(userId);
          socket.emit(CALL_EVENTS.INITIATED, { ...event, iceServers });
          logger.info('📲 Replayed in-progress call:initiated on (re)connect', { callId: c.id, userId });
        }
      } catch (err: any) {
        logger.error('call:check-active failed', { error: err?.message });
      }
    });

    /**
     * call:initiate - Client initiates a new call
     * CVE-002: Added rate limiting (5 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.INITIATE, async (data: CallInitiateEvent, ack?: (response: CallInitiateAck) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          ack?.({ success: false, error: 'User not authenticated' } as unknown as CallInitiateAck);
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }
        if (denyAnonymous()) {
          ack?.({ success: false, error: 'Anonymous users cannot initiate calls' } as unknown as CallInitiateAck);
          return;
        }
        rememberAuth(userId);

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_INITIATE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) {
          ack?.({ success: false, error: 'Rate limit exceeded' } as unknown as CallInitiateAck);
          return;
        }

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketInitiateCallSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          ack?.({ success: false, error: validationError } as unknown as CallInitiateAck);
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:initiate', {
          socketId: socket.id,
          userId,
          conversationId: data.conversationId,
          type: data.type
        });

        // Resolve participantId from userId + conversationId
        const participantId = await this.resolveParticipantId(userId, data.conversationId);
        if (!participantId) {
          ack?.({ success: false, error: 'You are not a participant in this conversation' } as unknown as CallInitiateAck);
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation'
          } as CallError);
          return;
        }

        // Initiate call via service
        const callSession = await this.callService.initiateCall({
          conversationId: data.conversationId,
          initiatorId: userId,
          participantId,
          type: data.type,
          settings: data.settings ? { screenShareEnabled: data.settings.screenShareEnabled } : undefined
        });

        // CRITICAL: Initiator must join the call room to receive participant-joined events
        await socket.join(ROOMS.call(callSession.id));

        logger.info('✅ Socket: Initiator joined call room', {
          callId: callSession.id,
          userId,
          room: ROOMS.call(callSession.id)
        });

        // Prepare event data
        // CRITIQUE — `mode` est l'architecture WebRTC (`'p2p' | 'sfu'`), PAS
        // le type média. Le type média (`'audio' | 'video'`) est stocké dans
        // `callSession.metadata.type` (cf. CallService.initiateCall:339). Sans
        // ce champ explicite, l'iOS recevait `mode: 'p2p'` et décidait
        // toujours `isVideo = false` → CallKit affichait l'incoming call en
        // audio même quand l'appelant voulait un appel vidéo.
        const callType: 'audio' | 'video' = (callSession.metadata as { type?: string } | null)?.type === 'video' ? 'video' : 'audio';
        const initiatedEvent: CallInitiatedEvent = {
          callId: callSession.id,
          conversationId: data.conversationId,
          mode: callSession.mode,
          type: callType,
          initiator: {
            userId: callSession.initiator.id,
            username: callSession.initiator.username,
            displayName: callSession.initiator.displayName || undefined,
            avatar: callSession.initiator.avatar
          },
          participants: callSession.participants.map(p => ({
            id: p.id,
            callSessionId: p.callSessionId,
            userId: p.participant?.userId || p.participantId,
            role: p.role,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            isAudioEnabled: p.isAudioEnabled,
            isVideoEnabled: p.isVideoEnabled,
            connectionQuality: (p.connectionQuality as unknown as ConnectionQuality | null),
            username: p.participant?.user?.username || p.participant?.displayName,
            displayName: p.participant?.displayName || p.participant?.user?.displayName,
            avatar: p.participant?.user?.avatar || p.participant?.avatar
          }))
        };

        // ACK to initiator with callId, mode AND iceServers — the iceServers
        // MUST be returned synchronously so the initiator's RTCPeerConnection
        // is built with TURN credentials BEFORE the SDP offer is created.
        // Without this, the offer carries STUN-only candidates and NAT-symmetric
        // peers can never connect.
        const initiatorIceServers = this.callService.generateIceServers(userId);
        ack?.({
          success: true,
          data: {
            callId: callSession.id,
            mode: callSession.mode,
            iceServers: initiatorIceServers,
            ttl: this.callService.getIceServerTtl(),
          }
        });

        // Get all conversation participants to notify (excluding initiator)
        const conversationParticipants = await this.prisma.participant.findMany({
          where: {
            conversationId: data.conversationId,
            isActive: true,
            userId: { not: null }
          },
          select: {
            userId: true
          }
        });

        const memberUserIds = conversationParticipants.map(p => p.userId!).filter(Boolean);
        logger.info('📋 Conversation members to notify', {
          conversationId: data.conversationId,
          memberUserIds
        });

        // Audit P2-GW-1 — was `io.fetchSockets()` which scans EVERY connected
        // socket on the server (O(N), prohibitive at 10k+ connections). Each
        // callee user auto-joins `ROOMS.user(userId)` at auth (AuthHandler
        // L121/L181), so a per-user `io.in(ROOMS.user(memberId)).fetchSockets()`
        // is O(M) where M = the callee's online device count (typically 1–3).
        let notifiedSocketsCount = 0;
        const notifiedUserIds = new Set<string>();
        const foregroundUserIds = new Set<string>();
        for (const memberId of memberUserIds) {
          if (memberId === userId) continue; // skip initiator
          const memberSockets = await io.in(ROOMS.user(memberId)).fetchSockets();
          if (memberSockets.length === 0) continue;
          notifiedUserIds.add(memberId);
          // CALL-FIX 2026-06-06 — a member is reachable via the in-app socket UI
          // ONLY if at least one of its sockets is FOREGROUND. A backgrounded
          // socket still receives this emit but iOS has suspended the app so it
          // can't act on it → that member also needs a VoIP push (below).
          if (memberSockets.some((s: any) => s.data?.appForeground === true)) {
            foregroundUserIds.add(memberId);
          }
          const memberIceServers = this.callService.generateIceServers(memberId);
          for (const memberSocket of memberSockets) {
            memberSocket.emit(CALL_EVENTS.INITIATED, { ...initiatedEvent, iceServers: memberIceServers });
            notifiedSocketsCount++;
            logger.debug('📤 Sent call:initiated to member socket', {
              socketId: memberSocket.id,
              userId: memberId,
              callId: callSession.id
            });
          }
        }

        logger.info('✅ Socket: Call initiated and sent to members', {
          callId: callSession.id,
          conversationId: data.conversationId,
          totalMembers: memberUserIds.length,
          notifiedSockets: notifiedSocketsCount
        });

        // Phase 1 fix P2 — schedule 60s ringing timeout. If no answer arrives,
        // force transition to 'missed' and broadcast call:ended + call:missed.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.5
        // Audit 2026-05-11 — multiple fixes applied:
        //   - Use real CallStatus / CallEndReason enums (was 'no_answer' as
        //     any which Prisma rejected at runtime, swallowed by .catch,
        //     leaving the call in 'ringing' forever in the DB).
        //   - Replace findUnique + updateCallStatus with atomic updateMany
        //     scoped to the eligible source statuses, eliminating a TOCTOU
        //     race where a concurrent call:join could promote the call to
        //     'connecting' between read and write.
        //   - Trigger handleMissedCall so offline callees actually receive
        //     a missed-call push notification (the entire infrastructure
        //     was already wired but never invoked from this path).
        //   - Emit CALL_EVENTS.MISSED in addition to CALL_EVENTS.ENDED so
        //     online clients can render an in-app missed-call banner
        //     without round-tripping through push.
        this.callService.scheduleRingingTimeout(
          callSession.id,
          this.buildRingingTimeoutHandler(io, callSession.id)
        );

        // Send VoIP push to offline members for incoming call wake-up
        if (this.pushService) {
          const callerName = callSession.initiator.displayName || callSession.initiator.username || 'Unknown';
          const callerAvatar = callSession.initiator.avatar || undefined;

          // CALL-FIX 2026-06-06 — VoIP-push every callee that is NOT confirmed
          // FOREGROUND (the `foregroundUserIds` set built during the fanout). That
          // covers BOTH truly offline members (no socket) AND backgrounded members
          // (socket still TCP-connected for ~45s but the app is suspended and can't
          // ring from the socket event). Only a foreground member relies on the
          // in-app socket UI and must NOT get a VoIP push (which would force a
          // CallKit banner over the in-app UI). Previously this used
          // `!notifiedUserIds` (socket-less only), so a backgrounded iPhone never
          // rang — the core "I don't receive calls when the app is closed" bug.
          const offlineUserIds = memberUserIds.filter(
            uid => uid !== userId && !foregroundUserIds.has(uid)
          );

          for (const offlineUserId of offlineUserIds) {
            // Per-user TURN credentials so the answerer's RTCPeerConnection has
            // TURN at construction time (VoIPPushManager.didReceiveIncomingPush
            // configures WebRTC immediately, before any socket reconnect).
            // Serialized as JSON string because APNs `data` is Record<string,string>.
            const memberIceServers = this.callService.generateIceServers(offlineUserId);
            this.pushService.sendToUser({
              userId: offlineUserId,
              payload: {
                title: `${callerName} vous appelle`,
                body: data.type === 'video' ? 'Appel vidéo' : 'Appel audio',
                callId: callSession.id,
                callerName,
                callerAvatar,
                data: {
                  type: 'call',
                  callId: callSession.id,
                  conversationId: data.conversationId,
                  callerName,
                  callerUserId: userId,
                  callerAvatar: callerAvatar || '',
                  // String "true"/"false" — iOS VoIPPushManager parses both bool and string forms.
                  isVideo: String(data.type === 'video'),
                  // JSON-encoded; iOS deserializes into [SocketIceServer] before
                  // calling WebRTCService.configure(iceServers:).
                  iceServers: JSON.stringify(memberIceServers),
                },
              },
              types: ['voip'],
            }).catch(err => {
              logger.error('Failed to send VoIP push', { userId: offlineUserId, error: err });
            });
          }

          if (offlineUserIds.length > 0) {
            logger.info('📲 VoIP push sent to offline members', {
              callId: callSession.id,
              offlineUserIds,
            });
          }
        }
      } catch (error: any) {
        logger.error('Error initiating call', error);

        const errorMessage = error.message || 'Failed to initiate call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;

        ack?.({ success: false, error: { code: errorCode, message } });
        socket.emit(CALL_EVENTS.ERROR, { code: errorCode, message } as CallError);
      }
    });

    /**
     * call:join - Client joins an existing call
     * CVE-002: Added rate limiting (20 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.JOIN, async (data: CallJoinEvent, ack?: (response: CallJoinAck) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          ack?.({ success: false, error: 'User not authenticated' } as unknown as CallJoinAck);
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }
        if (denyAnonymous()) {
          ack?.({ success: false, error: 'Anonymous users cannot join calls' } as unknown as CallJoinAck);
          return;
        }
        rememberAuth(userId);

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_JOIN,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) {
          ack?.({ success: false, error: 'Rate limit exceeded' } as unknown as CallJoinAck);
          return;
        }

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketJoinCallSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          ack?.({ success: false, error: validationError } as unknown as CallJoinAck);
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined
          } as CallError);
          return;
        }

        // CALL-RESILIENCE — a (re)join cancels any pending disconnect grace timer
        // for this user on this call: the participant's signaling socket is back
        // (reconnected after a network blip or a gateway restart), so the call
        // that was armed for grace-ending when their socket dropped must ride on.
        this.cancelDisconnectGrace(data.callId, userId);

        logger.info('📞 Socket: call:join', {
          socketId: socket.id,
          userId,
          callId: data.callId
        });

        // Resolve participantId from userId + callId
        const joinParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);
        if (!joinParticipantId) {
          ack?.({ success: false, error: 'You are not a participant in this conversation' } as unknown as CallJoinAck);
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation'
          } as CallError);
          return;
        }

        // CVE-005: Join call via service (returns dynamic ICE servers).
        //
        // Audit 2026-05-11 — race fix: joinCall transitions DB status to
        // 'connecting' inside its Prisma transaction, then runs auxiliary
        // work (TURN credential generation, participant enrichment) OUTSIDE
        // that transaction. If anything in the auxiliary block throws, the
        // outer catch fires and the previous explicit `clearRingingTimeout`
        // at this site is skipped — leaving the 60s timer live against a
        // call already in 'connecting'. With Phase 2's fixed timeout
        // callback (atomic updateMany scoped to ringing/initiated only)
        // the leaked timer is now harmless to the call state, but it would
        // still spuriously emit call:ended/call:missed once the timeout
        // window expires. Guarantee cleanup via try/finally below — the
        // explicit call here is redundant once the finally block runs, so
        // it's removed in favour of the single canonical cleanup site.
        const joinResult = await this.callService.joinCall({
          callId: data.callId,
          userId,
          participantId: joinParticipantId,
          settings: data.settings
        });

        const { callSession, iceServers } = joinResult;

        // Join call room
        await socket.join(ROOMS.call(data.callId));

        // C8 (prod audit, callIds 6a4607a9…/6a4607bb…) — a user re-joining
        // from a NEW socket (churn, second tab, post-restart reconnect)
        // leaves stale sockets of the SAME user in the room: every targeted
        // signal then fans out to N sockets (targetSockets:2 observed —
        // glare risk, double offer handling, double analytics). A P2P call
        // has exactly one signaling endpoint per user: last join wins, our
        // own older sockets are evicted from the room. Best-effort — an
        // eviction failure must never fail the join.
        try {
          const roomSockets = await io.in(ROOMS.call(data.callId)).fetchSockets();
          for (const s of roomSockets) {
            if (s.id !== socket.id && getUserId(s.id) === userId) {
              s.leave(ROOMS.call(data.callId));
              logger.info('📞 C8 — evicted stale same-user socket from call room', {
                callId: data.callId, userId, staleSocketId: s.id, newSocketId: socket.id
              });
            }
          }
        } catch (evictError) {
          logger.warn('📞 C8 — same-user socket eviction failed (join unaffected)', {
            callId: data.callId, evictError
          });
        }

        // Get the participant that just joined
        const participant = callSession.participants.find(
          p => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
        );

        if (!participant) {
          throw new Error('Participant not found after joining');
        }

        // Prepare event data
        const joinedEvent: CallParticipantJoinedEvent = {
          callId: callSession.id,
          participant: {
            id: participant.id,
            callSessionId: participant.callSessionId,
            userId: participant.participant?.userId || participant.participantId,
            role: participant.role,
            joinedAt: participant.joinedAt,
            leftAt: participant.leftAt,
            isAudioEnabled: participant.isAudioEnabled,
            isVideoEnabled: participant.isVideoEnabled,
            connectionQuality: (participant.connectionQuality as unknown as ConnectionQuality | null),
            username: participant.participant?.user?.username || participant.participant?.displayName,
            displayName: participant.participant?.displayName || participant.participant?.user?.displayName,
            avatar: participant.participant?.user?.avatar || participant.participant?.avatar
          },
          mode: callSession.mode
        };

        // ACK with call session and ICE servers (with time-limited TURN credentials)
        ack?.({ success: true, data: { callSession: callSession as unknown as CallJoinAck['data']['callSession'], iceServers } });

        // Broadcast to all OTHER call participants with per-user TURN credentials (§3.4)
        // The caller needs iceServers from this event to configure WebRTC before creating SDP offer
        //
        // CRITIQUE — utiliser `getUserId(socketId)` (résolution via connectionMap).
        // Socket.IO `fetchSockets()` retourne des `RemoteSocket` proxies qui
        // n'embarquent PAS les propriétés server-side custom. Sans la résolution via
        // connectionMap, `remoteUserId` serait toujours undefined, entraînant le
        // fallback STUN-only à chaque broadcast — ICE échouait sur tout call entre
        // devices derrière des NATs distincts (simulator ↔ device cellulaire, par ex.).
        const socketsInRoom = await io.in(ROOMS.call(data.callId)).fetchSockets();
        for (const remoteSocket of socketsInRoom) {
          if (remoteSocket.id === socket.id) continue;
          const remoteUserId = getUserId(remoteSocket.id);
          if (!remoteUserId) {
            // Skip: a STUN-only config can't relay behind symmetric NAT/CGNAT.
            // The socket will receive proper TURN credentials via its own
            // join/check-active path once its userId is resolvable.
            logger.warn('⚠️ Skipping participant-joined push — remote socket has no userId in connectionMap', { socketId: remoteSocket.id });
            continue;
          }
          const remoteIceServers = this.callService.generateIceServers(remoteUserId);
          remoteSocket.emit(CALL_EVENTS.PARTICIPANT_JOINED, {
            ...joinedEvent,
            iceServers: remoteIceServers
          });
        }

        // §4.6 — replay a buffered offer to the joining participant. If the
        // caller's offer arrived before this socket was in the room (PushKit
        // wake / churn), it was buffered; deliver it now so the callee can
        // answer instead of waiting forever (bug a/d). Epoch-guarded on the
        // client (stale offers dropped via negotiationId).
        // Match the same identity the relay uses to resolve `signal.to`:
        // the participant's real userId (registered) or participantId (anon).
        const joinerParticipantId = participant.participant?.userId || participant.participantId;
        const replayOffer = this.bufferedOfferFor(data.callId, userId, joinerParticipantId);
        if (replayOffer) {
          // C2 — verify the offer sender is still an active participant before
          // replaying. If the sender left between buffering and this join, the
          // offer is stale: replaying it would expose the departed sender's
          // identity to the joining participant and trigger a dead negotiation
          // (answer sent to nobody). callSession is already in scope from joinCall.
          const senderId = replayOffer.signal.from;
          const senderActive = callSession.participants.some(
            (p: any) => !p.leftAt && (
              (p.participant?.userId ?? p.participantId) === senderId ||
              p.participantId === senderId
            )
          );
          if (senderActive) {
            socket.emit(CALL_EVENTS.SIGNAL, replayOffer);
            logger.info('📦 [CALL] Replayed buffered offer on (re)join', {
              callId: data.callId,
              to: userId,
              type: replayOffer.signal.type
            });
          } else {
            this.clearBufferedOffer(data.callId);
            logger.info('📦 [CALL] Buffered offer sender no longer active — dropped', {
              callId: data.callId,
              type: replayOffer.signal.type
            });
          }
        }

        // Audit P1-27 — notify the joining user's OTHER devices that the
        // call was answered elsewhere, so they dismiss their ringing UI /
        // CallKit incoming card. `socket.to(...)` excludes the answering
        // socket automatically.
        socket.to(ROOMS.user(userId)).emit(CALL_EVENTS.ALREADY_ANSWERED, {
          callId: data.callId
        });

        // Multi-device socketless — the socket event above cannot reach a
        // secondary device woken by the VoIP push whose WebSocket never came
        // up: it would ring until its local timeout although the call was
        // answered elsewhere. Mirror of the call_cancel hardening: a silent
        // background push to the joiner's devices; the answering device (and
        // any device not ringing on this callId) drops it via the client-side
        // FSM guard. Only on a real ANSWER (callee, initiated/ringing →
        // connecting) — never for the initiator's own room join nor rejoins.
        // Best-effort: a push failure must never fail the join.
        if (this.pushService
            && userId !== callSession.initiatorId
            && (callSession.status as string) === 'connecting') {
          this.pushService.sendToUser({
            userId,
            payload: {
              title: '',
              body: '',
              silent: true,
              data: { type: 'call_answered_elsewhere', callId: data.callId }
            },
            types: ['apns'],
            platforms: ['ios']
          }).catch((error) => {
            logger.error('call_answered_elsewhere push failed (join unaffected)', {
              callId: data.callId, userId, error
            });
          });
        }

        logger.info('✅ Socket: User joined call', {
          callId: data.callId,
          userId,
          participantId: participant.id
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error joining call', error);

        const errorMessage = error.message || 'Failed to join call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;

        ack?.({ success: false, error: message } as unknown as CallJoinAck);
        socket.emit(CALL_EVENTS.ERROR, {
          code: errorCode,
          message
        } as CallError);
      }
      // Item F follow-up (chaos-2 re-test) — the join deliberately does NOT
      // clear the ringing timer anymore: the callee EARLY-joins while still
      // ringing (the offer must flow during the ring), and clearing here left
      // no server-side bound on the ring after any join — and wiped the timer
      // the boot rehydration had just re-armed after a mid-ring restart (the
      // call then decayed via the GC tier at ~150s instead of resolving
      // missed at its nominal remaining budget). The SDP answer path and the
      // terminal paths (leave/end/GC, item I) own the clear.
    });

    /**
     * call:leave - Client leaves a call
     * CVE-002: Added rate limiting (20 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.LEAVE, async (data: { callId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_LEAVE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketLeaveCallSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:leave', {
          socketId: socket.id,
          userId,
          callId: data.callId
        });

        // Find participant before leaving
        const callBefore = await this.callService.getCallSession(data.callId);
        const participant = callBefore.participants.find(
          p => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
        );

        if (!participant) {
          logger.warn('⚠️ Socket: User not in call', { userId, callId: data.callId });
          return;
        }

        // Resolve participantId from userId + callId
        const leaveParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);

        // Leave call via service
        const callSession = await this.callService.leaveCall({
          callId: data.callId,
          userId,
          participantId: leaveParticipantId || userId
        });

        // Phase 1 fix P2 — caller cancel or callee reject ends ringing
        this.callService.clearRingingTimeout(data.callId);
        // §4.6 — drop any buffered offer for this call (a participant left).
        this.clearBufferedOffer(data.callId);

        // Prepare event data BEFORE leaving room
        const leftEvent: CallParticipantLeftEvent = {
          callId: callSession.id,
          participantId: participant.id,
          userId: participant.participant?.userId || participant.participantId,
          mode: callSession.mode
        };

        // Get all sockets in the room for debugging
        const socketsInRoom = await io.in(ROOMS.call(data.callId)).fetchSockets();

        logger.info('📤 Broadcasting call:participant-left event', {
          callId: data.callId,
          participantId: participant.id,
          userId: participant.participant?.userId || participant.participantId,
          remainingParticipants: callSession.participants.filter(p => !p.leftAt).length,
          roomName: ROOMS.call(data.callId),
          socketsInRoom: socketsInRoom.length,
          socketIds: socketsInRoom.map(s => s.id),
          leavingSocketId: socket.id
        });

        // IMPORTANT: Broadcast BEFORE leaving room to ensure message delivery
        io.to(ROOMS.call(data.callId)).emit(
          CALL_EVENTS.PARTICIPANT_LEFT,
          leftEvent
        );

        // Leave call room AFTER broadcasting
        await socket.leave(ROOMS.call(data.callId));

        // Audit P1-29 — leaveCall service now maps pre-answer last-leave to
        // `missed` (with endReason=missed). Handle both terminal statuses:
        // emit `call:ended` always, plus `call:missed` + create missed-call
        // notifications when the leave actually means "the call never
        // connected".
        const finalStatus = callSession.status as string;
        if (finalStatus === 'ended' || finalStatus === 'missed') {
          const endedEvent: CallEndedEvent = {
            callId: callSession.id,
            duration: callSession.duration || 0,
            endedBy: userId,
            reason: (callSession.endReason || 'completed') as CallEndReason
          };

          await this.broadcastCallEnded(io, data.callId, callSession.conversationId, endedEvent);

          // P3 — post the call-summary system message ("Appel … · MM:SS" /
          // "… manqué" / "Appel refusé"). Idempotent across terminal paths.
          await this.postCallSummary(callSession.id);

          if (finalStatus === 'missed') {
            // Reuse the same missed-call notification path as the ringing
            // timeout so the UX is identical (push notification + in-app
            // banner) regardless of whether the call was cancelled by the
            // initiator or timed out server-side.
            /* istanbul ignore next -- handleMissedCall has its own internal catch and never rejects */
            this.handleMissedCall(callSession.id).catch((err) => {
              logger.error('❌ handleMissedCall failed after leave', { callId: data.callId, err });
            });
          }

          logger.info('Call closed - last participant left', {
            callId: data.callId,
            duration: callSession.duration,
            status: finalStatus,
            endReason: callSession.endReason
          });
        } else {
          logger.info('✅ Socket: User left call', {
            callId: data.callId,
            userId
          });
        }
      } catch (error: any) {
        logger.error('❌ Socket: Error leaving call', error);

        const errorMessage = error.message || 'Failed to leave call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;

        socket.emit(CALL_EVENTS.ERROR, {
          code: errorCode,
          message
        } as CallError);
      }
    });

    /**
     * call:force-leave - Force cleanup of any active calls in a conversation
     * This is used when "call already active" error occurs to cleanup stale calls
     */
    socket.on('call:force-leave', async (data: { conversationId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }
        rememberAuth(userId);

        // Audit P1-22 — Rate limit (reuse CALL_LEAVE budget — same intent).
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_LEAVE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // Audit P1-22 — Validate conversationId is a valid ObjectId before
        // running an unbounded `findMany` against the conversation_id index.
        const validation = validateSocketEvent(socketForceLeaveSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined
          } as CallError);
          return;
        }

        // Audit P1-22 — Membership check: a user must belong to the
        // conversation before they can list / terminate its active calls.
        // Without this gate any authenticated user could iterate over guessed
        // conversation IDs and force-end every active call on the platform.
        const membership = await this.prisma.participant.findFirst({
          where: {
            conversationId: data.conversationId,
            userId,
            isActive: true
          },
          select: { id: true }
        });
        if (!membership) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation'
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:force-leave', {
          socketId: socket.id,
          userId,
          conversationId: data.conversationId
        });

        // Find any active calls in this conversation.
        //
        // CRITICAL FIX (2026-05-12) — Audit force-leave participantId mismatch :
        // le query ne chargeait que `participants: true` (=== CallParticipant
        // sans la relation `participant`). En conséquence le find() suivant
        // comparait `p.participantId` (= Participant.id ObjectId) avec
        // `userId` (= User.id ObjectId distinct) → la comparaison était
        // TOUJOURS FALSE et le handler force-leave silently no-op-ait.
        // Symptôme : zombie call jamais nettoyé, `CALL_ALREADY_ACTIVE`
        // bloquant tous les call:initiate suivants dans la conversation.
        // On charge maintenant la relation imbriquée pour pouvoir comparer
        // sur le vrai userId.
        // Aussi élargi le filtre statuses pour couvrir `connecting` et
        // `reconnecting` (cohérent avec ACTIVE_STATUSES dans CallService).
        const activeCalls = await this.prisma.callSession.findMany({
          where: {
            conversationId: data.conversationId,
            status: { in: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'] }
          },
          include: {
            participants: {
              include: { participant: true }
            }
          }
        });

        // Force leave each active call where user is a participant
        for (const call of activeCalls) {
          const participant = call.participants.find(
            (p) => p.participant?.userId === userId && !p.leftAt
          );

          if (participant) {
            logger.info('🔄 Force leaving call', {
              callId: call.id,
              userId,
              participantId: participant.id
            });

            try {
              // Resolve participantId for cleanup
              const cleanupParticipantId = await this.resolveParticipantIdFromCall(userId, call.id);

              // Leave the call
              const callSession = await this.callService.leaveCall({
                callId: call.id,
                userId,
                participantId: cleanupParticipantId || userId
              });

              // Sibling-drift fix — mirrors the `call:leave` handler above:
              // this is an explicit leave just like `call:leave`, so it must
              // clear the same per-call in-memory state. Without this, a
              // still-armed ringing timer or buffered offer for this callId
              // lingers in memory until its own unrelated sweep/timeout,
              // instead of being released the moment the leave is known.
              this.callService.clearRingingTimeout(call.id);
              this.clearBufferedOffer(call.id);

              // Broadcast participant left event
              const leftEvent: CallParticipantLeftEvent = {
                callId: callSession.id,
                participantId: participant.id,
                userId: participant.participant?.userId || /* istanbul ignore next */ participant.participantId,
                mode: callSession.mode
              };

              io.to(ROOMS.call(call.id)).emit(
                CALL_EVENTS.PARTICIPANT_LEFT,
                leftEvent
              );

              // Leave the room
              await socket.leave(ROOMS.call(call.id));

              // Audit C7 (2026-07-02) — mirror the `call:leave` handler above:
              // a pre-answer force-leave (e.g. idempotent leave on CallKit
              // teardown) lands the session in `missed`, not `ended`. This
              // branch used to only fire on `ended`, so those calls got no
              // summary message and no missed-call notification — the callee
              // had no UX trace the call ever happened, even after answering.
              const forceLeaveStatus = callSession.status as string;
              if (forceLeaveStatus === 'ended' || forceLeaveStatus === 'missed') {
                const endedEvent: CallEndedEvent = {
                  callId: callSession.id,
                  duration: callSession.duration || 0,
                  endedBy: userId,
                  reason: (callSession.endReason || 'completed') as CallEndReason
                };

                // CALL-RESILIENCE — shared fanout (call + conversation + every
                // active member's user room); see broadcastCallEnded.
                await this.broadcastCallEnded(io, callSession.id, callSession.conversationId, endedEvent);

                // P3 — post the call-summary system message (idempotent).
                await this.postCallSummary(callSession.id);

                if (forceLeaveStatus === 'missed') {
                  /* istanbul ignore next -- handleMissedCall has its own internal catch and never rejects */
                  this.handleMissedCall(callSession.id).catch((err) => {
                    logger.error('❌ handleMissedCall failed after force-leave', { callId: call.id, err });
                  });
                }
              }
            } catch (leaveError) {
              logger.error('❌ Error force leaving call', { callId: call.id, error: leaveError });
            }
          }
        }

        logger.info('✅ Force cleanup completed', {
          conversationId: data.conversationId,
          userId,
          callsProcessed: activeCalls.length
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error force leaving calls', error);
        socket.emit(CALL_EVENTS.ERROR, {
          code: 'FORCE_LEAVE_ERROR',
          message: error.message || 'Failed to force leave calls'
        } as CallError);
      }
    });

    /**
     * call:signal - WebRTC signaling (SDP offer/answer, ICE candidates)
     * CVE-001: Added WebRTC signal validation with size limits
     * CVE-002: Added rate limiting (100 req/10s)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.SIGNAL, async (data: CallSignalEvent, ack?: (response: { success: boolean }) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated',
            callId: data.callId
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check (strict for signals to prevent spam)
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_SIGNAL,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-001 & CVE-006: Validate signal data structure and size
        const validation = validateSocketEvent(socketSignalSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          logger.warn('Invalid WebRTC signal', {
            userId,
            error: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.INVALID_SIGNAL,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined,
            callId: data.callId
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:signal', {
          socketId: socket.id,
          userId,
          callId: data.callId,
          signalType: data.signal.type,
          from: data.signal.from,
          to: data.signal.to
        });

        // Per-call ICE candidate rate limit — prevents a malicious or buggy client
        // from flooding a specific call with candidates even within the global signal budget.
        if (data.signal.type === 'ice-candidate') {
          const iceAllowed = await this.rateLimiter.checkLimit(
            `${userId}:${data.callId}`,
            SOCKET_RATE_LIMITS.CALL_ICE_CANDIDATE
          );
          if (!iceAllowed) {
            socket.emit(CALL_EVENTS.ERROR, {
              code: CALL_ERROR_CODES.RATE_LIMIT_EXCEEDED,
              message: 'Too many ICE candidates — slow down',
              callId: data.callId
            } as CallError);
            ack?.({ success: false });
            return;
          }
        }

        // CVE-001: Verify sender is actually a participant in the call
        const callSession = await this.callService.getCallSession(data.callId);
        const senderParticipant = callSession.participants.find(
          p => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
        );

        if (!senderParticipant) {
          logger.warn('⚠️ Socket: Sender not a participant in call', {
            userId,
            callId: data.callId
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not in this call',
            callId: data.callId
          } as CallError);
          return;
        }

        // CVE-001: Verify signal.from matches the authenticated user
        if (data.signal.from !== userId && data.signal.from !== senderParticipant.participantId) {
          logger.warn('⚠️ Socket: Signal sender mismatch', {
            userId,
            signalFrom: data.signal.from,
            callId: data.callId
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.SIGNAL_SENDER_MISMATCH,
            message: 'Signal sender does not match authenticated user',
            callId: data.callId
          } as CallError);
          return;
        }

        // CVE-001: Find and validate target participant
        const targetParticipant = callSession.participants.find(
          p => ((p.participant?.userId || p.participantId) === data.signal.to) && !p.leftAt
        );

        if (!targetParticipant) {
          logger.warn('⚠️ Socket: Target participant not found', {
            callId: data.callId,
            targetId: data.signal.to
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.TARGET_NOT_FOUND,
            message: 'Target participant not found in call',
            callId: data.callId
          } as CallError);
          return;
        }

        // TARGETED EMIT: Forward signal ONLY to the target participant's sockets
        // Resolves target userId to their socketIds within the call room
        const targetUserId = targetParticipant.participant?.userId || targetParticipant.participantId;
        const targetSocketIds = await this.resolveTargetSockets(io, data.callId, targetUserId, getUserId);

        if (targetSocketIds.length === 0) {
          // §4.6 — target not in the room yet (PushKit wake / socket churn /
          // 2nd device). Instead of silently losing the offer, buffer it so it
          // is replayed when the target (re)joins. ICE candidates are dropped
          // as before (they are re-gathered after the buffered offer is
          // applied). The caller still gets success:false so its at-least-once
          // retry can also fire; the buffer is the backstop.
          if (data.signal.type === 'offer' || data.signal.type === 'ice-restart') {
            this.bufferOffer(data.callId, validation.data as CallSignalEvent);
            logger.info('📦 [CALL] Buffered offer for late (re)join', {
              callId: data.callId,
              to: data.signal.to,
              type: data.signal.type
            });
          }
          logger.warn('Target participant has no active sockets', {
            callId: data.callId,
            targetUserId
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.TARGET_NOT_FOUND,
            message: 'Target participant has no active connection',
            callId: data.callId
          } as CallError);
          ack?.({ success: false });
          return;
        }

        // Relay the Zod-validated payload (validation.data), not the raw
        // client object — socketSignalSchema is a plain z.object() so
        // schema.parse() strips any field not declared in it. Forwarding
        // the unvalidated `data` would let a client smuggle arbitrary extra
        // fields into the peer's signaling payload.
        for (const targetSocketId of targetSocketIds) {
          io.to(targetSocketId).emit(CALL_EVENTS.SIGNAL, validation.data);
        }

        // §4.6 — also buffer successfully-relayed offers. The target may have
        // received it but then churn its socket before answering; the buffer
        // lets it recover on rejoin (epoch-guarded, last-write-wins).
        if (data.signal.type === 'offer' || data.signal.type === 'ice-restart') {
          this.bufferOffer(data.callId, validation.data as CallSignalEvent);
        }

        // Transition to active on first successful signal exchange
        if (data.signal.type === 'answer') {
          // Phase 1 fix P2 — answer signal transitions ringing → active
          this.callService.clearRingingTimeout(data.callId);
          // §4.6 — negotiation complete, the buffered offer is no longer needed.
          this.clearBufferedOffer(data.callId);
          await this.callService.updateCallStatus(data.callId, CallStatus.active).catch((err) => logger.warn('call:status update failed (active on answer)', { callId: data.callId, err }));
        }

        ack?.({ success: true });

        logger.info('Signal forwarded (targeted)', {
          callId: data.callId,
          from: data.signal.from,
          to: targetUserId,
          type: data.signal.type,
          targetSockets: targetSocketIds.length
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error forwarding signal', error);

        socket.emit(CALL_EVENTS.ERROR, {
          code: 'SIGNAL_FAILED',
          message: 'Failed to forward WebRTC signal',
          callId: data.callId
        } as CallError);
      }
    });

    /**
     * call:toggle-audio - Toggle audio on/off
     * CVE-002: Added rate limiting (50 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.TOGGLE_AUDIO, async (data: CallMediaToggleEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.MEDIA_TOGGLE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketMediaToggleSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:toggle-audio', {
          socketId: socket.id,
          userId,
          callId: data.callId,
          enabled: data.enabled
        });

        // Audit P2-GW-5 — `updateParticipantMedia` queries on
        // `participantId` (Participant.id ObjectId), NOT userId. Passing
        // userId here matched nothing and the toggle silently failed.
        // Resolve to the real participantId before calling the service.
        const audioParticipantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!audioParticipantId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this call'
          } as CallError);
          return;
        }
        await this.callService.updateParticipantMedia(
          data.callId,
          audioParticipantId,
          'audio',
          data.enabled
        );

        // P0-3 — broadcast to the OTHER participants only, mirroring the video
        // toggle handler below. The sender already updated its own mic state
        // locally and must NOT receive its own echo: iOS treats any received
        // call:media-toggled as the REMOTE peer's state (drives the muted
        // indicator). `io.to` incorrectly included the sender, corrupting the
        // sender's own view of the peer's mute state on every self-toggle.
        const toggleEvent: CallMediaToggleEvent = {
          callId: data.callId,
          participantId: audioParticipantId,
          mediaType: 'audio',
          enabled: data.enabled
        };

        socket.to(ROOMS.call(data.callId)).emit(
          CALL_EVENTS.MEDIA_TOGGLED,
          toggleEvent
        );

        logger.info('✅ Socket: Audio toggled', {
          callId: data.callId,
          userId,
          enabled: data.enabled
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error toggling audio', error);

        socket.emit(CALL_EVENTS.ERROR, this.mapMediaToggleError(error, 'Failed to toggle audio'));
      }
    });

    /**
     * call:toggle-video - Toggle video on/off
     * CVE-002: Added rate limiting (50 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.TOGGLE_VIDEO, async (data: CallMediaToggleEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.MEDIA_TOGGLE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketMediaToggleSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:toggle-video', {
          socketId: socket.id,
          userId,
          callId: data.callId,
          enabled: data.enabled
        });

        // Audit P2-GW-5 — see audio toggle handler for rationale.
        const videoParticipantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!videoParticipantId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this call'
          } as CallError);
          return;
        }
        await this.callService.updateParticipantMedia(
          data.callId,
          videoParticipantId,
          'video',
          data.enabled
        );

        // P0-3 — broadcast to the OTHER participants only. The sender already
        // updated its own camera state locally and must NOT receive its own echo:
        // iOS treats any received call:media-toggled as the REMOTE peer's state
        // (drives the avatar placeholder). `socket.to` excludes the sender;
        // `io.to` would include it.
        const toggleEvent: CallMediaToggleEvent = {
          callId: data.callId,
          participantId: videoParticipantId,
          mediaType: 'video',
          enabled: data.enabled
        };

        socket.to(ROOMS.call(data.callId)).emit(
          CALL_EVENTS.MEDIA_TOGGLED,
          toggleEvent
        );

        logger.info('✅ Socket: Video toggled', {
          callId: data.callId,
          userId,
          enabled: data.enabled
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error toggling video', error);

        socket.emit(CALL_EVENTS.ERROR, this.mapMediaToggleError(error, 'Failed to toggle video'));
      }
    });

    /**
     * call:end - End a call (ANY active participant can end in P2P)
     * CVE-004: Anonymous users still blocked
     */
    socket.on(CALL_EVENTS.END, async (data: { callId: string; reason?: string }, ack?: (response: { success: boolean }) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          ack?.({ success: false });
          return;
        }

        // Anonymous users cannot end calls — they cannot initiate or join them
        // either (denyAnonymous is checked at initiate/join). This gate prevents
        // a future bug where an anonymous user that somehow holds a callId
        // could end someone else's call by guessing or replaying an event.
        if (denyAnonymous()) { ack?.({ success: false }); return; }

        // Rate limiting
        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_LEAVE, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) { ack?.({ success: false }); return; }

        // Validate
        const validation = validateSocketEvent(socketEndCallSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError } = validation;
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError
          } as CallError);
          ack?.({ success: false });
          return;
        }

        const userInfo = getUserInfo?.(socket.id);
        const isAnonymous = userInfo?.isAnonymous || false;

        // [Perf raccroché 2026-07-04] Fast-path : le pair doit couper
        // INSTANTANÉMENT quand l'autre raccroche — or le chemin terminal
        // ci-dessous enchaîne plusieurs allers-retours MongoDB
        // (resolveParticipantIdFromCall → endCall → resolveCallEndedRooms)
        // avant le premier broadcast. L'appartenance du socket émetteur à la
        // call room EST l'autorisation (rejoindre la room a exigé un
        // call:join vérifié en DB) : on notifie la room immédiatement,
        // en mémoire pure. Le broadcast autoritatif (durée réelle, raison
        // normalisée, audience élargie conversation + user rooms) suit —
        // les clients dédupliquent sur leur état terminal.
        if (socket.rooms.has(ROOMS.call(data.callId))) {
          socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.ENDED, {
            callId: data.callId,
            duration: 0,
            endedBy: userId,
            reason: (data.reason || 'completed') as CallEndReason
          } as CallEndedEvent);
        }

        const endParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);
        if (!endParticipantId) {
          // The fast-path broadcast above already told the room the call
          // ended. Since we can't resolve authorization to run the
          // authoritative endCall() below, force the session to a terminal
          // state ourselves so it isn't left stuck ACTIVE — otherwise it
          // blocks every future call:initiate in this conversation until
          // CallCleanupService's GC tier reaps it (~120s).
          await this.forceEndOrphanedCallAfterOptimisticBroadcast(data.callId, data.reason);
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation'
          } as CallError);
          ack?.({ success: false });
          return;
        }

        const callSession = await this.callService.endCall(
          data.callId, userId, endParticipantId, isAnonymous, data.reason
        );

        // Phase 1 fix P2 — explicit end clears any pending ringing timeout
        this.callService.clearRingingTimeout(data.callId);
        // §4.6 — drop any buffered offer for this terminated call.
        this.clearBufferedOffer(data.callId);

        const endReason = (callSession.endReason || 'completed') as CallEndReason;

        const endedEvent: CallEndedEvent = {
          callId: callSession.id,
          duration: callSession.duration || 0,
          endedBy: userId,
          reason: endReason
        };

        // Broadcast to call room + conversation room + member user rooms
        // (deduplicated single emit — see broadcastCallEnded).
        await this.broadcastCallEnded(io, data.callId, callSession.conversationId, endedEvent);

        // P3 — post the call-summary system message ("Appel … · MM:SS",
        // "Appel refusé", …). Primary hangup/reject path; idempotent.
        await this.postCallSummary(callSession.id);

        // Audit C3/C4 (2026-07-02 prod audit) — endCall() now mirrors leaveCall()
        // and resolves a pre-answer end to `missed`. Mirror the call:leave handler:
        // trigger the same missed-call notification path (push + in-app banner) so
        // the OTHER party is notified, regardless of whether the call was ended via
        // call:leave or call:end.
        if ((callSession.status as string) === 'missed') {
          /* istanbul ignore next -- handleMissedCall has its own internal catch and never rejects */
          this.handleMissedCall(callSession.id).catch((err) => {
            logger.error('❌ handleMissedCall failed after end', { callId: data.callId, err });
          });
        }

        // Cleanup: remove all sockets from call room
        const socketsInCallRoom = await io.in(ROOMS.call(data.callId)).fetchSockets();
        await Promise.all(socketsInCallRoom.map(s => s.leave(ROOMS.call(data.callId))));

        ack?.({ success: true });

        logger.info('Call ended by user', {
          callId: data.callId,
          endedBy: userId,
          duration: callSession.duration,
          reason: endReason
        });
      } catch (error: any) {
        logger.error('Error ending call', error);
        // The fast-path broadcast may already have told the room the call
        // ended before this failure (e.g. endCall() itself threw). Force the
        // session to a terminal state so it matches what clients were told —
        // a no-op if endCall() actually succeeded before a later step failed
        // (broadcastCallEnded/postCallSummary), since the session is already
        // terminal by then.
        await this.forceEndOrphanedCallAfterOptimisticBroadcast(data.callId, data.reason);
        const errorMessage = error.message || 'Failed to end call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;
        ack?.({ success: false });
        socket.emit(CALL_EVENTS.ERROR, { code: errorCode, message } as CallError);
      }
    });

    /**
     * call:heartbeat - Fire-and-forget heartbeat to prevent zombie calls
     */
    socket.on(CALL_EVENTS.HEARTBEAT, async (data: CallHeartbeatEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_HEARTBEAT,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketHeartbeatSchema, data);
        if (!validation.success) return;

        // Authorization — only an ACTIVE PARTICIPANT OF THIS CALL may record a
        // heartbeat against it (not merely a member of its conversation).
        // `resolveParticipantIdFromCall` only checked conversation membership,
        // letting any other conversation member plant a phantom in-memory
        // heartbeat entry for a call they never joined (or already left) —
        // polluting `CallService.hasHeartbeatData`/`getStaleHeartbeats`, which
        // `CallCleanupService` relies on to reap zombie calls.
        const participantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (participantId) {
          this.callService.recordHeartbeat(data.callId, participantId);
        }
      } catch (error) {
        logger.error('Error recording heartbeat', { error });
      }
    });

    /**
     * call:quality-report - Fire-and-forget quality stats
     */
    socket.on(CALL_EVENTS.QUALITY_REPORT, async (data: CallQualityReportEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_QUALITY_REPORT,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketQualityReportSchema, data);
        if (!validation.success) return;

        // Authorization — only an ACTIVE PARTICIPANT OF THIS CALL may write
        // stats/quality data against it (not merely a member of its
        // conversation — `resolveParticipantIdFromCall` only checked that,
        // letting any other conversation member flood-write bogus
        // bytesSent/bytesReceived/level onto someone else's active call).
        const participantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!participantId) return;

        // Check quality thresholds and emit alerts if needed
        const { stats } = data;

        // Persist cumulative data usage + quality tier so the call-summary
        // message can surface "data spent · network quality". Best-effort.
        await this.callService.persistCallStats(data.callId, {
          bytesSent: stats.bytesSent,
          bytesReceived: stats.bytesReceived,
          level: stats.level
        });

        const isDegraded = stats.rtt > 300 || stats.packetLoss > 5;
        const streakKey = `${data.callId}:${participantId}`;
        if (!isDegraded) {
          this.qualityDegradedStreaks.delete(streakKey);
        } else {
          const nowMs = Date.now();
          const prev = this.qualityDegradedStreaks.get(streakKey);
          const consecutive = prev && nowMs - prev.lastAt <= CallEventsHandler.QUALITY_STREAK_STALE_MS
            ? prev.streak
            : 0;
          const streak = consecutive + 1;
          this.qualityDegradedStreaks.set(streakKey, { streak, lastAt: nowMs });

          // Leak guard: calls that end on a degraded report leave their entry
          // behind — sweep stale entries when the map grows unusually large.
          if (this.qualityDegradedStreaks.size > CallEventsHandler.QUALITY_STREAK_MAP_MAX) {
            for (const [key, entry] of this.qualityDegradedStreaks) {
              if (nowMs - entry.lastAt > CallEventsHandler.QUALITY_STREAK_STALE_MS) {
                this.qualityDegradedStreaks.delete(key);
              }
            }
          }

          if (streak >= CallEventsHandler.QUALITY_ALERT_SUSTAINED_REPORTS) {
            const metric = stats.rtt > 300 ? 'rtt' : 'packetLoss';
            const value = metric === 'rtt' ? stats.rtt : stats.packetLoss;
            const threshold = metric === 'rtt' ? 300 : 5;

            // `socket.to` (NOT `io.to`): the reporter must never receive the
            // "your contact has a bad connection" alert about ITS OWN link —
            // its local pill already covers that, and the double banner read
            // as contradictory. Re-emitted on every sustained report so the
            // remote's 15 s auto-clear keeps being refreshed while the link
            // stays bad.
            socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.QUALITY_ALERT, {
              callId: data.callId,
              participantId,
              metric,
              value,
              threshold
            });
          }
        }
      } catch (error) {
        logger.error('Error processing quality report', { error });
      }
    });

    /**
     * call:reconnecting - Client notifies server of ICE restart attempt
     */
    socket.on(CALL_EVENTS.RECONNECTING, async (data: CallReconnectingEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_RECONNECTING, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketReconnectingSchema, data);
        if (!validation.success) return;

        // Audit P1-21 — Authorization: only an active participant of THIS
        // call can flip its status (not merely a member of its conversation).
        // Otherwise any authenticated user could toggle reconnecting/active
        // on arbitrary callIds.
        const membership = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!membership) return;

        await this.callService.updateCallStatus(data.callId, CallStatus.reconnecting).catch((err) => logger.warn('call:status update failed (reconnecting)', { callId: data.callId, err }));

        logger.info('Call reconnecting', {
          callId: data.callId,
          participantId: data.participantId,
          attempt: data.attempt
        });
      } catch (error) {
        logger.error('Error handling reconnecting', { error });
      }
    });

    /**
     * call:reconnected - Client notifies server of successful reconnection
     */
    socket.on(CALL_EVENTS.RECONNECTED, async (data: CallReconnectedEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_RECONNECTED, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketReconnectedSchema, data);
        if (!validation.success) return;

        // Audit P1-21 — Authorization: see RECONNECTING handler above.
        const membership = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!membership) return;

        await this.callService.updateCallStatus(data.callId, CallStatus.active).catch((err) => logger.warn('call:status update failed (active on reconnect)', { callId: data.callId, err }));

        logger.info('Call reconnected', {
          callId: data.callId,
          participantId: data.participantId
        });
      } catch (error) {
        logger.error('Error handling reconnected', { error });
      }
    });

    /**
     * call:transcription-segment - Real-time transcription segment from participant
     * Validates, checks participation, and relays to other call participants
     * If translation is enabled on the call, forwards to ZMQ translator
     */
    socket.on(CALL_EVENTS.TRANSCRIPTION_SEGMENT, async (data: CallTranscriptionSegmentEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        // Rate limiting — SOCKET_RATE_LIMITS.CALL_TRANSCRIPTION_SEGMENT was
        // defined but never enforced, leaving this handler unthrottled: every
        // final segment triggers a DB read (and potentially a ZMQ translation
        // request), so a flooding client could amplify load onto the DB and
        // the translator service.
        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_TRANSCRIPTION_SEGMENT, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketTranscriptionSegmentSchema, data);
        if (!validation.success) return;

        // Authorization — only an ACTIVE PARTICIPANT OF THIS CALL may inject
        // transcription text into it (not merely a member of its conversation
        // — `resolveParticipantIdFromCall` only checked that, letting any
        // other conversation member broadcast arbitrary text into a call
        // they never joined). Same fix as QUALITY_REPORT / RECONNECTING.
        const participantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!participantId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this call'
          } as CallError);
          return;
        }

        const callSession = await this.prisma.callSession.findUnique({
          where: { id: data.callId },
          select: { status: true, metadata: true }
        });

        if (!callSession || callSession.status === 'ended') return;

        const metadata = callSession.metadata as CallTranscriptionSegmentEvent['segment'] extends unknown ? Record<string, unknown> | null : never;
        const translationEnabled = metadata && typeof metadata === 'object' && 'translationEnabled' in metadata && metadata.translationEnabled === true;

        if (translationEnabled && this.zmqClient && data.segment.isFinal) {
          await this.translateAndEmitSegment(socket, data, userId);
        } else {
          socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.TRANSLATED_SEGMENT, {
            callId: data.callId,
            segment: {
              text: data.segment.text,
              speakerId: data.segment.speakerId,
              startMs: data.segment.startMs,
              endMs: data.segment.endMs,
              isFinal: data.segment.isFinal,
              sourceLanguage: data.segment.language,
              targetLanguage: data.segment.language,
              confidence: data.segment.confidence
            }
          });
        }

        logger.debug('Transcription segment relayed', {
          callId: data.callId,
          speakerId: data.segment.speakerId,
          isFinal: data.segment.isFinal
        });
      } catch (error) {
        logger.error('Error handling transcription segment', { error });
      }
    });

    /**
     * call:request-ice-servers — refresh TURN credentials before TTL expiry.
     * The client requests this at ~80% of the credential TTL so long calls (>10 min)
     * always have valid TURN credentials for ICE restart.
     */
    socket.on(CALL_EVENTS.REQUEST_ICE_SERVERS, async (data: { callId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_ICE_SERVERS_REFRESH, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketRequestIceServersSchema, data);
        if (!validation.success) return;

        // Authorization: socket must be in the call room (joined on call:join).
        if (!socket.rooms.has(ROOMS.call(data.callId))) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'Not in call room'
          } as CallError);
          return;
        }

        // Defense-in-depth: confirm the caller is still an active participant
        // of THIS call (not just that their socket is in the room — room
        // membership and participant state could diverge if cleanup ever
        // races — and not merely a member of its conversation, which is all
        // `resolveParticipantIdFromCall` verifies) before minting fresh TURN
        // credentials for them. Same fix as QUALITY_REPORT / TRANSCRIPTION_SEGMENT
        // (audit gateway prod 2026-07-02, backlog item "authz call:request-ice-servers").
        const iceParticipantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!iceParticipantId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'Not a participant in this call'
          } as CallError);
          return;
        }

        const iceServers = this.callService.generateIceServers(userId);
        const ttl = this.callService.getIceServerTtl();
        const refreshedEvent: CallIceServersRefreshedEvent = {
          callId: data.callId,
          iceServers,
          ttl,
        };
        socket.emit(CALL_EVENTS.ICE_SERVERS_REFRESHED, refreshedEvent);

        logger.debug('🔐 ICE servers refreshed for call', {
          callId: data.callId,
          userId,
          ttl,
          serverCount: iceServers.length
        });
      } catch (error) {
        logger.error('Error handling call:request-ice-servers', { error });
      }
    });

    // ─── call:backgrounded ───────────────────────────────────────────────────
    // The iOS app signals it is going to background while a call is active.
    // We flip socket.data.appForeground so the ringing logic knows to use VoIP
    // push for future incoming calls instead of socket delivery.
    socket.on(CALL_EVENTS.BACKGROUNDED, async (data: { callId: string; participantId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_BACKGROUNDED,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketCallBackgroundedSchema, data);
        if (!validation.success) return;

        // Resolve the caller's own participantId rather than trusting the
        // client-supplied one — otherwise a participant could flag a peer's
        // participantId as backgrounded and skew that peer's heartbeat
        // tolerance / ringing delivery (socket vs VoIP push). Must be an
        // active participant of THIS call, not merely its conversation.
        const backgroundedParticipantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!backgroundedParticipantId) return;

        socket.data.appForeground = false;
        this.callService.recordParticipantBackgrounded(data.callId, backgroundedParticipantId);

        logger.debug('📞 Socket: call:backgrounded', {
          callId: data.callId,
          participantId: backgroundedParticipantId,
          userId,
        });
      } catch (error) {
        logger.error('Error handling call:backgrounded', { error });
      }
    });

    // ─── call:foregrounded ───────────────────────────────────────────────────
    // The iOS app has returned to foreground. Reset the flag so future ringing
    // can be delivered via socket again.
    socket.on(CALL_EVENTS.FOREGROUNDED, async (data: { callId: string; participantId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_FOREGROUNDED,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketCallForegroundedSchema, data);
        if (!validation.success) return;

        // Same rationale as call:backgrounded — resolve the caller's own
        // participantId instead of trusting the client-supplied one.
        const foregroundedParticipantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!foregroundedParticipantId) return;

        socket.data.appForeground = true;
        this.callService.clearParticipantBackgrounded(data.callId, foregroundedParticipantId);

        logger.debug('📞 Socket: call:foregrounded', {
          callId: data.callId,
          participantId: foregroundedParticipantId,
          userId,
        });
      } catch (error) {
        logger.error('Error handling call:foregrounded', { error });
      }
    });

    // ─── call:screen-capture-detected ────────────────────────────────────────
    // A participant started or stopped screen capture. Relay to everyone else
    // in the call room so they can display/dismiss the capture warning.
    socket.on(CALL_EVENTS.SCREEN_CAPTURE_DETECTED, async (data: CallScreenCaptureEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_SCREEN_CAPTURE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketCallScreenCaptureDetectedSchema, data);
        if (!validation.success) return;

        if (!socket.rooms.has(ROOMS.call(data.callId))) {
          return;
        }

        // Security fix 2026-07-03: resolve the caller's own participantId
        // server-side rather than trusting the client-supplied one — same
        // rationale as call:backgrounded/call:foregrounded. Otherwise either
        // participant in a call could impersonate the other, forging or
        // suppressing that peer's screen-capture privacy alert.
        const screenCaptureParticipantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!screenCaptureParticipantId) return;

        const alertEvent: CallScreenCaptureEvent = {
          callId: data.callId,
          participantId: screenCaptureParticipantId,
          isCapturing: data.isCapturing,
        };
        socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.SCREEN_CAPTURE_ALERT, alertEvent);

        logger.info('📞 Socket: call:screen-capture-detected relayed', {
          callId: data.callId,
          participantId: screenCaptureParticipantId,
          isCapturing: data.isCapturing,
          userId,
        });
      } catch (error) {
        logger.error('Error handling call:screen-capture-detected', { error });
      }
    });

    // ─── call:analytics ──────────────────────────────────────────────────────
    // Fire-and-forget lifecycle telemetry emitted once at call end by iOS.
    // Validated and logged; no response sent back to the client.
    socket.on(CALL_EVENTS.ANALYTICS, async (data: {
      callId: string;
      setupTimeMs: number;
      negotiationTimeMs?: number;
      durationSeconds: number;
      reconnectionCount: number;
      networkTransitions: number;
      averageRtt: number;
      averagePacketLoss: number;
      maxPacketLoss: number;
      codec: string;
      effectsUsed: string[];
      filtersUsed: boolean;
      transcriptionUsed: boolean;
      qualityDistribution: { excellent: number; good: number; fair: number; poor: number };
      platform: string;
      deviceModel: string;
      isVideo: boolean;
      endReason: string;
    }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_ANALYTICS,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketCallAnalyticsSchema, data);
        if (!validation.success) return;

        // Authorization — was previously unchecked, letting any authenticated
        // user submit telemetry against an arbitrary callId. Scoped to
        // conversation membership (not `resolveActiveCallParticipantId`,
        // which requires `leftAt: null` — analytics fires after the client
        // has already left the call, so an active-participant check would
        // reject the legitimate sender).
        const analyticsParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);
        if (!analyticsParticipantId) return;

        logger.info('📞 Socket: call:analytics received', {
          callId: data.callId,
          platform: data.platform,
          durationSeconds: data.durationSeconds,
          setupTimeMs: data.setupTimeMs,
          negotiationTimeMs: data.negotiationTimeMs ?? -1,
          reconnectionCount: data.reconnectionCount,
          networkTransitions: data.networkTransitions,
          averageRtt: data.averageRtt,
          averagePacketLoss: data.averagePacketLoss,
          maxPacketLoss: data.maxPacketLoss,
          codec: data.codec,
          isVideo: data.isVideo,
          endReason: data.endReason,
          qualityDistribution: data.qualityDistribution,
          userId,
        });

        // Persist the VALIDATED payload on this participant's CallParticipant
        // row so reliability can be tracked on real calls (reconnectionCount,
        // qualityDistribution, negotiationTimeMs…) — log-only telemetry is
        // invisible to dashboards. Per-participant row: both ends emit at
        // hangup within the same second and must never clobber each other.
        // Best-effort — telemetry loss must stay invisible to the client.
        try {
          await this.prisma.callParticipant.updateMany({
            where: { callSessionId: data.callId, participantId: analyticsParticipantId },
            data: { analytics: validation.data }
          });
        } catch (persistError) {
          logger.error('call:analytics persistence failed (telemetry lost, client unaffected)', {
            callId: data.callId, participantId: analyticsParticipantId, error: persistError
          });
        }
      } catch (error) {
        logger.error('Error handling call:analytics', { error });
      }
    });

    /**
     * Handle disconnect - auto-leave any active calls
     *
     * Audit P1-28 — `getUserId(socket.id)` may already return undefined here
     * if MeeshySocketIOManager's own disconnect listener ran first and purged
     * its socketToUser map. Fall back to the cached userId we captured during
     * the last authenticated event handled by this socket.
     */
    socket.on('disconnect', async () => {
      try {
        const userId = recoverUserId();
        if (!userId) return;

        // CALL-RESILIENCE — during a graceful shutdown the mass socket drop is
        // NOT a hangup. Leave every active call untouched so the P2P media
        // survives and clients transparently re-join the restarted instance.
        // Stale ringing/pre-answer calls (and active calls nobody reconnects to)
        // are reaped by the restarted instance's CallCleanupService.
        if (this.isShuttingDown) {
          logger.info('📞 Socket disconnect during shutdown — preserving active calls', {
            socketId: socket.id,
            userId
          });
          return;
        }

        // ZOMBIE-SOCKET GUARD (2026-07-02) — a stale socket from a previous
        // session expiring must NOT tear down calls the user is actively on
        // through ANOTHER live socket (prod: two expired zombies killed call
        // 6a464c61 mid-ring while the active socket still received messages).
        // This handler listens on 'disconnect', so the closing socket has
        // already left its rooms — any member left in the user room is a
        // different, live connection: no leave, no grace, the user is here.
        const remainingUserSockets =
          io?.sockets?.adapter?.rooms?.get(ROOMS.user(userId))?.size ?? 0;
        if (remainingUserSockets > 0) {
          logger.info('📞 Socket disconnect ignored for calls — user still has live sockets', {
            socketId: socket.id,
            userId,
            remainingUserSockets
          });
          return;
        }

        logger.info('📞 Socket: disconnect - checking for active calls', {
          socketId: socket.id,
          userId
        });

        // Find any active calls the user is in. Audit C5 (2026-07-02) —
        // `{leftAt: null}` alone misses Mongo docs whose leftAt field was
        // never written (pre-C5 participants).
        const activeParticipations = await this.prisma.callParticipant.findMany({
          where: {
            OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
            participant: { userId }
          },
          include: {
            callSession: true
          }
        });

        if (activeParticipations.length > 0) {
          logger.debug('disconnect-cleanup-path', {
            socketId: socket.id,
            userId,
            count: activeParticipations.length,
            callIds: activeParticipations.map(p => p.callSessionId)
          });
        }

        for (const participation of activeParticipations) {
          // Skip ANY terminal status — a leftAt:null participant row on a
          // missed/failed/rejected call is bookkeeping residue, not a live
          // call; arming a grace for it ends with leaveCall rewriting the
          // terminal row (probe prod 2026-07-02 22:41Z).
          if ((CALL_TERMINAL_STATUSES as readonly string[]).includes(participation.callSession.status)) continue;

          // CALL-RESILIENCE — an ANSWERED call (active/reconnecting) rides on a
          // direct P2P media connection that a transient socket drop does NOT
          // sever. Arm a reconnect grace window instead of ending it now; a
          // re-join cancels it, expiry ends it.
          //
          // Pre-answer calls (initiated/ringing/connecting) get a SHORT grace
          // instead of the historical immediate end (chaos-test prod
          // 2026-07-02, callId 6a466a60…): the caller's sockets churned within
          // 100ms during RINGING and the immediate end resolved the call
          // missed while the caller's app was alive — its re-join 3s later hit
          // "Call is in terminal state". A REAL cancel/decline goes through an
          // explicit call:end; this path only serves crash/force-quit, for
          // which a few extra ringing seconds are harmless (the 60s ringing
          // timeout stays the hard cap).
          const dcStatus = participation.callSession.status as string;
          const isAnswered = dcStatus === 'active' || dcStatus === 'reconnecting';
          this.armDisconnectGrace(
            {
              io,
              getUserId,
              participation: participation as unknown as DisconnectParticipation,
              userId
            },
            isAnswered
              ? CallEventsHandler.DISCONNECT_GRACE_MS
              : CallEventsHandler.PRE_ANSWER_GRACE_MS
          );
        }
      } catch (error) {
        logger.error('❌ Socket: Error handling disconnect for calls', error);
      }
    });
  }

  /**
   * Créer des notifications pour les participants qui n'ont pas répondu à un appel
   */
  async createMissedCallNotifications(callId: string): Promise<void> {
    if (!this.notificationService) {
      logger.warn('⚠️ NotificationService not initialized, cannot create missed call notifications');
      return;
    }

    try {
      // Récupérer les informations de l'appel
      const callSession = await this.prisma.callSession.findUnique({
        where: { id: callId },
        include: {
          initiator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          conversation: {
            select: {
              id: true,
              identifier: true
            }
          }
        }
      });

      if (!callSession) {
        logger.warn('⚠️ Call session not found for missed call notifications', { callId });
        return;
      }

      // Récupérer les participants qui n'ont pas rejoint l'appel
      const unrespondedParticipants = await this.callService.getUnrespondedParticipants(callId);

      if (unrespondedParticipants.length === 0) {
        logger.info('📢 No unresponded participants for missed call notifications', { callId });
        return;
      }

      // Créer une notification pour chaque participant qui n'a pas répondu
      const callerName = callSession.initiator.displayName || callSession.initiator.username;
      const callerAvatar = callSession.initiator.avatar || undefined;

      // Audit P2-GW-2 — derive callType from metadata.type (set by
      // initiateCall) instead of hardcoding 'video'. Misclassified
      // notifications confuse users about what they actually missed.
      const inferredCallType: 'audio' | 'video' =
        ((callSession.metadata as { type?: string } | null)?.type === 'video' ? 'video' : 'audio');
      for (const participantId of unrespondedParticipants) {
        await this.notificationService.createMissedCallNotification({
          recipientUserId: participantId,
          callerId: callSession.initiatorId,
          conversationId: callSession.conversationId,
          callSessionId: callSession.id,
          callType: inferredCallType,
        });
      }

      logger.info('📢 Missed call notifications created', {
        callId,
        recipientCount: unrespondedParticipants.length
      });
    } catch (error) {
      logger.error('❌ Error creating missed call notifications:', error);
    }
  }

  /**
   * Marquer un appel comme manqué et créer les notifications
   */
  async handleMissedCall(callId: string): Promise<void> {
    try {
      // Marquer l'appel comme manqué
      await this.callService.markCallAsMissed(callId);

      // Créer les notifications pour les participants qui n'ont pas répondu
      await this.createMissedCallNotifications(callId);

      logger.info('✅ Missed call handled', { callId });
    } catch (error) {
      logger.error('❌ Error handling missed call:', error);
    }
  }
}
