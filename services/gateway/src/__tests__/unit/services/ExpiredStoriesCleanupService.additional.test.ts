/**
 * Additional coverage for ExpiredStoriesCleanupService — lines not reached by
 * the primary P2014 regression suite:
 *  - start() method: immediate cleanup call + setInterval setup (lines 41-56)
 *  - soft-delete catch block (line 84)
 *  - hard-delete catch block (line 142)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../../../services/ExpiredStoriesCleanupService';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

function makeMinimalPrisma(overrides: Record<string, unknown> = {}): any {
  return {
    post: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postComment: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

describe('ExpiredStoriesCleanupService — start() method', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls cleanup() immediately on start', async () => {
    const prisma = makeMinimalPrisma();
    const service = new ExpiredStoriesCleanupService(prisma);

    service.start(60_000);
    // The immediate cleanup() is a void promise — flush microtasks
    await Promise.resolve();

    expect(prisma.post.updateMany).toHaveBeenCalled();
    service.stop();
  });

  it('calls cleanup() again when the interval fires', async () => {
    const prisma = makeMinimalPrisma();
    const service = new ExpiredStoriesCleanupService(prisma);
    const intervalMs = 5_000;

    service.start(intervalMs);
    await Promise.resolve(); // flush immediate cleanup

    const callsAfterStart = (prisma.post.updateMany as jest.Mock).mock.calls.length;

    jest.advanceTimersByTime(intervalMs);
    await Promise.resolve(); // flush interval cleanup

    const callsAfterInterval = (prisma.post.updateMany as jest.Mock).mock.calls.length;
    expect(callsAfterInterval).toBeGreaterThan(callsAfterStart);

    service.stop();
  });

  it('stop() clears the interval so no further cleanup calls are made', async () => {
    const prisma = makeMinimalPrisma();
    const service = new ExpiredStoriesCleanupService(prisma);

    service.start(5_000);
    await Promise.resolve();

    service.stop();

    const callsAtStop = (prisma.post.updateMany as jest.Mock).mock.calls.length;
    jest.advanceTimersByTime(100_000);
    await Promise.resolve();

    expect((prisma.post.updateMany as jest.Mock).mock.calls.length).toBe(callsAtStop);
  });

  it('stop() is a no-op when called before start()', () => {
    const prisma = makeMinimalPrisma();
    const service = new ExpiredStoriesCleanupService(prisma);
    expect(() => service.stop()).not.toThrow();
  });
});

describe('ExpiredStoriesCleanupService — error catch blocks', () => {
  it('soft-delete pass failure is caught and returns softDeleted=0', async () => {
    const prisma = makeMinimalPrisma();
    prisma.post.updateMany = jest.fn<any>().mockRejectedValue(new Error('DB unavailable'));

    const service = new ExpiredStoriesCleanupService(prisma);
    const result = await service.cleanup();

    expect(result.softDeleted).toBe(0);
    expect(result.hardDeleted).toBe(0);
  });

  it('hard-delete pass failure is caught and returns hardDeleted=0', async () => {
    const prisma = makeMinimalPrisma();
    // Soft-delete succeeds
    prisma.post.updateMany = jest.fn<any>().mockResolvedValue({ count: 2 });
    // Hard-delete findMany succeeds and returns stories
    prisma.post.findMany = jest.fn<any>().mockResolvedValueOnce([{ id: 'story-1' }]);
    // But a subsequent operation in the hard-delete block throws
    prisma.post.deleteMany = jest.fn<any>().mockRejectedValue(new Error('delete failed'));

    const service = new ExpiredStoriesCleanupService(prisma, { hardDeleteAgeMs: 0 });
    const result = await service.cleanup();

    expect(result.softDeleted).toBe(2);
    expect(result.hardDeleted).toBe(0);
  });

  it('cleanup returns { softDeleted: 0, hardDeleted: 0 } when both passes fail', async () => {
    const prisma = makeMinimalPrisma();
    prisma.post.updateMany = jest.fn<any>().mockRejectedValue(new Error('soft fail'));
    prisma.post.findMany = jest.fn<any>().mockRejectedValue(new Error('hard fail'));

    const service = new ExpiredStoriesCleanupService(prisma);
    const result = await service.cleanup();

    expect(result).toEqual({ softDeleted: 0, hardDeleted: 0 });
  });
});
