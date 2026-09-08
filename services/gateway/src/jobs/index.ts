/**
 * Background Jobs Manager
 * Central management for all background jobs
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { CleanupExpiredTokens } from './cleanup-expired-tokens';
import { UnlockAccountsJob } from './unlock-accounts';
import { NotificationDigestJob } from './notification-digest';
import { DeliveryQueueCleanupJob } from './delivery-queue-cleanup';
import { MutationLogCleanupJob } from './mutation-log-cleanup';
import { BanExpirySweepJob } from './ban-expiry-sweep';
import { sweepExpiredSessions } from './session-expiry-sweep';
import { EmailService } from '../services/EmailService';
import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';
import { MagicLinkService } from '../services/MagicLinkService';
import { getCacheStore } from '../services/CacheStore';
import { GeoIPService } from '../services/GeoIPService';
import { BanService } from '../services/admin/ban.service';
import { UserAuditService } from '../services/admin/user-audit.service';
import { UserManagementService } from '../services/admin/user-management.service';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'BackgroundJobs' });

export class BackgroundJobsManager {
  private cleanupTokensJob: CleanupExpiredTokens;
  private unlockAccountsJob: UnlockAccountsJob;
  private notificationDigestJob: NotificationDigestJob;
  private deliveryQueueCleanupJob: DeliveryQueueCleanupJob;
  private mutationLogCleanupJob: MutationLogCleanupJob;
  private banExpirySweepJob: BanExpirySweepJob;
  /**
   * Le balayage des sessions expirées n'a pas de classe à lui : c'est UNE
   * requête, sans état ni dépendance. Une classe n'ajouterait qu'un emballage
   * à tenir (#5712).
   */
  private sessionSweepInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  private prismaClient: PrismaClient;

  constructor(prisma: PrismaClient, emailService: EmailService, deliveryQueue?: RedisDeliveryQueue) {
    this.prismaClient = prisma;
    this.cleanupTokensJob = new CleanupExpiredTokens(prisma);
    this.unlockAccountsJob = new UnlockAccountsJob(prisma);
    // Reuse the existing passwordless-login mechanism for the digest CTA
    // (single source of truth — no duplicate token model/service).
    const magicLinkService = new MagicLinkService(prisma, getCacheStore(), emailService, new GeoIPService());
    this.notificationDigestJob = new NotificationDigestJob(prisma, emailService, magicLinkService);
    this.deliveryQueueCleanupJob = new DeliveryQueueCleanupJob(deliveryQueue ?? new RedisDeliveryQueue({ getNativeClient: () => null } as any));
    this.mutationLogCleanupJob = new MutationLogCleanupJob(prisma);
    // Le balayage ne réactive jamais que via `updateStatus` — aucun besoin de
    // `revokeSessions` (seule la désactivation en dépend, cf. `userAdminRoutes`).
    const userManagementService = new UserManagementService(prisma);
    const userAuditService = new UserAuditService(prisma);
    const banService = new BanService(prisma, userManagementService);
    this.banExpirySweepJob = new BanExpirySweepJob(banService, userAuditService);
  }

  /**
   * Start all background jobs
   */
  startAll(): void {
    if (this.isRunning) {
      logger.warn('Jobs already running');
      return;
    }

    logger.info('Starting all background jobs');

    this.cleanupTokensJob.start();
    this.unlockAccountsJob.start();
    this.notificationDigestJob.start();
    this.deliveryQueueCleanupJob.start();
    this.mutationLogCleanupJob.start();
    this.banExpirySweepJob.start();

    // Toutes les six heures : une session dont l'échéance est passée cesse de
    // se déclarer valide. Sans ce balayage, `isValid` ment à tout ce qui le lit
    // — 140 lignes le faisaient en production, dont depuis mars (#5712).
    const balayerLesSessions = () => {
      sweepExpiredSessions(this.prismaClient)
        .then((n) => { if (n > 0) logger.info(`${n} expired session(s) invalidated`); })
        .catch((err) => logger.error('Session expiry sweep failed', err));
    };
    balayerLesSessions();
    this.sessionSweepInterval = setInterval(balayerLesSessions, 6 * 60 * 60 * 1000);
    this.sessionSweepInterval.unref();

    this.isRunning = true;
    logger.info('All background jobs started successfully');
  }

  /**
   * Stop all background jobs
   */
  stopAll(): void {
    if (!this.isRunning) {
      logger.warn('Jobs not running');
      return;
    }

    logger.info('Stopping all background jobs');

    this.cleanupTokensJob.stop();
    this.unlockAccountsJob.stop();
    this.notificationDigestJob.stop();
    this.deliveryQueueCleanupJob.stop();
    this.mutationLogCleanupJob.stop();
    this.banExpirySweepJob.stop();

    if (this.sessionSweepInterval) {
      clearInterval(this.sessionSweepInterval);
      this.sessionSweepInterval = null;
    }

    this.isRunning = false;
    logger.info('All background jobs stopped successfully');
  }

  /**
   * Run all jobs manually
   */
  async runAll(): Promise<void> {
    logger.info('Running all jobs manually');

    await this.cleanupTokensJob.runNow();
    await this.unlockAccountsJob.runNow();
    await this.notificationDigestJob.runNow();
    await this.deliveryQueueCleanupJob.runNow();
    await this.mutationLogCleanupJob.runNow();
    await this.banExpirySweepJob.runNow();

    logger.info('All jobs completed');
  }

  /**
   * Get individual job instances
   */
  getJobs() {
    return {
      cleanupTokens: this.cleanupTokensJob,
      unlockAccounts: this.unlockAccountsJob,
      notificationDigest: this.notificationDigestJob,
      deliveryQueueCleanup: this.deliveryQueueCleanupJob,
      mutationLogCleanup: this.mutationLogCleanupJob,
      banExpirySweep: this.banExpirySweepJob,
    };
  }

  /**
   * Check if jobs are running
   */
  isJobsRunning(): boolean {
    return this.isRunning;
  }
}
