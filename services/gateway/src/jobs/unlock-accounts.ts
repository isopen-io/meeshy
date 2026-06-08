/**
 * Unlock Accounts Job
 * Background job that runs daily to unlock accounts with expired lockouts
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'UnlockAccountsJob' });

export class UnlockAccountsJob {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalHours: number = 24; // Run every 24 hours

  constructor(private prisma: PrismaClient) {}

  /**
   * Start the unlock job
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }

    logger.info(`Starting unlock job (interval: ${this.intervalHours} hours)`);

    // Run immediately on start
    this.unlock();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.unlock();
    }, this.intervalHours * 60 * 60 * 1000);
    this.intervalId.unref?.();
  }

  /**
   * Stop the unlock job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Unlock job stopped');
    }
  }

  /**
   * Run unlock task
   */
  private async unlock(): Promise<void> {
    try {
      const now = new Date();

      // Find accounts with expired locks
      const expiredLocks = await this.prisma.user.findMany({
        where: {
          AND: [
            { lockedUntil: { not: null } },
            { lockedUntil: { lte: now } }
          ]
        },
        select: {
          id: true,
          email: true,
          lockedUntil: true,
          lockedReason: true
        }
      });

      if (expiredLocks.length === 0) {
        logger.debug('No expired account locks found');
        return;
      }

      logger.info(`Found ${expiredLocks.length} accounts with expired locks`);

      // Unlock accounts
      const result = await this.prisma.user.updateMany({
        where: {
          id: { in: expiredLocks.map(u => u.id) }
        },
        data: {
          lockedUntil: null,
          lockedReason: null,
          passwordResetAttempts: 0,
          failedLoginAttempts: 0
        }
      });

      logger.info(`Unlocked ${result.count} accounts`);

      await this.prisma.securityEvent.createMany({
        data: expiredLocks.map(user => ({
          userId: user.id,
          eventType: 'ACCOUNT_UNLOCKED',
          severity: 'MEDIUM',
          status: 'SUCCESS',
          description: 'Account automatically unlocked after lock expiration',
          metadata: {
            previousLockReason: user.lockedReason,
            lockedUntil: user.lockedUntil?.toISOString()
          }
        }))
      });

      const stats = await this.getStats();
      logger.info('Current stats', { stats });

    } catch (error) {
      logger.error('Error during unlock', error as Error);
    }
  }

  /**
   * Get account lock statistics
   */
  private async getStats(): Promise<any> {
    const now = new Date();

    const [
      totalUsers,
      lockedUsers,
      usersWithFailedAttempts
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          AND: [
            { lockedUntil: { not: null } },
            { lockedUntil: { gt: now } }
          ]
        }
      }),
      this.prisma.user.count({
        where: {
          OR: [
            { failedLoginAttempts: { gt: 0 } },
            { passwordResetAttempts: { gt: 0 } }
          ]
        }
      })
    ]);

    return {
      totalUsers,
      lockedUsers,
      usersWithFailedAttempts,
      timestamp: now.toISOString()
    };
  }

  /**
   * Run unlock manually (for testing)
   */
  async runNow(): Promise<void> {
    await this.unlock();
  }

  /**
   * Change interval (in hours)
   */
  setInterval(hours: number): void {
    if (hours < 1) {
      throw new Error('Interval must be at least 1 hour');
    }

    this.intervalHours = hours;

    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }
}
