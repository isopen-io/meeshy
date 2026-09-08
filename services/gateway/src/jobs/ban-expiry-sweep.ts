/**
 * Ban Expiry Sweep Job
 * Background job that runs periodically to lift bans whose duration has
 * expired, reactivating the account when no other ban remains in force.
 *
 * Suite de #3719 : un `Ban.expiresAt` non nul ne réactivait rien tout seul,
 * un compte banni 7 jours restait désactivé indéfiniment tant qu'un admin ne
 * levait pas le ban à la main. #5527.
 */

import { UserAuditAction } from '@meeshy/shared/types';
import type { BanService } from '../services/admin/ban.service';
import { SYSTEM_ACTOR_ID } from '../services/admin/ban.service';
import type { UserAuditService } from '../services/admin/user-audit.service';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'BanExpirySweepJob' });

export class BanExpirySweepJob {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMinutes: number = 15; // Run every 15 minutes

  constructor(
    private banService: BanService,
    private userAuditService: UserAuditService
  ) {}

  /**
   * Start the sweep job
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }

    logger.info(`Starting ban expiry sweep job (interval: ${this.intervalMinutes} minutes)`);

    // Run immediately on start
    this.sweep();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.sweep();
    }, this.intervalMinutes * 60 * 1000);
    this.intervalId.unref?.();
  }

  /**
   * Stop the sweep job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Ban expiry sweep job stopped');
    }
  }

  /**
   * Run sweep task: lift expired bans, then write an audit trail entry per
   * lifted ban. A single audit-log failure is logged and does not stop the
   * remaining ones — the reactivation itself already succeeded by then.
   */
  private async sweep(): Promise<void> {
    try {
      const lifted = await this.banService.sweepExpiredBans();

      if (lifted.length === 0) {
        logger.debug('No expired bans found');
        return;
      }

      logger.info(`Lifted ${lifted.length} expired bans`);

      for (const ban of lifted) {
        try {
          await this.userAuditService.createAuditLog({
            userId: ban.userId,
            adminId: SYSTEM_ACTOR_ID,
            action: UserAuditAction.UNBAN_USER,
            entityId: ban.id,
            changes: {},
            metadata: { reason: 'expired', banId: ban.id, expiresAt: ban.expiresAt?.toISOString() ?? null },
          });
        } catch (error) {
          logger.error(`Failed to write audit log for expired ban ${ban.id}`, error as Error);
        }
      }
    } catch (error) {
      logger.error('Error during ban expiry sweep', error as Error);
    }
  }

  /**
   * Run sweep manually (for testing)
   */
  async runNow(): Promise<void> {
    await this.sweep();
  }

  /**
   * Change interval (in minutes)
   */
  setInterval(minutes: number): void {
    if (minutes < 1) {
      throw new Error('Interval must be at least 1 minute');
    }

    this.intervalMinutes = minutes;

    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }
}
