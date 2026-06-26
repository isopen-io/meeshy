/**
 * Unit tests for OrphanMediaCleanupService — producer/consumer API and
 * lifecycle methods (track, untrack, trackBatch, untrackBatch, start, stop).
 *
 * Race-condition tests for reapExpired() live in the companion file
 * OrphanMediaCleanupService.race.test.ts.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OrphanMediaCleanupService } from '../OrphanMediaCleanupService';
import type { MediaStorage } from '../MediaStorage';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  orphanMediaCleanup: {
    create: jest.fn() as jest.Mock<any>,
    delete: jest.fn() as jest.Mock<any>,
    deleteMany: jest.fn() as jest.Mock<any>,
    findMany: jest.fn() as jest.Mock<any>,
  },
  $transaction: jest.fn() as jest.Mock<any>,
});

const buildMockStorage = (): MediaStorage =>
  ({
    delete: jest.fn() as jest.Mock<any>,
    duplicate: jest.fn(),
    planDuplicate: jest.fn(),
    relativePathFromUrl: jest.fn(),
  } as unknown as MediaStorage);

// ── Tests ─────────────────────────────────────────────────────────────────

describe('OrphanMediaCleanupService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockStorage: MediaStorage;
  let service: OrphanMediaCleanupService;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPrisma = buildMockPrisma();
    mockStorage = buildMockStorage();
    service = new OrphanMediaCleanupService(mockPrisma as any, mockStorage);
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  // ── track ──────────────────────────────────────────────────────────────

  describe('track', () => {
    it('creates an outbox row and returns its id', async () => {
      mockPrisma.orphanMediaCleanup.create.mockResolvedValue({ id: 'row-id-1' });

      const id = await service.track('https://storage/file.jpg', 'message-upload');

      expect(id).toBe('row-id-1');
      const call = mockPrisma.orphanMediaCleanup.create.mock.calls[0][0] as any;
      expect(call.data.fileUrl).toBe('https://storage/file.jpg');
      expect(call.data.source).toBe('message-upload');
      expect(call.data.cleanupAfter).toBeInstanceOf(Date);
      // cleanupAfter should be roughly 1 hour in the future
      const diff = call.data.cleanupAfter.getTime() - Date.now();
      expect(diff).toBeGreaterThan(59 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(60 * 60 * 1000 + 100);
    });

    it('respects a custom expiryMs', async () => {
      mockPrisma.orphanMediaCleanup.create.mockResolvedValue({ id: 'row-id-2' });

      await service.track('https://storage/video.mp4', 'post-upload', 5 * 60 * 1000);

      const call = mockPrisma.orphanMediaCleanup.create.mock.calls[0][0] as any;
      const diff = call.data.cleanupAfter.getTime() - Date.now();
      expect(diff).toBeGreaterThan(4 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(5 * 60 * 1000 + 100);
    });

    it('only selects the id column from create result', async () => {
      mockPrisma.orphanMediaCleanup.create.mockResolvedValue({ id: 'only-id' });

      await service.track('https://storage/img.png', 'story-upload');

      const call = mockPrisma.orphanMediaCleanup.create.mock.calls[0][0] as any;
      expect(call.select).toEqual({ id: true });
    });
  });

  // ── untrack ────────────────────────────────────────────────────────────

  describe('untrack', () => {
    it('deletes the outbox row by id', async () => {
      mockPrisma.orphanMediaCleanup.delete.mockResolvedValue({ id: 'row-1' });

      await service.untrack('row-1');

      expect(mockPrisma.orphanMediaCleanup.delete).toHaveBeenCalledWith({
        where: { id: 'row-1' },
      });
    });

    it('is idempotent: swallows errors when row is already gone', async () => {
      mockPrisma.orphanMediaCleanup.delete.mockRejectedValue(
        new Error('Record to delete does not exist'),
      );

      await expect(service.untrack('missing-row')).resolves.toBeUndefined();
    });
  });

  // ── trackBatch ─────────────────────────────────────────────────────────

  describe('trackBatch', () => {
    it('returns empty array immediately for empty input', async () => {
      const result = await service.trackBatch([], 'batch-source');
      expect(result).toEqual([]);
      expect(mockPrisma.orphanMediaCleanup.create).not.toHaveBeenCalled();
    });

    it('creates one row per file and returns ids in order', async () => {
      mockPrisma.orphanMediaCleanup.create
        .mockResolvedValueOnce({ id: 'id-1' })
        .mockResolvedValueOnce({ id: 'id-2' })
        .mockResolvedValueOnce({ id: 'id-3' });

      const ids = await service.trackBatch(
        ['https://s/a.jpg', 'https://s/b.mp4', 'https://s/c.png'],
        'repost-upload',
      );

      expect(ids).toEqual(['id-1', 'id-2', 'id-3']);
      expect(mockPrisma.orphanMediaCleanup.create).toHaveBeenCalledTimes(3);
    });

    it('sets cleanupAfter with custom expiryMs', async () => {
      mockPrisma.orphanMediaCleanup.create.mockResolvedValue({ id: 'x' });

      await service.trackBatch(['https://s/f.jpg'], 'src', 10 * 60 * 1000);

      const call = mockPrisma.orphanMediaCleanup.create.mock.calls[0][0] as any;
      const diff = call.data.cleanupAfter.getTime() - Date.now();
      expect(diff).toBeGreaterThan(9 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(10 * 60 * 1000 + 100);
    });
  });

  // ── untrackBatch ───────────────────────────────────────────────────────

  describe('untrackBatch', () => {
    it('returns immediately without DB call for empty input', async () => {
      await service.untrackBatch([]);
      expect(mockPrisma.orphanMediaCleanup.deleteMany).not.toHaveBeenCalled();
    });

    it('calls deleteMany with all provided ids', async () => {
      mockPrisma.orphanMediaCleanup.deleteMany.mockResolvedValue({ count: 3 });

      await service.untrackBatch(['id-1', 'id-2', 'id-3']);

      expect(mockPrisma.orphanMediaCleanup.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['id-1', 'id-2', 'id-3'] } },
      });
    });

    it('is idempotent: swallows errors from deleteMany', async () => {
      mockPrisma.orphanMediaCleanup.deleteMany.mockRejectedValue(
        new Error('Records to delete do not exist'),
      );

      await expect(service.untrackBatch(['gone-1', 'gone-2'])).resolves.toBeUndefined();
    });
  });

  // ── start / stop lifecycle ─────────────────────────────────────────────

  describe('start', () => {
    it('starts the reap interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      service.start(1000);

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      setIntervalSpy.mockRestore();
    });

    it('is idempotent: second call does not create another interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      service.start(1000);
      service.start(1000);

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      setIntervalSpy.mockRestore();
    });

    it('fires reapExpired after the interval elapses', async () => {
      mockPrisma.orphanMediaCleanup.findMany.mockResolvedValue([]);

      service.start(60_000);
      jest.advanceTimersByTime(60_001);
      // Allow the setInterval callback to flush
      await Promise.resolve();

      expect(mockPrisma.orphanMediaCleanup.findMany).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('clears the running interval', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.start(1000);
      service.stop();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      clearIntervalSpy.mockRestore();
    });

    it('is idempotent: multiple stop calls do not throw', () => {
      service.start(1000);
      expect(() => {
        service.stop();
        service.stop();
        service.stop();
      }).not.toThrow();
    });

    it('does not call clearInterval when not started', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.stop(); // never started

      expect(clearIntervalSpy).not.toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  // ── reapExpired ────────────────────────────────────────────────────────

  describe('reapExpired', () => {
    it('returns 0 when there are no expired rows', async () => {
      mockPrisma.orphanMediaCleanup.findMany.mockResolvedValue([]);

      const count = await service.reapExpired();

      expect(count).toBe(0);
      expect(mockStorage.delete).not.toHaveBeenCalled();
    });

    it('deletes storage files and outbox rows for expired entries', async () => {
      const rows = [
        { id: 'r1', fileUrl: 'https://s/a.jpg' },
        { id: 'r2', fileUrl: 'https://s/b.mp4' },
      ];

      // Outer findMany returns the batch
      mockPrisma.orphanMediaCleanup.findMany.mockResolvedValueOnce(rows);
      // Second call signals end of loop
      mockPrisma.orphanMediaCleanup.findMany.mockResolvedValueOnce([]);

      // $transaction claims the rows: inner findMany, then deleteMany
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          orphanMediaCleanup: {
            findMany: jest.fn().mockResolvedValue(rows),
            deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        });
      });

      const count = await service.reapExpired();

      expect(count).toBe(2);
      expect(mockStorage.delete).toHaveBeenCalledTimes(2);
    });

    it('does not call storage.delete when transaction claims zero rows', async () => {
      const rows = [{ id: 'r1', fileUrl: 'https://s/a.jpg' }];

      mockPrisma.orphanMediaCleanup.findMany.mockResolvedValueOnce(rows);

      // Transaction: inner findMany sees nothing (concurrent untrack won)
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          orphanMediaCleanup: {
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        });
      });

      const count = await service.reapExpired();

      expect(count).toBe(0);
      expect(mockStorage.delete).not.toHaveBeenCalled();
    });
  });
});
