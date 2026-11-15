import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';
import { enhancedLogger } from '../utils/logger-enhanced';
import { guardedInterval } from '../utils/guarded-timer';

const logger = enhancedLogger.child({ module: 'DeliveryQueueCleanup' });

export class DeliveryQueueCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMinutes = 30;

  /**
   * #18616 — la file est OPTIONNELLE, et son absence veut dire « ce processus
   * n'a pas de file » (outil, script, témoin), jamais « fabrique-m'en une ».
   *
   * Le repli d'avant — `new RedisDeliveryQueue({ getNativeClient: () => null })`
   * — était une SECONDE instance au sens du balayage d'unicité : inoffensive
   * ici, ce balayeur n'enfilant rien, mais c'est exactement l'inventaire qu'on
   * refuse de porter. Un objet nul se dit en ne faisant rien, pas en
   * construisant la chose dont on n'a pas besoin.
   */
  constructor(private deliveryQueue: RedisDeliveryQueue | undefined) {}

  start(): void {
    if (this.intervalId) {
      logger.warn('DeliveryQueueCleanup job already running');
      return;
    }

    logger.info(`Starting delivery queue cleanup job (interval: ${this.intervalMinutes}min)`);

    this.run();

    this.intervalId = guardedInterval({ name: 'delivery-queue-cleanup', everyMs: this.intervalMinutes * 60 * 1000, logger, run: () => {
      this.run();
    } });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Delivery queue cleanup job stopped');
    }
  }

  async runNow(): Promise<void> {
    await this.run();
  }

  private async run(): Promise<void> {
    if (!this.deliveryQueue) return;
    try {
      const removed = await this.deliveryQueue.cleanup();
      if (removed > 0) {
        logger.info(`Cleaned up ${removed} expired delivery queue entries`);
      }
    } catch (error) {
      logger.error('Error during delivery queue cleanup', { error });
    }
  }
}
