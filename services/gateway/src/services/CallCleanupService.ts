/**
 * CallCleanupService - Garbage collection for zombie/orphaned calls
 *
 * Spec Section 2.6: Server cron every 60s with tiered cleanup:
 * - initiated/ringing > 60s → MISSED
 * - connecting > 30s → FAILED
 * - active/reconnecting > 2h → ENDED (garbageCollected)
 * - active with stale heartbeat > 60s → ENDED (heartbeatTimeout)
 */

import { PrismaClient, CallStatus, CallEndReason } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import type { CallService } from './CallService';

export class CallCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000;

  private readonly MAX_INITIATED_RINGING_MS = 60 * 1000;
  private readonly MAX_CONNECTING_MS = 30 * 1000;
  private readonly MAX_ACTIVE_MS = 2 * 60 * 60 * 1000;
  private readonly HEARTBEAT_TIMEOUT_MS = 60 * 1000;

  constructor(
    private prisma: PrismaClient,
    private callService?: CallService
  ) {}

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

    // 1. initiated/ringing > 60s → MISSED
    const initiatedCutoff = new Date(now.getTime() - this.MAX_INITIATED_RINGING_MS);
    const staleInitiated = await this.prisma.callSession.findMany({
      where: {
        status: { in: [CallStatus.initiated, CallStatus.ringing] },
        startedAt: { lt: initiatedCutoff }
      }
    });

    for (const call of staleInitiated) {
      try {
        await this.forceEndCall(call.id, now, call.startedAt, CallStatus.missed, CallEndReason.missed);
        logger.warn('[CallCleanupService] Force MISSED', { callId: call.id, status: call.status });
        cleaned++;
      } catch (error) {
        logger.error('[CallCleanupService] Failed to force MISSED', { callId: call.id, error });
        errors++;
      }
    }

    // 2. connecting > 30s → FAILED
    const connectingCutoff = new Date(now.getTime() - this.MAX_CONNECTING_MS);
    const staleConnecting = await this.prisma.callSession.findMany({
      where: {
        status: CallStatus.connecting,
        startedAt: { lt: connectingCutoff }
      }
    });

    for (const call of staleConnecting) {
      try {
        await this.forceEndCall(call.id, now, call.startedAt, CallStatus.failed, CallEndReason.failed);
        logger.warn('[CallCleanupService] Force FAILED', { callId: call.id });
        cleaned++;
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
        await this.forceEndCall(call.id, now, call.startedAt, CallStatus.ended, CallEndReason.garbageCollected);
        logger.warn('[CallCleanupService] Force GC ENDED', { callId: call.id, status: call.status });
        cleaned++;
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
        for (const participant of call.participants) {
          const staleParticipants = this.callService.getStaleHeartbeats(call.id, this.HEARTBEAT_TIMEOUT_MS);
          if (staleParticipants.length > 0 && staleParticipants.length >= call.participants.length) {
            try {
              await this.forceEndCall(call.id, now, call.startedAt, CallStatus.ended, CallEndReason.heartbeatTimeout);
              logger.warn('[CallCleanupService] Heartbeat timeout', { callId: call.id, staleParticipants });
              cleaned++;
            } catch (error) {
              logger.error('[CallCleanupService] Heartbeat cleanup failed', { callId: call.id, error });
              errors++;
            }
            break;
          }
        }
      }
    }

    if (cleaned > 0 || errors > 0) {
      logger.info('[CallCleanupService] GC completed', { cleaned, errors });
    }

    return { cleaned, errors };
  }

  private async forceEndCall(
    callId: string,
    now: Date,
    startedAt: Date,
    status: CallStatus,
    endReason: CallEndReason
  ): Promise<void> {
    const duration = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.callParticipant.updateMany({
        where: { callSessionId: callId, leftAt: null },
        data: { leftAt: now }
      });

      await tx.callSession.update({
        where: { id: callId },
        data: { status, endedAt: now, duration, endReason }
      });
    });

    this.callService?.clearHeartbeats(callId);
  }

  async manualCleanup(): Promise<{ cleaned: number; errors: number }> {
    logger.info('[CallCleanupService] Running manual cleanup');
    return this.runCleanup();
  }
}
