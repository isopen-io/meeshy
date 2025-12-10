/**
 * CallCleanupService - Automatic cleanup of zombie calls
 *
 * Handles:
 * - Closing calls that have been active for more than 5 hours
 * - Running cleanup job periodically (every 30 minutes)
 * - Logging cleanup statistics
 */

import { PrismaClient, CallStatus } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';

export class CallCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  // URGENT FIX: Different timeouts for different call statuses
  private readonly MAX_INITIATED_DURATION_MS = 30 * 1000; // 30 seconds for 'initiated' calls (unanswered)
  private readonly MAX_ACTIVE_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours for 'active' calls

  constructor(private prisma: PrismaClient) {}

  /**
   * Start the automatic cleanup job
   */
  start(): void {
    if (this.cleanupInterval) {
      logger.warn('[CallCleanupService] Cleanup job already running');
      return;
    }

    logger.info('[CallCleanupService] Starting automatic call cleanup job', {
      intervalMinutes: this.CLEANUP_INTERVAL_MS / 60000,
      maxInitiatedDurationSeconds: this.MAX_INITIATED_DURATION_MS / 1000,
      maxActiveDurationHours: this.MAX_ACTIVE_DURATION_MS / 3600000
    });

    // Run cleanup immediately on start
    this.runCleanup().catch((error) => {
      logger.error('[CallCleanupService] Initial cleanup failed', { error });
    });

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup().catch((error) => {
        logger.error('[CallCleanupService] Scheduled cleanup failed', { error });
      });
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the automatic cleanup job
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[CallCleanupService] Stopped automatic call cleanup job');
    }
  }

  /**
   * Run cleanup of zombie calls
   * URGENT FIX: Different timeouts for 'initiated' (2min) vs 'active' (5h) calls
   */
  async runCleanup(): Promise<{ cleaned: number; errors: number }> {
    logger.info('[CallCleanupService] Running zombie call cleanup');

    try {
      const now = new Date();
      const initiatedCutoff = new Date(now.getTime() - this.MAX_INITIATED_DURATION_MS);
      const activeCutoff = new Date(now.getTime() - this.MAX_ACTIVE_DURATION_MS);

      // Find 'initiated' calls older than 2 minutes (unanswered calls)
      const zombieInitiatedCalls = await this.prisma.callSession.findMany({
        where: {
          status: CallStatus.initiated,
          startedAt: {
            lt: initiatedCutoff
          }
        },
        include: {
          participants: {
            where: {
              leftAt: null
            }
          }
        }
      });

      // Find 'active' or 'ringing' calls older than 5 hours (stuck calls)
      const zombieActiveCalls = await this.prisma.callSession.findMany({
        where: {
          status: {
            in: [CallStatus.active, CallStatus.ringing]
          },
          startedAt: {
            lt: activeCutoff
          }
        },
        include: {
          participants: {
            where: {
              leftAt: null
            }
          }
        }
      });

      // Combine both lists
      const zombieCalls = [...zombieInitiatedCalls, ...zombieActiveCalls];

      if (zombieCalls.length === 0) {
        logger.info('[CallCleanupService] No zombie calls found');
        return { cleaned: 0, errors: 0 };
      }

      logger.warn('[CallCleanupService] Found zombie calls', {
        count: zombieCalls.length,
        initiatedCount: zombieInitiatedCalls.length,
        activeCount: zombieActiveCalls.length,
        callIds: zombieCalls.map(c => c.id),
        oldestCallStarted: zombieCalls.reduce((oldest, call) =>
          call.startedAt < oldest ? call.startedAt : oldest,
          zombieCalls[0].startedAt
        )
      });

      let cleaned = 0;
      let errors = 0;

      // Close each zombie call
      for (const call of zombieCalls) {
        try {
          const duration = Math.floor((now.getTime() - call.startedAt.getTime()) / 1000);

          await this.prisma.$transaction(async (tx) => {
            // Mark all active participants as left
            await tx.callParticipant.updateMany({
              where: {
                callSessionId: call.id,
                leftAt: null
              },
              data: {
                leftAt: now
              }
            });

            // End the call
            await tx.callSession.update({
              where: { id: call.id },
              data: {
                status: CallStatus.ended,
                endedAt: now,
                duration
              }
            });
          });

          logger.info('[CallCleanupService] Closed zombie call', {
            callId: call.id,
            conversationId: call.conversationId,
            status: call.status,
            startedAt: call.startedAt,
            durationSeconds: duration,
            durationHuman: call.status === 'initiated'
              ? `${Math.floor(duration / 60)} minutes`
              : `${(duration / 3600).toFixed(2)} hours`,
            activeParticipants: call.participants.length,
            reason: call.status === 'initiated' ? 'Unanswered call (>30s)' : 'Stuck active call (>5h)'
          });

          cleaned++;
        } catch (error) {
          logger.error('[CallCleanupService] Failed to close zombie call', {
            callId: call.id,
            error
          });
          errors++;
        }
      }

      logger.info('[CallCleanupService] Cleanup completed', {
        cleaned,
        errors,
        total: zombieCalls.length
      });

      return { cleaned, errors };
    } catch (error) {
      logger.error('[CallCleanupService] Cleanup failed', { error });
      throw error;
    }
  }

  /**
   * Manual cleanup - can be called via API or CLI
   */
  async manualCleanup(): Promise<{ cleaned: number; errors: number }> {
    logger.info('[CallCleanupService] Running manual cleanup');
    return this.runCleanup();
  }
}
