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
import { EmailService } from '../services/EmailService';
import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';

export class BackgroundJobsManager {
  private cleanupTokensJob: CleanupExpiredTokens;
  private unlockAccountsJob: UnlockAccountsJob;
  private notificationDigestJob: NotificationDigestJob;
  private deliveryQueueCleanupJob: DeliveryQueueCleanupJob;
  private mutationLogCleanupJob: MutationLogCleanupJob;
  private isRunning: boolean = false;

  constructor(private prisma: PrismaClient, emailService: EmailService, deliveryQueue?: RedisDeliveryQueue) {
    this.cleanupTokensJob = new CleanupExpiredTokens(prisma);
    this.unlockAccountsJob = new UnlockAccountsJob(prisma);
    this.notificationDigestJob = new NotificationDigestJob(prisma, emailService);
    this.deliveryQueueCleanupJob = new DeliveryQueueCleanupJob(deliveryQueue ?? new RedisDeliveryQueue({ getNativeClient: () => null } as any));
    this.mutationLogCleanupJob = new MutationLogCleanupJob(prisma);
  }

  /**
   * Start all background jobs
   */
  startAll(): void {
    if (this.isRunning) {
      console.warn('[BackgroundJobs] Jobs already running');
      return;
    }

    console.log('[BackgroundJobs] Starting all background jobs...');

    this.cleanupTokensJob.start();
    this.unlockAccountsJob.start();
    this.notificationDigestJob.start();
    this.deliveryQueueCleanupJob.start();
    this.mutationLogCleanupJob.start();

    this.isRunning = true;
    console.log('[BackgroundJobs] ✅ All background jobs started successfully');
  }

  /**
   * Stop all background jobs
   */
  stopAll(): void {
    if (!this.isRunning) {
      console.warn('[BackgroundJobs] Jobs not running');
      return;
    }

    console.log('[BackgroundJobs] Stopping all background jobs...');

    this.cleanupTokensJob.stop();
    this.unlockAccountsJob.stop();
    this.notificationDigestJob.stop();
    this.deliveryQueueCleanupJob.stop();
    this.mutationLogCleanupJob.stop();

    this.isRunning = false;
    console.log('[BackgroundJobs] ✅ All background jobs stopped successfully');
  }

  /**
   * Run all jobs manually
   */
  async runAll(): Promise<void> {
    console.log('[BackgroundJobs] Running all jobs manually...');

    await this.cleanupTokensJob.runNow();
    await this.unlockAccountsJob.runNow();
    await this.notificationDigestJob.runNow();
    await this.deliveryQueueCleanupJob.runNow();
    await this.mutationLogCleanupJob.runNow();

    console.log('[BackgroundJobs] ✅ All jobs completed');
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
    };
  }

  /**
   * Check if jobs are running
   */
  isJobsRunning(): boolean {
    return this.isRunning;
  }
}
