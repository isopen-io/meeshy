/**
 * Session Expiry Sweep Job
 *
 * #5712 — `UserSession.isValid` restait `true` indéfiniment sur une session
 * expirée : `cleanupExpiredSessions()` (`SessionService.ts`) existait déjà et
 * fait exactement ce qu'il faut, mais rien ne l'appelait — mesuré en
 * production le 2026-09-08, 140 sessions expirées depuis jusqu'à six mois se
 * déclaraient encore `isValid: true` (34 comptes). Ce job est le seul
 * appelant : son premier passage soldera aussi bien le solde hérité que
 * l'entretien courant, sans script de migration séparé.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { initSessionService, cleanupExpiredSessions } from '../services/SessionService.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'SessionExpirySweepJob' });

export class SessionExpirySweepJob {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMinutes: number = 30; // Run every 30 minutes

  constructor(private prisma: PrismaClient) {}

  /**
   * Start the sweep job
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }

    logger.info(`Starting session expiry sweep (interval: ${this.intervalMinutes} minutes)`);

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
      logger.info('Session expiry sweep stopped');
    }
  }

  /**
   * Run sweep task
   */
  private async sweep(): Promise<void> {
    try {
      // Idempotent — `SessionService` garde une référence Prisma de niveau
      // module ; la reposer à chaque passage coûte une affectation et évite
      // toute dépendance à l'ordre d'initialisation des autres appelants
      // (`AuthService`, `MagicLinkService`, les routes `auth/`).
      initSessionService(this.prisma);
      const count = await cleanupExpiredSessions();
      if (count > 0) {
        logger.info(`Invalidated ${count} expired sessions`);
      }
    } catch (error) {
      logger.error('Error during session expiry sweep', error as Error);
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
