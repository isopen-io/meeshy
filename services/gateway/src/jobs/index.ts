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
import { EmailService } from '../services/EmailService';
import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';
import { MagicLinkService } from '../services/MagicLinkService';
import { getCacheStore } from '../services/CacheStore';
import { GeoIPService } from '../services/GeoIPService';
import { UserManagementService } from '../services/admin/user-management.service';
import { UserAuditService } from '../services/admin/user-audit.service';
import { BanService } from '../services/admin/ban.service';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'BackgroundJobs' });

export class BackgroundJobsManager {
  private cleanupTokensJob: CleanupExpiredTokens;
  private unlockAccountsJob: UnlockAccountsJob;
  private notificationDigestJob: NotificationDigestJob;
  private deliveryQueueCleanupJob: DeliveryQueueCleanupJob;
  private mutationLogCleanupJob: MutationLogCleanupJob;
  private banExpirySweepJob: BanExpirySweepJob;
  private isRunning: boolean = false;

  constructor(prisma: PrismaClient, emailService: EmailService, deliveryQueue?: RedisDeliveryQueue) {
    this.cleanupTokensJob = new CleanupExpiredTokens(prisma);
    this.unlockAccountsJob = new UnlockAccountsJob(prisma);
    // Reuse the existing passwordless-login mechanism for the digest CTA
    // (single source of truth — no duplicate token model/service).
    const magicLinkService = new MagicLinkService(prisma, getCacheStore(), emailService, new GeoIPService());
    this.notificationDigestJob = new NotificationDigestJob(prisma, emailService, magicLinkService);
    this.deliveryQueueCleanupJob = new DeliveryQueueCleanupJob(deliveryQueue ?? new RedisDeliveryQueue({ getNativeClient: () => null } as any));
    this.mutationLogCleanupJob = new MutationLogCleanupJob(prisma);
    // Pas de `revokeSessions`/`resolveSocketManager` : `expireBan` ne pose
    // jamais `isActive: false` (il ne fait que RÉACTIVER), le seul chemin de
    // `UserManagementService.updateStatus` qui révoque des sessions.
    const banUserManagementService = new UserManagementService(prisma);
    this.banExpirySweepJob = new BanExpirySweepJob(
      prisma,
      new BanService(prisma, banUserManagementService),
      new UserAuditService(prisma)
    );
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
