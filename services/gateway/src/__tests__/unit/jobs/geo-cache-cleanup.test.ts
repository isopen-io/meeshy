/**
 * Unit tests for GeoCacheCleanupJob.
 *
 * The job periodically drains EXPIRED entries from the in-memory GeoIP cache.
 * Without it, expired entries are only skipped on read and never freed, so the
 * cache retains one dead entry per distinct IP seen since boot. The job takes a
 * `clean` function so the scheduling behaviour can be tested without reaching
 * into the module-level cache (mirrors DeliveryQueueCleanupJob taking its queue).
 */

import { GeoCacheCleanupJob, GEO_CACHE_CLEANUP_INTERVAL_MS } from '../../../jobs/geo-cache-cleanup';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

describe('GeoCacheCleanupJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('start()', () => {
    test('runs cleanup immediately on first start', () => {
      const clean = jest.fn().mockReturnValue(0);
      const job = new GeoCacheCleanupJob(clean);

      job.start();

      expect(clean).toHaveBeenCalledTimes(1);
    });

    test('sets an interval that fires periodically', () => {
      const clean = jest.fn().mockReturnValue(0);
      const job = new GeoCacheCleanupJob(clean);

      job.start();
      expect(clean).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(GEO_CACHE_CLEANUP_INTERVAL_MS);
      expect(clean).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(GEO_CACHE_CLEANUP_INTERVAL_MS);
      expect(clean).toHaveBeenCalledTimes(3);
    });

    test('second start() call is a no-op (already-running guard)', () => {
      const clean = jest.fn().mockReturnValue(0);
      const job = new GeoCacheCleanupJob(clean);

      job.start();
      job.start();

      expect(clean).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    test('clears the interval so cleanup no longer fires', () => {
      const clean = jest.fn().mockReturnValue(0);
      const job = new GeoCacheCleanupJob(clean);

      job.start();
      job.stop();

      jest.advanceTimersByTime(GEO_CACHE_CLEANUP_INTERVAL_MS * 3);

      expect(clean).toHaveBeenCalledTimes(1);
    });

    test('stop() is a no-op when the job was never started', () => {
      const clean = jest.fn().mockReturnValue(0);
      const job = new GeoCacheCleanupJob(clean);

      expect(() => job.stop()).not.toThrow();
      expect(clean).not.toHaveBeenCalled();
    });

    test('stop() allows re-starting the job afterwards', () => {
      const clean = jest.fn().mockReturnValue(0);
      const job = new GeoCacheCleanupJob(clean);

      job.start();
      job.stop();
      job.start();

      expect(clean).toHaveBeenCalledTimes(2);
    });
  });

  describe('runNow()', () => {
    test('calls clean() once and returns the number removed', () => {
      const clean = jest.fn().mockReturnValue(7);
      const job = new GeoCacheCleanupJob(clean);

      const removed = job.runNow();

      expect(clean).toHaveBeenCalledTimes(1);
      expect(removed).toBe(7);
    });

    test('works without start() having been called', () => {
      const clean = jest.fn().mockReturnValue(0);
      const job = new GeoCacheCleanupJob(clean);

      expect(job.runNow()).toBe(0);
      expect(clean).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    test('catches errors thrown by clean() and does not re-throw', () => {
      const clean = jest.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const job = new GeoCacheCleanupJob(clean);

      expect(() => job.runNow()).not.toThrow();
    });

    test('interval keeps firing even after a cleanup error', () => {
      const clean = jest.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const job = new GeoCacheCleanupJob(clean);

      job.start();
      jest.advanceTimersByTime(GEO_CACHE_CLEANUP_INTERVAL_MS);

      expect(clean).toHaveBeenCalledTimes(2);
    });
  });

  describe('default cleanup binding', () => {
    test('defaults to the real cleanGeoCache when no argument is given', () => {
      // Constructing with no clean fn must not throw — it binds the module cleaner.
      expect(() => new GeoCacheCleanupJob()).not.toThrow();
    });
  });
});
