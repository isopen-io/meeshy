/**
 * Mutation Log Cleanup Job — Wave 1 Task 3.8
 *
 * Deletes `MutationLog` rows older than 30 days. Runs once at startup
 * (best-effort) and then every 24 hours (24 * 60 minutes).
 *
 * Why an application cron rather than a MongoDB TTL index :
 *   - We want to log the deletion count for observability — a TTL
 *     index drops rows silently.
 *   - 30 days is well beyond the iOS outbox retention horizon (a
 *     mutation that hasn't been confirmed in 30 days is unrecoverable
 *     anyway), so we don't need fine-grained TTL behaviour.
 *
 * Reference : Wave 1 Task 3.8 / Phase 3 Tier B.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'MutationLogCleanup' });

export const MUTATION_LOG_RETENTION_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class MutationLogCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMs: number = ONE_DAY_MS;

  constructor(private readonly prisma: PrismaClient) {}

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }

    logger.info(`Starting cleanup job (retention: ${MUTATION_LOG_RETENTION_DAYS} days, interval: 24h)`);

    // Run shortly after startup so an out-of-band cron doesn't ride on
    // the request critical path. setImmediate keeps server boot snappy.
    setImmediate(() => {
      this.cleanup().catch(err =>
        logger.error('Initial cleanup failed', err)
      );
    });

    this.intervalId = setInterval(() => {
      this.cleanup().catch(err =>
        logger.error('Scheduled cleanup failed', err)
      );
    }, this.intervalMs);
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Cleanup job stopped');
    }
  }

  /**
   * Run cleanup once. Exposed publicly for manual triggers and tests.
   * Returns the number of rows deleted.
   */
  async runNow(): Promise<number> {
    return this.cleanup();
  }

  private async cleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - MUTATION_LOG_RETENTION_DAYS * ONE_DAY_MS);
    try {
      const result = await this.prisma.mutationLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      if (result.count > 0) {
        logger.info('Deleted old mutation log rows', { count: result.count, cutoff: cutoff.toISOString() });
      }
      return result.count;
    } catch (error) {
      logger.error('Error during cleanup', error as Error);
      return 0;
    }
  }
}
