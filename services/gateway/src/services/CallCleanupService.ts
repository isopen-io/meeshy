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
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { logger } from '../utils/logger';
import type { CallService } from './CallService';

export class CallCleanupService {
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
  private readonly MAX_ACTIVE_MS = 2 * 60 * 60 * 1000;
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

  constructor(
    private prisma: PrismaClient,
    private callService?: CallService
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

  start(): void {
    if (this.cleanupInterval) {
      logger.warn('[CallCleanupService] Cleanup job already running');
      return;
    }

    logger.info('[CallCleanupService] Starting GC', {
      intervalMs: this.CLEANUP_INTERVAL_MS,
      maxInitiatedMs: this.MAX_INITIATED_RINGING_MS,
      maxConnectingMs: this.MAX_CONNECTING_MS,
      maxActiveMs: this.MAX_ACTIVE_MS,
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

    // 3. active/reconnecting > 2h → ENDED (garbageCollected)
    const activeCutoff = new Date(now.getTime() - this.MAX_ACTIVE_MS);
    const staleActive = await this.prisma.callSession.findMany({
      where: {
        status: { in: [CallStatus.active, CallStatus.reconnecting] },
        startedAt: { lt: activeCutoff }
      }
    });

    for (const call of staleActive) {
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
        include: { participants: { where: { leftAt: null } } }
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
          const staleThreshold = new Date(now.getTime() - this.HEARTBEAT_TIMEOUT_MS);
          const dbStaleParticipants = call.participants.filter(
            (p: { lastHeartbeatAt: Date | null; joinedAt: Date }) =>
              (p.lastHeartbeatAt ?? p.joinedAt) < staleThreshold
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
        data: { status, endedAt: now, duration, endReason }
      });
      if (updated.count === 0) {
        return false;
      }

      await tx.callParticipant.updateMany({
        where: { callSessionId: callId, leftAt: null },
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

    // Broadcast `call:ended` so clients (caller stuck in `.ringing`,
    // callee stuck in `.connecting`) leave their hung state instead of
    // ringing forever. Mirrors the inline path in CallEventsHandler's
    // scheduleRingingTimeout callback. The DB write is the source of
    // truth — if the broadcast fails, the next client reconnect will
    // observe the call status as ended.
    if (this.io) {
      const endedEvent = {
        callId,
        duration,
        endedBy: undefined,
        reason: endReason
      };
      this.io.to(ROOMS.call(callId)).emit(CALL_EVENTS.ENDED, endedEvent);
      if (session?.conversationId) {
        this.io.to(ROOMS.conversation(session.conversationId)).emit(CALL_EVENTS.ENDED, endedEvent);
      }
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
