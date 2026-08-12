import { DeliveryQueueCleanupJob } from '../../../jobs/delivery-queue-cleanup';
import type { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';

function makeQueue(cleanupResult = 0, rejects = false): RedisDeliveryQueue {
  return {
    cleanup: rejects
      ? jest.fn().mockRejectedValue(new Error('cleanup failed'))
      : jest.fn().mockResolvedValue(cleanupResult),
  } as unknown as RedisDeliveryQueue;
}

describe('DeliveryQueueCleanupJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('start()', () => {
    test('runs cleanup immediately on first start', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });

    test('sets an interval that fires periodically', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      expect(queue.cleanup).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();
      expect(queue.cleanup).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();
      expect(queue.cleanup).toHaveBeenCalledTimes(3);
    });

    test('second start() call is a no-op (already-running guard)', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      job.start();
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    test('clears the interval so cleanup no longer fires', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      job.stop();

      jest.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });

    test('stop() is a no-op when the job was never started', () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      expect(() => job.stop()).not.toThrow();
      expect(queue.cleanup).not.toHaveBeenCalled();
    });

    test('stop() allows re-starting the job afterwards', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      job.stop();

      job.start();
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(2);
    });
  });

  describe('runNow()', () => {
    test('calls cleanup() and awaits the result', async () => {
      const queue = makeQueue(5);
      const job = new DeliveryQueueCleanupJob(queue);

      await job.runNow();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });

    test('works without start() having been called', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      await expect(job.runNow()).resolves.toBeUndefined();
      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling in run()', () => {
    test('catches errors from cleanup() and does not re-throw', async () => {
      const queue = makeQueue(0, true);
      const job = new DeliveryQueueCleanupJob(queue);

      await expect(job.runNow()).resolves.toBeUndefined();
    });

    test('interval continues firing even after a cleanup error', async () => {
      const queue = makeQueue(0, true);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();

      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(2);
    });
  });
});
