/**
 * GeoIP Cache Cleanup Job
 *
 * Drains EXPIRED entries from the in-memory GeoIP cache
 * (services/GeoIPService.ts). That cache is populated for every distinct public
 * IP that reaches the gateway (login, register, magic-link, phone-transfer via
 * getRequestContext) with a 5-minute TTL, but expired entries are only skipped
 * on READ — they are never freed there. Without this job the map retains one
 * dead entry per distinct IP seen since boot: an unbounded leak driven purely by
 * the number of distinct clients.
 *
 * Runs once shortly after startup (best-effort) and then every 10 minutes
 * (2× the cache TTL, so every entry is at most one interval past expiry before
 * it is freed). The cleaner is injected so scheduling can be tested without
 * reaching into the module-level cache (mirrors DeliveryQueueCleanupJob taking
 * its queue).
 */

import { cleanGeoCache } from '../services/GeoIPService';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'GeoCacheCleanup' });

export const GEO_CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class GeoCacheCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private readonly clean: () => number = cleanGeoCache) {}

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }

    logger.info('Starting GeoIP cache cleanup job (interval: 10m)');

    // Run immediately so a long-lived process that boots with a warm cache
    // doesn't wait a full interval before its first drain.
    this.run();

    this.intervalId = setInterval(() => this.run(), GEO_CACHE_CLEANUP_INTERVAL_MS);
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('GeoIP cache cleanup job stopped');
    }
  }

  /**
   * Run cleanup once. Exposed for manual triggers and tests. Returns the number
   * of expired entries removed.
   */
  runNow(): number {
    return this.run();
  }

  private run(): number {
    try {
      const removed = this.clean();
      if (removed > 0) {
        logger.info('Drained expired GeoIP cache entries', { removed });
      }
      return removed;
    } catch (error) {
      logger.error('Error during GeoIP cache cleanup', error as Error);
      return 0;
    }
  }
}
