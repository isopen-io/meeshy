/**
 * CallService - Business logic for video/audio calls (Phase 1A: P2P MVP)
 *
 * Handles:
 * - Call initiation (P2P mode only)
 * - Participant joining/leaving
 * - Call state management
 * - Validation (DIRECT/GROUP conversations only)
 *
 * Unified Participant model: all calls use participantId
 */

import { PrismaClient, CallMode, CallStatus, CallEndReason, ParticipantRole, Prisma } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { CALL_ERROR_CODES, type CallEndedEvent } from '@meeshy/shared/types/video-call';
import {
  buildCallSummaryWithMetadata,
  buildGarbageCollectedConversion,
  buildLiveCallMetadata,
  callSummaryClientMessageId
} from '@meeshy/shared/utils/call-summary';
import { TURNCredentialService } from './TURNCredentialService';
import {
  buildCallHistoryItem,
  type CallHistoryItem,
  type CallHistoryPeer,
  type CallHistoryRow
} from './callHistory';

/** Call journal sliding window: 3 months. */
const CALL_HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** Floor a finite, non-negative byte counter; anything else → null. */
const clampNonNegativeInt = (value?: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

// Mirror of `CALL_TERMINAL_STATUSES` (@meeshy/shared/types/video-call),
// typed on the Prisma enum — keep both lists in sync.
const TERMINAL_STATUSES: CallStatus[] = [
  CallStatus.ended,
  CallStatus.missed,
  CallStatus.rejected,
  CallStatus.failed
];

const ACTIVE_STATUSES: CallStatus[] = [
  CallStatus.initiated,
  CallStatus.ringing,
  CallStatus.connecting,
  CallStatus.active,
  CallStatus.reconnecting
];

// P3 — sender include for the call-summary system message, mirroring the
// `message:new` broadcast shape produced by the normal message path so iOS/web
// can render it like any other message.
const CALL_SUMMARY_MESSAGE_INCLUDE = {
  sender: {
    select: {
      id: true,
      displayName: true,
      avatar: true,
      type: true,
      nickname: true,
      userId: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true,
          avatar: true
        }
      }
    }
  },
  attachments: true
} as const satisfies Prisma.MessageInclude;

// Type for CallSession with populated participants
type CallSessionWithParticipants = Prisma.CallSessionGetPayload<{
  include: {
    participants: {
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true;
                username: true;
                displayName: true;
                avatar: true;
              };
            };
          };
        };
      };
    };
    initiator: {
      select: {
        id: true;
        username: true;
        displayName: true;
        avatar: true;
      };
    };
    conversation: {
      select: {
        id: true;
        identifier: true;
        type: true;
      };
    };
  };
}>;

const callSessionInclude = {
  participants: {
    include: {
      participant: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        }
      }
    }
  },
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
      identifier: true,
      type: true
    }
  }
} as const;

interface InitiateCallData {
  conversationId: string;
  initiatorId: string;
  participantId: string;
  type: 'video' | 'audio';
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    screenShareEnabled?: boolean;
  };
}

interface JoinCallData {
  callId: string;
  userId: string;
  participantId: string;
  isAnonymous?: boolean;
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  };
}

interface LeaveCallData {
  callId: string;
  userId: string;
  participantId: string;
}

export class CallService {
  private turnCredentialService: TURNCredentialService;
  private heartbeats: Map<string, Map<string, number>> = new Map();
  private ringingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatDbWriteTimers: Map<string, NodeJS.Timeout> = new Map();
  // Participants that signalled call:backgrounded; they receive an extended
  // heartbeat grace period so CallKit audio calls survive iOS socket suspension.
  private backgroundedParticipants: Map<string, Set<string>> = new Map();
  // Étage 2 de la cascade de budgets de sonnerie (audit 2026-07-11 #7) — les
  // trois valeurs sont VOLONTAIREMENT distinctes, chaque étage rattrape le
  // précédent s'il ne se déclenche pas :
  //   45s  client iOS (WebRTCTypes.outgoingRingTimeoutSeconds — fail rapide UX)
  //   60s  serveur missed (ICI — autorité : marque l'appel missed + push)
  //  120s  GC (CallCleanupService.MAX_INITIATED_RINGING_MS — filet VoIP lent)
  // Toute évolution doit préserver l'ordre strict 45 < 60 < 120.
  private readonly RINGING_TIMEOUT_MS = 60_000;   // Phase 1 fix P2 — FaceTime parity
  private readonly RINGING_REHYDRATE_FLOOR_MS = 5_000; // item H — min budget after boot rehydration
  private readonly HEARTBEAT_DB_DEBOUNCE_MS = 30_000; // Write at most every 30s per participant
  // iOS suspends the socket after ~45s in background; CallKit keeps the RTP
  // stream alive. Give backgrounded participants 5 min before timing them out.
  private readonly BACKGROUND_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;
  // Phantom-cleanup staleness budgets (P0 fix 2026-07-06, see
  // `isPhantomCallStale`) — intentionally mirror CallCleanupService's own
  // tiers (MAX_CONNECTING_MS / HEARTBEAT_TIMEOUT_MS) so a call classified as
  // "stale" here is stale by the exact same yardstick the periodic GC sweep
  // already uses, just evaluated immediately instead of on the next 60s tick.
  // Declared independently (not imported) to avoid a value-level dependency
  // on CallCleanupService, which already type-imports CallService.
  private readonly PHANTOM_CONNECTING_GRACE_MS = 90 * 1000;
  private readonly PHANTOM_HEARTBEAT_GRACE_MS = 120 * 1000;
  // Live-call message — initiateCall's own GC sweeps (phantom/zombie) end
  // calls with `garbageCollected` WITHOUT going through any summary path: an
  // already-posted live message would read "en cours" forever. The socket
  // layer wires this to `postCallSummaryForTerminatedCall`, which converts
  // an orphaned live message to `failed`. Fire-and-forget, never blocking.
  private reapedCallCallback: ((callId: string) => Promise<void> | void) | null = null;

  // Wired in server.ts to CallEventsHandler.broadcastCallEndedForTerminatedCall.
  // The REST end/leave routes have no `io`, so they delegate the `call:ended`
  // fanout through this callback (same audience as the socket handlers).
  private callEndedBroadcaster:
    | ((callId: string, conversationId: string | undefined, endedEvent: CallEndedEvent) => Promise<void> | void)
    | null = null;

  constructor(
    private prisma: PrismaClient,
    // CALL-RESILIENCE (item H bug class, re-opened by the 2026-07-06 P0 fix)
    // — liveness floor for `isPhantomCallStale`'s no-heartbeat-data fallback:
    // `this.heartbeats` is always empty right after a restart, so without
    // this floor a real, healthy, long-running call reads as instantly stale
    // (its DB `startedAt` is old) the moment ANY user's phantom-cleanup sweep
    // touches it, before clients have had a chance to reconnect and re-beat.
    // Mirrors `CallCleanupService`'s own `bootedAt` floor. Injectable for tests.
    private readonly bootedAt: Date = new Date()
  ) {
    this.turnCredentialService = new TURNCredentialService();
  }

  /**
   * Register the callback notified with every callId force-ended by
   * `initiateCall`'s own GC sweeps (phantom stale participations + zombie
   * active call). Pattern mirrors CallCleanupService's
   * `setPostSummaryCallback`; wired in server.ts.
   */
  setReapedCallCallback(callback: (callId: string) => Promise<void> | void): void {
    this.reapedCallCallback = callback;
  }

  /** Fire-and-forget notification — a failing callback never affects initiate. */
  private notifyReapedCall(callId: string): void {
    const callback = this.reapedCallCallback;
    if (!callback) {
      return;
    }
    try {
      Promise.resolve(callback(callId)).catch((error) => {
        logger.warn('reaped-call callback failed', { callId, error });
      });
    } catch (error) {
      logger.warn('reaped-call callback failed synchronously', { callId, error });
    }
  }

  /**
   * P0 (bulles « Appel … en cours » orphelines) — finalise le message live
   * après une transition terminale déclenchée par un appelant qui ne poste PAS
   * le summary lui-même. Les handlers socket `call:end` / `call:leave` le
   * postent explicitement ; les routes REST end/leave n'appellent que
   * `endCall()`/`leaveCall()` et laissaient la bulle live orpheline pour
   * toujours (GC ne re-balaye pas un CallSession déjà terminal).
   *
   * Réutilise le câblage reaped déjà en place (→ postCallSummaryForTerminatedCall
   * → createCallSummaryMessage) : fire-and-forget, idempotent et auto-gardé —
   * createCallSummaryMessage est un no-op pour un appel non-terminal et n'édite
   * qu'une bulle encore live. Un appel redondant (chemin socket) ou un appel de
   * groupe encore en cours est donc sans effet.
   */
  finalizeCallSummary(callId: string): void {
    this.notifyReapedCall(callId);
  }

  /**
   * Register the broadcaster that emits `call:ended` to the full termination
   * audience (call room + conversation room + member user rooms). Wired in
   * server.ts to `CallEventsHandler.broadcastCallEndedForTerminatedCall`
   * (which owns `io`). Pattern mirrors `setReapedCallCallback`.
   */
  setCallEndedBroadcaster(
    callback: (callId: string, conversationId: string | undefined, endedEvent: CallEndedEvent) => Promise<void> | void
  ): void {
    this.callEndedBroadcaster = callback;
  }

  /**
   * Bug (parité socket) — les routes REST `DELETE /calls/:id` (end) et
   * `.../participants/:pid` (leave) appellent endCall()/leaveCall() puis
   * renvoient, SANS jamais diffuser `call:ended`. Contrairement aux handlers
   * socket `call:end`/`call:leave` (broadcastCallEnded), le pair n'apprenait
   * la fin qu'au balayage GC (~120s) : son UI WebRTC/CallKit restait « en
   * appel » (classe d'incident 2026-07-03 que broadcastCallEnded corrige).
   *
   * Auto-gardé sur le statut terminal : no-op pour un leave de groupe qui
   * continue (endedAt null, statut actif). Fire-and-forget — un broadcaster
   * qui échoue ne casse jamais la réponse REST (parité finalizeCallSummary).
   */
  broadcastCallEndedIfTerminal(
    callSession: { id: string; conversationId?: string; status?: CallStatus | string; endedAt?: Date | null; duration?: number | null; endReason?: CallEndReason | string | null } | null | undefined,
    endedBy: string
  ): void {
    if (!callSession) {
      return;
    }

    const status = callSession.status as CallStatus | undefined;
    const isTerminal = callSession.endedAt != null || (status != null && TERMINAL_STATUSES.includes(status));
    if (!isTerminal) {
      return;
    }

    const broadcaster = this.callEndedBroadcaster;
    if (!broadcaster) {
      return;
    }

    const endedEvent: CallEndedEvent = {
      callId: callSession.id,
      duration: callSession.duration || 0,
      endedBy,
      reason: (callSession.endReason || CallEndReason.completed) as CallEndReason
    };

    try {
      Promise.resolve(broadcaster(callSession.id, callSession.conversationId, endedEvent)).catch((error) => {
        logger.warn('call-ended broadcaster failed', { callId: callSession.id, error });
      });
    } catch (error) {
      logger.warn('call-ended broadcaster failed synchronously', { callId: callSession.id, error });
    }
  }

  /**
   * Phase 1 fix P2 — Schedule a 60s timeout for a ringing call. If no answer
   * arrives in time, the callback is invoked (caller will transition the call
   * to `missed`). Replaces any previously scheduled timeout for this callId.
   *
   * NOTE: Phase 1 uses in-process setTimeout. Multi-instance gateway deployments
   * may race on the timeout; Phase 4 introduces optimistic-locked transitions
   * which are idempotent against this race.
   *
   * Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.5
   */
  scheduleRingingTimeout(
    callId: string,
    onTimeout: () => void,
    delayMs: number = this.RINGING_TIMEOUT_MS
  ): void {
    this.clearRingingTimeout(callId);
    const handle = setTimeout(() => {
      this.ringingTimeouts.delete(callId);
      onTimeout();
    }, delayMs);
    handle.unref?.();
    this.ringingTimeouts.set(callId, handle);
  }

  /**
   * CALL-RESILIENCE (item H) — re-arm a ringing timer lost to a process
   * restart. Fires at `startedAt + RINGING_TIMEOUT_MS`, as if the in-process
   * timer had never been wiped; when that budget is already exhausted the
   * short floor still gives just-rebooted clients a beat to answer or cancel
   * before the call resolves to missed.
   */
  rescheduleRingingTimeout(callId: string, startedAt: Date, onTimeout: () => void): void {
    const elapsedMs = Date.now() - startedAt.getTime();
    const remainingMs = Math.max(
      this.RINGING_REHYDRATE_FLOOR_MS,
      this.RINGING_TIMEOUT_MS - elapsedMs
    );
    this.scheduleRingingTimeout(callId, onTimeout, remainingMs);
  }

  clearRingingTimeout(callId: string): void {
    const handle = this.ringingTimeouts.get(callId);
    if (handle) {
      clearTimeout(handle);
      this.ringingTimeouts.delete(callId);
    }
  }

  /**
   * Generate ICE servers with per-user TURN credentials
   */
  generateIceServers(userId: string): RTCIceServer[] {
    return this.turnCredentialService.generateCredentials(userId);
  }

  getIceServerTtl(): number {
    return this.turnCredentialService.getStatus().credentialTTL;
  }

  /**
   * Record a heartbeat from a participant. Updates in-memory immediately and
   * schedules a debounced write to MongoDB (30s) so liveness data survives restarts.
   */
  recordHeartbeat(callId: string, participantId: string): void {
    if (!this.heartbeats.has(callId)) {
      this.heartbeats.set(callId, new Map());
    }
    this.heartbeats.get(callId)!.set(participantId, Date.now());

    const key = `${callId}:${participantId}`;
    if (!this.heartbeatDbWriteTimers.has(key)) {
      const timer = setTimeout(() => {
        this.heartbeatDbWriteTimers.delete(key);
        void this.persistHeartbeatToDb(callId, participantId);
      }, this.HEARTBEAT_DB_DEBOUNCE_MS);
      timer.unref?.();
      this.heartbeatDbWriteTimers.set(key, timer);
    }
  }

  /**
   * Clear every in-flight ringing/heartbeat-debounce timer. Called on
   * gateway shutdown so no stray timer fires (and touches the DB) after the
   * process has begun tearing down — mirrors CallEventsHandler's own
   * prepareForShutdown()/destroy() timer discipline for its disconnect-grace
   * and buffer-cleanup timers.
   */
  destroy(): void {
    for (const handle of this.ringingTimeouts.values()) {
      clearTimeout(handle);
    }
    this.ringingTimeouts.clear();
    for (const timer of this.heartbeatDbWriteTimers.values()) {
      clearTimeout(timer);
    }
    this.heartbeatDbWriteTimers.clear();
  }

  private async persistHeartbeatToDb(callId: string, participantId: string): Promise<void> {
    try {
      await this.prisma.callParticipant.updateMany({
        where: { callSessionId: callId, participantId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
        data: { lastHeartbeatAt: new Date() }
      });
    } catch (err) {
      logger.warn('Failed to persist heartbeat to DB', { callId, participantId, err });
    }
  }

  /**
   * Returns true when at least one heartbeat has been recorded in-memory for
   * this call. Used by CallCleanupService to distinguish "no data yet" (post-restart)
   * from "data exists but no stale entries".
   */
  hasHeartbeatData(callId: string): boolean {
    return (this.heartbeats.get(callId)?.size ?? 0) > 0;
  }

  /**
   * Clear heartbeat tracking for a call and cancel any pending DB write timers.
   */
  clearHeartbeats(callId: string): void {
    this.heartbeats.delete(callId);
    this.backgroundedParticipants.delete(callId);
    for (const [key, timer] of this.heartbeatDbWriteTimers) {
      if (key.startsWith(`${callId}:`)) {
        clearTimeout(timer);
        this.heartbeatDbWriteTimers.delete(key);
      }
    }
  }

  /**
   * Force-terminates a CallSession that a normal endCall/leaveCall path could
   * not cleanly resolve — e.g. the ending participant no longer resolves, or
   * the authoritative write itself failed — after the caller has already told
   * the call room the call ended (CallEventsHandler's disconnect force-cleanup
   * fallback and call:end optimistic-broadcast recovery paths). Mirrors
   * CallCleanupService.forceEndCall's terminal-write protocol: scoped to
   * ACTIVE_STATUSES (a no-op, returning null, if another path already resolved
   * the call) and bumps `version` so a version-guarded writer that read the
   * row moments earlier can't silently clobber this terminal state.
   */
  async forceEndOrphanedCallSession(
    callId: string,
    endReason: CallEndReason
  ): Promise<{ duration: number; conversationId: string; status: CallStatus; endReason: CallEndReason } | null> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: callId },
      select: { startedAt: true, conversationId: true, answeredAt: true }
    });
    if (!session) return null;

    const now = new Date();

    // Audit Vague 25 — mirror endCall()'s wasPreAnswered handling (see its
    // doc comment): a call force-ended before it was ever answered (e.g. the
    // caller's own participant row can't be resolved, or endCall() itself
    // threw, while the callee never picked up) must resolve to `missed`, not
    // `ended` — otherwise the callee gets no missed-call notification and
    // call history shows a phantom "completed" 0-duration call. `answeredAt`
    // is the authoritative "was ever answered" signal, stamped once on the
    // SDP answer. An explicit non-default reason (e.g. connectionLost) is
    // preserved; only the generic default `completed` is normalized to
    // `missed`, same rule as endCall().
    const wasPreAnswered = !session.answeredAt;
    const targetStatus = wasPreAnswered ? CallStatus.missed : CallStatus.ended;
    const targetEndReason = wasPreAnswered && endReason === CallEndReason.completed
      ? CallEndReason.missed
      : endReason;
    // Audit Vague 27 — anchor duration on answeredAt (talk time), exactly
    // like endCall()'s `call.answeredAt ? … : 0`. This was the one terminal
    // writer still anchoring on startedAt unconditionally (ring+talk time),
    // producing a duration inconsistent with the same real-world call ending
    // via a different path (e.g. the explicit "End Call" button).
    const duration = wasPreAnswered
      ? 0
      : Math.max(0, Math.floor((now.getTime() - session.answeredAt!.getTime()) / 1000));

    const ended = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.callSession.updateMany({
        where: { id: callId, status: { in: ACTIVE_STATUSES } },
        data: {
          status: targetStatus,
          endedAt: now,
          duration,
          endReason: targetEndReason,
          version: { increment: 1 }
        }
      });
      if (updated.count === 0) return false;

      await tx.callParticipant.updateMany({
        where: { callSessionId: callId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
        data: { leftAt: now }
      });
      return true;
    }).catch((error) => {
      // Same protocol as joinCall/endCall/leaveCall (isTransientWriteConflict's
      // doc comment): a P2034 here means another terminal writer (call:end,
      // call:leave, the ringing-timeout GC) touched this same CallSession
      // document concurrently and won — functionally identical to this
      // transaction's own `updated.count === 0` no-op above, not a real
      // failure. Without this, it was misreported to the caller's catch as
      // "force cleanup also failed" and could leave the call non-terminal
      // until the 60s GC tier reaps it.
      if (this.isTransientWriteConflict(error)) return false;
      throw error;
    });

    if (!ended) return null;

    this.clearHeartbeats(callId);
    this.clearRingingTimeout(callId);
    await this.releaseActiveCallClaim(session.conversationId, callId);

    return { duration, conversationId: session.conversationId, status: targetStatus, endReason: targetEndReason };
  }

  /**
   * Mark a participant as backgrounded, granting them an extended heartbeat
   * grace period (BACKGROUND_HEARTBEAT_TIMEOUT_MS) so CallKit audio calls
   * survive iOS socket suspension (~45s after backgrounding).
   */
  recordParticipantBackgrounded(callId: string, participantId: string): void {
    if (!this.backgroundedParticipants.has(callId)) {
      this.backgroundedParticipants.set(callId, new Set());
    }
    this.backgroundedParticipants.get(callId)!.add(participantId);
  }

  /**
   * Remove a participant from the backgrounded set. Called on call:foregrounded
   * or when the participant leaves the call.
   */
  clearParticipantBackgrounded(callId: string, participantId: string): void {
    this.backgroundedParticipants.get(callId)?.delete(participantId);
  }

  /**
   * Get all participants with stale heartbeats (> maxAge ms ago).
   * Backgrounded participants use the extended BACKGROUND_HEARTBEAT_TIMEOUT_MS
   * grace period instead of maxAgeMs to survive iOS socket suspension.
   */
  getStaleHeartbeats(callId: string, maxAgeMs: number): string[] {
    const callHeartbeats = this.heartbeats.get(callId);
    if (!callHeartbeats) return [];

    const now = Date.now();
    const backgrounded = this.backgroundedParticipants.get(callId);
    const stale: string[] = [];
    for (const [participantId, lastBeat] of callHeartbeats) {
      const effectiveMaxAge = backgrounded?.has(participantId)
        ? this.BACKGROUND_HEARTBEAT_TIMEOUT_MS
        : maxAgeMs;
      if (now - lastBeat > effectiveMaxAge) {
        stale.push(participantId);
      }
    }
    return stale;
  }

  /**
   * Number of participants with at least one recorded in-memory heartbeat for
   * this call. Paired with `getStaleHeartbeats` to tell "everyone stale" (the
   * call is truly dead) from "someone is still fresh" (the call is alive) —
   * mirrors `CallCleanupService.hasFreshLiveness`'s `stale.length <
   * participants.length` check without needing a DB round-trip for the
   * participant list.
   */
  getHeartbeatParticipantCount(callId: string): number {
    return this.heartbeats.get(callId)?.size ?? 0;
  }

  /**
   * P0 fix (2026-07-06) — is an initiator-phantom candidate actually stale,
   * or is it a genuinely live call (e.g. a second device/tab) the initiator
   * happens to still be a live participant of? Without this gate,
   * `initiateCall`'s phantom-cleanup force-ends ANY non-terminal call the
   * initiator is still attached to — including a real, in-progress call in a
   * completely unrelated conversation — the instant the same user starts a
   * new call elsewhere. `CallService` holds no Socket.IO reference, so that
   * force-end never broadcasts `call:ended`: the other party's client is left
   * "connected" indefinitely, silently, until its own next action discovers
   * the row is already terminal.
   *
   * Mirrors `CallCleanupService`'s tiered staleness semantics: a
   * ringing/initiated call gets the same budget as its own scheduled ringing
   * timeout, a connecting call gets the GC's connecting budget anchored on
   * `answeredAt`, and an active/reconnecting call is stale only when there is
   * no evidence — in memory or otherwise — that anyone is still beating.
   *
   * The no-heartbeat-data fallback additionally floors its anchor at
   * `this.bootedAt` (CALL-RESILIENCE item H) — see constructor comment.
   */
  private isPhantomCallStale(
    session: { id: string; status?: CallStatus; startedAt: Date | null; answeredAt?: Date | null },
    now: Date
  ): boolean {
    // A call record missing its own start time is anomalous — safe to treat
    // as ancient (stale) rather than risk sparing a corrupt row forever.
    const startedAtMs = session.startedAt ? session.startedAt.getTime() : 0;

    if (session.status === CallStatus.initiated || session.status === CallStatus.ringing) {
      return now.getTime() - startedAtMs > this.RINGING_TIMEOUT_MS;
    }
    if (session.status === CallStatus.connecting) {
      const anchorMs = session.answeredAt ? session.answeredAt.getTime() : startedAtMs;
      return now.getTime() - anchorMs > this.PHANTOM_CONNECTING_GRACE_MS;
    }
    // active / reconnecting (ACTIVE_STATUSES guarantees a real status here in
    // production; the fallback below only matters for incomplete test doubles).
    if (this.hasHeartbeatData(session.id)) {
      const staleCount = this.getStaleHeartbeats(session.id, this.PHANTOM_HEARTBEAT_GRACE_MS).length;
      return staleCount >= this.getHeartbeatParticipantCount(session.id);
    }
    // Floored at `bootedAt` (CALL-RESILIENCE item H) — right after a restart
    // `this.heartbeats` is empty for every call regardless of true age, so an
    // anchor on `startedAt` alone would misclassify a real, long-running call
    // as stale the instant any sweep touches it, before clients re-beat.
    const anchorMs = Math.max(startedAtMs, this.bootedAt.getTime());
    return now.getTime() - anchorMs > this.PHANTOM_HEARTBEAT_GRACE_MS;
  }

  /**
   * Release the conversation's active-call claim taken by `initiateCall`'s
   * atomic claim step, so a future `initiateCall` on this conversation is no
   * longer blocked. Scoped to `activeCallId: callId` (compare-and-clear) so a
   * call that never held the claim — or one that already lost it to a newer
   * call — can never clobber someone else's live claim. Best-effort: a
   * failure here is logged, not thrown, since the call's own status write is
   * always the source of truth and the claim self-heals the next time a call
   * is attempted for this conversation and finds this one already terminal.
   * Public: the ringing-timeout handler (CallEventsHandler) owns the atomic
   * missed-transition and must release the claim itself — delegating to
   * markCallAsMissed hit the non-ringing guard and leaked the claim (prod
   * incident 2026-07-02, conversation blocked CALL_ALREADY_ACTIVE ~5 min).
   */
  async releaseActiveCallClaim(conversationId: string, callId: string): Promise<void> {
    try {
      await this.prisma.conversation.updateMany({
        where: { id: conversationId, activeCallId: callId },
        data: { activeCallId: null }
      });
    } catch (error) {
      logger.error('Failed to release active-call claim', { conversationId, callId, error });
    }
  }

  /**
   * Self-heal a leaked active-call claim. A claim can outlive its call when
   * a terminal write raced the release (prod incident 2026-07-02: ringing
   * timeout won the missed-transition, the delegated release was skipped by
   * markCallAsMissed's non-ringing guard, and the conversation rejected
   * every initiateCall for minutes). When the current holder is terminal —
   * or the claim vanished between our failed claim and this read — take the
   * claim for `newCallId` with a single compare-and-swap, so a concurrent
   * healthy claim can never be clobbered. Returns true when the claim is won.
   */
  private async reclaimFromTerminalHolder(conversationId: string, newCallId: string): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { activeCallId: true }
    });
    const holderId = conversation?.activeCallId;

    if (!holderId) {
      const retry = await this.prisma.conversation.updateMany({
        where: {
          id: conversationId,
          OR: [{ activeCallId: null }, { activeCallId: { isSet: false } }]
        },
        data: { activeCallId: newCallId }
      });
      return retry.count > 0;
    }

    const holder = await this.prisma.callSession.findUnique({
      where: { id: holderId },
      select: { status: true }
    });
    if (holder && ACTIVE_STATUSES.includes(holder.status)) {
      return false;
    }

    const swap = await this.prisma.conversation.updateMany({
      where: { id: conversationId, activeCallId: holderId },
      data: { activeCallId: newCallId }
    });
    if (swap.count > 0) {
      logger.warn('⚠️ Active-call claim self-healed from terminal holder', {
        conversationId,
        staleHolderCallId: holderId,
        newCallId
      });
      return true;
    }
    return false;
  }

  /**
   * Update call status with validation (state machine transition)
   */
  async updateCallStatus(callId: string, newStatus: CallStatus, endReason?: CallEndReason): Promise<CallSessionWithParticipants> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId }
    });

    if (!call) {
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    if (TERMINAL_STATUSES.includes(call.status)) {
      logger.warn('Call already in terminal state', { callId, currentStatus: call.status, requestedStatus: newStatus });
      return this.getCallSession(callId);
    }

    // FSM guard (2026-07-03, prod call 6a47689d) — `reconnecting` only makes
    // sense for a call that was actually answered (media once established).
    // A stale client whose ring-time watchdog fires during the ring (the
    // pre-f86a907c4 iOS .offering bug) must not drag the session out of
    // `ringing`: it hid `ringing` from the boot-rehydration path and made
    // endCall/leaveCall classify the never-answered call as completed.
    // Server-side mirror of CallReliabilityPolicy.reconnectingAllowed.
    if (newStatus === CallStatus.reconnecting && !call.answeredAt) {
      logger.warn('⚠️ Ignoring reconnecting transition on a never-answered call', {
        callId, currentStatus: call.status
      });
      return this.getCallSession(callId);
    }

    const updateData: Prisma.CallSessionUpdateInput = { status: newStatus };

    if (TERMINAL_STATUSES.includes(newStatus)) {
      const now = new Date();
      updateData.endedAt = now;
      updateData.duration = Math.floor((now.getTime() - call.startedAt.getTime()) / 1000);
      if (endReason) {
        updateData.endReason = endReason;
      }
    }

    if (newStatus === CallStatus.active && !call.answeredAt) {
      updateData.answeredAt = new Date();
    }

    // Version-guarded write: the plain `update` this replaced could blind-write
    // over a concurrent terminal transition (e.g. endCall()/leaveCall() resolving
    // the call to `missed`/`ended` between our `findUnique` above and this write),
    // resurrecting an already-ended call back to a non-terminal status. Scoping
    // to the version we read makes a losing writer's update a no-op instead —
    // same optimistic-lock pattern as joinCallAttempt().
    const lock = await this.prisma.callSession.updateMany({
      where: { id: callId, version: call.version },
      data: { ...updateData, version: { increment: 1 } }
    });

    if (lock.count === 0) {
      logger.warn('⚠️ Call status update lost race to a concurrent write — no-op', {
        callId, requestedStatus: newStatus
      });
      return this.getCallSession(callId);
    }

    if (TERMINAL_STATUSES.includes(newStatus)) {
      await this.releaseActiveCallClaim(call.conversationId, callId);
    }

    logger.info('Call status updated', { callId, from: call.status, to: newStatus, endReason });

    return this.getCallSession(callId);
  }

  /**
   * Initiate a new video call
   * - Validates conversation exists and type is DIRECT or GROUP
   * - Creates CallSession with mode='p2p' and status='initiated'
   * - Creates CallParticipant for initiator
   * - Returns CallSession with participants
   */
  async initiateCall(data: InitiateCallData): Promise<CallSessionWithParticipants> {
    const { conversationId, initiatorId, participantId, type, settings } = data;

    logger.info('📞 Initiating call', { conversationId, initiatorId, type });

    // Validate conversation exists
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true, identifier: true }
    });

    if (!conversation) {
      logger.error('❌ Conversation not found', { conversationId });
      throw new Error(`${CALL_ERROR_CODES.CONVERSATION_NOT_FOUND}: Conversation not found`);
    }

    // Validate conversation type (only DIRECT and GROUP support video calls)
    if (conversation.type !== 'direct' && conversation.type !== 'group') {
      logger.error('❌ Video calls not supported for this conversation type', {
        conversationId,
        type: conversation.type
      });
      throw new Error(
        `${CALL_ERROR_CODES.VIDEO_CALLS_NOT_SUPPORTED}: Video calls are only supported for DIRECT and GROUP conversations`
      );
    }

    // Check if user is participant of conversation. `participantId` MUST be
    // checked explicitly before hitting Prisma: passing `id: undefined` in a
    // `where` clause makes Prisma treat the field as omitted rather than
    // "match nothing", so the query silently degrades to "does this
    // conversation have ANY active participant" — true for virtually every
    // real conversation. Without this guard a caller whose participantId
    // failed to resolve (e.g. genuinely not a member) would sail through the
    // membership check for a conversation they have no access to.
    if (!participantId) {
      logger.error('❌ Missing participantId — cannot verify conversation membership', {
        conversationId,
        initiatorId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    const membership = await this.prisma.participant.findFirst({
      where: {
        conversationId,
        id: participantId,
        isActive: true
      }
    });

    if (!membership) {
      logger.error('❌ User is not a participant in conversation', {
        conversationId,
        initiatorId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    // PHANTOM CLEANUP (2026-06-05) — every initiate force-ends ANY non-ended call
    // the INITIATOR is still a live participant of (across ALL conversations).
    // The iOS long-poll transport churns (transport close/error) and frequently
    // leaves the initiator as a leftAt:null participant in a stale call whose
    // leave/end never processed; that stale call then makes the next initiate
    // throw CALL_ALREADY_ACTIVE and surfaces as a stuck "phantom" call on the
    // device. Clearing the initiator's phantoms here guarantees a fresh start on
    // every call. We end the WHOLE stale session (all remaining participants
    // marked left + status ended) so it can never block the conversation either.
    const initiatorStaleParticipations = await this.prisma.callParticipant.findMany({
      where: {
        // Audit C5 (2026-07-02) — `{leftAt: null}` alone misses Mongo docs
        // whose leftAt field was never written (pre-C5 participants).
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
        participant: { userId: initiatorId },
        callSession: {
          status: { in: ACTIVE_STATUSES },
          // P0 fix (2026-07-06) — never let this cross-conversation sweep
          // touch a call in the SAME conversation the caller is initiating
          // into: the zombie-active-call check a few lines below is already
          // scoped to `conversationId` and correctly handles a duplicate
          // initiate there (CALL_ALREADY_ACTIVE vs. genuinely zombie) without
          // this broader sweep's coarser, cross-conversation staleness gate.
          conversationId: { not: conversationId }
        }
      },
      include: {
        callSession: {
          select: { id: true, startedAt: true, conversationId: true, status: true, answeredAt: true }
        }
      }
    });

    if (initiatorStaleParticipations.length > 0) {
      const now = new Date();
      const staleCalls = Array.from(
        new Map(
          initiatorStaleParticipations.map(p => [p.callSessionId, p.callSession])
        ).entries()
      );
      logger.warn('🔬 [CALL-DIAG] phantom-cleanup on initiate — force-ending initiator stale calls', {
        initiatorId,
        conversationId,
        staleCallIds: staleCalls.map(([id]) => id)
      });
      for (const [staleCallId, staleSession] of staleCalls) {
        if (staleSession && !this.isPhantomCallStale(staleSession, now)) {
          logger.info('🔬 [CALL-DIAG] phantom-cleanup skipped — candidate still has fresh liveness', {
            initiatorId,
            conversationId,
            staleCallId,
            staleConversationId: staleSession.conversationId
          });
          continue;
        }
        // Audit — anchor duration on `answeredAt` (talk time), mirroring
        // endCall()/forceEndCall()'s `answeredAt ? … : 0` (Vague 25/27/30's
        // sibling fixes in CallCleanupService). This phantom-cleanup terminal
        // writer was still anchoring on `startedAt` unconditionally, so a
        // call that rang for minutes and was NEVER answered (status still
        // `initiated`/`ringing`/`connecting`) got a `duration` equal to its
        // ring time instead of 0 — the same "Manqué · N:NN" call-history leak
        // already fixed for the GC tiers, reproduced here via a different
        // caller (CallService.initiateCall's own phantom sweep).
        const answeredAt = staleSession?.answeredAt ? new Date(staleSession.answeredAt) : null;
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.callParticipant.updateMany({
              where: { callSessionId: staleCallId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
              data: { leftAt: now }
            });
            await tx.callSession.updateMany({
              where: { id: staleCallId, status: { in: ACTIVE_STATUSES } },
              data: {
                status: CallStatus.ended,
                endedAt: now,
                duration: answeredAt
                  ? Math.max(0, Math.floor((now.getTime() - answeredAt.getTime()) / 1000))
                  : 0,
                endReason: CallEndReason.garbageCollected,
                // Terminal write protocol: every terminal writer MUST bump `version`
                // (see endCall/markCallAsMissed) — otherwise a version-guarded writer
                // that read this row a moment earlier still matches its stale `version`
                // and clobbers this terminal state right after.
                version: { increment: 1 }
              }
            });
          });
          this.clearHeartbeats(staleCallId);
          this.clearRingingTimeout(staleCallId);
          await this.releaseActiveCallClaim(staleSession?.conversationId ?? conversationId, staleCallId);
          this.notifyReapedCall(staleCallId);
        } catch (cleanupErr) {
          logger.error('phantom-cleanup failed for stale call', { staleCallId, error: cleanupErr });
        }
      }
    }

    // IMPROVEMENT: Clean up any zombie calls before initiating new call
    // This prevents orphan calls from blocking new calls
    const activeCall = await this.prisma.callSession.findFirst({
      where: {
        conversationId,
        status: { in: ACTIVE_STATUSES }
      },
      include: {
        participants: true
      }
    });

    if (activeCall) {
      // Check if all participants have left (zombie call)
      const activeParticipants = activeCall.participants.filter(p => !p.leftAt);

      if (activeParticipants.length === 0) {
        // Zombie call - force cleanup before starting new call
        logger.warn('⚠️ Found zombie call, cleaning up before new call', {
          conversationId,
          zombieCallId: activeCall.id,
          callStatus: activeCall.status
        });

        const now = new Date();
        // Audit — same anchor fix as the phantom-cleanup sweep above: a
        // zombie call that was never answered (all participants left before
        // anyone joined) must persist `duration: 0`, not its ring time.
        const duration = activeCall.answeredAt
          ? Math.max(0, Math.floor((now.getTime() - activeCall.answeredAt.getTime()) / 1000))
          : 0;

        // Scoped to status still in ACTIVE_STATUSES (mirrors the
        // initiatorStaleParticipations cleanup above): if the last
        // participant reconnected/rejoined between the `activeParticipants`
        // read above and this write, this becomes a no-op instead of
        // force-ending a call that just resumed.
        await this.prisma.callSession.updateMany({
          where: { id: activeCall.id, status: { in: ACTIVE_STATUSES } },
          data: {
            status: CallStatus.ended,
            endedAt: now,
            duration,
            endReason: CallEndReason.garbageCollected,
            // Terminal write protocol: every terminal writer MUST bump `version`
            // (see endCall/markCallAsMissed) — otherwise a version-guarded writer
            // that read this row a moment earlier still matches its stale `version`
            // and clobbers this terminal state right after.
            version: { increment: 1 }
          }
        });

        this.clearHeartbeats(activeCall.id);
        this.clearRingingTimeout(activeCall.id);
        await this.releaseActiveCallClaim(conversationId, activeCall.id);
        this.notifyReapedCall(activeCall.id);

        logger.info('Zombie call cleaned up', { zombieCallId: activeCall.id });
      } else {
        // Real active call with participants
        logger.error('❌ Call already active', { conversationId, callId: activeCall.id });
        throw new Error(`${CALL_ERROR_CODES.CALL_ALREADY_ACTIVE}: A call is already active in this conversation`);
      }
    }

    // Create call session with participant in a transaction
    const callSession = await this.prisma.$transaction(async (tx) => {
      // Create call session
      const session = await tx.callSession.create({
        data: {
          conversationId,
          initiatorId,
          mode: CallMode.p2p, // Phase 1A: P2P only
          status: CallStatus.initiated,
          metadata: {
            type, // 'video' or 'audio'
            ...settings
          }
        }
      });

      // Create participant for initiator
      // Audit C5 (2026-07-02): `leftAt` must be written explicitly as `null`
      // — MongoDB has no NULL-vs-missing-field distinction at the storage
      // layer, but Prisma's query engine treats them differently: a field
      // omitted from `data` at create time is never written to the document,
      // so a later `findFirst({ where: { leftAt: null } })` (used throughout
      // this service, e.g. updateParticipantMedia) never matches it. That
      // caused 100% of media-toggle DB writes to silently no-op in prod.
      await tx.callParticipant.create({
        data: {
          callSessionId: session.id,
          participantId,
          role: ParticipantRole.initiator,
          leftAt: null,
          isAudioEnabled: settings?.audioEnabled ?? true,
          isVideoEnabled: type === 'video' ? (settings?.videoEnabled ?? true) : false
        }
      });

      return session;
    });

    // TOCTOU close (audit 2026-07-02): the zombie/active-call check above is a
    // plain read that ran BEFORE this session was created — two near-
    // simultaneous `initiateCall` calls for the same conversation (mutual
    // calling, or a client double-tap racing its own UI's disable-button)
    // can both pass that read and each create a `CallSession`. MongoDB
    // guarantees single-document writes are atomic even without a
    // transaction, so this conditional `updateMany` against `Conversation`
    // deterministically lets exactly one of two concurrent callers win the
    // claim; the loser observes `count === 0` and unwinds its own orphaned
    // session instead of leaving two live sessions for one conversation.
    // Prisma-on-MongoDB null semantics: `activeCallId: null` matches ONLY
    // documents where the field is explicitly null — NOT documents missing
    // the field entirely (every conversation created before this claim was
    // introduced, plus any new conversation Prisma creates while omitting
    // unset optionals). Without the `isSet: false` arm the claim can NEVER
    // succeed on those documents and every initiateCall fails
    // CALL_ALREADY_ACTIVE (prod incident 2026-07-02: 211/211 conversations
    // lacked the field; hot-fixed by backfilling `activeCallId: null`).
    const claim = await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [{ activeCallId: null }, { activeCallId: { isSet: false } }]
      },
      data: { activeCallId: callSession.id }
    });

    if (claim.count === 0) {
      const healed = await this.reclaimFromTerminalHolder(conversationId, callSession.id);
      if (!healed) {
        logger.error('❌ Call already active (lost race to claim conversation)', {
          conversationId,
          orphanedCallId: callSession.id
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.callParticipant.deleteMany({ where: { callSessionId: callSession.id } });
          await tx.callSession.delete({ where: { id: callSession.id } });
        });
        throw new Error(`${CALL_ERROR_CODES.CALL_ALREADY_ACTIVE}: A call is already active in this conversation`);
      }
    }

    logger.info('✅ Call initiated successfully', {
      callId: callSession.id,
      conversationId,
      initiatorId
    });

    // Fetch and return complete call session with participants
    return this.getCallSession(callSession.id);
  }

  /**
   * Join an existing call
   * - Validates call exists and status is 'initiated' or 'active'
   * - Validates user is participant of conversation
   * - Creates CallParticipant for joiner
   * - Updates call status to 'active' if was 'initiated'
   * - CVE-005: Returns dynamic TURN credentials via TURNCredentialService
   * - Returns updated CallSession with ICE servers
   */
  async joinCall(data: JoinCallData): Promise<{
    callSession: CallSessionWithParticipants;
    iceServers: RTCIceServer[]
  }> {
    return this.joinCallAttempt(data, 0);
  }

  /**
   * MongoDB can detect two transactions racing on the same CallSession
   * document BEFORE either side's app-level `version` guard returns
   * `count: 0` — Prisma surfaces that as P2034 ("write conflict or
   * deadlock, please retry") instead of letting our own conditional
   * `updateMany` resolve the race. Every version-guarded terminal write
   * (join/end/leave) must treat P2034 the same as its own local
   * version-conflict signal — fall back to the fresh-state path instead of
   * throwing a raw Prisma error at the client (prod 2026-07-04, callId
   * observed on `call:join`: two `call:join` 3-11ms apart).
   */
  private isTransientWriteConflict(error: unknown): boolean {
    return (error as { code?: string } | null)?.code === 'P2034';
  }

  /**
   * TOCTOU close (audit 2026-07-02): `activeParticipants.length >= 2` below
   * reads a snapshot fetched before this method's own write, so two callers
   * racing to join the same call (a third party racing the intended callee,
   * or the same user answering from two devices within milliseconds) could
   * both read `< 2` and both insert a `CallParticipant`, exceeding the P2P
   * cap every downstream consumer assumes. The join transaction now also
   * does a version-guarded conditional update on the shared `CallSession`
   * document — MongoDB detects the write conflict when two transactions
   * touch that same document concurrently, so at most one caller's
   * transaction commits. The loser retries once against freshly-read state,
   * where the cap check above will correctly reject it if the winner took
   * the last slot.
   */
  private async joinCallAttempt(data: JoinCallData, attempt: number): Promise<{
    callSession: CallSessionWithParticipants;
    iceServers: RTCIceServer[]
  }> {
    const { callId, userId, participantId, settings } = data;

    logger.info('📞 User joining call', { callId, userId });

    // Validate call exists
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { conversation: true, participants: true }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Validate call is not in a terminal state (ended/missed/rejected/failed)
    if (TERMINAL_STATUSES.includes(call.status)) {
      logger.error('❌ Call is in terminal state', { callId, status: call.status });
      throw new Error(`${CALL_ERROR_CODES.CALL_ENDED}: This call has already ended`);
    }

    // Check if user is participant of conversation. See the matching guard in
    // `initiateCall` for why `participantId` must be checked before the
    // Prisma query: `id: undefined` is treated as an omitted field, not
    // "match nothing", which would otherwise let a non-member's join sail
    // through as long as the conversation has any active participant.
    if (!participantId) {
      logger.error('❌ Missing participantId — cannot verify conversation membership', {
        conversationId: call.conversationId,
        userId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    const membership = await this.prisma.participant.findFirst({
      where: {
        conversationId: call.conversationId,
        id: participantId,
        isActive: true
      }
    });

    if (!membership) {
      logger.error('❌ User is not a participant in conversation', {
        conversationId: call.conversationId,
        userId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    // Check if user is already in the call
    const existingParticipant = call.participants.find(
      (p) => p.participantId === participantId && !p.leftAt
    );

    if (existingParticipant) {
      logger.warn('⚠️ User already in call', { callId, userId });
      // CVE-005: Return current state with dynamic ICE servers
      const iceServers = this.turnCredentialService.generateCredentials(userId);
      const callSession = await this.getCallSession(callId);
      return {
        callSession,
        iceServers
      };
    }

    // Phase 1A: Enforce P2P mode (max 2 participants)
    const activeParticipants = call.participants.filter((p) => !p.leftAt);
    if (activeParticipants.length >= 2) {
      logger.error('❌ Max participants reached for P2P call', {
        callId,
        activeParticipants: activeParticipants.length
      });
      throw new Error(
        `${CALL_ERROR_CODES.MAX_PARTICIPANTS_REACHED}: Maximum participants (2) reached for P2P calls`
      );
    }

    // Privacy gate (audit 2026-07-07): the joiner's isVideoEnabled must be
    // derived from the call's actual media type, exactly like the
    // initiator's is at create time above — never trust `settings.videoEnabled`
    // on its own. Without this, a stale or malicious client answering an
    // AUDIO call with `videoEnabled: true` gets recorded (and, via the web
    // client, actually transmits) live camera video the callee never
    // consented to for this call.
    const metadataType = (call.metadata as Record<string, unknown> | null)?.type;
    const isVideoCall = metadataType === 'video';

    // Join call in transaction, guarded by an optimistic-lock claim on
    // CallSession.version so a concurrent joiner can't silently slip past
    // the cap check above (see joinCallAttempt's doc comment).
    const versionConflict = Symbol('versionConflict');
    const outcome = await this.prisma.$transaction(async (tx) => {
      // Create participant. See the C5 note on the initiator's `create` above
      // — `leftAt: null` must be explicit or later `findFirst({ leftAt: null })`
      // lookups (e.g. updateParticipantMedia) never match this row.
      await tx.callParticipant.create({
        data: {
          callSessionId: callId,
          participantId,
          role: ParticipantRole.participant,
          leftAt: null,
          isAudioEnabled: settings?.audioEnabled ?? true,
          isVideoEnabled: isVideoCall ? (settings?.videoEnabled ?? true) : false
        }
      });

      // Item F (chaos-test 2, callId 6a4690a2…) — the callee EARLY-joins while
      // still ringing (the SDP offer must flow during the ring), so this
      // transition means "it is ringing on their device", NOT "they answered".
      // Stamping connecting+answeredAt here made `ringing` invisible
      // server-side, gave the boot rehydration (initiated/ringing) nothing to
      // re-arm after a mid-ring restart (the call decayed to failed/91s via
      // the connecting GC tier instead of resolving missed), and inflated
      // `duration` with the ringing time. The real pick-up already stamps
      // active+answeredAt via updateCallStatus on the SDP answer.
      // Server FSM: initiated → ringing → active.
      const statusChange =
        call.status === CallStatus.initiated || call.status === CallStatus.ringing
          ? { status: CallStatus.ringing }
          : {};

      // Conditional update scoped to the version we read at the top of this
      // attempt: if a concurrent joiner already committed a change to this
      // CallSession, `count` is 0 and we roll back (including the
      // CallParticipant just created above) by throwing.
      const lock = await tx.callSession.updateMany({
        where: { id: callId, version: call.version },
        data: { version: { increment: 1 }, ...statusChange }
      });

      if (lock.count === 0) {
        throw versionConflict;
      }
    }).then(
      () => 'joined' as const,
      (error) => {
        if (error === versionConflict || this.isTransientWriteConflict(error)) {
          return 'conflict' as const;
        }
        throw error;
      }
    );

    if (outcome === 'conflict') {
      if (attempt >= 1) {
        logger.error('❌ Call state conflict persisted after retry', { callId, userId });
        throw new Error(`${CALL_ERROR_CODES.CALL_STATE_CONFLICT}: Call state changed concurrently, please retry`);
      }
      logger.warn('⚠️ Call state conflict on join — retrying with fresh state', { callId, userId });
      return this.joinCallAttempt(data, attempt + 1);
    }

    logger.info('✅ User joined call successfully', { callId, userId });

    // CVE-005: Generate dynamic TURN credentials for this user
    const iceServers = this.turnCredentialService.generateCredentials(userId);

    const callSession = await this.getCallSession(callId);

    return {
      callSession,
      iceServers
    };
  }

  /**
   * Leave a call
   * - Updates CallParticipant.leftAt
   * - If last participant, end call (status='ended', endedAt=now)
   * - Returns updated CallSession
   */
  async leaveCall(data: LeaveCallData): Promise<CallSessionWithParticipants> {
    const { callId, userId, participantId } = data;

    logger.info('📞 User leaving call', { callId, userId });

    // Find the call participant. Audit C5 (2026-07-02) — match both explicit
    // null and never-written leftAt (pre-C5 Mongo docs).
    const callParticipant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        participantId,
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
      }
    });

    if (!callParticipant) {
      // CALL-FIX 2026-06-06 — IDEMPOTENT LEAVE. The leaver's active (leftAt:null)
      // CallParticipant row is missing: either a racing path stamped it first
      // (socket `disconnect` auto-leave, a double `call:leave`), OR the handler
      // passed a fallback `participantId` (a User.id, when resolveParticipantId
      // returned null) that can never match `CallParticipant.participantId`
      // (a Participant.id). A legitimate hang-up must NEVER throw here — throwing
      // made the handler skip the `call:ended` broadcast, so the OTHER party
      // stayed "in call" until CallCleanupService force-FAILED the call 30s later.
      // Instead, ensure the call is terminal and RETURN it so the handler still
      // broadcasts `call:ended` cleanly.
      const existing = await this.prisma.callSession.findUnique({
        where: { id: callId },
        include: { participants: true }
      });

      if (!existing) {
        logger.error('❌ Call not found on idempotent leave', { callId, userId });
        throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
      }

      // Already ended by the racing path → return as-is; the handler still
      // broadcasts call:ended. (`endedAt != null` is the terminal signal.)
      if (existing.endedAt) {
        logger.info('ℹ️ Idempotent leave — call already ended, returning session', {
          callId, userId, status: existing.status
        });
        return this.getCallSession(callId);
      }

      // Mirror the normal direct/last-participant decision below.
      const idemConversation = await this.prisma.conversation.findUnique({
        where: { id: existing.conversationId },
        select: { type: true }
      });
      const idemIsDirect = idemConversation?.type === 'direct';
      const idemRemaining = existing.participants.filter((p) => !p.leftAt).length;
      if (!idemIsDirect && idemRemaining > 1) {
        // Group call with others still active and this leaver already gone:
        // nothing to end. Return the live session unchanged.
        logger.info('ℹ️ Idempotent leave — leaver gone, group call continues', { callId, userId });
        return this.getCallSession(callId);
      }

      // Direct call (or last participant): end it so the OTHER party is notified.
      const idemNow = new Date();
      // Same `answeredAt` criterion as the main path below (2026-07-03).
      const idemPreAnswered = !existing.answeredAt;
      // Audit Vague 27 — anchor duration on answeredAt (talk time), mirroring
      // endCall()'s `call.answeredAt ? … : 0`. This idempotent branch was
      // still anchoring on startedAt unconditionally (ring+talk time),
      // producing a duration inconsistent with the same real-world call
      // ending via a different path (e.g. the main leaveCall branch, or the
      // explicit "End Call" button).
      const idemDuration = idemPreAnswered
        ? 0
        : Math.max(0, Math.floor((idemNow.getTime() - existing.answeredAt!.getTime()) / 1000));
      // Version-guarded (see endCall()'s doc comment): a racing terminal
      // writer (call:end, force-end) could resolve this same call between
      // the `existing` read above and this write; scope to `existing.version`
      // so the losing writer no-ops instead of clobbering the winner's
      // duration/endReason.
      const idemVersionConflict = Symbol('idemVersionConflict');
      const idemOutcome = await this.prisma.$transaction(async (tx) => {
        await tx.callParticipant.updateMany({
          where: { callSessionId: callId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
          data: { leftAt: idemNow }
        });
        const lock = await tx.callSession.updateMany({
          where: { id: callId, version: existing.version },
          data: {
            status: idemPreAnswered ? CallStatus.missed : CallStatus.ended,
            endReason: idemPreAnswered ? CallEndReason.missed : CallEndReason.completed,
            endedAt: idemNow,
            duration: idemDuration,
            // Mirror endCall(): record WHO ended the call in the metadata
            // blob. A pre-answer leave by the initiator is how the summary
            // distinguishes "Appel annulé" (cancelled by caller) from a plain
            // "Appel manqué" (endedByInitiator, see createCallSummaryMessage).
            metadata: {
              ...(existing.metadata as Record<string, unknown>),
              endedBy: userId
            },
            version: { increment: 1 }
          }
        });
        if (lock.count === 0) {
          throw idemVersionConflict;
        }
      }).then(
        () => 'ended' as const,
        (error) => {
          if (error === idemVersionConflict || this.isTransientWriteConflict(error)) {
            return 'conflict' as const;
          }
          throw error;
        }
      );

      if (idemOutcome === 'conflict') {
        logger.warn('⚠️ Idempotent leave lost race to a concurrent terminal write — returning current session', {
          callId, userId
        });
        return this.getCallSession(callId);
      }

      this.clearHeartbeats(callId);
      this.clearRingingTimeout(callId);
      await this.releaseActiveCallClaim(existing.conversationId, callId);
      logger.info('✅ Idempotent leave — call force-ended for absent participant', {
        callId, userId, wasPreAnswered: idemPreAnswered
      });
      return this.getCallSession(callId);
    }

    // Get call with all participants
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { participants: true }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Terminal guard (probe prod 2026-07-02 22:41Z): a leave landing on a call
    // that another path already resolved (ringing timeout → missed, force-end,
    // concurrent hangup) must only stamp the leaver's leftAt. Recomputing the
    // outcome from a terminal status corrupts history — `missed` is not a
    // pre-answer status, so the old path rewrote it ended/completed with a
    // duration measured to the leave, and the handler posted a second summary.
    if (TERMINAL_STATUSES.includes(call.status) || call.endedAt) {
      await this.prisma.callParticipant.update({
        where: { id: callParticipant.id },
        data: { leftAt: new Date() }
      });
      this.clearParticipantBackgrounded(callId, participantId);
      this.heartbeats.get(callId)?.delete(participantId);
      await this.releaseActiveCallClaim(call.conversationId, callId);
      logger.info('ℹ️ Leave on already-terminal call — participant marked left, terminal status preserved', {
        callId, userId, status: call.status
      });
      return this.getCallSession(callId);
    }

    const leftAt = new Date();

    // CALL-FIX 2026-06-06 — a DIRECT (1:1) call cannot continue with a single
    // remaining participant, so ANY leave (callee decline, caller cancel, hangup)
    // must END the call so the OTHER party is notified (call:ended broadcast) and
    // stops ringing. Previously only the LAST participant leaving ended the call:
    // when the callee declined, the caller remained (isLastParticipant=false), the
    // call stayed open, no call:ended was broadcast, and the caller's ringback kept
    // playing until they manually hung up. GROUP calls still continue until the
    // last participant leaves.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: call.conversationId },
      select: { type: true }
    });
    const isDirectCall = conversation?.type === 'direct';

    // Check if this is the last active participant
    const activeParticipants = call.participants.filter((p) => !p.leftAt && p.id !== callParticipant.id);
    const isLastParticipant = activeParticipants.length === 0 || isDirectCall;

    // Audit P1-29 — distinguish "leave before the call was ever answered"
    // (callee declined or initiator cancelled before media negotiation
    // completed) from "leave during an active call". The pre-answer case
    // must map to `missed` (with `endReason: missed`) so:
    //   - the iOS UI surfaces a missed-call banner on the OTHER device,
    //   - Recents shows "Missed" / "Cancelled" instead of "Ended",
    //   - the gateway emits `call:missed` in addition to `call:ended` and
    //     can create missed-call push notifications for offline callees.
    // 2026-07-03 — keyed on `answeredAt` (stamped once, on the SDP answer),
    // not on a status list: `reconnecting` is reachable pre-answer via a
    // stale client's ring-time watchdog (see endCall's doc comment).
    const wasPreAnswered = !call.answeredAt;
    const targetEndedStatus = wasPreAnswered ? CallStatus.missed : CallStatus.ended;
    const targetEndReason = wasPreAnswered ? CallEndReason.missed : CallEndReason.completed;

    // Update in transaction. Version-guarded on the terminal write (see
    // endCall()'s doc comment): a racing terminal writer for this same call
    // (e.g. a retried call:end, or the OTHER participant's own leave landing
    // concurrently) could resolve it between the `call` read above and this
    // write; scoping to `call.version` makes the losing writer's terminal
    // write a no-op instead of clobbering the winner's duration/endReason.
    const leaveVersionConflict = Symbol('leaveVersionConflict');
    const leaveOutcome = await this.prisma.$transaction(async (tx) => {
      // Update participant left time
      await tx.callParticipant.update({
        where: { id: callParticipant.id },
        data: { leftAt }
      });

      // If last participant, end the call (status depends on pre/post-answer).
      if (isLastParticipant) {
        // Stamp leftAt on any OTHER still-active participant too (mirrors
        // endCall()'s updateMany and the idempotent-leave branch above). A
        // direct call always ends here regardless of whether the other party
        // has formally left — without this, the other party's CallParticipant
        // row keeps leftAt: null forever even though the CallSession is now
        // terminal, so every per-event authorization check that gates on
        // `!leftAt` (resolveActiveCallParticipantId — call:signal, heartbeat,
        // quality-report, reconnecting/reconnected, request-ice-servers,
        // backgrounded/foregrounded, screen-capture-detected) keeps accepting
        // that party's events against a dead call indefinitely.
        await tx.callParticipant.updateMany({
          where: {
            callSessionId: callId,
            id: { not: callParticipant.id },
            OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
          },
          data: { leftAt }
        });

        // Audit Vague 27 — anchor duration on answeredAt (talk time),
        // mirroring endCall()'s `call.answeredAt ? … : 0`. This was still
        // anchoring on startedAt unconditionally (ring+talk time), producing
        // a duration inconsistent with the same real-world call ending via
        // a different path (e.g. the explicit "End Call" button).
        const duration = wasPreAnswered
          ? 0
          : Math.max(0, Math.floor((leftAt.getTime() - call.answeredAt!.getTime()) / 1000));

        const lock = await tx.callSession.updateMany({
          where: { id: callId, version: call.version },
          data: {
            status: targetEndedStatus,
            endReason: targetEndReason,
            endedAt: leftAt,
            duration,
            // Mirror endCall(): record WHO ended the call. The callee's
            // decline and the caller's cancel both land here — the summary
            // uses initiator equality to render "Appel annulé" per-viewer.
            metadata: {
              ...(call.metadata as Record<string, unknown>),
              endedBy: userId
            },
            version: { increment: 1 }
          }
        });

        if (lock.count === 0) {
          throw leaveVersionConflict;
        }

        logger.info('✅ Call closed - last participant left', {
          callId,
          duration,
          status: targetEndedStatus,
          endReason: targetEndReason,
          wasPreAnswered
        });
      }
    }).then(
      () => 'left' as const,
      (error) => {
        if (error === leaveVersionConflict || this.isTransientWriteConflict(error)) {
          return 'conflict' as const;
        }
        throw error;
      }
    );

    if (leaveOutcome === 'conflict') {
      logger.warn('⚠️ Leave-triggered call end lost race to a concurrent terminal write — returning current session', {
        callId, userId
      });
      return this.getCallSession(callId);
    }

    if (isLastParticipant) {
      this.clearHeartbeats(callId);
      this.clearRingingTimeout(callId);
      await this.releaseActiveCallClaim(call.conversationId, callId);
    } else {
      // Mid-call leave: clear only this participant's backgrounded state and
      // heartbeat entry. clearHeartbeats() handles the full call cleanup when
      // the last participant leaves; for mid-call leaves we must clean up
      // individually, or the departed participant's stale heartbeat lingers
      // in memory for the rest of the call.
      this.clearParticipantBackgrounded(callId, participantId);
      this.heartbeats.get(callId)?.delete(participantId);
    }

    logger.info('✅ User left call successfully', { callId, userId, wasPreAnswered });

    return this.getCallSession(callId);
  }

  /**
   * Get call session details with participants
   * CVE-003: Added authorization check — the requesting USER must be an active
   * member of the call's conversation (or already a call participant).
   *
   * @param callId - Call session ID
   * @param requestingUserId - Optional `User.id` requesting access. The REST route
   *   `GET /calls/:callId` passes `authContext.userId`. Authorization MUST be
   *   resolved by user (`Participant.userId`), NOT by `Participant.id`: a callee
   *   fetching an incoming call to answer it is not yet a `CallParticipant` and
   *   never has a `Participant` row whose `id` equals their `userId` — the old
   *   `id:` lookup 403'd every legitimate callee (regression from the Participant
   *   migration), which left incoming calls unjoinable.
   */
  async getCallSession(callId: string, requestingUserId?: string): Promise<CallSessionWithParticipants> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: callSessionInclude
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // CVE-003: Authorization check if a requesting user is provided.
    if (requestingUserId) {
      // Fast path: the user is already a participant of this call.
      const isCallParticipant = call.participants.some((p) => p.participant?.userId === requestingUserId);

      // Otherwise, authorize by active membership of the call's conversation.
      if (!isCallParticipant) {
        const isMember = await this.prisma.participant.findFirst({
          where: {
            conversationId: call.conversationId,
            userId: requestingUserId,
            isActive: true
          }
        });

        if (!isMember) {
          logger.warn('❌ Unauthorized call access attempt', {
            callId,
            userId: requestingUserId,
            conversationId: call.conversationId
          });
          throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You do not have access to this call`);
        }
      }
    }

    return call;
  }

  /**
   * End call (force end by moderator or system)
   * CVE-004: Added authorization check - only initiator or moderators can end calls
   *
   * @param callId - Call session ID
   * @param endedBy - User ID attempting to end the call
   * @param participantId - Participant ID of the user ending the call
   * @param isAnonymous - Whether the user is anonymous (anonymous users CANNOT end calls)
   */
  async endCall(callId: string, endedBy: string, participantId: string, isAnonymous?: boolean, reason?: string): Promise<CallSessionWithParticipants> {
    logger.info('Ending call', { callId, endedBy, isAnonymous, reason });

    // CVE-004: Anonymous users cannot end calls for everyone
    if (isAnonymous) {
      logger.warn('⚠️ Anonymous user attempted to end call', { callId, userId: endedBy });
      throw new Error(`${CALL_ERROR_CODES.PERMISSION_DENIED}: Anonymous users cannot end calls. Use leave instead.`);
    }

    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true
      }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Idempotency: `updateCallStatus`/`leaveCall` already short-circuit on
    // ANY terminal status, not just `ended` — this guard only checked
    // `ended`, so a call already resolved to `missed`/`rejected`/`failed`
    // by another path (e.g. the ringing-timeout's `markCallAsMissed`, which
    // never touches participant rows) could still be re-processed by a
    // delayed/retried `call:end` and get silently overwritten back to
    // `ended`/`completed` — reopening the exact "phantom completed call"
    // bug the C3/C4 pre-answer fix above was meant to close.
    if (TERMINAL_STATUSES.includes(call.status)) {
      logger.warn('⚠️ Call already in terminal state', { callId, currentStatus: call.status });
      return this.getCallSession(callId);
    }

    // CVE-004: Verify user has permission to end the call (initiator or moderator role)
    const userParticipant = call.participants.find(p => p.participantId === participantId && !p.leftAt);

    if (!userParticipant) {
      logger.error('❌ User not in call', { callId, endedBy });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not in this call`);
    }

    // P2P: ANY active participant can end the call (spec C4 fix)
    // SFU (Phase 2): only initiator/moderator can end for everyone

    const endedAt = new Date();
    const duration = call.answeredAt
      ? Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1000)
      : 0;

    // Audit C3/C4 (2026-07-02 prod audit) — mirror leaveCall()'s pre-answer
    // handling: a call ended before it was ever answered must resolve to
    // `missed`, never `completed`. Without this, `call:end` fired before the
    // callee answered persisted status='ended'/duration=0/reason='completed'
    // — a phantom "completed" call in history that never triggered a
    // missed-call notification for the other party. An explicit non-default
    // reason (rejected/failed/...) is preserved as endReason; only the status
    // is normalized to `missed` so history/Recents filters stay consistent
    // with leaveCall().
    // 2026-07-03 (prod call 6a47689d) — the criterion is `answeredAt`, NOT a
    // status list: a pre-answer client watchdog dragged the session
    // ringing→reconnecting during the ring, and the old
    // initiated|ringing|connecting check classified that never-answered call
    // as completed. `answeredAt` is stamped exactly once, on the SDP answer
    // (updateCallStatus → active) — it is the authoritative "was ever
    // answered" signal across every status the session may pass through.
    const wasPreAnswered = !call.answeredAt;
    const resolvedReason = this.resolveEndReason(reason);
    const endReason = wasPreAnswered && resolvedReason === CallEndReason.completed
      ? CallEndReason.missed
      : resolvedReason;
    // Un refus EXPLICITE (reason=rejected, envoyé par les boutons Refuser de
    // toutes les plateformes) garde son statut distinct : normalisé `missed`,
    // il déclenchait handleMissedCall — une notification « appel manqué »
    // pour un appel que le callee venait de REFUSER — et tombait dans le
    // filtre « manqués » du journal (dont le commentaire suppose, à raison,
    // un statut `rejected` que rien n'écrivait jusqu'ici).
    const targetStatus = !wasPreAnswered
      ? CallStatus.ended
      : resolvedReason === CallEndReason.rejected
        ? CallStatus.rejected
        : CallStatus.missed;

    // Version-guarded: a plain read-modify-write here raced with any other
    // terminal writer touching this same call (a retried `call:end`, a
    // concurrent `leaveCall`/force-end from CallCleanupService/disconnect
    // handling) — both read the same pre-terminal snapshot, both pass the
    // `TERMINAL_STATUSES` guard above, and whichever writes last silently
    // clobbers the other's `duration`/`endReason`. Scoping the final write to
    // `version: call.version` (same optimistic-lock field `joinCallAttempt`
    // uses) makes the losing writer's update a no-op and roll back its
    // participant `leftAt` stamps too, instead of corrupting the record.
    const versionConflict = Symbol('versionConflict');
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.callParticipant.updateMany({
        where: {
          callSessionId: callId,
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
        },
        data: { leftAt: endedAt }
      });

      const lock = await tx.callSession.updateMany({
        where: { id: callId, version: call.version },
        data: {
          status: targetStatus,
          endedAt,
          duration,
          endReason,
          metadata: {
            ...(call.metadata as Record<string, unknown>),
            endedBy
          },
          version: { increment: 1 }
        }
      });

      if (lock.count === 0) {
        throw versionConflict;
      }
    }).then(
      () => 'ended' as const,
      (error) => {
        if (error === versionConflict || this.isTransientWriteConflict(error)) {
          return 'conflict' as const;
        }
        throw error;
      }
    );

    if (outcome === 'conflict') {
      logger.warn('⚠️ Call end lost race to a concurrent terminal write — returning current session', {
        callId, endedBy
      });
      return this.getCallSession(callId);
    }

    this.clearHeartbeats(callId);
    this.clearRingingTimeout(callId);
    await this.releaseActiveCallClaim(call.conversationId, callId);

    logger.info('Call ended successfully', { callId, duration, endedBy, endReason, wasPreAnswered });

    return this.getCallSession(callId);
  }

  /**
   * Get active call for conversation
   */
  async getActiveCallForConversation(conversationId: string): Promise<CallSessionWithParticipants | null> {
    const call = await this.prisma.callSession.findFirst({
      where: {
        conversationId,
        status: { in: ACTIVE_STATUSES }
      },
      include: callSessionInclude
    });

    return call;
  }

  /**
   * Paginated call journal for a user: the terminal (ended/missed/rejected/
   * failed) calls in conversations they belong to, newest first, over a 3-month
   * sliding window. Cursor-paginated by call id.
   *
   * Peer resolution: for a direct (P2P) conversation the "other party" is the
   * conversation's other member — resolved from the conversation roster, not the
   * call participants — so a missed outgoing call (callee never joined) still
   * shows who was dialed. Group calls carry no peer (the conversation
   * name/avatar identifies them).
   */
  async listHistory(
    userId: string,
    options: { limit: number; cursor?: string; filter: 'all' | 'missed' }
  ): Promise<{ items: CallHistoryItem[]; hasMore: boolean; nextCursor?: string }> {
    const { limit, cursor, filter } = options;
    const windowStart = new Date(Date.now() - CALL_HISTORY_WINDOW_MS);

    const where: Prisma.CallSessionWhereInput = {
      startedAt: { gte: windowStart },
      status: { in: TERMINAL_STATUSES },
      conversation: { participants: { some: { userId, isActive: true } } }
    };
    if (filter === 'missed') {
      // A missed call: an incoming call that rang out unanswered. Keyed on the
      // distinct `missed` status so calls the user actively rejected
      // (status `rejected`) and the user's own unanswered outgoing calls are
      // excluded.
      where.status = CallStatus.missed;
      where.initiatorId = { not: userId };
    }

    const rows = await this.prisma.callSession.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        conversationId: true,
        mode: true,
        status: true,
        endReason: true,
        initiatorId: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        duration: true,
        bytesSent: true,
        bytesReceived: true,
        metadata: true,
        conversation: { select: { type: true, title: true, avatar: true } }
      }
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

    // Resolve all direct-call peers in a single batched roster query.
    const directConvIds = Array.from(
      new Set(page.filter((r) => r.conversation.type === 'direct').map((r) => r.conversationId))
    );
    const peerByConv = new Map<string, CallHistoryPeer>();
    if (directConvIds.length > 0) {
      const members = await this.prisma.participant.findMany({
        where: { conversationId: { in: directConvIds }, userId: { not: userId } },
        select: {
          conversationId: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              phoneNumber: true,
              isOnline: true
            }
          }
        }
      });
      for (const m of members) {
        if (m.user && !peerByConv.has(m.conversationId)) {
          peerByConv.set(m.conversationId, {
            userId: m.user.id,
            username: m.user.username,
            displayName: m.user.displayName ?? null,
            avatar: m.user.avatar ?? null,
            phoneNumber: m.user.phoneNumber ?? null,
            isOnline: m.user.isOnline
          });
        }
      }
    }

    const items = page.map((row) =>
      buildCallHistoryItem(
        row as CallHistoryRow,
        userId,
        row.conversation.type === 'direct' ? peerByConv.get(row.conversationId) ?? null : null
      )
    );

    return { items, hasMore, nextCursor };
  }

  /**
   * Update participant media state (audio/video toggle)
   */
  async updateParticipantMedia(
    callId: string,
    participantId: string,
    mediaType: 'audio' | 'video',
    enabled: boolean
  ): Promise<CallSessionWithParticipants> {
    logger.info('📞 Updating participant media state', {
      callId,
      participantId,
      mediaType,
      enabled
    });

    // Find the call participant. Audit C5 (2026-07-02) — the `{leftAt: null}`
    // filter alone never matched docs whose leftAt field was never written,
    // making this lookup (and the DB media flag below) a 100% no-op in prod.
    const callParticipant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        participantId,
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
      }
    });

    // CALL-FIX 2026-06-06 — TOLERANT media toggle. The DB media flag
    // (isAudioEnabled/isVideoEnabled) is bookkeeping; what actually matters is
    // that the handler BROADCASTS call:media-toggled to the peer (avatar
    // placeholder). When the resolved `participantId` doesn't match an active
    // CallParticipant row (participantId↔Participant.id resolution drift, or a
    // racing leave), THROWING aborted the whole toggle — the peer never learned
    // the camera turned off, and the error bubbled back to the toggling client.
    // Skip the bookkeeping update best-effort instead of throwing so the toggle
    // still propagates.
    if (!callParticipant) {
      logger.warn('⚠️ updateParticipantMedia — no active CallParticipant, skipping DB flag (toggle still broadcast)', {
        callId, participantId, mediaType, enabled
      });
      return this.getCallSession(callId);
    }

    // Update media state
    await this.prisma.callParticipant.update({
      where: { id: callParticipant.id },
      data:
        mediaType === 'audio'
          ? { isAudioEnabled: enabled }
          : { isVideoEnabled: enabled }
    });

    logger.info('✅ Participant media state updated', {
      callId,
      participantId,
      mediaType,
      enabled
    });

    return this.getCallSession(callId);
  }

  /**
   * Marquer un appel comme manqué
   * À appeler quand un appel n'est pas répondu après un timeout
   */
  async markCallAsMissed(callId: string): Promise<CallSessionWithParticipants> {
    logger.info('📞 Marking call as missed', { callId });

    const callSession = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true,
        initiator: true
      }
    });

    if (!callSession) {
      logger.error('❌ Call session not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Audit P2-GW-3 — guard against non-ringing states. The ringing
    // timeout callback already performs an atomic `updateMany` scoped to
    // `[initiated, ringing]`, so when this path runs the row is typically
    // already `missed`. Unconditionally re-writing it drifts `endedAt`
    // (+a few ms) and `duration` (+a few seconds) on every retry.
    if (callSession.status !== CallStatus.initiated && callSession.status !== CallStatus.ringing) {
      logger.info('Call already in non-ringing state — skipping markCallAsMissed write', {
        callId,
        currentStatus: callSession.status
      });
      // Audit 2026-07-02 — if the status write already landed via another
      // path (the ringing-timeout handler's own atomic `updateMany`), that
      // path only touches CallSession.status: it never stamps participant
      // rows, clears in-memory heartbeats/timers, or releases the
      // conversation's active-call claim. Skipping those here left the claim
      // locked forever (every future `call:initiate` on the conversation
      // failed CALL_ALREADY_ACTIVE) and left `call:signal` still relaying
      // SDP/ICE between "missed" participants (their `leftAt` was never
      // set). Only run this for genuinely terminal statuses — an `active`/
      // `connecting`/`reconnecting` call must never be torn down here.
      // Idempotent: a no-op if another terminal path already did it.
      if (TERMINAL_STATUSES.includes(callSession.status)) {
        await this.finalizeMissedCallCleanup(callSession.conversationId, callId);
      }
      return this.getCallSession(callId);
    }

    // Mettre à jour le statut de l'appel
    const now = new Date();
    // Anchor on answeredAt (talk time), mirroring every sibling terminal
    // writer (endCall/leaveCall/forceEndCall/the phantom+zombie cleanup
    // sweeps — Vague 25/27/30). The guard above only lets `initiated`/
    // `ringing` calls reach here, and `answeredAt` is stamped exclusively on
    // the transition to `active`, so a call resolved `missed` here was NEVER
    // answered — its duration must be 0, not `now - startedAt` (ring time),
    // else call history shows a phantom "Manqué · N:NN" instead of "Manqué".
    const duration = 0;

    // Version/status-scoped write, mirroring updateCallStatus()'s optimistic
    // lock — a concurrent terminal writer (call:end, call:leave, the ringing
    // timeout handler on another path, CallCleanupService GC) can resolve this
    // call between the findUnique read above and this write. Scoping the
    // update to the source statuses we actually read makes a losing writer's
    // update a no-op instead of clobbering endedAt/duration/endReason.
    const result = await this.prisma.callSession.updateMany({
      where: {
        id: callId,
        status: { in: [CallStatus.initiated, CallStatus.ringing] }
      },
      data: {
        status: CallStatus.missed,
        endedAt: now,
        duration,
        endReason: CallEndReason.missed,
        // Terminal write protocol: every terminal writer MUST bump `version`,
        // even one guarded by status rather than by version — otherwise a
        // version-guarded writer (endCall/leaveCall/updateCallStatus) that
        // read the row a moment before this write still matches its stale
        // `version` and clobbers this terminal state right after.
        version: { increment: 1 }
      }
    });

    if (result.count === 0) {
      logger.warn('⚠️ markCallAsMissed lost race to a concurrent terminal write — no-op', { callId });
      return this.getCallSession(callId);
    }

    await this.finalizeMissedCallCleanup(callSession.conversationId, callId);

    logger.info('Call marked as missed', { callId, duration });

    return this.getCallSession(callId);
  }

  /**
   * Shared terminal cleanup for a call resolved to `missed` — stamps any
   * still-open participant rows so `call:signal` stops relaying between them,
   * clears in-memory heartbeat/ringing-timer state, and releases the
   * conversation's active-call claim. Safe to call more than once: every
   * write here is scoped/idempotent.
   */
  private async finalizeMissedCallCleanup(conversationId: string, callId: string): Promise<void> {
    await this.prisma.callParticipant.updateMany({
      where: {
        callSessionId: callId,
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
      },
      data: { leftAt: new Date() }
    });
    this.clearHeartbeats(callId);
    this.clearRingingTimeout(callId);
    await this.releaseActiveCallClaim(conversationId, callId);
  }

  /**
   * Récupérer les participants d'un appel qui n'ont pas rejoint
   */
  async getUnrespondedParticipants(callId: string): Promise<string[]> {
    const callSession = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true,
        conversation: {
          include: {
            participants: {
              where: {
                isActive: true
              },
              select: {
                id: true,
                userId: true
              }
            }
          }
        }
      }
    });

    if (!callSession) {
      return [];
    }

    // Récupérer les IDs des participants qui ont déjà rejoint l'appel
    const joinedParticipantIds = callSession.participants.map(p => p.participantId);

    // Récupérer tous les membres de la conversation
    const conversationParticipantIds = callSession.conversation.participants.map(m => m.userId).filter(Boolean) as string[];

    // Exclure l'initiateur et ceux qui ont rejoint
    const unrespondedUserIds = conversationParticipantIds.filter(
      userId => userId !== callSession.initiatorId && !callSession.conversation.participants
        .filter(p => joinedParticipantIds.includes(p.id))
        .some(p => p.userId === userId)
    );

    return unrespondedUserIds;
  }

  /**
   * Resolve a string reason to a Prisma CallEndReason enum. Public: the single
   * normalization point for any raw client-supplied `reason` string reaching a
   * `CallEndReason`-typed field — callers must never cast client input directly.
   */
  resolveEndReason(reason?: string): CallEndReason {
    switch (reason) {
      case 'missed': return CallEndReason.missed;
      case 'rejected': return CallEndReason.rejected;
      case 'failed': return CallEndReason.failed;
      case 'connectionLost': return CallEndReason.connectionLost;
      case 'heartbeatTimeout': return CallEndReason.heartbeatTimeout;
      case 'garbageCollected': return CallEndReason.garbageCollected;
      default: return CallEndReason.completed;
    }
  }

  /**
   * Persist the latest client-reported call statistics onto the CallSession so
   * the call-summary message can surface "data spent" + network quality.
   *
   * WebRTC `bytesSent`/`bytesReceived` are cumulative monotonic counters, so we
   * keep the MAX seen (defensive against out-of-order/duplicate reports); the
   * last report before teardown therefore yields the call totals. The quality
   * tier is overwritten with the most recent non-empty value. Best-effort and
   * never throws — a failed stats write must not break call signaling.
   */
  async persistCallStats(
    callId: string,
    stats: { bytesSent?: number | null; bytesReceived?: number | null; level?: string | null }
  ): Promise<void> {
    const data: Prisma.CallSessionUpdateInput = {};
    const current = await this.prisma.callSession
      .findUnique({ where: { id: callId }, select: { bytesSent: true, bytesReceived: true } })
      .catch(() => null);
    if (current === null) {
      return;
    }
    // "Data spent" is a per-DEVICE figure. Each participant reports its OWN
    // cumulative sent/received, so maxing the two fields independently across
    // participants would mix endpoints and over-count asymmetric calls (e.g.
    // one side sends video). Instead, keep the (sent, received) pair from the
    // single report with the largest TOTAL — a coherent one-device view that is
    // also monotonic across a given participant's growing counters.
    const reportSent = clampNonNegativeInt(stats.bytesSent);
    const reportReceived = clampNonNegativeInt(stats.bytesReceived);
    if (reportSent !== null || reportReceived !== null) {
      const nextSent = reportSent ?? current.bytesSent ?? 0;
      const nextReceived = reportReceived ?? current.bytesReceived ?? 0;
      const currentTotal = (current.bytesSent ?? 0) + (current.bytesReceived ?? 0);
      if (nextSent + nextReceived > currentTotal) {
        data.bytesSent = nextSent;
        data.bytesReceived = nextReceived;
      }
    }
    if (stats.level === 'excellent' || stats.level === 'good' || stats.level === 'fair' || stats.level === 'poor') {
      data.networkQuality = stats.level;
    }
    if (Object.keys(data).length === 0) {
      return;
    }
    await this.prisma.callSession.update({ where: { id: callId }, data }).catch((error) => {
      logger.warn('Failed to persist call stats', {
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  /**
   * P3 — post (or now UPDATE) the call-summary system message when a call
   * reaches a terminal state ("Appel vidéo · 04:32", "Appel audio manqué",
   * "Appel refusé").
   *
   * Upsert semantics (live-call message): `call:initiate` may already have
   * posted the live "Appel … en cours" message under the SAME deterministic
   * `clientMessageId`. Every terminal path therefore:
   *   1. looks the message up with `findFirst(conversationId, clientMessageId)`
   *      (the composite `findUnique` selector does NOT exist in the generated
   *      client — the schema comment is misleading);
   *   2. live found → edits it in-place to the canonical terminal state
   *      (`kind: 'call'`) → `{ kind: 'updated' }`;
   *   3. terminal found → `null` (all 7 terminal paths stay idempotent);
   *   4. absent → creates it → `{ kind: 'created' }`; on P2002 it RE-READS:
   *      a live message that committed mid-race is updated (anti-freeze —
   *      otherwise the bubble stays "en cours" forever), an already-terminal
   *      one is left alone (`null`).
   * `garbageCollected` stays silent when no message exists (housekeeping),
   * but converts an orphaned live message to `failed` ("Appel … interrompu").
   *
   * The caller routes the result: `created` → `message:new` broadcast,
   * `updated` → `message:edited` broadcast.
   */
  async createCallSummaryMessage(
    callId: string
  ): Promise<{ kind: 'created' | 'updated'; message: Prisma.MessageGetPayload<{ include: typeof CALL_SUMMARY_MESSAGE_INCLUDE }> } | null> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      select: {
        id: true,
        conversationId: true,
        initiatorId: true,
        status: true,
        endReason: true,
        duration: true,
        answeredAt: true,
        metadata: true,
        bytesSent: true,
        bytesReceived: true,
        networkQuality: true
      }
    });
    if (!call) {
      return null;
    }

    const sessionMetadata = call.metadata as Record<string, unknown> | null;
    const metadataType = sessionMetadata?.type;
    const callType = typeof metadataType === 'string' ? metadataType : null;
    const endedBy = sessionMetadata?.endedBy;
    const endedById = typeof endedBy === 'string' ? endedBy : null;

    const findExisting = () => this.prisma.message.findFirst({
      where: {
        conversationId: call.conversationId,
        clientMessageId: callSummaryClientMessageId(call.id)
      },
      select: { id: true, metadata: true }
    });
    const isLiveMessage = (existing: { metadata: unknown } | null): boolean =>
      (existing?.metadata as Record<string, unknown> | null)?.kind === 'call-live';
    const applyUpdate = async (
      messageId: string,
      content: string,
      metadata: unknown
    ): Promise<{ kind: 'updated'; message: Prisma.MessageGetPayload<{ include: typeof CALL_SUMMARY_MESSAGE_INCLUDE }> }> => {
      const message = await this.prisma.message.update({
        where: { id: messageId },
        data: {
          content,
          metadata: metadata as Prisma.InputJsonValue
        },
        include: CALL_SUMMARY_MESSAGE_INCLUDE
      });
      logger.info('Live call message updated to terminal state', {
        callId,
        conversationId: call.conversationId
      });
      return { kind: 'updated', message };
    };

    // Compute the human-readable label AND the structured call facts the client
    // renders into a rich, actionable bubble (direction resolved per-viewer from
    // initiatorId, media glyph, outcome tint, and the "duration · data · quality"
    // line) in a single pass. Persisted on `Message.metadata`; survives both the
    // socket broadcast and REST history.
    const built = buildCallSummaryWithMetadata({
      status: call.status,
      endReason: call.endReason,
      callType,
      durationSeconds: call.duration,
      callId: call.id,
      initiatorId: call.initiatorId,
      bytesSent: call.bytesSent,
      bytesReceived: call.bytesReceived,
      networkQuality: call.networkQuality,
      answeredAt: call.answeredAt,
      endedById
    });
    if (!built) {
      // Non-terminal → nothing to do. GC housekeeping stays silent UNLESS a
      // live message was already posted: that bubble would read "en cours"
      // forever, so it converts to the failed terminal state.
      if (call.endReason !== 'garbageCollected') {
        return null;
      }
      const existing = await findExisting();
      if (!existing || !isLiveMessage(existing)) {
        return null;
      }
      const conversion = buildGarbageCollectedConversion({
        callId: call.id,
        initiatorId: call.initiatorId,
        callType
      });
      return applyUpdate(existing.id, conversion.summary.content, conversion.metadata);
    }
    const { summary, metadata: callMetadata } = built;

    const existing = await findExisting();
    if (existing) {
      if (!isLiveMessage(existing)) {
        // A concurrent terminal path already posted the final summary.
        return null;
      }
      return applyUpdate(existing.id, summary.content, callMetadata);
    }

    // `Message.senderId` references a Participant (not a User); resolve the
    // initiator's participant row in this conversation to attribute the
    // summary. iOS/web center system messages regardless of sender, so the
    // attribution is bookkeeping, not a visible "from".
    const initiatorParticipant = await this.prisma.participant.findFirst({
      where: { userId: call.initiatorId, conversationId: call.conversationId },
      select: { id: true }
    });
    if (!initiatorParticipant) {
      logger.warn('Cannot attribute call summary: initiator has no participant row', {
        callId,
        conversationId: call.conversationId,
        initiatorId: call.initiatorId
      });
      return null;
    }

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId: call.conversationId,
          senderId: initiatorParticipant.id,
          content: summary.content,
          originalLanguage: 'fr',
          messageType: 'system',
          messageSource: 'system',
          metadata: (callMetadata ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
          clientMessageId: callSummaryClientMessageId(call.id)
        },
        include: CALL_SUMMARY_MESSAGE_INCLUDE
      });
      logger.info('Call summary message posted', {
        callId,
        conversationId: call.conversationId,
        outcome: summary.outcome,
        callType: summary.callType
      });
      return { kind: 'created', message };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Anti-freeze: the losing side of the race MUST re-read. If the
        // live-create committed between our lookup and this insert, nobody
        // else will ever edit that message — convert it here. If the winner
        // was another terminal path, stay idempotent.
        const raced = await findExisting();
        if (raced && isLiveMessage(raced)) {
          return applyUpdate(raced.id, summary.content, callMetadata);
        }
        return null;
      }
      throw error;
    }
  }

  /**
   * Post the LIVE call message ("Appel audio/vidéo en cours", `kind:
   * 'call-live'`) into the conversation at `call:initiate`, BEFORE any
   * terminal fact exists. It shares the terminal summary's deterministic
   * `clientMessageId`, so the terminal path later edits this same message
   * in-place — one message per call, at its chronological position.
   *
   * Returns `null` (never throws P2002) when nothing should be posted:
   * unknown call, call already terminal (a fast terminal path won the race —
   * its own create posted the final summary), no initiator participant row,
   * or the unique index rejected a duplicate.
   */
  async createLiveCallMessage(
    callId: string
  ): Promise<Prisma.MessageGetPayload<{ include: typeof CALL_SUMMARY_MESSAGE_INCLUDE }> | null> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      select: {
        id: true,
        conversationId: true,
        initiatorId: true,
        status: true,
        metadata: true
      }
    });
    if (!call) {
      return null;
    }
    if (TERMINAL_STATUSES.includes(call.status)) {
      return null;
    }

    const metadataType = (call.metadata as Record<string, unknown> | null)?.type;
    const callType = typeof metadataType === 'string' ? metadataType : null;
    const { summary, metadata: callMetadata } = buildLiveCallMetadata({
      callId: call.id,
      initiatorId: call.initiatorId,
      callType
    });

    const initiatorParticipant = await this.prisma.participant.findFirst({
      where: { userId: call.initiatorId, conversationId: call.conversationId },
      select: { id: true }
    });
    if (!initiatorParticipant) {
      logger.warn('Cannot attribute live call message: initiator has no participant row', {
        callId,
        conversationId: call.conversationId,
        initiatorId: call.initiatorId
      });
      return null;
    }

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId: call.conversationId,
          senderId: initiatorParticipant.id,
          content: summary.content,
          originalLanguage: 'fr',
          messageType: 'system',
          messageSource: 'system',
          metadata: callMetadata as unknown as Prisma.InputJsonValue,
          clientMessageId: callSummaryClientMessageId(call.id)
        },
        include: CALL_SUMMARY_MESSAGE_INCLUDE
      });
      logger.info('Live call message posted', {
        callId,
        conversationId: call.conversationId,
        callType: summary.callType
      });
      return message;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // The call terminated concurrently and its terminal path already
        // posted the final summary — the live message must not exist.
        return null;
      }
      throw error;
    }
  }
}
