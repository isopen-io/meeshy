/**
 * Unlock Accounts Job
 * Background job that runs daily to unlock accounts with expired lockouts
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

export class UnlockAccountsJob {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalHours: number = 24; // Run every 24 hours

  constructor(private prisma: PrismaClient) {}

  /**
   * Start the unlock job
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[UnlockAccountsJob] Job already running');
      return;
    }

    console.log(`[UnlockAccountsJob] Starting unlock job (interval: ${this.intervalHours} hours)`);

    // Run immediately on start
    this.unlock();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.unlock();
    }, this.intervalHours * 60 * 60 * 1000);
  }

  /**
   * Stop the unlock job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[UnlockAccountsJob] Unlock job stopped');
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
        console.log('[UnlockAccountsJob] No expired account locks found');
        return;
      }

      console.log(`[UnlockAccountsJob] Found ${expiredLocks.length} accounts with expired locks`);

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

      console.log(`[UnlockAccountsJob] ✅ Unlocked ${result.count} accounts`);

      // Log security events for each unlock
      for (const user of expiredLocks) {
        await this.prisma.securityEvent.create({
          data: {
            userId: user.id,
            eventType: 'ACCOUNT_UNLOCKED',
            severity: 'MEDIUM',
            status: 'SUCCESS',
            description: 'Account automatically unlocked after lock expiration',
            metadata: {
              previousLockReason: user.lockedReason,
              lockedUntil: user.lockedUntil?.toISOString()
            }
          }
        });
      }

      // Get updated statistics
      const stats = await this.getStats();
      console.log('[UnlockAccountsJob] Current stats:', stats);

    } catch (error) {
      console.error('[UnlockAccountsJob] Error during unlock:', error);
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
