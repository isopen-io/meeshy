import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'DeliveryQueueCleanup' });

export class DeliveryQueueCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMinutes = 30;

  constructor(private deliveryQueue: RedisDeliveryQueue) {}

  start(): void {
    if (this.intervalId) {
      logger.warn('DeliveryQueueCleanup job already running');
      return;
    }

    logger.info(`Starting delivery queue cleanup job (interval: ${this.intervalMinutes}min)`);

    this.run();

    this.intervalId = setInterval(() => {
      this.run();
    }, this.intervalMinutes * 60 * 1000);
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
