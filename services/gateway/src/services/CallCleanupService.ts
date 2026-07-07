/**
 * CallCleanupService - Garbage collection for zombie/orphaned calls
 *
 * Spec Section 2.6: Server cron every 60s with tiered cleanup:
 * - initiated/ringing > 120s → MISSED
 * - connecting > 30s → FAILED
 * - active/reconnecting > 2h → ENDED (garbageCollected)
 * - active with stale heartbeat > 120s → ENDED (heartbeatTimeout)
 */

import { PrismaClient, CallStatus, CallEndReason } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer } from 'socket.io';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { resolveCallEndedRooms } from '../utils/callEndedFanout';
import { logger } from '../utils/logger';
import type { CallService } from './CallService';

export class CallCleanupService {
  // Static + public so other services/tests can tie their own limits to the
  // server's hard cap on active-call lifetime without duplicating the magic
  // number (see TURNCredentialService, whose credential TTL must cover this).
  static readonly MAX_ACTIVE_MS = 2 * 60 * 60 * 1000;

  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000;

  // CALL-FIX 2026-06-25 — 60s→120s: VoIP push on iOS can take up to 30s to
  // wake the device + show the incoming call UI, then the user needs time to
  // swipe/tap answer. 60s was routinely too short on slow networks, causing
  // valid incoming calls to be force-MISSed before the user could answer.
  private readonly MAX_INITIATED_RINGING_MS = 120 * 1000;
  // CALL-FIX 2026-06-25 — 30s→90s and anchored on `answeredAt` (entry into
  // `connecting`) instead of `startedAt`. ICE/DTLS over a TURN relay on a weak
  // cellular link routinely needs 5–15s; anchoring on `startedAt` left a callee
  // who answered late only the remainder of 30s to negotiate, force-FAILing
  // healthy calls mid-handshake ("it rings, I answer, it drops").
  private readonly MAX_CONNECTING_MS = 90 * 1000;
  // CALL-FIX 2026-06-25 — 60s→120s: heartbeat interval is 10s on the iOS
  // client; a device with moderate network latency may miss 5-6 beats before
  // the connection recovers, and the 60s window was too tight for cellular
  // reconnections that legitimately take 30-90s (switching between Wi-Fi and
  // LTE, dormant radio wakeup, tunnelled corporate VPN).
  private readonly HEARTBEAT_TIMEOUT_MS = 120 * 1000;

  // Optional Socket.IO server — set via `attachSocketServer()` once the
  // socket layer is ready. Without it the cleanup still runs but the
  // affected clients won't receive the `call:ended` broadcast and would
  // stay in `.ringing(true)` until their own client-side timeout fires.
  private io: SocketIOServer | null = null;

  // P3 — set via `setPostSummaryCallback()` once the socket layer's
  // CallEventsHandler is ready. Without it, calls force-ended by GC (a
  // stuck ringing/connecting call, or a truly abandoned active call nobody
  // explicitly hung up) never get the "Appel … · MM:SS" / "manqué" system
  // message that every other terminal path posts.
  private postSummary: ((callId: string) => Promise<void>) | null = null;

  // Sibling-drift fix (2026-07-05) — `CallEventsHandler.clearQualityDegradedStreaks`
  // is only reachable from that instance; without this bridge, calls this GC
  // tier force-ends (stale ringing/connecting/active/heartbeat-timeout — see
  // `forceEndCall`) never clear their `qualityDegradedStreaks` entries, unlike
  // the three terminal paths CallEventsHandler already hooks into itself
  // (call:end, call:leave, disconnect force-cleanup). A GC-reaped call is, if
  // anything, the MOST likely candidate: an abandoned call nobody explicitly
  // hung up is exactly the "last report was degraded" scenario this leak
  // targets.
  private clearQualityStreaks: ((callId: string) => void) | null = null;

  // Phantom-ringing safety net — set via `setMissedCallCancelPushCallback()`
  // once the socket layer's CallEventsHandler is ready. A callee whose VoIP
  // push was delivered but whose socket never joined the call room does not
  // observe the `call:ended` broadcast (it never joined `ROOMS.call`/
  // `ROOMS.conversation`, and the per-user-room fanout requires a live
  // socket). Without this, GC tier 1 (initiated/ringing > 120s → missed) —
  // the fallback for when the in-process ringing timer never fired — leaves
  // that callee's CallKit screen ringing until its own client-side timeout,
  // even though every other missed-call path sends the silent `call_cancel`
  // background push that tears it down.
  private missedCallCancelPush: ((callId: string, conversationId: string | undefined, duration: number) => Promise<void>) | null = null;

  // Sibling-drift fix (2026-07-07) — set via `setMissedCallNotificationCallback()`.
  // `CallEventsHandler.handleMissedCall` (the in-process ringing-timeout path)
  // both marks the call missed AND creates a persisted `Notification` (badge/
  // notification-center entry) for every unresponded participant. GC tier 1
  // (initiated/ringing > 120s → missed) is the backstop for when that
  // in-process timer never fires — it already mirrors the OTHER two side
  // effects of a missed call (the `postSummary` system message and the
  // `missedCallCancelPush` silent APNs push above) but had no bridge for the
  // notification itself, so a call resolved ONLY by this GC path left the
  // callee with no notification-center/badge trace it was ever called.
  // `markCallAsMissed` is NOT re-invoked here — GC's own transaction above
  // already performed the terminal write, so only the notification side
  // effect is needed.
  private missedCallNotify: ((callId: string) => Promise<void>) | null = null;

  constructor(
    private prisma: PrismaClient,
    private callService?: CallService,
    // CALL-RESILIENCE (item H) — liveness floor for the post-restart DB
    // fallback of the heartbeat tier: heartbeats were impossible to record
    // while the process was down, so a stale `lastHeartbeatAt` alone must not
    // reap a call until clients have had a full heartbeat window since boot
    // to re-join and resume beating. Injectable for tests.
    private readonly bootedAt: Date = new Date()
  ) {}

  attachSocketServer(io: SocketIOServer): void {
    this.io = io;
    logger.info('[CallCleanupService] Socket.IO server attached — force-end events will be broadcast');
  }

  // RC-4 — the socket layer's CallService (and the ringingTimeouts/heartbeats
  // it owns) only exists once MeeshySocketIOManager is constructed, which
  // happens after this service. Without this, `this.callService` stayed
  // undefined for the process lifetime and tier 4 (stale-heartbeat GC,
  // documented above) never ran at all.
  setCallService(callService: CallService): void {
    this.callService = callService;
    logger.info('[CallCleanupService] CallService attached — heartbeat-timeout GC tier active');
  }

  // P3 — mirrors `attachSocketServer`/`setCallService`: injected from server
  // startup once CallEventsHandler exists, so force-ended calls get their
  // call-summary system message posted too.
  setPostSummaryCallback(postSummary: (callId: string) => Promise<void>): void {
    this.postSummary = postSummary;
    logger.info('[CallCleanupService] Post-summary callback attached — GC-ended calls will get a summary message');
  }

  // Mirrors `setPostSummaryCallback` — injected from server startup once
  // CallEventsHandler exists, so GC-ended calls also release their
  // `qualityDegradedStreaks` entries (see the field comment above).
  setQualityStreakCleanupCallback(clearQualityStreaks: (callId: string) => void): void {
    this.clearQualityStreaks = clearQualityStreaks;
    logger.info('[CallCleanupService] Quality-streak cleanup callback attached — GC-ended calls will release their streak entries');
  }

  // Phantom-ringing safety net (see field doc above) — injected from server
  // startup once CallEventsHandler exists, mirroring attachSocketServer/
  // setCallService/setPostSummaryCallback.
  setMissedCallCancelPushCallback(
    cancelPush: (callId: string, conversationId: string | undefined, duration: number) => Promise<void>
  ): void {
    this.missedCallCancelPush = cancelPush;
    logger.info('[CallCleanupService] Missed-call cancel-push callback attached — phantom-ringing callees will be released on GC tier 1');
  }

  // Mirrors `setMissedCallCancelPushCallback` (see the field doc above) —
  // injected from server startup once CallEventsHandler exists, so a call
  // resolved only by GC tier 1 also gets its persisted missed-call
  // notification, not just the silent cancel push.
  setMissedCallNotificationCallback(notify: (callId: string) => Promise<void>): void {
    this.missedCallNotify = notify;
    logger.info('[CallCleanupService] Missed-call notification callback attached — GC tier 1 will create notifications for unresponded participants');
  }

  start(): void {
    if (this.cleanupInterval) {
      logger.warn('[CallCleanupService] Cleanup job already running');
      return;
    }

    logger.info('[CallCleanupService] Starting GC', {
      intervalMs: this.CLEANUP_INTERVAL_MS,
      maxInitiatedMs: this.MAX_INITIATED_RINGING_MS,
      maxConnectingMs: this.MAX_CONNECTING_MS,
      maxActiveMs: CallCleanupService.MAX_ACTIVE_MS,
      heartbeatTimeoutMs: this.HEARTBEAT_TIMEOUT_MS
    });

    this.runCleanup().catch((error) => {
      logger.error('[CallCleanupService] Initial cleanup failed', { error });
    });

    this.cleanupInterval = setInterval(() => {
      this.runCleanup().catch((error) => {
        logger.error('[CallCleanupService] Scheduled cleanup failed', { error });
      });
    }, this.CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref?.();
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[CallCleanupService] Stopped GC');
    }
  }

  async runCleanup(): Promise<{ cleaned: number; errors: number }> {
    const now = new Date();
    let cleaned = 0;
    let errors = 0;

    // 1. initiated/ringing > 120s → MISSED
    const initiatedCutoff = new Date(now.getTime() - this.MAX_INITIATED_RINGING_MS);
    const staleInitiated = await this.prisma.callSession.findMany({
      where: {
        status: { in: [CallStatus.initiated, CallStatus.ringing] },
        startedAt: { lt: initiatedCutoff }
      }
    });

    for (const call of staleInitiated) {
      try {
        const ended = await this.forceEndCall(
          call.id, now, call.startedAt,
          [CallStatus.initiated, CallStatus.ringing], CallStatus.missed, CallEndReason.missed
        );
        if (ended) {
          logger.warn('[CallCleanupService] Force MISSED', { callId: call.id, status: call.status });
          cleaned++;
        }
      } catch (error) {
        logger.error('[CallCleanupService] Failed to force MISSED', { callId: call.id, error });
        errors++;
      }
    }

    // 2. connecting > 90s (since answeredAt) → FAILED.
    // Anchor on `answeredAt` — the moment the call entered `connecting` — not
    // `startedAt`, so a callee who answered late still gets the full negotiation
    // budget. A `connecting` row always has `answeredAt` set (joinCall stamps it
    // at the initiated→connecting transition); a null `answeredAt` is skipped
    // here, which fails safe (never force-FAILs a call we can't time).
    const connectingCutoff = new Date(now.getTime() - this.MAX_CONNECTING_MS);
    const staleConnecting = await this.prisma.callSession.findMany({
      where: {
        status: CallStatus.connecting,
        answeredAt: { lt: connectingCutoff }
      }
    });

    for (const call of staleConnecting) {
      try {
        const ended = await this.forceEndCall(
          call.id, now, call.startedAt,
          [CallStatus.connecting], CallStatus.failed, CallEndReason.failed
        );
        if (ended) {
          logger.warn('[CallCleanupService] Force FAILED', { callId: call.id });
          cleaned++;
        }
      } catch (error) {
        logger.error('[CallCleanupService] Failed to force FAILED', { callId: call.id, error });
        errors++;
      }
    }

    // 3. active/reconnecting > 2h with NO fresh liveness → ENDED (garbageCollected).
    // The wall-clock cap is a safety net for rows the heartbeat tier cannot
    // judge (orphans with zero live participants, or no CallService attached) —
    // never a duration limit: a multi-hour call whose participants still beat
    // is legitimate and must be spared (tier 4 already reaps real zombies
    // within HEARTBEAT_TIMEOUT_MS, no need to wait 2h for those).
    const activeCutoff = new Date(now.getTime() - CallCleanupService.MAX_ACTIVE_MS);
    const staleActive = await this.prisma.callSession.findMany({
      where: {
        status: { in: [CallStatus.active, CallStatus.reconnecting] },
        startedAt: { lt: activeCutoff }
      },
      // Same live-participant filter as the heartbeat tier (Audit C5): rows
      // whose leftAt was never written must still count as live.
      include: { participants: { where: { OR: [{ leftAt: null }, { leftAt: { isSet: false } }] } } }
    });

    for (const call of staleActive) {
      if (this.hasFreshLiveness(call, now)) {
        logger.info('[CallCleanupService] Sparing long-running live call from 2h cap', {
          callId: call.id, status: call.status, startedAt: call.startedAt
        });
        continue;
      }
      try {
        const ended = await this.forceEndCall(
          call.id, now, call.startedAt,
          [CallStatus.active, CallStatus.reconnecting], CallStatus.ended, CallEndReason.garbageCollected
        );
        if (ended) {
          logger.warn('[CallCleanupService] Force GC ENDED', { callId: call.id, status: call.status });
          cleaned++;
        }
      } catch (error) {
        logger.error('[CallCleanupService] Failed to force GC', { callId: call.id, error });
        errors++;
      }
    }

    // 4. Heartbeat timeout check (active calls with no heartbeat > 60s)
    if (this.callService) {
      const activeCalls = await this.prisma.callSession.findMany({
        where: {
          status: { in: [CallStatus.active, CallStatus.reconnecting] }
        },
        // Audit C5 (2026-07-02) — Prisma-on-Mongo `{leftAt: null}` does not
        // match documents whose leftAt field was never written (historical
        // participants created before the explicit `leftAt: null` write).
        include: { participants: { where: { OR: [{ leftAt: null }, { leftAt: { isSet: false } }] } } }
      });

      for (const call of activeCalls) {
        const hasInMemory = this.callService.hasHeartbeatData(call.id);

        if (hasInMemory) {
          // Fast path: in-memory data is authoritative during the current process lifetime
          const staleParticipants = this.callService.getStaleHeartbeats(call.id, this.HEARTBEAT_TIMEOUT_MS);
          if (staleParticipants.length > 0 && staleParticipants.length >= call.participants.length) {
            try {
              const ended = await this.forceEndCall(
                call.id, now, call.startedAt,
                [CallStatus.active, CallStatus.reconnecting], CallStatus.ended, CallEndReason.heartbeatTimeout
              );
              if (ended) {
                logger.warn('[CallCleanupService] Heartbeat timeout', { callId: call.id, staleParticipants });
                cleaned++;
              }
            } catch (error) {
              logger.error('[CallCleanupService] Heartbeat cleanup failed', { callId: call.id, error });
              errors++;
            }
          }
        } else {
          // Post-restart fallback: in-memory map is empty; check DB lastHeartbeatAt
          // timestamps. A participant with no `lastHeartbeatAt` yet is NOT
          // automatically stale — `lastHeartbeatAt` is only flushed 30s after the
          // first heartbeat (HEARTBEAT_DB_DEBOUNCE_MS in CallService), so a call
          // that is younger than the heartbeat timeout when the gateway restarts
          // would otherwise have every participant read back as "stale" (null
          // lastHeartbeatAt) and get force-ended seconds after a routine deploy.
          // Fall back to `joinedAt` as the last-known-liveness signal instead.
          //
          // CALL-RESILIENCE (item H) — `bootedAt` is an additional liveness
          // floor: while the gateway was down, clients could not record any
          // heartbeat, so after an outage longer than HEARTBEAT_TIMEOUT_MS
          // every DB timestamp reads stale even though the P2P media is alive
          // and the clients are about to re-join. Reaping is therefore only
          // possible once a full heartbeat window has elapsed SINCE BOOT with
          // still no resumption.
          const staleThresholdMs = now.getTime() - this.HEARTBEAT_TIMEOUT_MS;
          const bootFloorMs = this.bootedAt.getTime();
          const dbStaleParticipants = call.participants.filter(
            (p: { lastHeartbeatAt: Date | null; joinedAt: Date }) => {
              const lastKnownMs = (p.lastHeartbeatAt ?? p.joinedAt).getTime();
              return Math.max(lastKnownMs, bootFloorMs) < staleThresholdMs;
            }
          );
          if (dbStaleParticipants.length > 0 && dbStaleParticipants.length >= call.participants.length) {
            try {
              const ended = await this.forceEndCall(
                call.id, now, call.startedAt,
                [CallStatus.active, CallStatus.reconnecting], CallStatus.ended, CallEndReason.heartbeatTimeout
              );
              if (ended) {
                logger.warn('[CallCleanupService] Heartbeat timeout (DB fallback, post-restart)', {
                  callId: call.id,
                  staleCount: dbStaleParticipants.length
                });
                cleaned++;
              }
            } catch (error) {
              logger.error('[CallCleanupService] Heartbeat cleanup failed (DB fallback)', { callId: call.id, error });
              errors++;
            }
          }
        }
      }
    }

    if (cleaned > 0 || errors > 0) {
      logger.info('[CallCleanupService] GC completed', { cleaned, errors });
    }

    return { cleaned, errors };
  }

  /**
   * Tier-3 liveness guard — mirrors the heartbeat tier's staleness semantics
   * exactly (a call is live iff at least one live participant beat within
   * HEARTBEAT_TIMEOUT_MS): in-memory heartbeats when available, else the DB
   * `lastHeartbeatAt ?? joinedAt` fallback with the same post-restart
   * boot-time floor. Returns `false` (reap) for orphans with zero live
   * participants and when no CallService is attached (heartbeat data
   * unavailable → the 2h wall-clock cap stays the last-resort safety net).
   */
  private hasFreshLiveness(
    call: { id: string; participants?: Array<{ lastHeartbeatAt: Date | null; joinedAt: Date }> },
    now: Date
  ): boolean {
    if (!this.callService) return false;
    const participants = call.participants ?? [];
    if (participants.length === 0) return false;

    if (this.callService.hasHeartbeatData(call.id)) {
      const stale = this.callService.getStaleHeartbeats(call.id, this.HEARTBEAT_TIMEOUT_MS);
      return stale.length < participants.length;
    }

    const staleThresholdMs = now.getTime() - this.HEARTBEAT_TIMEOUT_MS;
    const bootFloorMs = this.bootedAt.getTime();
    return participants.some(
      (p) => Math.max((p.lastHeartbeatAt ?? p.joinedAt).getTime(), bootFloorMs) >= staleThresholdMs
    );
  }

  /**
   * Force-ends a call, but ONLY if it is still in one of `fromStatuses` at
   * write time. `runCleanup`'s tiers snapshot stale calls via `findMany` up to
   * a full 60s cleanup tick earlier; without this guard, a call that a client
   * legitimately ended (`call:end`/`call:leave`) in that window would have its
   * already-correct terminal `status`/`endReason`/`duration` clobbered by the
   * GC reason, and clients would receive a second, contradictory `call:ended`
   * broadcast. Mirrors the conditional `updateMany` pattern already used by
   * the ringing-timeout callback in `CallEventsHandler.ts`.
   *
   * Returns `false` (and does nothing further) when the call had already
   * moved to a different status — the caller must not count this as cleaned.
   */
  private async forceEndCall(
    callId: string,
    now: Date,
    startedAt: Date,
    fromStatuses: CallStatus[],
    status: CallStatus,
    endReason: CallEndReason
  ): Promise<boolean> {
    const duration = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

    // Read conversationId BEFORE the transaction so we can broadcast to the
    // conversation room as well (the call room would already empty if every
    // participant disconnected).
    const session = await this.prisma.callSession.findUnique({
      where: { id: callId },
      select: { conversationId: true }
    });

    const ended = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.callSession.updateMany({
        where: { id: callId, status: { in: fromStatuses } },
        data: {
          status,
          endedAt: now,
          duration,
          endReason,
          // Terminal write protocol: every terminal writer MUST bump
          // `version`, even one guarded by status rather than by version —
          // otherwise a version-guarded writer (endCall/leaveCall/
          // updateCallStatus) that read the row a moment before this GC
          // write still matches its stale `version` and clobbers this
          // terminal state right after.
          version: { increment: 1 }
        }
      });
      if (updated.count === 0) {
        return false;
      }

      await tx.callParticipant.updateMany({
        where: { callSessionId: callId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
        data: { leftAt: now }
      });
      return true;
    });

    if (!ended) {
      logger.info('[CallCleanupService] Skipped force-end — call already transitioned', {
        callId, fromStatuses, attemptedStatus: status
      });
      return false;
    }

    this.callService?.clearHeartbeats(callId);
    // Item I — a reaped pre-answer call may still hold its in-process ringing
    // timer; without this, the timer fires later against an already-terminal
    // row (a no-op thanks to the status guard) and lingers in memory.
    this.callService?.clearRingingTimeout(callId);
    // Sibling-drift fix (2026-07-05) — see the field comment on `clearQualityStreaks`.
    this.clearQualityStreaks?.(callId);

    // Release the conversation's active-call claim (CallService.initiateCall's
    // atomic race guard) so a new call can be started once this one is
    // GC-terminated. Scoped compare-and-clear: a no-op if this call never held
    // the claim or already lost it to a newer one.
    if (session?.conversationId) {
      await this.prisma.conversation.updateMany({
        where: { id: session.conversationId, activeCallId: callId },
        data: { activeCallId: null }
      });
    }

    // P3 — post the call-summary system message. Failures are logged and
    // swallowed inside `postCallSummary` itself, never thrown, so a summary
    // posting issue can never break GC or leave the transaction half-done.
    if (this.postSummary) {
      this.postSummary(callId).catch((error) => {
        logger.error('[CallCleanupService] Failed to post call summary for GC-ended call', { callId, error });
      });
    }

    // Phantom-ringing safety net — only tier 1's `missed` reason applies:
    // tier 2/3/heartbeat force-ends only ever fire on calls that were
    // ANSWERED (connecting/active/reconnecting), whose participants already
    // hold a live call-room socket and so already observe the broadcast
    // above. Best-effort, mirrors postSummary's fire-and-forget error
    // handling — a push failure must never break GC.
    if (this.missedCallCancelPush && endReason === CallEndReason.missed) {
      this.missedCallCancelPush(callId, session?.conversationId ?? undefined, duration).catch((error) => {
        logger.error('[CallCleanupService] Failed to send missed-call cancel push for GC-ended call', { callId, error });
      });
    }

    // Sibling-drift fix (2026-07-07) — same tier-1-only scope as the cancel
    // push above: only a still-ringing call GC'd into `missed` has
    // unresponded participants who never got the missed-call notification
    // any other path (`handleMissedCall`) would have created for them.
    if (this.missedCallNotify && endReason === CallEndReason.missed) {
      this.missedCallNotify(callId).catch((error) => {
        logger.error('[CallCleanupService] Failed to create missed-call notification for GC-ended call', { callId, error });
      });
    }

    // Broadcast `call:ended` to the FULL termination audience — call room,
    // conversation room AND every conversation member's user room (same
    // audience as `call:initiated`). Without the user-room fanout, a callee
    // GC'd out of `.ringing`/`.connecting` (caller vanished without a clean
    // hangup) never learns the call ended and keeps ringing — the same
    // prod incident CallEventsHandler.broadcastCallEnded fixed for the
    // client-driven end/leave/ringing-timeout paths (2026-07-03), but this
    // GC path used its own two-room emit and was missed by that fix.
    if (this.io) {
      const endedEvent = {
        callId,
        duration,
        endedBy: undefined,
        reason: endReason
      };
      const rooms = await resolveCallEndedRooms(this.prisma, callId, session?.conversationId);
      this.io.to(rooms).emit(CALL_EVENTS.ENDED, endedEvent);
      logger.info('[CallCleanupService] Broadcast call:ended', { callId, endReason, conversationId: session?.conversationId });
    } else {
      logger.warn('[CallCleanupService] No Socket.IO server attached — clients will not receive call:ended', { callId });
    }
    return true;
  }

  async manualCleanup(): Promise<{ cleaned: number; errors: number }> {
    logger.info('[CallCleanupService] Running manual cleanup');
    return this.runCleanup();
  }
}
