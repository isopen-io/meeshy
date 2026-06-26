/**
 * TusCleanupService Unit Tests
 *
 * Verifies:
 * - start() creates a repeating interval
 * - stop() clears the interval and nulls it
 * - stop() when interval is null is a safe no-op
 * - cleanup() removes stale files (mtimeMs older than 24h)
 * - cleanup() skips fresh files (mtimeMs too recent)
 * - cleanup() returns the count of removed files
 * - cleanup() handles readdir throwing (directory missing)
 * - cleanup() handles stat throwing on a specific file (file deleted mid-scan)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ─── fs mock ─────────────────────────────────────────────────────────────────

const mockReaddir = jest.fn<any>();
const mockStat = jest.fn<any>();
const mockRm = jest.fn<any>();

jest.mock('fs', () => ({
  promises: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    rm: (...args: unknown[]) => mockRm(...args),
  },
}));

// ─── logger mock ─────────────────────────────────────────────────────────────

const mockChildLogger = {
  debug: jest.fn<any>(),
  info: jest.fn<any>(),
  warn: jest.fn<any>(),
  error: jest.fn<any>(),
};

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => mockChildLogger,
  },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { TusCleanupService } from '../../../services/TusCleanupService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 86_400_000 ms
const STALE_OFFSET_MS = 90_000_000;     // 25h — clearly older than 24h
const FRESH_OFFSET_MS = 1_000;           // 1s — clearly newer than 24h

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStat(offsetMs: number): { mtimeMs: number } {
  return { mtimeMs: Date.now() - offsetMs };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TusCleanupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  describe('start', () => {
    it('creates an interval that fires cleanup on each tick', () => {
      const service = new TusCleanupService();
      mockReaddir.mockResolvedValue([]);

      service.start(1_000);

      // interval handle should be set
      expect((service as any).interval).not.toBeNull();

      service.stop();
    });

    it('fires cleanup after each interval tick', async () => {
      const service = new TusCleanupService();
      mockReaddir.mockResolvedValue([]);

      service.start(1_000);

      jest.advanceTimersByTime(1_000);
      // Let the async cleanup promise settle
      await Promise.resolve();
      await Promise.resolve();

      expect(mockReaddir).toHaveBeenCalled();

      service.stop();
    });
  });

  describe('stop', () => {
    it('clears the interval and nulls the handle', () => {
      const service = new TusCleanupService();
      mockReaddir.mockResolvedValue([]);

      service.start(1_000);
      expect((service as any).interval).not.toBeNull();

      service.stop();
      expect((service as any).interval).toBeNull();
    });

    it('is a safe no-op when interval is already null', () => {
      const service = new TusCleanupService();

      expect(() => service.stop()).not.toThrow();
      expect((service as any).interval).toBeNull();
    });
  });

  // ── cleanup() ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('removes stale files and returns count 1', async () => {
      mockReaddir.mockResolvedValue(['stale-upload']);
      mockStat.mockResolvedValue(makeStat(STALE_OFFSET_MS));
      mockRm.mockResolvedValue(undefined);

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      expect(mockRm).toHaveBeenCalledTimes(1);
      expect(removed).toBe(1);
    });

    it('removes multiple stale files and returns correct count', async () => {
      mockReaddir.mockResolvedValue(['upload-a', 'upload-b', 'upload-c']);
      mockStat.mockResolvedValue(makeStat(STALE_OFFSET_MS));
      mockRm.mockResolvedValue(undefined);

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      expect(mockRm).toHaveBeenCalledTimes(3);
      expect(removed).toBe(3);
    });

    it('skips fresh files and returns 0', async () => {
      mockReaddir.mockResolvedValue(['fresh-upload']);
      mockStat.mockResolvedValue(makeStat(FRESH_OFFSET_MS));

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      expect(mockRm).not.toHaveBeenCalled();
      expect(removed).toBe(0);
    });

    it('only removes files older than MAX_AGE_MS (mixed stale + fresh)', async () => {
      mockReaddir.mockResolvedValue(['stale', 'fresh']);
      mockStat
        .mockResolvedValueOnce(makeStat(STALE_OFFSET_MS)) // stale
        .mockResolvedValueOnce(makeStat(FRESH_OFFSET_MS)); // fresh

      mockRm.mockResolvedValue(undefined);

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      expect(mockRm).toHaveBeenCalledTimes(1);
      expect(removed).toBe(1);
    });

    it('calls rm with recursive + force options', async () => {
      mockReaddir.mockResolvedValue(['stale-dir']);
      mockStat.mockResolvedValue(makeStat(STALE_OFFSET_MS));
      mockRm.mockResolvedValue(undefined);

      const service = new TusCleanupService();
      await service.cleanup();

      expect(mockRm).toHaveBeenCalledWith(
        expect.stringContaining('stale-dir'),
        { recursive: true, force: true }
      );
    });

    it('returns 0 when the directory does not exist (readdir throws)', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      expect(removed).toBe(0);
      expect(mockRm).not.toHaveBeenCalled();
    });

    it('continues processing other entries when stat throws on one file', async () => {
      mockReaddir.mockResolvedValue(['gone', 'stale']);
      mockStat
        .mockRejectedValueOnce(new Error('ENOENT: gone already deleted')) // first file vanished
        .mockResolvedValueOnce(makeStat(STALE_OFFSET_MS));                // second is stale
      mockRm.mockResolvedValue(undefined);

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      // Only the stale file (which stat succeeded for) should be removed
      expect(mockRm).toHaveBeenCalledTimes(1);
      expect(removed).toBe(1);
    });

    it('does not call rm when stat throws (does not count as removed)', async () => {
      mockReaddir.mockResolvedValue(['ghost']);
      mockStat.mockRejectedValue(new Error('ENOENT'));

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      expect(mockRm).not.toHaveBeenCalled();
      expect(removed).toBe(0);
    });

    it('returns 0 and does not call rm when directory is empty', async () => {
      mockReaddir.mockResolvedValue([]);

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      expect(mockRm).not.toHaveBeenCalled();
      expect(removed).toBe(0);
    });

    it('logs info when stale files are removed', async () => {
      mockReaddir.mockResolvedValue(['stale-upload']);
      mockStat.mockResolvedValue(makeStat(STALE_OFFSET_MS));
      mockRm.mockResolvedValue(undefined);

      const service = new TusCleanupService();
      await service.cleanup();

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        'TusCleanup removed stale uploads',
        expect.objectContaining({ count: 1 })
      );
    });

    it('does not log removal info when no files are stale', async () => {
      mockReaddir.mockResolvedValue(['fresh-upload']);
      mockStat.mockResolvedValue(makeStat(FRESH_OFFSET_MS));

      const service = new TusCleanupService();
      await service.cleanup();

      expect(mockChildLogger.info).not.toHaveBeenCalledWith(
        'TusCleanup removed stale uploads',
        expect.anything()
      );
    });

    it('exactly at the boundary (mtimeMs = now - MAX_AGE_MS) is NOT removed (not strictly greater)', async () => {
      // now - stats.mtimeMs > MAX_AGE_MS must be strictly greater, so boundary === MAX_AGE_MS is kept
      mockReaddir.mockResolvedValue(['boundary-file']);
      // We can't freeze Date.now() precisely, but we can use MAX_AGE_MS directly as the offset;
      // since STALE_OFFSET_MS > MAX_AGE_MS we verify the condition is strictly greater-than.
      // This test documents the boundary semantics: equal is NOT removed.
      mockStat.mockImplementation(() =>
        Promise.resolve({ mtimeMs: Date.now() - MAX_AGE_MS })
      );

      const service = new TusCleanupService();
      const removed = await service.cleanup();

      // now - (now - MAX_AGE_MS) === MAX_AGE_MS, which is NOT > MAX_AGE_MS
      expect(removed).toBe(0);
      expect(mockRm).not.toHaveBeenCalled();
    });
  });
});
