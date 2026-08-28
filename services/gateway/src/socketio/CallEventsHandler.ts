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

/**
 * Cycle 107 — le `Socket` et le `Server` de ce handler, TYPÉS contre le contrat
 * partagé.
 *
 * Ils portaient les types NUS de `socket.io` jusqu'ici, dont les génériques
 * valent `DefaultEventsMap` : sous eux, `socket.on(n'importe quoi, (data:
 * n'importe quoi) => …)` compile. C'est ce qui a permis à `call:analytics` —
 * vingt-deux sites d'écoute plus bas, dix-neuf champs transcrits dans la
 * signature du listener, trois clients émetteurs — de n'être déclaré NULLE PART
 * dans `ClientToServerEvents`.
 *
 * Ces deux alias-là ne changent aucune forme : ils rendent l'écart VISIBLE au
 * compilateur. Portée exacte de ce qu'ils gardent (mesurée, pas supposée) :
 * `socketio/clientReceive.ts`.
 */
import type { MeeshySocket as Socket, MeeshyIOServer as SocketIOServer } from './typed-socket';
import { PrismaClient, CallStatus, CallEndReason } from '@meeshy/shared/prisma/client';
import { CallService, CallAlreadyEndedError } from '../services/CallService';
import { NotificationService } from '../services/notifications/NotificationService';
import { PushNotificationService } from '../services/PushNotificationService';
import { logger } from '../utils/logger';
import { CALL_EVENTS, CALL_ERROR_CODES, CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { ROOMS, CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { resolveCallEndedRooms } from '../utils/callEndedFanout';
import { callErrorMessageOf, parseCallHandlerError } from './utils/call-error-parsing';
import { buildCallSilentPush, shouldMirrorAnsweredElsewhere } from '../services/call-push-mirroring';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
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
  socketTranscriptionActiveSchema,
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
  CallMediaToggleClientEvent,
  CallAnalyticsEvent,
  CallError,
  CallHeartbeatEvent,
  CallQualityReportEvent,
  CallReconnectingEvent,
  CallReconnectedEvent,
  CallMissedEvent,
  CallInitiateAck,
  CallJoinAck,
  // CallEndReason imported as value from @meeshy/shared/prisma/client above
  // (the Prisma generated enum is both a value AND a type, so we don't
  // need the type-only re-export from video-call.ts which duplicates it).
  CallTranscriptionSegmentEvent,
  CallTranscriptionActiveEvent,
  CallTranslatedSegmentEvent,
  CallIceServersRefreshedEvent,
  CallScreenCaptureEvent,
} from '@meeshy/shared/types/video-call';

/**
 * CALL-RESILIENCE — the shape of an active participation row read by the
 * disconnect handler (`callParticipant.findMany` with `include: callSession`),
 * threaded into the grace-window helpers.
 */
export type DisconnectParticipation = {
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
  /**
   * Live-call message — the manager's `broadcastMessageEdited`, used when a
   * terminal path UPDATES an existing live message instead of creating one.
   * Stays null in unit tests that don't exercise the live-message path.
   */
  private messageUpdateBroadcaster: ((message: unknown, conversationId: string) => Promise<void>) | null = null;
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
   * Idempotency guard for `createMissedCallNotifications`, keyed by callId →
   * first-notified timestamp. `handleMissedCall` is reachable from 7
   * independent terminal paths (ringing-timeout, disconnect-grace-expiry,
   * force-cleanup-after-leave-failure, force-end-orphaned, call:leave,
   * call:force-leave, call:end) plus `CallCleanupService`'s GC tier, which
   * calls `createMissedCallNotifications` directly via `missedCallNotify`.
   * Only the ringing-timeout path guards itself with an atomic `updateMany`
   * (count===0 → return) before calling `handleMissedCall`; every other path
   * merely READS the call's already-committed status and fires again
   * whenever it happens to observe `missed`, regardless of whether IT caused
   * the transition. Without this guard, a hangup racing the ringing timeout
   * — an everyday occurrence, not an edge case — delivers TWO persisted
   * `missed_call` notifications (double badge, double push) for one missed
   * call. TTL-swept below rather than wired into every terminal call site,
   * mirroring `bufferedOffers`/`signalSessionCache`.
   */
  private readonly missedCallNotifiedAt = new Map<string, number>();
  private static readonly MISSED_CALL_NOTIFY_DEDUP_TTL_MS = 600_000;

  /**
   * Idempotency guard for `sendCallCancellationPushes`, the sibling of
   * `missedCallNotifiedAt` above — same multi-path fan-in problem, different
   * notification channel. `sendCallCancellationPushes` is reachable from
   * every `broadcastCallEnded` call site (ringing-timeout, call:leave,
   * call:force-leave, call:end, disconnect-grace-expiry,
   * force-cleanup-after-leave-failure, force-end-orphaned, plus the REST
   * `broadcastCallEndedForTerminatedCall` wrapper) AND directly from
   * `CallCleanupService`'s GC tier via
   * `sendMissedCallCancellationPushForTerminatedCall`. None of those callers
   * check whether THEY caused the terminal transition — same as the
   * `missedCallNotifiedAt` write-up above — so a hangup racing the ringing
   * timeout (or the GC tier racing either) fires this silent `call_cancel`
   * push twice for one call. Vague 53 only deduped the persisted
   * `missed_call` notification; this push is a separate fan-out that never
   * got the same guard.
   */
  private readonly callCancellationPushSentAt = new Map<string, number>();
  private static readonly CALL_CANCELLATION_PUSH_DEDUP_TTL_MS = 600_000;

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
  /**
   * Cache TTL court du hot-path call:signal (audit appels 2026-07-11 #10) :
   * une rafale d'ICE candidates faisait un findUnique+include lourd PAR
   * signal. Les entrées expirent vite (participants/answeredAt quasi-frais)
   * et le handler re-lit la DB avant tout rejet si un participant manque.
   */
  private static readonly SIGNAL_SESSION_TTL_MS = 2_000;
  private readonly signalSessionCache = new Map<
    string,
    { session: Awaited<ReturnType<CallService['getCallSession']>>; fetchedAt: number }
  >();

  private async getSignalSession(callId: string): Promise<Awaited<ReturnType<CallService['getCallSession']>>> {
    const hit = this.signalSessionCache.get(callId);
    if (hit && Date.now() - hit.fetchedAt < CallEventsHandler.SIGNAL_SESSION_TTL_MS) {
      return hit.session;
    }
    return this.refreshSignalSession(callId);
  }

  private async refreshSignalSession(callId: string): Promise<Awaited<ReturnType<CallService['getCallSession']>>> {
    const session = await this.callService.getCallSession(callId);
    this.signalSessionCache.set(callId, { session, fetchedAt: Date.now() });
    return session;
  }

  /**
   * The 2s TTL guards against DB re-reads within a burst, not against a
   * participant leaving mid-burst — `findSender`/`findTarget` in the
   * `call:signal` handler only force a fresh read when a participant is
   * ABSENT from the cached snapshot, never when one is present but stale
   * (already left). Every path that writes `CallParticipant.leftAt` for
   * this call must evict the entry so the very next `call:signal` re-reads.
   *
   * Public: also wired in server.ts as `CallService.setSignalCacheInvalidationCallback`
   * / `CallCleanupService.setSignalCacheInvalidationCallback` — those services
   * force-end calls (writing `leftAt`) through their own GC/phantom-cleanup
   * paths, outside any socket handler in this class.
   */
  invalidateSignalSession(callId: string): void {
    this.signalSessionCache.delete(callId);
  }

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
      for (const [callId, entry] of this.signalSessionCache) {
        if (now - entry.fetchedAt >= CallEventsHandler.SIGNAL_SESSION_TTL_MS) {
          this.signalSessionCache.delete(callId);
        }
      }
      for (const [callId, notifiedAt] of this.missedCallNotifiedAt) {
        if (now - notifiedAt >= CallEventsHandler.MISSED_CALL_NOTIFY_DEDUP_TTL_MS) {
          this.missedCallNotifiedAt.delete(callId);
        }
      }
      for (const [callId, sentAt] of this.callCancellationPushSentAt) {
        if (now - sentAt >= CallEventsHandler.CALL_CANCELLATION_PUSH_DEDUP_TTL_MS) {
          this.callCancellationPushSentAt.delete(callId);
        }
      }
    }, 60_000).unref();
  }

  /**
   * Langue de notification résolue (Prisme-first) pour chaque callee d'un
   * push d'appel. Un seul findMany ; toute erreur retourne une Map vide —
   * notificationString(undefined) retombe sur 'fr', le push part toujours.
   */
  private async resolveNotificationLangs(userIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (userIds.length === 0) return out;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          deviceLocale: true,
        },
      });
      for (const u of users) {
        out.set(u.id, resolveUserLanguage(u, { deviceLocale: u.deviceLocale ?? undefined }));
      }
    } catch (error) {
      logger.error('Notification language resolution failed — falling back to fr', { error });
    }
    return out;
  }

  /**
   * Guideline 5 (MIIT) CallKit-in-China compliance — deviceCountry resolved
   * per callee for an incoming-call push. A single findMany; any error
   * returns an empty Map so the caller conservatively falls back to the
   * (CallKit-eligible) 'voip' push type rather than silently dropping it.
   */
  private async resolveDeviceCountries(userIds: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (userIds.length === 0) return out;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, deviceCountry: true },
      });
      for (const u of users) {
        out.set(u.id, u.deviceCountry);
      }
    } catch (error) {
      logger.error('Device country resolution failed — falling back to voip push', { error });
    }
    return out;
  }

  /**
   * GW6(b) — users with at least one ACTIVE `voip` push token. A callee
   * without one (iOS-app-on-Mac, expired/never-registered PushKit token)
   * would get a `voip` send that dies on `No active tokens found` — the call
   * is totally silent app-killed. Those callees fall back to a standard
   * `apns` alert with the SAME payload (data.type 'call' + callId +
   * iceServers) so tapping the banner drives the existing
   * `.incomingCallAlert` navigation. Fail-open toward `voip` (historical
   * behavior) on query error.
   */
  private async resolveVoipCapableUsers(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    try {
      const rows = await this.prisma.pushToken.findMany({
        where: { userId: { in: userIds }, type: 'voip', isActive: true },
        select: { userId: true },
      });
      return new Set(rows.map(r => r.userId));
    } catch (error) {
      logger.error('VoIP token resolution failed — assuming voip-capable', { error });
      return new Set(userIds);
    }
  }

  /**
   * GW6(c) — a socket's `appForeground=true` is only trusted while the socket
   * is FRESH (last inbound packet within this window). A zombie socket (app
   * crashed / network died without presence:app-state=false) stays flagged
   * foreground until the Socket.IO ping timeout (~45s) — during that window a
   * ring would be lost. Window > pingInterval (25s) + jitter so a healthy
   * idle-foreground client (which only pongs every 25s) is never
   * misclassified — a false-stale would force a CallKit banner over the
   * in-app UI (client dedups by callId, but avoid it by construction).
   */
  private static readonly FOREGROUND_SOCKET_STALENESS_MS = 32_000;

  private isFreshForegroundSocket(socketData: { appForeground?: boolean; lastSeenAt?: number } | undefined): boolean {
    if (socketData?.appForeground !== true) return false;
    const lastSeenAt = socketData.lastSeenAt;
    if (typeof lastSeenAt !== 'number') return true;
    return Date.now() - lastSeenAt <= CallEventsHandler.FOREGROUND_SOCKET_STALENESS_MS;
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
    this.signalSessionCache.clear();
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

    const sentAt = this.callCancellationPushSentAt.get(callId);
    if (sentAt !== undefined && Date.now() - sentAt < CallEventsHandler.CALL_CANCELLATION_PUSH_DEDUP_TTL_MS) {
      logger.info('📲 call_cancel push already sent for this call — skipping duplicate', { callId });
      return;
    }
    this.callCancellationPushSentAt.set(callId, Date.now());

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

      // Cross-platform mobile (audit 2026-07-11 #2) — le hardcode
      // apns/ios laissait un Android backgrounded (socket mort) sonner
      // dans le vide après un missed/rejected.
      await Promise.all(targets.map((uid) =>
        this.pushService!.sendToUser(
          buildCallSilentPush({ userId: uid, type: 'call_cancel', callId })
        ).catch((error) => {
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
          // Group-calls gap analysis S3 — every clearRingingTimeout() call
          // site pairs with a genuine terminal write (leaveCall/endCall/
          // markCallAsMissed/the GC sweeps), so reaching this branch with a
          // timer that actually fired means the call is non-terminal
          // (active/connecting/reconnecting) — most commonly a GROUP call
          // where one pair answered (the `call:signal` answer handler
          // deliberately leaves this timer armed past the first answer for
          // `conversation.type === 'group'`, see its comment) while other
          // invited members never joined at all. Notify those unresponded
          // members without touching the call itself: no status write, no
          // ENDED/MISSED broadcast, no active-call-claim release — the
          // ongoing call for whoever did answer is completely unaffected.
          // No-ops harmlessly (via createMissedCallNotifications' own
          // unresponded-empty guard) once every invited member has joined.
          await this.createMissedCallNotifications(callId).catch((err: unknown) => {
            logger.error('createMissedCallNotifications failed for a still-active call past its ring deadline', {
              callId, err: callErrorMessageOf(err, String(err))
            });
          });
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
        await this.handleMissedCall(callId).catch((err: unknown) => {
          logger.error('handleMissedCall failed for ringing timeout', {
            callId, err: callErrorMessageOf(err, String(err))
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
   * CALL-RESILIENCE (Vague 44) — the broadcast half of
   * `leaveParticipationAndBroadcast`, extracted and made public so
   * `AuthHandler`'s anonymous-guest disconnect path (the one case this
   * handler's own disconnect flow cannot resolve — its participation lookup
   * is keyed on `participant.userId`, always null for an anonymous guest,
   * see the `CALL-RESILIENCE` note in `AuthHandler.handleDisconnection`) can
   * fan out the exact same PARTICIPANT_LEFT/call:ended/postCallSummary/
   * evictCallRoomSockets sequence after calling `CallService.leaveCall`
   * itself, instead of leaving the other party's UI "in call" until the
   * ~120s `CallCleanupService` GC.
   */
  async broadcastParticipantLeftResult(opts: {
    io: SocketIOServer;
    leftSession: Awaited<ReturnType<CallService['leaveCall']>>;
    participation: DisconnectParticipation;
    userId: string;
  }): Promise<void> {
    const { io, leftSession, participation, userId } = opts;

    // Invariant "every path that writes leftAt evicts the signal cache" (see
    // invalidateSignalSession). Held here rather than in the private caller
    // below so the anonymous-guest path — AuthHandler's disconnect cleanup,
    // which runs leaveCall itself and enters through this public method — gets
    // it too. Without it, that call's ICE/SDP kept relaying off the stale 2s
    // snapshot after the DB already stamped leftAt.
    this.invalidateSignalSession(participation.callSessionId);

    io.to(ROOMS.call(participation.callSessionId)).emit(
      CALL_EVENTS.PARTICIPANT_LEFT,
      {
        callId: participation.callSessionId,
        participantId: participation.id,
        // Vague 132 — this emit omitted `userId` (call:leave and REST
        // leave/kick already set it; Vague 133 closed the last gap, the
        // forceCleanupParticipationAfterLeaveFailure fallback below). Without
        // it, a client tracking per-participant state keyed by `userId`
        // (e.g. `useRemoteCallAlerts`' screen-capturing Set) could never
        // clear a registered peer's entry on a disconnect-grace expiry
        // specifically. `userId` is already the resolved caller identity
        // passed into this method — no extra lookup needed.
        userId,
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

      // Room-membership leak fix — mirrors the same fix on call:end/
      // call:leave/call:force-leave: this only evicted THIS socket via
      // leaveCall(), leaving every other still-joined socket (e.g. a
      // second device/tab) a member of the now-dead room until its own
      // disconnect.
      await this.evictCallRoomSockets(io, participation.callSessionId);
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
    /**
     * La raison à graver quand ce départ termine l'appel. Le défaut sert le
     * seul appelant historique — l'expiration d'une fenêtre de grâce, un
     * arrachement de socket. Une fin d'APPARTENANCE, elle, n'a rien perdu :
     * elle passe `completed`, ce que produit déjà un raccroché ordinaire, et
     * n'oblige donc aucun client à connaître une raison de plus.
     */
    endReasonHint?: CallEndReason;
  }): Promise<void> {
    const { io, participation, userId, endReasonHint = CallEndReason.connectionLost } = opts;
    try {
      const leftSession = await this.callService.leaveCall({
        callId: participation.callSessionId,
        userId,
        participantId: participation.participantId,
        // Le défaut (`connectionLost`) sert le chemin d'origine : une
        // expiration de fenêtre de grâce (voir onDisconnectGraceExpired) —
        // un arrachement de socket qui n'a jamais reconnecté, jamais un
        // call:leave/call:end explicite. Il reflète la même raison que la
        // branche de repli ci-dessous grave via forceEndOrphanedCallSession.
        endReasonHint
      });
      // Cache eviction now lives inside broadcastParticipantLeftResult, so
      // both this caller and AuthHandler's anonymous path get it.
      await this.broadcastParticipantLeftResult({ io, leftSession, participation, userId });

      logger.info('✅ Socket: participation left call', {
        callId: participation.callSessionId,
        userId,
        endReasonHint
      });
    } catch (leaveError) {
      await this.forceCleanupParticipationAfterLeaveFailure({ io, participation, userId, leaveError });
    }
  }

  /**
   * Sort un membre des appels EN COURS du fil dont il vient de perdre
   * l'appartenance — quitté, banni, retiré par un modérateur, fil supprimé
   * pour soi.
   *
   * ─── Pourquoi ce verbe existe ───────────────────────────────────────────
   *
   * La room d'un appel (`ROOMS.call(callId)`) n'est PAS celle de la
   * conversation (`ROOMS.conversation(id)`) : sortir quelqu'un de la seconde
   * le laisse entièrement dans la première. Et rien en aval ne le rattrape —
   * l'autorisation du relais `call:signal` se lit sur la ligne
   * `CallParticipant` (`!p.leftAt`), jamais sur l'appartenance à la
   * conversation. Un membre banni pendant l'appel restait donc DEDANS :
   * signalisation relayée, média P2P établi, transcriptions et traductions
   * de tous les autres servies, dans un fil dont il vient d'être exclu.
   *
   * ─── Et il ne pouvait pas en sortir seul ────────────────────────────────
   *
   * `call:force-leave` — le seul verbe qui retire quelqu'un des appels d'une
   * conversation — commence par exiger `Participant.isActive: true`. La perte
   * du droit fait donc taire la commande de RETRAIT elle-même : c'est
   * exactement le défaut que le cycle 74 a payé sur
   * `handleLiveLocationStop`, ici d'un cran plus cher parce que ce qui
   * survit n'est pas une épingle figée mais un micro ouvert.
   *
   * ─── Ce que la CLÔTURE, elle, ne fait toujours pas ──────────────────────
   *
   * `announceConversationClosed` laisse délibérément vivre les appels d'un
   * fil clos : « raccrocher au nez de gens qui se parlent serait une
   * régression » (cycle 72, § 6). L'argument tient parce que la clôture ne
   * retire le droit de personne — tous les interlocuteurs restent membres.
   * Il s'INVERSE pour la fin d'appartenance : c'est précisément parce que le
   * partant n'a plus le droit d'être là qu'il faut le sortir.
   *
   * ─── L'ordre, et l'identité de la ligne ─────────────────────────────────
   *
   * `leaveParticipationAndBroadcast` diffuse `call:participant-left` (et
   * `call:ended` s'il ne restait que lui) dans la room de l'appel AVANT que
   * l'éviction ne s'y produise : c'est par cette room que l'appareil du
   * partant apprend qu'il doit démonter sa `RTCPeerConnection`, et par elle
   * que les restants démontent la leur — ce qui coupe le média P2P que
   * l'éviction seule, purement serveur, ne toucherait jamais.
   *
   * S'y ajoute `call:force-leave` vers la room PERSONNELLE du sorti : c'est
   * la seule phrase qui dise « c'est TOI qu'on sort » plutôt que « un pair
   * s'en va », et la seule room que l'éviction ne touche pas.
   *
   * La recherche s'appuie sur `participant: { userId, conversationId }` et
   * n'exige AUCUN `isActive` : la ligne vient d'être passée à `false` par la
   * route appelante, et la lire ainsi reproduirait le silence même qu'on
   * corrige.
   *
   * Ne rejette JAMAIS : l'appelant est une route qui a déjà commis son
   * écriture (bannissement, départ, retrait) et dont le succès ne doit pas
   * dépendre de cette hygiène.
   */
  async endCallParticipationForDepartedMember(opts: {
    io: SocketIOServer;
    conversationId: string;
    userId: string;
  }): Promise<void> {
    const { io, conversationId, userId } = opts;

    try {
      // Audit C5 — `{leftAt: null}` seul manque les documents Mongo dont le
      // champ n'a jamais été écrit ; même paire que le chemin disconnect.
      const participations = await this.prisma.callParticipant.findMany({
        where: {
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
          participant: { userId, conversationId }
        },
        include: { callSession: true }
      });

      for (const participation of participations) {
        // Une ligne `leftAt: null` sur un appel déjà terminal est de la
        // comptabilité résiduelle, pas un appel vivant — même garde que le
        // chemin disconnect.
        if ((CALL_TERMINAL_STATUSES as readonly string[]).includes(participation.callSession.status)) continue;

        const callId = participation.callSessionId;

        // Une fenêtre de grâce encore armée pour ce membre n'a plus d'objet :
        // il ne peut plus revenir dans ce fil, donc plus dans cet appel.
        this.cancelDisconnectGrace(callId, userId);

        await this.leaveParticipationAndBroadcast({
          io,
          participation: participation as unknown as DisconnectParticipation,
          userId,
          endReasonHint: CallEndReason.completed
        });

        // `leaveParticipationAndBroadcast` délègue à `CallService.leaveCall`,
        // qui clear déjà `ringingTimeouts` lui-même — mais SEULEMENT quand ce
        // partant était le DERNIER participant actif (branche
        // `isLastParticipant`). Pour un appel de groupe qui continue pour
        // d'autres invités encore non répondus, `leaveCall` laisse
        // délibérément le timer armé, exactement comme `call:signal` (answer)
        // le fait pour la même raison. Un `clearRingingTimeout(callId)`
        // INCONDITIONNEL ici — comme `call:end`/`call:leave`/`call:force-leave`
        // avant la Vague 164 — leur ferait perdre leur notification d'appel
        // manqué. Seule l'offre bufferisée du partant n'a plus de
        // destinataire (voir clearBufferedOfferFor) : elle est scopée au
        // partant, donc toujours sûre à nettoyer ici.
        this.clearBufferedOfferFor(callId, userId, participation.participantId);

        // Et l'écran du sorti, que rien d'autre ne referme. `call:participant
        // -left` dit aux RESTANTS qu'un pair s'en va ; il ne dit à personne
        // « c'est TOI qu'on sort ». `call:force-leave` porte exactement cette
        // phrase, et iOS l'implémente déjà entièrement (démontage WebRTC +
        // clôture de la session CallKit) — le gateway ne l'avait simplement
        // jamais émis. Vers la room PERSONNELLE : c'est la seule que
        // l'éviction ci-dessous ne touche pas, donc la seule qui reste
        // atteignable quel que soit l'ordre.
        io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CALL_FORCE_LEAVE, {
          callId,
          reason: 'membership_ended'
        });

        // L'éviction ne vise QUE les appareils du partant : un appel de
        // groupe continue pour ceux qui restent. Elle passe par la room
        // personnelle — la même clé que `endConversationMembership` — parce
        // que ce verbe n'a pas de socket appelant à interroger.
        await this.evictDepartedMemberFromCallRoom(io, callId, userId);

        logger.info('📞 Membre sorti de l\'appel avec son appartenance', {
          callId,
          conversationId,
          userId
        });
      }
    } catch (error) {
      logger.error('❌ Échec de la sortie d\'appel d\'un membre sortant', {
        conversationId,
        userId,
        error
      });
    }
  }

  /**
   * Sort les seuls appareils du partant de la room d'un appel. Sœur
   * user-scopée de `evictCallRoomSockets`, qui vide la room entière quand
   * l'appel LUI-MÊME est terminé.
   */
  private async evictDepartedMemberFromCallRoom(
    io: SocketIOServer,
    callId: string,
    userId: string
  ): Promise<void> {
    const userSockets = await io.in(ROOMS.user(userId)).fetchSockets();
    await Promise.all(userSockets.map((s) => s.leave(ROOMS.call(callId))));
  }

  /**
   * CALL-RESILIENCE — the force-cleanup fallback for a participation whose
   * `leaveCall` rejected (DB error, validation): stamp `leftAt` directly,
   * force-end the session when it was the last participant, and fan out the
   * same participant-left/call-ended/summary/room-eviction sequence. Without
   * it a failed leave leaves a zombie participant until the ~120s
   * `CallCleanupService` GC.
   *
   * Public for the same reason as `broadcastParticipantLeftResult`:
   * `AuthHandler`s anonymous-guest disconnect path runs `leaveCall` itself
   * (this handler cannot resolve anonymous participations — its lookup is
   * keyed on `participant.userId`) and only logged when it threw, so a guest
   * whose leave hit a DB error stayed a zombie while a registered user in the
   * exact same situation was force-cleaned.
   *
   * Never rejects — an unusable fallback must not abort the caller’s loop
   * over the remaining participations.
   */
  async forceCleanupParticipationAfterLeaveFailure(opts: {
    io: SocketIOServer;
    participation: DisconnectParticipation;
    userId: string;
    leaveError: unknown;
  }): Promise<void> {
    const { io, participation, userId, leaveError } = opts;
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

      // Invariant "every path that writes leftAt evicts the signal cache"
      // (see invalidateSignalSession) — must run AFTER the write commits,
      // like every other call site. Invalidating before the transaction let
      // a `call:signal` racing the in-flight write force a fresh read of the
      // still-uncommitted (pre-write) session and repopulate the cache with
      // a stale "not left" snapshot that then survived the full TTL.
      this.invalidateSignalSession(participation.callSessionId);

      io.to(ROOMS.call(participation.callSessionId)).emit(
        CALL_EVENTS.PARTICIPANT_LEFT,
        {
          callId: participation.callSessionId,
          participantId: participation.id,
          // Vague 133 — Vague 132's own comment above claimed
          // broadcastParticipantLeftResult was "the only PARTICIPANT_LEFT
          // emit site that omitted `userId`", but this sibling fallback
          // (reached when leaveCall itself throws — DB blip, validation
          // failure) still omitted it. `userId` is already in scope (see
          // destructure above) — every client that resolves identity by
          // `userId` (VideoCallInterface, useRemoteCallAlerts) silently
          // no-ops specifically on this fallback path, leaving the other
          // participants' UI with a stale tile/zombie RTCPeerConnection.
          userId,
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
            duration: forceEnded.duration,
            status: forceEnded.status
          });

          const dcForceEndedEvent: CallEndedEvent = {
            callId: participation.callSessionId,
            duration: forceEnded.duration,
            endedBy: userId,
            reason: forceEnded.endReason
          };
          await this.broadcastCallEnded(
            io,
            participation.callSessionId,
            participation.callSession.conversationId,
            dcForceEndedEvent
          );
          await this.postCallSummary(participation.callSessionId);
          if (forceEnded.status === CallStatus.missed) {
            /* istanbul ignore next -- handleMissedCall has its own internal catch and never rejects */
            this.handleMissedCall(participation.callSessionId).catch((err) => {
              logger.error('❌ handleMissedCall failed after force-cleanup on disconnect error', {
                callId: participation.callSessionId,
                err
              });
            });
          }

          // Room-membership leak fix — same reasoning as the happy path
          // above: this force-cleanup branch also terminates the call
          // session and must evict every remaining socket from its room.
          await this.evictCallRoomSockets(io, participation.callSessionId);
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

  /**
   * §4.6 — store the latest signal bound for a given recipient, sweeping
   * expired entries. Keyed `${callId}:${signal.to}` (not just `callId`): an
   * offer buffered for the callee and an answer buffered for the caller are
   * independent recipients on the SAME call and must not overwrite each
   * other's slot.
   */
  private bufferOffer(callId: string, signal: CallSignalEvent): void {
    const now = Date.now();
    for (const [key, entry] of this.bufferedOffers) {
      if (now - entry.bufferedAt > CallEventsHandler.OFFER_BUFFER_TTL_MS) {
        this.bufferedOffers.delete(key);
      }
    }
    this.bufferedOffers.set(`${callId}:${signal.signal.to}`, { signal, bufferedAt: now });
  }

  /**
   * §4.6 — drop EVERY buffered signal for a call. Entries are keyed
   * `${callId}:${to}` (one per recipient, see `bufferOffer`), so this sweeps
   * all matching keys rather than a single one — correct ONLY when the call
   * itself is ending for EVERYONE (every recipient's slot is equally moot).
   * A per-participant leave on a call that CONTINUES for others must use
   * `clearBufferedOfferFor` instead — see its doc comment for the group-call
   * bug this split fixes.
   */
  private clearBufferedOffer(callId: string): void {
    const prefix = `${callId}:`;
    for (const key of this.bufferedOffers.keys()) {
      if (key.startsWith(prefix)) {
        this.bufferedOffers.delete(key);
      }
    }
  }

  /**
   * Drop only the buffered signal slot(s) addressed to ONE specific
   * participant — by both identity spaces, since `signal.to` (and therefore
   * the map key) may be keyed by either a `User.id` or a `Participant.id`
   * depending on which the sender resolved (mirrors `bufferedOfferFor`'s own
   * dual-key lookup).
   *
   * Group-call bug this fixes (calling-stack audit 2026-08-16, extended
   * Vague 138): the buffer is deliberately per-RECIPIENT (`bufferOffer`'s
   * own doc comment — an offer buffered for one participant and another
   * buffered for a second participant on the SAME call are independent
   * slots). But several call sites used to clear via `clearBufferedOffer`
   * (whole-call sweep) whenever only ONE recipient's slot was actually known
   * to be moot — regardless of whether the call was ending for everyone or
   * continuing for the rest. Correct for a 1:1 call (the only shape that
   * existed when §4.6 was written), but wrong the moment a GROUP call
   * continues past that one recipient: e.g. participant D leaving (or D's
   * own stale buffered offer, sender long gone, being dropped on D's
   * `call:join`) wiped a still-pending buffered offer meant for a totally
   * unrelated, still-active participant C (e.g. C's socket hadn't (re)joined
   * the call room yet), permanently starving C's mesh connection to whoever
   * sent it — `bufferedOfferFor` would find nothing on C's eventual
   * `call:join` and never replay it. Used by: `call:leave`, `call:force-leave`,
   * `call:end` (group-continues branch), and `call:join`'s stale-sender drop.
   */
  private clearBufferedOfferFor(callId: string, ...participantIdentities: readonly (string | null | undefined)[]): void {
    for (const id of participantIdentities) {
      if (!id) continue;
      this.bufferedOffers.delete(`${callId}:${id}`);
    }
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
   * §4.6 — returns the buffered signal for a call IF one is destined for the
   * (re)joining participant and not expired; otherwise null. Does NOT consume
   * the entry — a participant that churns again must be able to recover, and
   * re-delivery is epoch-safe.
   */
  private bufferedOfferFor(callId: string, joiningUserId: string, joiningParticipantId: string | null): CallSignalEvent | null {
    const key = this.bufferedOffers.has(`${callId}:${joiningUserId}`)
      ? `${callId}:${joiningUserId}`
      : (joiningParticipantId !== null && this.bufferedOffers.has(`${callId}:${joiningParticipantId}`))
        ? `${callId}:${joiningParticipantId}`
        : null;
    if (key === null) return null;
    const entry = this.bufferedOffers.get(key)!;
    if (Date.now() - entry.bufferedAt > CallEventsHandler.OFFER_BUFFER_TTL_MS) {
      this.bufferedOffers.delete(key);
      return null;
    }
    return entry.signal;
  }

  /**
   * call:end's fast-path broadcast tells the ROOM (only) the call ended
   * before the authoritative endCall() write runs (see the comment at that
   * call site) — it never reaches conversation members who haven't joined
   * the call room (a still-ringing callee). If the authoritative write never
   * completes — the ender doesn't resolve to a participant, or endCall()
   * itself throws — the CallSession would otherwise be left ACTIVE, blocking
   * every future call:initiate in the conversation until
   * CallCleanupService's GC tier reaps it (~120s).
   *
   * Audit Vague 26 (sibling-drift) — this used to only force-end the DB row
   * and conditionally call handleMissedCall, silently SKIPPING the wide
   * call:ended fanout (broadcastCallEnded: clearQualityDegradedStreaks +
   * the same call+conversation+every-member's-user-room audience as
   * call:initiated + the phantom-ring call_cancel push), and skipping
   * postCallSummary (the chat "Appel …" system message) — unlike its exact
   * sibling, the disconnect force-cleanup path a few hundred lines up, which
   * already does all of this. A still-ringing callee whose caller's
   * call:end hit this failure branch would keep ringing (exactly the prod
   * incident 2026-07-03 06:14 that broadcastCallEnded's fanout exists to
   * prevent), the quality-streak map would leak, and no summary message
   * would appear in chat. Fixed by mirroring the disconnect force-cleanup
   * path exactly: broadcastCallEnded + postCallSummary + conditional
   * handleMissedCall.
   *
   * Best-effort: a failure here is logged, not thrown — this handler's
   * listener isn't awaited by Socket.IO's emit() (see the gateway's
   * async-EventEmitter hazard note), so letting this reject would surface as
   * an unhandled rejection instead of the clean error response already sent.
   */
  private async forceEndOrphanedCallAfterOptimisticBroadcast(
    io: SocketIOServer,
    callId: string,
    endedBy: string,
    reason?: string
  ): Promise<void> {
    try {
      // Same normalization requirement as the fast-path broadcast in
      // call:end — `reason` here can be raw client input (see the
      // `call:end` catch-block call site), never a validated CallEndReason.
      const forceEnded = await this.callService.forceEndOrphanedCallSession(callId, this.callService.resolveEndReason(reason));
      if (!forceEnded) return;

      // `forceEndOrphanedCallSession` stamped `leftAt` on every still-open
      // participant, so honour the same invariant the happy paths follow (see
      // `invalidateSignalSession`): this error-recovery helper runs from the
      // call:end/call:leave/call:force-leave catch blocks, where the rolled-back
      // transaction skipped their inline eviction — without this, a departed
      // participant's `call:signal` (any type but `answer`) is relayed off the
      // stale 2s snapshot for up to the TTL window.
      this.invalidateSignalSession(callId);

      const forceEndedEvent: CallEndedEvent = {
        callId,
        duration: forceEnded.duration,
        endedBy,
        reason: forceEnded.endReason
      };
      await this.broadcastCallEnded(io, callId, forceEnded.conversationId, forceEndedEvent);
      // Fire-and-forget — same ack-latency reasoning as call:end's happy
      // path: this helper runs on call:end's error branches too, still ahead
      // of that handler's own `ack?.({ success: false })`.
      /* istanbul ignore next -- postCallSummary has its own internal catch and never rejects */
      this.postCallSummary(callId).catch((err) => {
        logger.error('❌ postCallSummary failed after force-end orphaned call', { callId, err });
      });

      if (forceEnded.status === CallStatus.missed) {
        // Mirror the sibling call:end/call:leave paths (see their doc
        // comments): a call force-ended before it was ever answered must
        // still notify the other party it was missed, not just resolve the
        // DB row — otherwise the callee never sees a missed-call banner/badge.
        /* istanbul ignore next -- handleMissedCall has its own internal catch and never rejects */
        await this.handleMissedCall(callId).catch((err) => {
          logger.error('❌ handleMissedCall failed after force-end orphaned call', { callId, err });
        });
      }

      // Room-membership leak fix — mirrors the identical fix on the
      // call:end/call:leave/call:force-leave happy paths: this recovery path
      // is reached from every one of their catch blocks, so leaving it out
      // here left every OTHER socket still joined to the room (not just the
      // acting user's) stuck as a member of a now-permanently-dead room
      // until its own unrelated disconnect.
      await this.evictCallRoomSockets(io, callId);
    } catch (err) {
      logger.error('❌ Failed to force-end orphaned call after call:end failure', { callId, error: err });
    }
  }

  /**
   * Evict every socket from a call's room. Sibling of the identical inline
   * `fetchSockets()` + `leave()` pattern already run on call:end/call:leave/
   * call:force-leave's happy paths — without it, a still-joined socket (e.g.
   * a second device/tab) keeps a stale Socket.IO room membership for the
   * rest of its connection lifetime once the call ends via this path.
   */
  private async evictCallRoomSockets(io: SocketIOServer, callId: string): Promise<void> {
    const socketsInCallRoom = await io.in(ROOMS.call(callId)).fetchSockets();
    await Promise.all(socketsInCallRoom.map((s) => s.leave(ROOMS.call(callId))));
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
   * Resolve the caller's own CallParticipant row, verifying they are an
   * ACTIVE participant of THIS specific call — unlike
   * `resolveParticipantIdFromCall`, which only checks conversation
   * membership. A conversation member who never joined (or already left)
   * this call must not pass authorization checks gating writes against call
   * state/stats (quality reports, media toggles, background/foreground,
   * reconnect status).
   *
   * Returns BOTH identifier spaces the caller is known by:
   * - `participantId` — `CallParticipant.participantId`, the FK to the
   *   conversation's `Participant.id` row. Legacy value, still relayed
   *   verbatim on `call:quality-alert`/`call:screen-capture-alert` for
   *   backward compat.
   * - `userId` — `Participant.userId` for a registered user, falling back to
   *   `participantId` for an anonymous guest (no `User` row to point at).
   *   Mirrors `toCallParticipantResponse`'s own `userId` derivation exactly
   *   (`call-session-response.ts`), which is what every call ROSTER entry's
   *   `.userId` is populated from — a side-channel alert that only carries
   *   `participantId` can never match a roster lookup keyed by `userId` for a
   *   registered peer (Vague 132: both alert overlays silently rendered a
   *   blank peer name because of exactly this mismatch).
   */
  private async resolveActiveCallParticipant(
    userId: string,
    callId: string
  ): Promise<{ participantId: string; userId: string } | null> {
    const resolved = await this.resolveActiveCallParticipantDetailed(userId, callId);
    if (!resolved) return null;
    return { participantId: resolved.participantId, userId: resolved.userId };
  }

  /**
   * Same resolution as `resolveActiveCallParticipant`, but also surfaces the
   * call-type/roster context needed by `call:end` to tell a genuine
   * end-for-everyone apart from a group-call participant merely hanging up
   * on themselves (calling-stack audit 2026-08-16) — computed from the SAME
   * `getCallSession` read every other call site here already pays for, so
   * exposing it costs no extra query for the 9+ existing callers that only
   * destructure `{ participantId, userId }`.
   */
  private async resolveActiveCallParticipantDetailed(
    userId: string,
    callId: string
  ): Promise<{
    id: string;
    participantId: string;
    userId: string;
    mode: Awaited<ReturnType<CallService['getCallSession']>>['mode'];
    isDirectCall: boolean;
    hasOtherActiveParticipants: boolean;
  } | null> {
    try {
      const callSession = await this.callService.getCallSession(callId);
      const activeParticipant = callSession.participants.find(
        (p) => ((p.participant?.userId ?? p.participantId) === userId) && !p.leftAt
      );
      if (!activeParticipant) return null;
      return {
        id: activeParticipant.id,
        participantId: activeParticipant.participantId,
        userId: activeParticipant.participant?.userId ?? activeParticipant.participantId,
        mode: callSession.mode,
        isDirectCall: callSession.conversation?.type === 'direct',
        hasOtherActiveParticipants: callSession.participants.some(
          (p) => !p.leftAt && p.id !== activeParticipant.id
        )
      };
    } catch (error) {
      // A genuine "not a participant" resolves via the `.find()` above
      // returning undefined, never via this catch — reaching here means
      // getCallSession itself failed (DB timeout, connection drop, bug), which
      // is otherwise indistinguishable from "not a participant" and silently
      // drops the caller's toggle/heartbeat/quality-report with zero trace.
      logger.warn('resolveActiveCallParticipant: getCallSession failed, treating caller as unauthorized', {
        userId,
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Thin wrapper over `resolveActiveCallParticipant` for the (majority) call
   * sites that only need the legacy `CallParticipant.participantId` value.
   */
  private async resolveActiveCallParticipantId(userId: string, callId: string): Promise<string | null> {
    const resolved = await this.resolveActiveCallParticipant(userId, callId);
    return resolved?.participantId ?? null;
  }

  /**
   * Authorizes a callee declining a call they were invited to but never
   * joined. `call:join` is the only path that creates a CallParticipant row
   * for a callee — `call:initiate` creates one only for the initiator — so a
   * callee who taps "Decline" while still ringing legitimately has NO row
   * for `resolveActiveCallParticipantId` to find, and that check correctly
   * (by design) returns null for them. That is a DIFFERENT case from the one
   * 2026-07-10b actually closed: a caller who HAD a row and left it, then
   * replayed `call:end` from a stale socket. Disambiguate explicitly — a
   * caller who already has ANY row for this call (active or left) must keep
   * going through `resolveActiveCallParticipantId` and stay blocked here.
   * Decline-before-join regression fix, 2026-08-14.
   */
  private async resolvePreJoinDeclineParticipantId(userId: string, callId: string): Promise<string | null> {
    try {
      const callSession = await this.callService.getCallSession(callId);
      // Pre-join decline only makes sense while nobody has ever answered —
      // once the call is truly under way, a "never joined" decline has no
      // meaning and hangup must go through the active-participant path.
      if (callSession.answeredAt) return null;
      const hasAnyRow = callSession.participants.some(
        (p) => (p.participant?.userId ?? p.participantId) === userId
      );
      if (hasAnyRow) return null;
      // No CallParticipant row at all: this user never joined this call.
      // Only a genuine conversation member may decline it — keeps a
      // stranger who merely guessed/observed the callId from ending it.
      return this.resolveParticipantIdFromCall(userId, callId);
    } catch (error) {
      logger.warn('resolvePreJoinDeclineParticipantId: getCallSession failed, treating caller as unauthorized', {
        userId,
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Resolve the caller as an active participant of THIS call, returning both
   * the authorization proof (`participantId`) and the server-trusted
   * `displayName` (user.displayName ?? username) stamped onto relayed
   * transcription segments. Same authorization semantics as
   * `resolveActiveCallParticipantId`; the display name rides along because
   * `getCallSession` already includes each participant's user record — no
   * extra query. `null` displayName (no linked user) simply omits the field
   * from the wire, receivers fall back to their local roster.
   */
  private async resolveActiveCallSpeaker(
    userId: string,
    callId: string
  ): Promise<{ participantId: string; displayName: string | null } | null> {
    try {
      const callSession = await this.callService.getCallSession(callId);
      const activeParticipant = callSession.participants.find(
        (p) => ((p.participant?.userId ?? p.participantId) === userId) && !p.leftAt
      );
      if (!activeParticipant) return null;
      const user = activeParticipant.participant?.user;
      return {
        participantId: activeParticipant.participantId,
        displayName: user?.displayName ?? user?.username ?? null
      };
    } catch (error) {
      // See resolveActiveCallParticipantId — same rationale: a getCallSession
      // failure must be logged, not silently folded into "not a participant".
      logger.warn('resolveActiveCallSpeaker: getCallSession failed, treating caller as unauthorized', {
        userId,
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Resolve the caller's own CallParticipant.participantId for THIS call,
   * regardless of `leftAt` — unlike `resolveActiveCallParticipantId`, a
   * participant who has already left this call still resolves (needed by
   * call:analytics, which fires post-hangup). Unlike
   * `resolveParticipantIdFromCall`, which only checks conversation
   * membership, a conversation member who never joined this specific call
   * resolves to null — closing the gap where any member of the conversation
   * could submit fabricated telemetry against a call they were never part
   * of.
   */
  private async resolveEverCallParticipantId(userId: string, callId: string): Promise<string | null> {
    try {
      const callSession = await this.callService.getCallSession(callId);
      const everParticipant = callSession.participants.find(
        (p) => (p.participant?.userId ?? p.participantId) === userId
      );
      return everParticipant?.participantId ?? null;
    } catch (error) {
      // See resolveActiveCallParticipantId — same rationale: a getCallSession
      // failure must be logged, not silently folded into "not a participant".
      logger.warn('resolveEverCallParticipantId: getCallSession failed, treating caller as unauthorized', {
        userId,
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
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
    return { code: 'MEDIA_TOGGLE_FAILED', message: fallbackMessage } as CallError;
  }

  /**
   * Shared body of `call:toggle-audio` / `call:toggle-video` — the two
   * handlers were ~90-line copies differing only by the `mediaType` literal,
   * which meant every future fix (auth, rate limit, validation, participant
   * resolution) had to be applied twice and could silently drift between
   * audio and video. CVE-002 (rate limiting) / CVE-006 (input validation)
   * comments below apply identically to both media types.
   */
  private async handleMediaToggle(
    socket: Socket,
    getUserId: (socketId: string) => string | undefined,
    data: CallMediaToggleClientEvent,
    mediaType: 'audio' | 'video'
  ): Promise<void> {
    try {
      const userId = getUserId(socket.id);
      if (!userId) {
        socket.emit(CALL_EVENTS.ERROR, {
          code: 'NOT_AUTHENTICATED',
          message: 'User not authenticated',
          callId: data?.callId
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
          details: validationDetails ? { issues: validationDetails } : undefined,
          callId: data?.callId
        } as CallError);
        return;
      }

      logger.info(`📞 Socket: call:toggle-${mediaType}`, {
        socketId: socket.id,
        userId,
        callId: data.callId,
        enabled: data.enabled
      });

      // Audit P2-GW-5 — `updateParticipantMedia` queries on
      // `participantId` (Participant.id ObjectId), NOT userId. Passing
      // userId here matched nothing and the toggle silently failed.
      // Resolve to the real participantId before calling the service.
      const resolved = await this.resolveActiveCallParticipant(userId, data.callId);
      if (!resolved) {
        socket.emit(CALL_EVENTS.ERROR, {
          code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
          message: 'You are not a participant in this call',
          callId: data?.callId
        } as CallError);
        return;
      }
      const { participantId } = resolved;
      await this.callService.updateParticipantMedia(
        data.callId,
        participantId,
        mediaType,
        data.enabled
      );

      // P0-3 — broadcast to the OTHER participants only. The sender already
      // updated its own state locally and must NOT receive its own echo:
      // iOS treats any received call:media-toggled as the REMOTE peer's state
      // (drives the muted indicator / avatar placeholder). `socket.to`
      // excludes the sender; `io.to` would include it.
      //
      // Vague 140 — `participantId` alone (CallParticipant.participantId, the
      // FK to Participant.id) never matches a web roster entry's `.id`
      // (CallParticipant.id, its own PK) NOR its `.userId`/`.participantId`
      // lookup fields (the latter is never populated client-side) for a
      // registered peer — `updateParticipant` silently no-op'd on every
      // remote mute/camera toggle, leaving the peer's indicator permanently
      // stale. Include `userId`, same fix/rationale as `call:quality-alert`/
      // `call:screen-capture-alert` (Vague 132).
      const toggleEvent: CallMediaToggleEvent = {
        callId: data.callId,
        participantId,
        userId: resolved.userId,
        mediaType,
        enabled: data.enabled
      };

      socket.to(ROOMS.call(data.callId)).emit(
        CALL_EVENTS.MEDIA_TOGGLED,
        toggleEvent
      );

      logger.info(`✅ Socket: ${mediaType === 'audio' ? 'Audio' : 'Video'} toggled`, {
        callId: data.callId,
        userId,
        enabled: data.enabled
      });
    } catch (error) {
      logger.error(`❌ Socket: Error toggling ${mediaType}`, error);

      socket.emit(CALL_EVENTS.ERROR, { ...this.mapMediaToggleError(error, `Failed to toggle ${mediaType}`), callId: data?.callId } as CallError);
    }
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
   * Live-call message — inject the manager's `broadcastMessageEdited` so the
   * terminal upsert can fan the live→terminal transition (`message:edited`
   * full payload + conversation preview + offline enqueue) to clients.
   */
  setMessageUpdateBroadcaster(broadcaster: (message: unknown, conversationId: string) => Promise<void>): void {
    this.messageUpdateBroadcaster = broadcaster;
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
   * Public entry point for the REST `DELETE /calls/:id` (end) and
   * `.../participants/:pid` (leave) routes, via
   * `CallService.setCallEndedBroadcaster` (wired in server.ts). Those routes
   * hold no `io`, so they delegate the `call:ended` fanout here. Thin wrapper
   * over the private `broadcastCallEnded` — the pair on a socket now learns of
   * a REST-terminated call in real time instead of waiting for the ~120s GC.
   */
  async broadcastCallEndedForTerminatedCall(
    io: SocketIOServer,
    callId: string,
    conversationId: string | undefined,
    endedEvent: CallEndedEvent
  ): Promise<void> {
    return this.broadcastCallEnded(io, callId, conversationId, endedEvent);
  }

  /**
   * Public entry point for the REST `DELETE /calls/:id/participants/:pid`
   * (leave/kick) route, via `CallService.setParticipantLeftBroadcaster`
   * (wired in server.ts). That route holds no `io`, so it delegates the
   * `call:participant-left` fanout here — sibling of
   * `broadcastCallEndedForTerminatedCall`, but unconditional: this fires for
   * every REST leave, whether or not the call itself becomes terminal, same
   * as the socket `call:leave` handler.
   */
  broadcastParticipantLeftForRest(io: SocketIOServer, event: CallParticipantLeftEvent): void {
    io.to(ROOMS.call(event.callId)).emit(CALL_EVENTS.PARTICIPANT_LEFT, event);
  }

  /**
   * Translates a final transcription segment to each active participant's
   * preferred language and emits a `TRANSLATED_SEGMENT` event per language.
   * Only fires for final segments (isFinal=true) to avoid flooding ZMQ.
   * Falls back to emitting the original text if translation fails.
   *
   * Security fix 2026-08-13: every relayed segment is stamped with
   * `speakerUserId` (the server-authenticated caller resolved by
   * `resolveActiveCallParticipantId` in the caller), never the
   * client-supplied `data.segment.speakerId`. Same rationale as
   * call:backgrounded/call:foregrounded/call:screen-capture-detected: the
   * gateway authorizes that the sender is an active participant of THIS
   * call, but that says nothing about who the free-form `speakerId` field
   * names — trusting it let any participant put words in another
   * participant's mouth in the live-caption UI and, for final segments, in
   * the persisted call transcript.
   */
  /**
   * Single builder for every `TRANSLATED_SEGMENT` emission (untranslated
   * relay, no-target, no-zmq, translation success, timeout and error paths) —
   * the journal metadata (`id`, `speakerDisplayName`, `capturedAtMs`) must be
   * identical on all of them for cross-transport merge on the clients.
   * `capturedAtMs` falls back to reception time for legacy clients that don't
   * stamp their capture wall clock yet.
   */
  private buildTranslatedSegment(
    data: CallTranscriptionSegmentEvent,
    speaker: { userId: string; displayName: string | null },
    targetLanguage: string,
    translatedText?: string
  ): CallTranslatedSegmentEvent {
    return {
      callId: data.callId,
      segment: {
        ...(data.segment.id !== undefined ? { id: data.segment.id } : {}),
        text: data.segment.text,
        ...(translatedText !== undefined ? { translatedText } : {}),
        speakerId: speaker.userId,
        ...(speaker.displayName !== null ? { speakerDisplayName: speaker.displayName } : {}),
        startMs: data.segment.startMs,
        endMs: data.segment.endMs,
        isFinal: data.segment.isFinal,
        sourceLanguage: data.segment.language,
        targetLanguage,
        confidence: data.segment.confidence,
        capturedAtMs: data.segment.capturedAtMs ?? Date.now()
      }
    };
  }

  /**
   * Persiste un segment FINAL du journal (modèle Transcription) pour le
   * replay post-appel — décision produit 2026-08-13 : le transcript survit
   * à la suppression de l'app et de ses caches locaux. Ne REJETTE jamais
   * (échec → null + warn, le relais temps réel n'en dépend pas) ; le texte
   * n'est jamais loggé (donnée sensible).
   */
  private persistTranscriptionSegment(
    data: CallTranscriptionSegmentEvent,
    participantId: string
  ): Promise<string | null> {
    try {
      return this.prisma.transcription.create({
        data: {
          callSessionId: data.callId,
          participantId,
          source: 'client',
          segmentId: data.segment.id ?? null,
          text: data.segment.text,
          language: data.segment.language,
          confidence: data.segment.confidence,
          timestamp: new Date(data.segment.capturedAtMs ?? Date.now()),
          offsetMs: data.segment.startMs
        },
        select: { id: true }
      }).then(
        (row) => row.id,
        (err) => {
          logger.warn('Failed to persist call transcription segment', { callId: data.callId, err });
          return null;
        }
      );
    } catch (err) {
      logger.warn('Failed to persist call transcription segment', { callId: data.callId, err });
      return Promise.resolve(null);
    }
  }

  /**
   * Accroche la traduction ZMQ réussie au segment persisté (TranslationCall).
   * Fire-and-forget avec `.catch` propre (Leçon 230 : `void p` sans `.catch`
   * détache la promesse — un rejet tuerait le process sous Node 22).
   */
  private persistTranslation(
    persistedTranscriptionId: Promise<string | null> | null,
    targetLanguage: string,
    translatedText: string
  ): void {
    if (!persistedTranscriptionId) return;
    persistedTranscriptionId
      .then((transcriptionId) => {
        if (!transcriptionId) return null;
        return this.prisma.translationCall.create({
          data: { transcriptionId, targetLanguage, translatedText, model: 'nllb' }
        });
      })
      .catch((err) => {
        logger.warn('Failed to persist call transcription translation', { targetLanguage, err });
      });
  }

  private async translateAndEmitSegment(
    socket: Socket,
    data: CallTranscriptionSegmentEvent,
    speaker: { userId: string; displayName: string | null },
    persistedTranscriptionId: Promise<string | null> | null = null
  ): Promise<void> {
    const activeParticipants = await this.prisma.callParticipant.findMany({
      where: { callSessionId: data.callId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
      select: {
        participant: {
          select: {
            userId: true,
            user: {
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true,
                deviceLocale: true
              }
            }
          }
        }
      }
    });

    // Prisme-first (systemLanguage > regionalLanguage > customDestinationLanguage
    // > deviceLocale > 'fr') — same resolver as resolveNotificationLangs above.
    // Reading only `systemLanguage` here used to strand any listener who
    // configured a regional/custom language instead into a hardcoded 'fr'.
    //
    // Grouped BY target language, listener userIds and all — the per-language
    // relay below must reach ONLY the listeners who resolved to that language,
    // never the whole call room (see `emitTranslatedSegmentTo`).
    const listenersByLanguage = new Map<string, string[]>();
    // Auditeurs qui lisent DÉJÀ la langue du locuteur : rien à traduire pour
    // eux, mais ils ont droit aux sous-titres comme tout le monde. Les
    // `continue` les écartaient de `listenersByLanguage`, et la diffusion à
    // la salle ci-dessous ne se déclenche que si PERSONNE ne demande de
    // traduction — donc dès qu'un SEUL auditeur en demandait une, tous les
    // auditeurs de même langue que le locuteur ne recevaient plus RIEN
    // (appel fr+fr+en : le francophone était muet côté sous-titres).
    // Ils sont désormais servis en ORIGINAL, sans aller-retour ZMQ.
    const sameLanguageListeners: string[] = [];
    for (const p of activeParticipants) {
      // Même prudence que `resolveActiveCallSpeaker` : la relation
      // `participant` peut manquer sur une ligne, et l'accès nu jetait —
      // l'exception remontait au try/catch du handler, tuant le relais
      // pour TOUS les auditeurs, pas seulement celui dont la ligne est
      // incomplète.
      const userId = p.participant?.userId;
      if (!userId || userId === speaker.userId) continue;
      const lang = resolveUserLanguage(p.participant.user ?? {}, { deviceLocale: p.participant.user?.deviceLocale ?? undefined });
      if (typeof lang !== 'string' || lang === data.segment.language) {
        sameLanguageListeners.push(userId);
        continue;
      }
      const listeners = listenersByLanguage.get(lang);
      if (listeners) listeners.push(userId);
      else listenersByLanguage.set(lang, [userId]);
    }
    const targetLanguages: string[] = [...listenersByLanguage.keys()];

    if (targetLanguages.length === 0) {
      socket.to(ROOMS.call(data.callId)).emit(
        CALL_EVENTS.TRANSLATED_SEGMENT,
        this.buildTranslatedSegment(data, speaker, data.segment.language)
      );
      return;
    }

    // Capture zmqClient once so TypeScript can narrow the type and inner
    // lambdas don't need force-unwrap (zmqClient could theoretically be
    // cleared between the outer check in handleTranscriptionSegment and the
    // async Promise execution inside Promise.allSettled).
    const zmqClient = this.zmqClient;
    if (!zmqClient) {
      logger.warn('[CallEventsHandler] translateAndEmitSegment called without zmqClient — relaying original', { callId: data.callId });
      socket.to(ROOMS.call(data.callId)).emit(
        CALL_EVENTS.TRANSLATED_SEGMENT,
        this.buildTranslatedSegment(data, speaker, data.segment.language)
      );
      return;
    }

    // Les auditeurs de même langue sont servis TOUT DE SUITE, en original :
    // leur sous-titre n'attend pas le retour ZMQ des autres langues.
    this.emitTranslatedSegmentTo(
      socket,
      sameLanguageListeners,
      this.buildTranslatedSegment(data, speaker, data.segment.language)
    );

    // Scoped to this call+segment (shared across the segment's target
    // languages, disambiguated below by taskId) — NOT the global
    // `translationCompleted` bus. Subscribing to the global event here used
    // to leave a listener (per segment × target language, up to 10s) on a
    // process-wide EventEmitter with no cap, so every translation completing
    // anywhere (chat messages, stories, other calls) re-ran every pending
    // call's taskId filter. Listener count is now bounded by this call's
    // active target languages instead of process-wide traffic.
    const messageId = `call-${data.callId}-${data.segment.startMs}`;
    const scopedEvent = `translationCompleted:${messageId}`;

    await Promise.allSettled(
      targetLanguages.map(async (targetLanguage) => {
        const listeners = listenersByLanguage.get(targetLanguage) ?? [];
        try {
          const taskId = await zmqClient.translateText(
            data.segment.text,
            data.segment.language,
            targetLanguage,
            messageId,
            data.callId
          );

          logger.debug('Call transcription segment translation requested', { callId: data.callId, taskId, targetLanguage });

          return new Promise<void>((resolve) => {
            const TIMEOUT_MS = 10_000;
            const timer = setTimeout(() => {
              zmqClient.off(scopedEvent, onResult);
              this.emitTranslatedSegmentTo(socket, listeners, this.buildTranslatedSegment(data, speaker, targetLanguage));
              resolve();
            }, TIMEOUT_MS);
            timer.unref?.();

            const onResult = (event: { taskId: string; result: { translatedText: string; targetLanguage: string } }) => {
              if (event.taskId !== taskId) return;
              clearTimeout(timer);
              zmqClient.off(scopedEvent, onResult);
              this.persistTranslation(persistedTranscriptionId, targetLanguage, event.result.translatedText);
              this.emitTranslatedSegmentTo(
                socket, listeners,
                this.buildTranslatedSegment(data, speaker, targetLanguage, event.result.translatedText)
              );
              resolve();
            };
            zmqClient.on(scopedEvent, onResult);
          });
        } catch (err) {
          logger.warn('Call transcription translation failed, relaying original', { callId: data.callId, targetLanguage, err });
          this.emitTranslatedSegmentTo(socket, listeners, this.buildTranslatedSegment(data, speaker, targetLanguage));
        }
      })
    );
  }

  /**
   * Broadcast one translated segment to exactly the listeners who resolved
   * to `targetLanguage` — never the whole call room. `translateAndEmitSegment`
   * used to relay every target language's translation to `ROOMS.call(callId)`
   * wholesale: in a 3+-language group call every peer received EVERY
   * language's caption event, and the client-side journal merge
   * (`upsertCallTranscriptEntry`, keyed on speaker+timing — not
   * `targetLanguage`) let whichever language arrived last silently overwrite
   * the others, so the reader's own Prisme language was not guaranteed to
   * win. Chained `.to()` calls (never a loop of separate `.emit()`s) so a
   * listener sitting in more than one addressed room still receives the
   * event exactly once.
   */
  private emitTranslatedSegmentTo(
    socket: Socket,
    userIds: readonly string[],
    payload: CallTranslatedSegmentEvent
  ): void {
    if (userIds.length === 0) return;
    const [first, ...rest] = userIds;
    rest
      .reduce((broadcast, userId) => broadcast.to(ROOMS.user(userId)), socket.to(ROOMS.user(first)))
      .emit(CALL_EVENTS.TRANSLATED_SEGMENT, payload);
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
      const result = await this.callService.createCallSummaryMessage(callId);
      if (!result) {
        return;
      }
      // `created` → the summary is a brand-new message (message:new fanout);
      // `updated` → the live "en cours" message was edited in-place to its
      // terminal state (message:edited full-payload fanout).
      const broadcaster = result.kind === 'updated'
        ? this.messageUpdateBroadcaster
        : this.messageBroadcaster;
      if (!broadcaster) {
        return;
      }
      await broadcaster(result.message, result.message.conversationId);
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
   * Live-call message — post the "Appel audio/vidéo en cours" system message
   * right after `call:initiate` succeeds (`kind: 'call-live'`, same
   * deterministic clientMessageId as the terminal summary, which will edit it
   * in-place). Same retry envelope as `postCallSummary`; failures are logged
   * and NEVER affect call setup — the terminal path then simply falls back to
   * creating the summary, the exact pre-live behaviour.
   */
  private async postLiveCallMessage(callId: string, attempt = 1): Promise<void> {
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 1000;
    try {
      const message = await this.callService.createLiveCallMessage(callId);
      if (!message || !this.messageBroadcaster) {
        return;
      }
      await this.messageBroadcaster(message, message.conversationId);
    } catch (error) {
      logger.error('[CallEventsHandler] Failed to post live call message', {
        callId,
        attempt,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt < MAX_ATTEMPTS) {
        await new Promise<void>(resolve => setTimeout(resolve, BASE_DELAY_MS * attempt));
        return this.postLiveCallMessage(callId, attempt + 1);
      }
      logger.error('[CallEventsHandler] Giving up on live call message after max attempts', {
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

    // GW6(c) — freshness stamp for the stale-foreground guard. Every inbound
    // engine packet (messages, acks, pongs — pongs flow every pingInterval
    // 25s on a healthy connection) proves the client end is alive. A socket
    // whose lastSeenAt goes stale while still flagged appForeground=true is a
    // zombie: the ringing fan-out stops trusting its foreground claim.
    socket.data.lastSeenAt = Date.now();
    const engineConn = (socket as { conn?: { on?: (event: string, cb: () => void) => void } }).conn;
    if (engineConn?.on) {
      engineConn.on('packet', () => {
        socket.data.lastSeenAt = Date.now();
      });
    }

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
    // Audit gateway calling-stack 2026-07-08 — this was the last call-adjacent
    // handler with no auth/rate-limit gate at all (every sibling lifecycle
    // event does). Impact per-event is minimal (flips a socket-local flag, no
    // DB write, no broadcast) but a flooding client should still be bounded
    // like every other handler here, not left as the one exception.
    socket.on(CLIENT_EVENTS.PRESENCE_APP_STATE, async (data: { foreground?: boolean }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;
        rememberAuth(userId);

        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.PRESENCE_APP_STATE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        socket.data.appForeground = data?.foreground === true;
      } catch (err) {
        // Was the one handler in this file with no try/catch — every async
        // Socket.IO listener here must have one (emit() doesn't await
        // rejected promises, so an uncaught throw here becomes an unhandled
        // rejection instead of a logged, contained failure).
        logger.error('presence:app-state failed', { error: callErrorMessageOf(err, String(err)) });
      }
    });

    // CALL-FIX 2026-06-06 — replay any IN-PROGRESS (ringing) call to a socket that
    // just (re)connected. A user who was offline/backgrounded/app-closed when the
    // call started missed the original call:initiated; on reconnect the client emits
    // `call:check-active` and we re-send call:initiated so the incoming banner /
    // CallKit appears immediately ("I come online and a call started 20s ago → I see
    // it"; "I open the Mac app → the banner shows"). Scoped to the user's
    // conversations, the ringing window (<60s), calls they did NOT initiate, and only
    // if they haven't already left. The client dedups by callId.
    socket.on(CLIENT_EVENTS.CALL_CHECK_ACTIVE, async () => {
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
            // `endedAt` is never explicitly written to `null` at call
            // creation (CallService.initiateCall omits it) — a plain
            // `endedAt: null` equality filter only matches an EXPLICIT
            // null, never an unset field, so it silently matched zero
            // rows for every real ringing call (audit calling-stack
            // 2026-08-04). Same class of bug as `leftAt`/`activeCallId`
            // elsewhere in this file — mirror their `isSet: false` guard.
            OR: [{ endedAt: null }, { endedAt: { isSet: false } }],
            initiatorId: { not: userId },
            // No `connecting` here — the FSM (CallService Item F) never
            // persists that status, so it can never match.
            status: { in: [CallStatus.initiated, CallStatus.ringing] },
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
        // Vague 177 — a leave-then-rejoin (network blip, app relaunch mid-ring)
        // never reuses the departed `CallParticipant` row (`joinCall` only
        // reuses a row while `!leftAt`), so a user can own MULTIPLE rows for
        // the SAME callSessionId: one departed, one active. Collapsing them
        // into a `Map<callSessionId, row>` kept only the LAST row `findMany`
        // (no `orderBy`, no ordering guarantee) happened to return, silently
        // discarding the other — a leave-then-rejoin is exactly the moment
        // `call:check-active` fires (it runs on reconnect), so this hit the
        // target scenario, not a corner case. `leftAllRows` instead reduces
        // per call: skip the replay only when EVERY row for that call has
        // `leftAt` set — one active row is always enough to keep replaying.
        const leftAllRowsByCall = new Map<string, boolean>();
        for (const p of myParticipants) {
          const key = p.callSessionId as string;
          const leftThisRow = Boolean((p as { leftAt: Date | null }).leftAt);
          leftAllRowsByCall.set(key, (leftAllRowsByCall.get(key) ?? true) && leftThisRow);
        }
        for (const c of activeCalls) {
          if (leftAllRowsByCall.get(c.id)) continue;

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
            // Same conversation context as the main call:initiate emit below
            // — a client that (re)connects mid-ring must see the same group
            // vs. direct presentation as one that was online from the start.
            conversationType: full.conversation?.type ?? 'direct',
            conversationTitle: full.conversation?.title ?? null,
            participants: full.participants.map(p => ({
              id: p.id,
              callSessionId: p.callSessionId,
              userId: p.participant?.userId || p.participantId,
              role: p.role,
              joinedAt: p.joinedAt,
              leftAt: p.leftAt,
              isAudioEnabled: p.isAudioEnabled,
              isVideoEnabled: p.isVideoEnabled,
              username: p.participant?.user?.username || p.participant?.displayName,
              displayName: p.participant?.displayName || p.participant?.user?.displayName,
              avatar: resolveParticipantAvatar(p.participant)
            }))
          };
          const iceServers = this.callService.generateIceServers(userId);
          socket.emit(CALL_EVENTS.INITIATED, { ...event, iceServers });
          logger.info('📲 Replayed in-progress call:initiated on (re)connect', { callId: c.id, userId });
        }
      } catch (err) {
        logger.error('call:check-active failed', { error: callErrorMessageOf(err, String(err)) });
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
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.NOT_AUTHENTICATED, message: 'User not authenticated' } });
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }
        if (denyAnonymous()) {
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.PERMISSION_DENIED, message: 'Anonymous users cannot initiate calls' } });
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
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.RATE_LIMIT_EXCEEDED, message: 'Rate limit exceeded' } });
          return;
        }

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketInitiateCallSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.VALIDATION_ERROR, message: validationError } });
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
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.NOT_A_PARTICIPANT, message: 'You are not a participant in this conversation' } });
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
          // Group-calls gap analysis W6 — lets a ringing callee's UI tell
          // "Alice is calling you" (direct) apart from "Alice is calling the
          // Design Team" (group) without a separate conversation lookup.
          // `conversation` is already selected by `callSessionInclude`
          // (CallService.ts); the fallback only matters for a test double
          // that omits it, never for a real Prisma-backed session.
          conversationType: callSession.conversation?.type ?? 'direct',
          conversationTitle: callSession.conversation?.title ?? null,
          participants: callSession.participants.map(p => ({
            id: p.id,
            callSessionId: p.callSessionId,
            userId: p.participant?.userId || p.participantId,
            role: p.role,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            isAudioEnabled: p.isAudioEnabled,
            isVideoEnabled: p.isVideoEnabled,
            username: p.participant?.user?.username || p.participant?.displayName,
            displayName: p.participant?.displayName || p.participant?.user?.displayName,
            avatar: resolveParticipantAvatar(p.participant)
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

        // Live-call message — fire-and-forget, AFTER the ack: the "Appel …
        // en cours" bubble must never gate (or fail) the call setup.
        /* istanbul ignore next -- postLiveCallMessage has its own internal catch and never rejects */
        this.postLiveCallMessage(callSession.id).catch((err) => {
          logger.error('❌ postLiveCallMessage failed after initiate', { callId: callSession.id, err });
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
          // GW6(c) — appForeground is only trusted on a FRESH socket (see
          // isFreshForegroundSocket): a zombie foreground socket must not
          // suppress the VoIP push (iOS dedups by callId anyway).
          if (memberSockets.some((s) => this.isFreshForegroundSocket(s.data))) {
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

          // Prisme linguistique (audit 2026-07-11 #11) : titre/corps du push
          // VoIP à la langue résolue de CHAQUE callee, plus de français codé
          // en dur. La résolution ne bloque jamais le push (fallback 'fr').
          const offlineLangs = await this.resolveNotificationLangs(offlineUserIds);

          // Guideline 5 (MIIT) — Apple requires CallKit to be inactive in
          // China, and PushKit contractually forces reportNewIncomingCall on
          // every 'voip' push. iOS skips VoIP-push registration entirely for
          // China-region devices (VoIPPushManager.shouldRegisterVoIPPush), so
          // route those callees' incoming-call push through the standard
          // 'apns' alert type instead — same title/body/data payload, no
          // CallKit involved. Unknown/null deviceCountry conservatively keeps
          // the existing 'voip' behavior.
          const offlineCountries = await this.resolveDeviceCountries(offlineUserIds);

          // GW6(b) — callees without an active voip token get a standard
          // apns alert instead (same payload, `.incomingCallAlert` routing).
          const voipCapableUsers = await this.resolveVoipCapableUsers(offlineUserIds);

          for (const offlineUserId of offlineUserIds) {
            // Per-user TURN credentials so the answerer's RTCPeerConnection has
            // TURN at construction time (VoIPPushManager.didReceiveIncomingPush
            // configures WebRTC immediately, before any socket reconnect).
            // Serialized as JSON string because APNs `data` is Record<string,string>.
            const memberIceServers = this.callService.generateIceServers(offlineUserId);
            const isChinaDevice = offlineCountries.get(offlineUserId) === 'CN';
            this.pushService.sendToUser({
              userId: offlineUserId,
              payload: {
                title: notificationString(offlineLangs.get(offlineUserId), 'call.incoming.title', { actor: callerName }),
                body: notificationString(offlineLangs.get(offlineUserId), 'call.incoming.body', {
                  callType: data.type === 'video' ? 'video' : 'audio',
                }),
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
              types: isChinaDevice || !voipCapableUsers.has(offlineUserId) ? ['apns'] : ['voip'],
              bypassDnd: true,
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
      } catch (error) {
        logger.error('Error initiating call', error);

        const { code: errorCode, message } = parseCallHandlerError(error, 'Failed to initiate call');

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
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.NOT_AUTHENTICATED, message: 'User not authenticated' } });
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated',
            callId: data?.callId
          } as CallError);
          return;
        }
        if (denyAnonymous()) {
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.PERMISSION_DENIED, message: 'Anonymous users cannot join calls' } });
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
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.RATE_LIMIT_EXCEEDED, message: 'Rate limit exceeded' } });
          return;
        }

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketJoinCallSchema, data);
        if (isValidationFailure(validation)) {
          const { error: validationError, details: validationDetails } = validation;
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.VALIDATION_ERROR, message: validationError } });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validationError,
            details: validationDetails ? { issues: validationDetails } : undefined,
            callId: data?.callId
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:join', {
          socketId: socket.id,
          userId,
          callId: data.callId
        });

        // Resolve participantId from userId + callId
        const joinParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);
        if (!joinParticipantId) {
          ack?.({ success: false, error: { code: CALL_ERROR_CODES.NOT_A_PARTICIPANT, message: 'You are not a participant in this conversation' } });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation',
            callId: data.callId
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
        // window expires. Item F follow-up below explains why join no
        // longer clears the ringing timer at all — see that note past the
        // catch block for the current (and final) ownership of the clear.
        const joinResult = await this.callService.joinCall({
          callId: data.callId,
          userId,
          participantId: joinParticipantId,
          settings: data.settings
        });

        // CALL-RESILIENCE — a (re)join cancels any pending disconnect grace
        // timer for this user on this call: the participant's signaling
        // socket is back (reconnected after a network blip or a gateway
        // restart), so the call that was armed for grace-ending when their
        // socket dropped must ride on. Deliberately placed AFTER joinCall
        // succeeds (not before, where it previously lived) — a join that
        // itself fails transiently (DB hiccup, race) must not silently
        // disarm the grace timer protecting a call that is still genuinely
        // active; the timer is the only thing left standing in that case.
        this.cancelDisconnectGrace(data.callId, userId);

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
            username: participant.participant?.user?.username || participant.participant?.displayName,
            displayName: participant.participant?.displayName || participant.participant?.user?.displayName,
            avatar: resolveParticipantAvatar(participant.participant)
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
            (p: { leftAt: Date | null; participantId: string; participant?: { userId?: string | null } | null }) =>
              !p.leftAt && (
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
            // Vague 138 — scoped to THIS joiner's own stale slot, mirroring
            // `clearBufferedOfferFor`'s doc comment (the group-call bug it
            // fixed for call:leave/call:force-leave/call:end). This branch
            // used to call whole-call `clearBufferedOffer(data.callId)`: we
            // only just proved ONE recipient's slot (this joiner's) is stale
            // because ITS sender left, but a call-wide sweep also discards
            // every OTHER still-active recipient's unrelated pending offer on
            // the SAME call (e.g. a slow third participant who hasn't
            // (re)joined the room yet) — permanently starving their mesh
            // connection to whoever sent it, the exact same failure mode
            // `clearBufferedOfferFor` was introduced to prevent.
            this.clearBufferedOfferFor(data.callId, userId, joinerParticipantId);
            logger.info('📦 [CALL] Buffered offer sender no longer active — dropped', {
              callId: data.callId,
              type: replayOffer.signal.type
            });
          }
        }

        // Audit P1-27 originally emitted ALREADY_ANSWERED unconditionally
        // here, on every successful join. Vague 104 — Item F (above) changed
        // what a join MEANS: since then, joinCallAttempt only ever
        // transitions the call to `ringing` (the callee's device is ringing,
        // receiving the SDP offer) — never `active`. An unconditional emit
        // here therefore fired on ORDINARY multi-device ringing (any second
        // device auto-early-joining the room to receive the offer while
        // still ringing, e.g. iOS's `joinCallRoomReliably`), not on an actual
        // answer — so a second ringing device would immediately dismiss its
        // still-unanswered incoming-call UI as "answered elsewhere". The
        // genuine "callee answered" transition happens on the SDP `answer`
        // signal (`call:signal`, below), which is where this notification
        // now lives — gated by the same `shouldMirrorAnsweredElsewhere`
        // predicate as its push-notification twin (Audit Vague 27).

        logger.info('✅ Socket: User joined call', {
          callId: data.callId,
          userId,
          participantId: participant.id
        });
      } catch (error) {
        logger.error('❌ Socket: Error joining call', error);

        const { code: errorCode, message } = parseCallHandlerError(error, 'Failed to join call');

        // Vague 161 — `CallAlreadyEndedError` carries the call's REAL
        // `endReason` (Prisma) on top of the generic code/message pair above.
        // Forwarded on the ack only: `rejoinActiveCallAfterReconnect` (web)
        // used to hardcode `reason: 'completed'` on its synthetic
        // `CallEndedEvent` for EVERY CALL_ENDED ack, including one whose real
        // cause was `connectionLost`/`heartbeatTimeout` — silently defeating
        // the retry-on-transient-failure offer for the one case it exists for
        // (a reconnect that lost the race against the disconnect-grace
        // window). See tasks/calls-fonctionnel-todo.md Vague 160 follow-up.
        const endReason = error instanceof CallAlreadyEndedError ? error.endReason : undefined;

        // Audit gateway (2026-07-28) — this ack previously sent only the bare
        // `message` string despite `errorCode` already being computed above,
        // violating the documented `CallJoinAck.error: {code, message}` shape
        // (packages/shared/types/video-call.ts) and silently breaking the web
        // reconnect-rejoin cleanup path, which gates on `ack.error.code ===
        // 'CALL_ENDED'` (apps/web/components/video-call/CallManager.tsx) —
        // that branch could never fire because `code` was always undefined.
        ack?.({ success: false, error: { code: errorCode, message, ...(endReason ? { endReason } : {}) } });
        // callId systématique : sans lui, le garde de scoping par appel côté
        // client (CallError.callId, audit iOS 2026-07-08) ne peut pas
        // s'appliquer — un CALL_ENDED de rejoin tardif doit nommer SON appel.
        socket.emit(CALL_EVENTS.ERROR, {
          code: errorCode,
          message,
          callId: data?.callId
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
            message: 'User not authenticated',
            callId: data?.callId
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
            details: validationDetails ? { issues: validationDetails } : undefined,
            callId: data?.callId
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
        this.invalidateSignalSession(data.callId);

        // §4.6 — drop only THIS leaver's own buffered slot (calling-stack
        // audit 2026-08-16 — see clearBufferedOfferFor's doc comment). A
        // group call keeps running for whoever remains; a sibling pair's
        // still-pending buffered offer (e.g. a slow joiner not yet in the
        // room) must survive this one participant's leave. The rare case
        // where this leave actually ends the call for everyone self-heals
        // via the periodic TTL sweep (60s) — see the constructor's own
        // comment on that sweep.
        this.clearBufferedOfferFor(data.callId, userId, leaveParticipantId);

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
          // Phase 1 fix P2 — caller cancel or callee reject ends ringing.
          // Scoped to the terminal branch (calling-stack audit 2026-08-16
          // follow-up): `ringingTimeouts` is call-wide, keyed by callId, not
          // by participant — clearing it unconditionally on every leave,
          // including a group-call leave that leaves the call `active` for
          // remaining invitees, silently dropped the missed-call
          // notification for whoever never answered, with no recovery path.
          this.callService.clearRingingTimeout(data.callId);

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

          // Room-membership leak fix — mirrors call:end (line ~2789): the
          // leave above only evicted the LEAVING user's own socket. Every
          // OTHER socket still in the room (e.g. the other 1:1 participant
          // who declined/left via this same handler) never left it, so it
          // stayed a member of a now-permanently-dead room until its own
          // disconnect — a per-session Socket.IO room membership leak.
          const socketsInCallRoom = await io.in(ROOMS.call(data.callId)).fetchSockets();
          await Promise.all(socketsInCallRoom.map(s => s.leave(ROOMS.call(data.callId))));

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
      } catch (error) {
        logger.error('❌ Socket: Error leaving call', error);

        // Sibling-drift fix (Vague 27, mirrors call:end's catch) — if
        // leaveCall() itself threw, the CallSession may be left stuck
        // non-terminal (ACTIVE), blocking every future call:initiate in this
        // conversation until CallCleanupService's GC tier reaps it (~120s).
        // Force it to a terminal state and run the same fanout/summary/
        // missed-call side effects the happy path would have run. `userId`
        // was declared inside the try block above and is out of scope here —
        // re-resolve it the same way call:end's catch does.
        const recoveryUserId = getUserId(socket.id) ?? 'unknown';
        await this.forceEndOrphanedCallAfterOptimisticBroadcast(io, data.callId, recoveryUserId);

        const { code: errorCode, message } = parseCallHandlerError(error, 'Failed to leave call');

        socket.emit(CALL_EVENTS.ERROR, {
          code: errorCode,
          message,
          callId: data?.callId
        } as CallError);
      }
    });

    /**
     * call:force-leave - Force cleanup of any active calls in a conversation
     * This is used when "call already active" error occurs to cleanup stale calls
     */
    socket.on(CLIENT_EVENTS.CALL_FORCE_LEAVE, async (data: { conversationId: string }) => {
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
              this.invalidateSignalSession(call.id);

              // Sibling-drift fix — mirrors the `call:leave` handler above:
              // this is an explicit leave just like `call:leave`, so it must
              // clear the same per-call in-memory state. Without this, a
              // still-armed buffered offer for this callId lingers in memory
              // until its own unrelated sweep/timeout, instead of being
              // released the moment the leave is known.
              // Leaver-scoped (calling-stack audit 2026-08-16), same fix as
              // `call:leave` — see `clearBufferedOfferFor`'s doc comment.
              this.clearBufferedOfferFor(call.id, userId, cleanupParticipantId);

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
                // Scoped to the terminal branch (calling-stack audit
                // 2026-08-16 follow-up, same fix as `call:leave` above):
                // `ringingTimeouts` is call-wide, keyed by callId, not by
                // participant — clearing it unconditionally, including on a
                // group-call force-leave that leaves the call `active` for
                // remaining invitees, silently dropped their missed-call
                // notification with no recovery path.
                this.callService.clearRingingTimeout(call.id);

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

                // Room-membership leak fix — mirrors the same fix in
                // call:leave above: this only evicted the FORCING user's own
                // socket, leaving every other participant's socket a member
                // of the now-dead room until its own disconnect.
                const socketsInCallRoom = await io.in(ROOMS.call(call.id)).fetchSockets();
                await Promise.all(socketsInCallRoom.map(s => s.leave(ROOMS.call(call.id))));
              }
            } catch (leaveError) {
              logger.error('❌ Error force leaving call', { callId: call.id, error: leaveError });

              // Sibling-drift fix (Vague 27, mirrors call:end/call:leave's
              // catch) — if leaveCall() itself threw, this specific call may
              // be left stuck non-terminal (ACTIVE), blocking every future
              // call:initiate in this conversation until CallCleanupService's
              // GC tier reaps it (~120s) — defeating the whole point of
              // call:force-leave, whose job is exactly to unstick this.
              await this.forceEndOrphanedCallAfterOptimisticBroadcast(io, call.id, userId);
            }
          }
        }

        logger.info('✅ Force cleanup completed', {
          conversationId: data.conversationId,
          userId,
          callsProcessed: activeCalls.length
        });
      } catch (error) {
        logger.error('❌ Socket: Error force leaving calls', error);
        socket.emit(CALL_EVENTS.ERROR, {
          code: 'FORCE_LEAVE_ERROR',
          message: callErrorMessageOf(error, 'Failed to force leave calls')
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
            callId: data?.callId
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
            callId: data?.callId
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

        // CVE-001: Verify sender is actually a participant in the call.
        // Audit #10 — session servie du cache TTL court pendant les rafales
        // ICE. Deux garde-fous de correction : un `answer` lit TOUJOURS
        // frais (isFirstAnswer dépend du answeredAt pré-update), et un
        // participant absent du cache force UNE re-lecture avant tout rejet
        // (join tout frais pas encore visible dans l'entrée cachée).
        const findSender = (session: Awaited<ReturnType<CallService['getCallSession']>>) =>
          session.participants.find(
            p => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
          );
        const findTarget = (session: Awaited<ReturnType<CallService['getCallSession']>>) =>
          session.participants.find(
            p => ((p.participant?.userId || p.participantId) === data.signal.to) && !p.leftAt
          );

        const freshRead = data.signal.type === 'answer';
        let callSession = freshRead
          ? await this.refreshSignalSession(data.callId)
          : await this.getSignalSession(data.callId);
        let senderParticipant = findSender(callSession);
        let targetParticipant = findTarget(callSession);
        if ((!senderParticipant || !targetParticipant) && !freshRead) {
          callSession = await this.refreshSignalSession(data.callId);
          senderParticipant = findSender(callSession);
          targetParticipant = findTarget(callSession);
        }

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

        // CVE-001: Validate target participant (resolved above, cache-aware)
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
          // 2nd device). Instead of silently losing the signal, buffer it so
          // it is replayed when the target (re)joins. ICE candidates are
          // dropped as before (they are re-gathered after the buffered offer
          // is applied). `answer` is buffered too — the same churn that
          // motivates offer-buffering can just as easily hit the CALLER
          // between replaying its buffered offer to the callee and receiving
          // the callee's answer back (offer/ice-restart buffer for the
          // callee's slot, answer for the caller's slot — independent keys,
          // see `bufferOffer`). Without this an answer arriving while the
          // caller's socket is briefly down was silently dropped with no
          // recovery path, stalling the call one-sided. The caller still gets
          // success:false so its at-least-once retry can also fire; the
          // buffer is the backstop.
          if (data.signal.type === 'offer' || data.signal.type === 'ice-restart' || data.signal.type === 'answer') {
            this.bufferOffer(data.callId, validation.data as CallSignalEvent);
            logger.info('📦 [CALL] Buffered signal for late (re)join', {
              callId: data.callId,
              to: data.signal.to,
              type: data.signal.type
            });
          }
          logger.warn('Target participant has no active sockets', {
            callId: data.callId,
            targetUserId
          });
          // Audit 2026-07-11 #3 — le mirror answered-elsewhere doit partir
          // MÊME quand l'appelant n'a aucun socket à l'instant de l'answer
          // (churn socket mid-answer) : ce return sautait le bloc push du
          // chemin relais, et les autres devices du callee sonnaient
          // jusqu'à leur timeout local alors que l'appel était décroché.
          // Même prédicat pur que la branche relais ; best-effort.
          if (shouldMirrorAnsweredElsewhere({
            signalType: data.signal.type,
            answererUserId: userId,
            initiatorId: callSession.initiatorId,
            alreadyAnswered: !!callSession.answeredAt
          })) {
            // Vague 104 — direct-socket twin of the push mirror just below,
            // for the answerer's OTHER devices that DO have a live socket
            // (see the removed call:join emit, above, for the full story).
            socket.to(ROOMS.user(userId)).emit(CALL_EVENTS.ALREADY_ANSWERED, {
              callId: data.callId
            });
            if (this.pushService) {
              this.pushService.sendToUser(
                buildCallSilentPush({ userId, type: 'call_answered_elsewhere', callId: data.callId })
              ).catch((error) => {
                logger.error('call_answered_elsewhere push failed (no-socket branch)', {
                  callId: data.callId, userId, error
                });
              });
            }
          }
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
        // Cycle 107 — recomposé en littéral plutôt que relayé tel quel, et SANS
        // cast. Zod 4 infère toute propriété d'union comme OPTIONNELLE sous le
        // `strictNullChecks: false` de la passerelle (artefact d'INFÉRENCE : à
        // l'exécution, `signal` est requis et `socketSignalSchema` refuse une
        // charge qui l'omet). `{ signal?: WebRTCSignal }` n'est donc pas
        // assignable à `CallSignalEvent`, qui le déclare requis — alors que
        // LIRE la propriété rend bien l'union, `strictNullChecks` étant désactivé.
        // Reconstruire le littéral suffit à rétablir la correspondance ; le
        // `as CallSignalEvent` d'en dessous, lui, était une porte (cycle 105) et
        // part avec.
        const relayedSignal: CallSignalEvent = {
          callId: validation.data.callId,
          signal: validation.data.signal
        };
        for (const targetSocketId of targetSocketIds) {
          io.to(targetSocketId).emit(CALL_EVENTS.SIGNAL, relayedSignal);
        }

        // §4.6 — also buffer successfully-relayed offers. The target may have
        // received it but then churn its socket before answering; the buffer
        // lets it recover on rejoin (epoch-guarded, last-write-wins).
        if (data.signal.type === 'offer' || data.signal.type === 'ice-restart') {
          this.bufferOffer(data.callId, relayedSignal);
        }

        // Transition to active on first successful signal exchange
        if (data.signal.type === 'answer') {
          // Phase 1 fix P2 — answer signal transitions ringing → active.
          //
          // Calling-stack audit (group-calls gap analysis S3) — this must NOT
          // clear the call-wide ring timer for a GROUP call. `ringingTimeouts`
          // is keyed by callId, not by pair: in a mesh call to N callees, the
          // FIRST pair to complete SDP negotiation used to cancel the timer
          // for the entire call, so every callee who never answered at all
          // (never even opened the app) permanently lost their missed-call
          // notification — the ring-timeout callback that would eventually
          // run `createMissedCallNotifications` via `getUnrespondedParticipants`
          // simply never fired again for that call. Direct 1:1 calls keep the
          // original immediate clear (nothing left to wait for once the only
          // callee answers). For a group call the timer is left armed; when
          // it fires at its original deadline `buildRingingTimeoutHandler`'s
          // now-active branch runs the notify-only path (no call-state
          // mutation) — a no-op once everyone has actually joined.
          if (callSession.conversation?.type !== 'group') {
            this.callService.clearRingingTimeout(data.callId);
          }
          // §4.6 — negotiation between the answerer (userId) and the offerer
          // (targetUserId) is complete, so any buffered offer left over on
          // EITHER of their own two slots is now stale. Vague 139 — this used
          // to call whole-call `clearBufferedOffer(data.callId)`, the exact
          // same over-clear bug fixed for call:leave/call:force-leave/
          // call:end/call:join (Vague 137/138): the buffer is keyed strictly
          // per RECIPIENT (`bufferOffer`'s doc comment), so a THIRD, unrelated
          // participant's own still-pending buffered offer on the SAME call
          // (e.g. their socket hasn't (re)joined the room yet) has nothing to
          // do with THIS pair's negotiation finishing and must survive it —
          // a call-wide sweep here silently starves that third participant's
          // mesh connection, `bufferedOfferFor` finding nothing left to
          // replay on their own eventual `call:join`.
          this.clearBufferedOfferFor(
            data.callId,
            userId,
            senderParticipant.participantId,
            targetUserId,
            targetParticipant.participantId
          );
          // `callSession` was read (line ~2302) BEFORE this update — its
          // `answeredAt` is the true pre-update value, so this correctly
          // identifies the FIRST answer (never a later renegotiation answer,
          // e.g. enabling video mid-call, which would already have it set).
          const isFirstAnswer = !callSession.answeredAt;
          await this.callService.updateCallStatus(data.callId, CallStatus.active).catch((err) => logger.warn('call:status update failed (active on answer)', { callId: data.callId, err }));

          // Audit Vague 27 — relocated from call:join, where this was
          // permanently dead: it gated on `callSession.status === 'connecting'`,
          // a status the FSM (Item F) never actually writes (joinCallAttempt
          // only ever transitions initiated/ringing → ringing). The real
          // "callee answered" transition happens HERE, on the SDP answer.
          // Mirror of the call_cancel hardening: a silent background push to
          // the answerer's OTHER devices, for the multi-device-socketless
          // case (VoIP push wake whose WebSocket never came up). Never for
          // the initiator's own answer, never for a later renegotiation
          // answer. Best-effort: a push failure must never fail the signal
          // relay.
          //
          // Vague 104 — the direct-socket ALREADY_ANSWERED notification for
          // the answerer's OTHER devices that DO have a live socket used to
          // live in call:join, firing unconditionally on every join
          // (including ordinary early-ring-join, see the removed emit
          // there). It now shares this exact gate with its push twin, so
          // both fire once, only on a genuine first answer.
          if (shouldMirrorAnsweredElsewhere({
            signalType: data.signal.type,
            answererUserId: userId,
            initiatorId: callSession.initiatorId,
            alreadyAnswered: !isFirstAnswer
          })) {
            socket.to(ROOMS.user(userId)).emit(CALL_EVENTS.ALREADY_ANSWERED, {
              callId: data.callId
            });
            if (this.pushService) {
              this.pushService.sendToUser(
                buildCallSilentPush({ userId, type: 'call_answered_elsewhere', callId: data.callId })
              ).catch((error) => {
                logger.error('call_answered_elsewhere push failed (signal unaffected)', {
                  callId: data.callId, userId, error
                });
              });
            }
          }
        }

        ack?.({ success: true });

        logger.info('Signal forwarded (targeted)', {
          callId: data.callId,
          from: data.signal.from,
          to: targetUserId,
          type: data.signal.type,
          targetSockets: targetSocketIds.length
        });
      } catch (error) {
        logger.error('❌ Socket: Error forwarding signal', error);

        socket.emit(CALL_EVENTS.ERROR, {
          code: 'SIGNAL_FAILED',
          message: 'Failed to forward WebRTC signal',
          callId: data?.callId
        } as CallError);
      }
    });

    /**
     * call:toggle-audio - Toggle audio on/off
     * CVE-002: Added rate limiting (50 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.TOGGLE_AUDIO, async (data: CallMediaToggleClientEvent) => {
      await this.handleMediaToggle(socket, getUserId, data, 'audio');
    });

    /**
     * call:toggle-video - Toggle video on/off
     * CVE-002: Added rate limiting (50 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.TOGGLE_VIDEO, async (data: CallMediaToggleClientEvent) => {
      await this.handleMediaToggle(socket, getUserId, data, 'video');
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
            message: 'User not authenticated',
            callId: data?.callId
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
            message: validationError,
            callId: data?.callId
          } as CallError);
          ack?.({ success: false });
          return;
        }

        const userInfo = getUserInfo?.(socket.id);
        const isAnonymous = userInfo?.isAnonymous || false;

        // Security fix 2026-07-10 (gateway): the fast-path broadcast below
        // MUST run after this authorization check, not before. It used to
        // trust call-room membership alone, reasoning "joining the room
        // already required a verified call:join" — true at join time, but
        // nothing evicts a socket from the call room if the underlying
        // authorization is later revoked (e.g. removed from the conversation
        // mid-call). A since-unauthorized caller whose socket lingers in the
        // room could otherwise fire a false call:ended at the real
        // participant before this rejection ever ran, desyncing client state
        // (call torn down client-side) from server state (session still
        // `active`) until the 120s zombie-GC tier self-heals it.
        //
        // Security fix 2026-07-10b (gateway): the check itself must be
        // `resolveActiveCallParticipantId`, not `resolveParticipantIdFromCall`
        // — the latter only verifies conversation membership, not that the
        // caller is an active (`!leftAt`) participant of THIS call. A caller
        // who already left this specific call (e.g. a stale/duplicate socket
        // left behind in the call room by a reconnect race) is still a
        // conversation member, so the weaker check kept authorizing exactly
        // the fast-path broadcast this comment describes guarding against.
        const endParticipantDetail = await this.resolveActiveCallParticipantDetailed(userId, data.callId);
        let endParticipantId = endParticipantDetail?.participantId ?? null;
        // Decline-before-join fix (2026-08-14): a callee who declines while
        // still ringing has no CallParticipant row yet (`call:join` is the
        // only path that creates one for a callee) — the check above
        // correctly returns null for them. Fall back to the dedicated
        // pre-join decline check before rejecting outright — scoped to an
        // explicit reason='rejected' so every other `call:end` reason keeps
        // exactly its pre-existing (stricter) authorization surface.
        const preJoinDecline = (!endParticipantId && data.reason === 'rejected')
          ? await this.resolvePreJoinDeclineParticipantId(userId, data.callId)
          : null;
        if (preJoinDecline) {
          endParticipantId = preJoinDecline;
        }
        // Group hang-up (calling-stack audit 2026-08-16) — an ACTIVE
        // participant (already in the call room) hanging up on a GROUP call
        // that still has other active participants must only remove
        // THEMSELVES, mirroring CallService.endCall()'s own group/direct
        // split (see its doc comment). Computed from the same read
        // `resolveActiveCallParticipantDetailed` already made above — no
        // extra query — so both the optimistic fast-path broadcast below
        // AND the post-`endCall()` branch agree on the same call-shape
        // snapshot.
        const willContinueAsGroupLeave = !preJoinDecline
          && !!endParticipantDetail
          && !endParticipantDetail.isDirectCall
          && endParticipantDetail.hasOtherActiveParticipants;
        if (!endParticipantId) {
          // Failing here means `userId` has no active CallParticipant row
          // for THIS call — either no conversation membership at all, or a
          // conversation member who already left this call. Neither is a
          // transient/data race a real active participant could hit.
          // Previously this branch force-ended the call regardless
          // (`forceEndOrphanedCallAfterOptimisticBroadcast` has no
          // authorization check of its own), which let ANY caller —
          // including a total stranger who merely guessed/observed a callId —
          // terminate a call they had no relationship to. Just reject; do not
          // force-end a call on an unauthorized caller's behalf.
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation',
            callId: data?.callId
          } as CallError);
          ack?.({ success: false });
          return;
        }

        // [Perf raccroché 2026-07-04] Fast-path : le pair doit couper
        // INSTANTANÉMENT quand l'autre raccroche — or le chemin terminal
        // ci-dessous enchaîne plusieurs allers-retours MongoDB (endCall →
        // resolveCallEndedRooms) avant le premier broadcast. L'autorisation
        // est maintenant vérifiée (ci-dessus) avant ce broadcast en mémoire
        // pure. Le broadcast autoritatif (durée réelle, raison normalisée,
        // audience élargie conversation + user rooms) suit — les clients
        // dédupliquent sur leur état terminal.
        if (socket.rooms.has(ROOMS.call(data.callId))) {
          if (willContinueAsGroupLeave) {
            // Group call, other participants remain — broadcast the same
            // PARTICIPANT_LEFT the call:leave handler sends, not ENDED. The
            // authoritative endCall()→leaveCall() delegation below performs
            // the actual DB/state cleanup; this is purely the instant,
            // in-memory notification for the room.
            //
            // Identity-space fix (Vague 142, 2026-08-17): `participantId`
            // here MUST be `CallParticipant.id` (this row's own primary
            // key) — the same identity space `call:leave`/`call:force-leave`
            // use (see `participant.id` a few dozen lines above/below) and
            // the one every client's `removeParticipant`/roster lookup is
            // keyed on (doc comment above this class, "call:participant-left's
            // participantId porte authentiquement CallParticipant.id").
            // `endParticipantId` (used everywhere else in this branch, for
            // `endCall()`/`clearBufferedOfferFor`) is deliberately the OTHER
            // identity space — `CallParticipant.participantId`, the FK to
            // `Participant.id` — and must not be reused here.
            socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.PARTICIPANT_LEFT, {
              callId: data.callId,
              participantId: endParticipantDetail!.id,
              userId,
              mode: endParticipantDetail!.mode
            } as CallParticipantLeftEvent);
          } else {
            socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.ENDED, {
              callId: data.callId,
              duration: 0,
              endedBy: userId,
              // Must go through the same normalization as the authoritative
              // broadcast below (endCall() → resolveEndReason()): `data.reason`
              // is raw client input, gated only by the schema's `[a-z_]+`
              // charset whitelist, not membership in the CallEndReason enum. A
              // raw cast here could broadcast a value ("busy", "declined", ...)
              // the authoritative broadcast a few lines later would normalize
              // to `completed` — the two would disagree.
              reason: this.callService.resolveEndReason(data.reason)
            } as CallEndedEvent);
          }
        }

        const callSession = await this.callService.endCall(
          data.callId, userId, endParticipantId, isAnonymous, data.reason,
          { preJoinDecline: Boolean(preJoinDecline) }
        );

        // Group pre-join decline (2026-08-15): CallService.endCall() no-ops
        // (session returned UNCHANGED, still non-terminal) when a
        // preJoinDecline lands on a group call — see its doc comment. Detect
        // that here and stop: no call:ended broadcast, no summary post, no
        // missed-call notification, no signal/buffer teardown — none of
        // which are correct for a decline that left the session running for
        // the other invitees. The decliner still gets a clean ack so their
        // own UI dismisses the incoming-call sheet.
        if (preJoinDecline && !(CALL_TERMINAL_STATUSES as readonly string[]).includes(callSession.status)) {
          ack?.({ success: true });
          logger.info('Pre-join decline acknowledged — group call continues for other invitees', {
            callId: data.callId, declinedBy: userId
          });
          return;
        }

        // Group hang-up (calling-stack audit 2026-08-16) — mirrors the
        // preJoinDecline branch above. `endCall()` delegated to
        // `leaveCall()` (see its doc comment) because other participants
        // were still active when we snapshotted the call; re-check the
        // AUTHORITATIVE post-transaction status rather than trusting the
        // pre-call `willContinueAsGroupLeave` flag alone — a race where every
        // other participant also left between our snapshot and the write
        // must still fall through to the normal call:ended path below.
        // Cleanup here mirrors call:leave's own non-terminal branch exactly
        // (this participant's socket only — not the whole room; no
        // call:ended broadcast, no summary, no missed-call notification):
        // the PARTICIPANT_LEFT the fast path already sent covers the room.
        if (willContinueAsGroupLeave && !(CALL_TERMINAL_STATUSES as readonly string[]).includes(callSession.status)) {
          this.invalidateSignalSession(data.callId);
          // Group-calls gap analysis S3 regression fix: `ringingTimeouts` is
          // keyed by callId, not by participant (CallService.ts) — it is the
          // ONLY thing standing between "an invitee never answered" and a
          // missed-call notification for them. This branch is reached only
          // when the call is KNOWN to continue for other participants (see
          // `willContinueAsGroupLeave` above), so the call-wide timer is NOT
          // this hanger-up's to clear — `call:signal`'s answer handler
          // deliberately leaves it armed for exactly this reason. Do NOT
          // call `this.callService.clearRingingTimeout(data.callId)` here.
          // Leaver-scoped (calling-stack audit 2026-08-16) — mirrors
          // `call:leave`'s own fix (see `clearBufferedOfferFor`'s doc
          // comment): the call continues for the other participants, whose
          // own buffered offers (e.g. a slow joiner not yet in the room)
          // must survive this one participant hanging up on themselves.
          this.clearBufferedOfferFor(data.callId, userId, endParticipantId);
          await socket.leave(ROOMS.call(data.callId));
          ack?.({ success: true });
          logger.info('✅ Socket: call:end treated as a leave — group call continues for other participants', {
            callId: data.callId, userId
          });
          return;
        }

        this.invalidateSignalSession(data.callId);

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
        // Fire-and-forget (mirrors handleMissedCall below): postCallSummary
        // retries up to 3× with 1s/2s backoff on a transient DB failure —
        // awaiting it here delayed this ack past the client's 3s
        // emitCallEndWithAck timeout, which read as a failed hangup and
        // triggered a redundant fire-and-forget call:end + reconnect
        // reconciliation for a call that had, in fact, already ended cleanly.
        /* istanbul ignore next -- postCallSummary has its own internal catch and never rejects */
        this.postCallSummary(callSession.id).catch((err) => {
          logger.error('❌ postCallSummary failed after call:end', { callId: data.callId, err });
        });

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
      } catch (error) {
        // Issue #3581 — `endCall()` throws `CallAlreadyEndedError` when the
        // call was ALREADY in a terminal state (a retried/duplicate
        // `call:end`, or a race against another path that just resolved the
        // same call — e.g. the ringing-timeout's `markCallAsMissed`). This is
        // not a failure: the caller's intent (call ended) already holds, so
        // ack success and stop here — no `call:ended` re-broadcast, no
        // re-posted call-summary, no re-fired missed-call notification (all
        // already ran on whichever path ended the call first), and no
        // `forceEndOrphanedCallAfterOptimisticBroadcast`, which exists for
        // genuine failures, not for a call that is already correctly closed.
        if (error instanceof CallAlreadyEndedError) {
          logger.info('ℹ️ Socket: call:end no-op — call already ended', {
            callId: data.callId, endReason: error.endReason
          });
          ack?.({ success: true });
          return;
        }

        logger.error('Error ending call', error);
        const { code: errorCode, message } = parseCallHandlerError(error, 'Failed to end call');

        // The fast-path broadcast may already have told the room the call
        // ended before this failure (e.g. endCall() itself threw). Force the
        // session to a terminal state so it matches what clients were told —
        // a no-op if endCall() actually succeeded before a later step failed
        // (broadcastCallEnded/postCallSummary), since the session is already
        // terminal by then.
        //
        // Security fix 2026-07-10: skip this force-end when `endCall()`
        // itself rejected the caller's authorization (NOT_A_PARTICIPANT /
        // PERMISSION_DENIED) — that means the caller was never a genuine
        // participant of THIS call, and force-ending on their behalf let any
        // conversation member (or, via the branch above, any caller at all)
        // terminate a call they weren't part of. Only auto-recover for other
        // failure classes (e.g. a transient DB error after endCall() had
        // already validated the caller as an active participant).
        if (errorCode !== CALL_ERROR_CODES.NOT_A_PARTICIPANT && errorCode !== CALL_ERROR_CODES.PERMISSION_DENIED) {
          // `userId` was declared inside the try block above and is out of
          // scope here — re-resolve it the same way the try block did.
          const endedByUserId = getUserId(socket.id) ?? 'unknown';
          await this.forceEndOrphanedCallAfterOptimisticBroadcast(io, data.callId, endedByUserId, data.reason);
        }
        ack?.({ success: false });
        socket.emit(CALL_EVENTS.ERROR, { code: errorCode, message, callId: data?.callId } as CallError);
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
        const activeReporter = await this.resolveActiveCallParticipant(userId, data.callId);
        if (!activeReporter) return;
        const { participantId, userId: reporterUserId } = activeReporter;

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
              // Vague 132 — `participantId` alone (CallParticipant.participantId,
              // a Participant.id) never matches a registered peer's roster
              // entry, whose `.userId` is a real User.id. See
              // `resolveActiveCallParticipant`'s doc comment.
              userId: reporterUserId,
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

        // FSM guard (2026-07-10) — symmetric with the RECONNECTING handler's
        // `!call.answeredAt` guard above: `reconnected` only makes sense once
        // a reconnect was actually recorded as in flight (or the call is
        // already active — a harmless idempotent re-send). Without this, a
        // stray/out-of-order/replayed call:reconnected on a still-ringing,
        // never-answered call would fabricate an `answeredAt` via
        // updateCallStatus(active), corrupting duration accounting and
        // bypassing ring-timeout semantics. `resolveActiveCallParticipantId`
        // only proves the caller is an active participant of THIS call — it
        // says nothing about whether a reconnect was ever actually underway.
        const callSession = await this.callService.getCallSession(data.callId).catch(() => null);
        if (callSession?.status !== CallStatus.reconnecting && callSession?.status !== CallStatus.active) {
          logger.warn('⚠️ Ignoring reconnected transition — no reconnect was in flight', {
            callId: data.callId, currentStatus: callSession?.status
          });
          return;
        }

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
     * call:transcription-active — signal de présence : un participant a
     * activé (ou fermé) son panneau de transcription. Relayé estampillé à la
     * room (émetteur exclu) pour afficher l'indicateur d'invitation sur
     * l'icône de transcription des autres. Silent-drop intégral (pas de
     * CALL_ERROR) : signal cosmétique, jamais bloquant pour l'appel — même
     * posture que call:backgrounded/foregrounded.
     */
    socket.on(CALL_EVENTS.TRANSCRIPTION_ACTIVE, async (data: CallTranscriptionActiveEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        // Rate limiting — the last call:* lifecycle signal left unthrottled
        // (every sibling — BACKGROUNDED/FOREGROUNDED/CHECK_ACTIVE — already
        // checks). Each event triggers a nested Prisma call-session lookup
        // plus a second unconditional status read, so a flooding client
        // could still amplify DB load even though authorization is enforced
        // below. Same fix as BACKGROUNDED/FOREGROUNDED.
        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_TRANSCRIPTION_ACTIVE, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        const validation = validateSocketEvent(socketTranscriptionActiveSchema, data);
        if (!validation.success) return;

        const participantId = await this.resolveActiveCallParticipantId(userId, data.callId);
        if (!participantId) return;

        const callSession = await this.prisma.callSession.findUnique({
          where: { id: data.callId },
          select: { status: true }
        });
        if (!callSession || (CALL_TERMINAL_STATUSES as readonly string[]).includes(callSession.status)) return;

        socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.TRANSCRIPTION_ACTIVE, {
          callId: data.callId,
          speakerId: userId,
          active: data.active
        });
      } catch (error) {
        logger.error('Error handling transcription-active signal', { error });
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
        const speaker = await this.resolveActiveCallSpeaker(userId, data.callId);
        if (!speaker) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this call',
            callId: data?.callId
          } as CallError);
          return;
        }

        const callSession = await this.prisma.callSession.findUnique({
          where: { id: data.callId },
          select: { status: true }
        });

        if (!callSession || (CALL_TERMINAL_STATUSES as readonly string[]).includes(callSession.status)) return;

        // Journal metadata normalized once so every downstream emission
        // (translated or not, success or timeout) stamps the SAME
        // capturedAtMs — the clients' journal ordering key. Legacy clients
        // that don't send it get reception time.
        const segmentEvent: CallTranscriptionSegmentEvent = {
          callId: data.callId,
          segment: {
            ...data.segment,
            capturedAtMs: data.segment.capturedAtMs ?? Date.now()
          }
        };
        const stampedSpeaker = { userId, displayName: speaker.displayName };

        // Persistance serveur du journal (décision produit 2026-08-13) : les
        // segments FINAUX sont stockés (modèle Transcription) pour le replay
        // post-appel via GET /calls/:callId/transcript — le journal survit à
        // la suppression de l'app et de ses caches locaux. Les partiels
        // (révisions du stream de corrections) ne sont JAMAIS persistés :
        // seule la dernière valeur dite compte. Fire-and-forget interne
        // (jamais de rejet — voir persistTranscriptionSegment) : un échec de
        // persistance ne bloque ni le relais ni la traduction. La promesse
        // (id de ligne) est transmise au chemin de traduction pour y
        // accrocher les TranslationCall.
        const persistedTranscriptionId = data.segment.isFinal
          ? this.persistTranscriptionSegment(segmentEvent, speaker.participantId)
          : null;

        // No callSession.metadata.translationEnabled gate — the real product
        // control is client-side (the speaker's own captions toggle; no
        // client ever emits a segment unless the user turned captions on).
        // See docs/superpowers/specs/2026-07-10-live-call-transcription-design.md.
        if (this.zmqClient && data.segment.isFinal) {
          await this.translateAndEmitSegment(socket, segmentEvent, stampedSpeaker, persistedTranscriptionId);
        } else {
          // Security fix 2026-08-13: stamp the authenticated `userId` (and a
          // server-resolved displayName), never the client-supplied
          // `data.segment.speakerId` — see translateAndEmitSegment's doc
          // comment for the spoofing this closes.
          socket.to(ROOMS.call(data.callId)).emit(
            CALL_EVENTS.TRANSLATED_SEGMENT,
            this.buildTranslatedSegment(segmentEvent, stampedSpeaker, data.segment.language)
          );
        }

        logger.debug('Transcription segment relayed', {
          callId: data.callId,
          speakerId: userId,
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
     *
     * Quasi-inerte PAR CONSTRUCTION avec les valeurs par défaut (audit
     * 2026-07-11 #8) : le TTL est clampé ≥ CallCleanupService.MAX_ACTIVE_MS
     * (2 h, TURNCredentialService) et les appels sont capés à cette même durée
     * — les credentials survivent donc toujours à l'appel et le seuil des 80 %
     * n'est jamais atteint. Garder ce chemin : c'est le filet si un opérateur
     * relève MAX_ACTIVE_MS ou si un client garde une session au-delà du cap ;
     * ne pas s'étonner qu'il ne fire jamais en prod, ne pas le « réparer ».
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
        if (isValidationFailure(validation)) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validation.error,
            details: validation.details ? { issues: validation.details } : undefined,
            callId: data?.callId
          } as CallError);
          return;
        }

        // Authorization: socket must be in the call room (joined on call:join).
        if (!socket.rooms.has(ROOMS.call(data.callId))) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'Not in call room',
            callId: data?.callId
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
            message: 'Not a participant in this call',
            callId: data?.callId
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
        if (isValidationFailure(validation)) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validation.error,
            details: validation.details ? { issues: validation.details } : undefined,
            callId: data?.callId
          } as CallError);
          return;
        }

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
        if (isValidationFailure(validation)) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validation.error,
            details: validation.details ? { issues: validation.details } : undefined,
            callId: data?.callId
          } as CallError);
          return;
        }

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
        if (isValidationFailure(validation)) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validation.error,
            details: validation.details ? { issues: validation.details } : undefined,
            callId: data?.callId
          } as CallError);
          return;
        }

        if (!socket.rooms.has(ROOMS.call(data.callId))) {
          return;
        }

        // Security fix 2026-07-03: resolve the caller's own participantId
        // server-side rather than trusting the client-supplied one — same
        // rationale as call:backgrounded/call:foregrounded. Otherwise either
        // participant in a call could impersonate the other, forging or
        // suppressing that peer's screen-capture privacy alert.
        const screenCaptureReporter = await this.resolveActiveCallParticipant(userId, data.callId);
        if (!screenCaptureReporter) return;

        const alertEvent: CallScreenCaptureEvent = {
          callId: data.callId,
          participantId: screenCaptureReporter.participantId,
          // Vague 132 — same mismatch as call:quality-alert: without this, a
          // registered peer's roster lookup (keyed by User.id) can never
          // match `participantId` alone (a Participant.id).
          userId: screenCaptureReporter.userId,
          isCapturing: data.isCapturing,
        };
        socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.SCREEN_CAPTURE_ALERT, alertEvent);

        logger.info('📞 Socket: call:screen-capture-detected relayed', {
          callId: data.callId,
          participantId: screenCaptureReporter.participantId,
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
    // Cycle 107 — la forme vient du contrat (`CallAnalyticsEvent`), plus d'une
    // transcription de dix-neuf champs dans cette signature. L'événement était
    // écouté, validé et agrégé sans figurer dans `ClientToServerEvents` : c'est
    // le cast d'`io` qui le rendait possible, et c'est le seul défaut de ce lot
    // que la porte typée aurait attrapé toute seule.
    socket.on(CALL_EVENTS.ANALYTICS, async (data: CallAnalyticsEvent) => {
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
        if (isValidationFailure(validation)) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: validation.error,
            details: validation.details ? { issues: validation.details } : undefined,
            callId: data?.callId
          } as CallError);
          return;
        }

        // Authorization — was previously unchecked, letting any authenticated
        // user submit telemetry against an arbitrary callId, then scoped to
        // conversation membership via `resolveParticipantIdFromCall` — which
        // still let ANY member of the conversation submit fabricated
        // telemetry for a call they never joined, since it never looks at
        // CallParticipant rows at all. `resolveEverCallParticipantId` checks
        // the caller actually has a CallParticipant row for THIS call
        // (regardless of `leftAt`, since analytics fires after the sender
        // has already left — `resolveActiveCallParticipantId`'s `leftAt:
        // null` requirement would reject the legitimate sender).
        const analyticsParticipantId = await this.resolveEverCallParticipantId(userId, data.callId);
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
        //
        // Scoped to the most-recently-joined row for this participantId, not
        // a blanket updateMany: a participant who left and rejoined mid-call
        // (churn) has MULTIPLE CallParticipant rows sharing the same
        // participantId, and a broad updateMany stamped this same final
        // analytics blob onto every prior row too — corrupting per-session
        // telemetry for any dashboard built off this field.
        try {
          const targetParticipant = await this.prisma.callParticipant.findFirst({
            where: { callSessionId: data.callId, participantId: analyticsParticipantId },
            orderBy: { joinedAt: 'desc' },
            select: { id: true }
          });
          if (targetParticipant) {
            await this.prisma.callParticipant.update({
              where: { id: targetParticipant.id },
              data: { analytics: validation.data }
            });
          }
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
          const callId = participation.callSessionId;

          // ZOMBIE-SOCKET GUARD (2026-07-02, scoped per-call 2026-07-08) — a
          // stale socket from a previous session expiring must NOT tear down
          // a call the user is actively on through ANOTHER live socket (prod:
          // two expired zombies killed call 6a464c61 mid-ring while the
          // active socket still received messages). This handler listens on
          // 'disconnect', so the closing socket has already left its rooms.
          //
          // Pre-answer calls have no `ROOMS.call` membership yet (joined only
          // on answer/explicit join) — the only signal of "user is still
          // here" is a live socket anywhere in their user room. Answered
          // calls DO have call-room membership, and checking there instead
          // (rather than the user's global presence) is what actually proves
          // the user is still on THIS call: an unrelated idle second device
          // (never joined to this call) must not mask a crashed in-call
          // device and suppress grace for a call nobody is actually still on.
          if (!isAnswered) {
            const remainingUserSockets =
              io?.sockets?.adapter?.rooms?.get(ROOMS.user(userId))?.size ?? 0;
            if (remainingUserSockets > 0) {
              logger.info('📞 Socket disconnect ignored for pre-answer call — user still has live sockets', {
                socketId: socket.id, userId, callId, remainingUserSockets
              });
              continue;
            }
          } else {
            const socketsInCallRoom = await io.in(ROOMS.call(callId)).fetchSockets();
            const stillInCallRoom = socketsInCallRoom.some((s: { id: string }) => getUserId(s.id) === userId);
            if (stillInCallRoom) {
              logger.info('📞 Socket disconnect ignored for call — user still has a live socket in the call room', {
                socketId: socket.id, userId, callId
              });
              continue;
            }
          }

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
    const notifiedAt = this.missedCallNotifiedAt.get(callId);
    if (notifiedAt !== undefined && Date.now() - notifiedAt < CallEventsHandler.MISSED_CALL_NOTIFY_DEDUP_TTL_MS) {
      logger.info('📢 Missed call notifications already sent for this call — skipping duplicate', { callId });
      return;
    }

    if (!this.notificationService) {
      logger.warn('⚠️ NotificationService not initialized, cannot create missed call notifications');
      return;
    }

    this.missedCallNotifiedAt.set(callId, Date.now());

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
