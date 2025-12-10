/**
 * Cleanup Expired Password Reset Tokens
 * Background job that runs every 15 minutes to clean up expired tokens
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

export class CleanupExpiredTokens {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMinutes: number = 15; // Run every 15 minutes

  constructor(private prisma: PrismaClient) {}

  /**
   * Start the cleanup job
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[CleanupExpiredTokens] Job already running');
      return;
    }

    console.log(`[CleanupExpiredTokens] Starting cleanup job (interval: ${this.intervalMinutes} minutes)`);

    // Run immediately on start
    this.cleanup();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[CleanupExpiredTokens] Cleanup job stopped');
    }
  }

  /**
   * Run cleanup task
   */
  private async cleanup(): Promise<void> {
    try {
      const now = new Date();

      // Delete expired tokens
      const result = await this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [
            // Expired tokens
            { expiresAt: { lt: now } },
            // Used tokens older than 24 hours
            {
              AND: [
                { usedAt: { not: null } },
                { usedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
              ]
            },
            // Revoked tokens older than 24 hours
            {
              AND: [
                { isRevoked: true },
                { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
              ]
            }
          ]
        }
      });

      if (result.count > 0) {
        console.log(`[CleanupExpiredTokens] ✅ Deleted ${result.count} expired/used/revoked tokens`);
      } else {
        console.log('[CleanupExpiredTokens] No expired tokens to clean up');
      }

      // Log statistics
      const stats = await this.getStats();
      console.log('[CleanupExpiredTokens] Current stats:', stats);

    } catch (error) {
      console.error('[CleanupExpiredTokens] Error during cleanup:', error);
    }
  }

  /**
   * Get current token statistics
   */
  private async getStats(): Promise<any> {
    const now = new Date();

    const [
      totalTokens,
      activeTokens,
      expiredTokens,
      usedTokens,
      revokedTokens
    ] = await Promise.all([
      this.prisma.passwordResetToken.count(),
      this.prisma.passwordResetToken.count({
        where: {
          expiresAt: { gt: now },
          usedAt: null,
          isRevoked: false
        }
      }),
      this.prisma.passwordResetToken.count({
        where: { expiresAt: { lt: now } }
      }),
      this.prisma.passwordResetToken.count({
        where: { usedAt: { not: null } }
      }),
      this.prisma.passwordResetToken.count({
        where: { isRevoked: true }
      })
    ]);

    return {
      totalTokens,
      activeTokens,
      expiredTokens,
      usedTokens,
      revokedTokens,
      timestamp: now.toISOString()
    };
  }

  /**
   * Run cleanup manually (for testing)
   */
  async runNow(): Promise<void> {
    await this.cleanup();
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
