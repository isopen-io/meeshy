/**
 * TusCleanupService Unit Tests
 *
 * Covers:
 * - start(): creates interval with correct default/custom period
 * - stop(): clears interval; no-op when not started
 * - cleanup(): returns 0 on empty dir, removes stale files, skips fresh ones
 * - cleanup(): handles readdir error gracefully (missing dir)
 * - cleanup(): handles per-file stat error gracefully (race condition)
 * - cleanup(): calls rm with recursive+force options
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

const mockReaddir = jest.fn();
const mockStat = jest.fn();
const mockRm = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    rm: (...args: unknown[]) => mockRm(...args),
  },
}));

import { TusCleanupService } from '../../../services/TusCleanupService';

const ONE_HOUR_MS = 60 * 60 * 1000;
const STALE_AGE_MS = 25 * 60 * 60 * 1000; // 25 h — older than 24 h threshold

describe('TusCleanupService', () => {
  let svc: TusCleanupService;

  beforeEach(() => {
    svc = new TusCleanupService();
  });

  afterEach(() => {
    svc.stop();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // start / stop
  // ---------------------------------------------------------------------------
  describe('start / stop', () => {
    it('creates an interval on start', () => {
      svc.start();
      expect((svc as any).interval).not.toBeNull();
    });

    it('clears the interval on stop', () => {
      svc.start();
      svc.stop();
      expect((svc as any).interval).toBeNull();
    });

    it('stop is a no-op when not started', () => {
      expect(() => svc.stop()).not.toThrow();
      expect((svc as any).interval).toBeNull();
    });

    it('uses 1-hour default interval when not specified', () => {
      const spy = jest.spyOn(global, 'setInterval');
      svc.start();
      expect(spy).toHaveBeenCalledWith(expect.any(Function), ONE_HOUR_MS);
      spy.mockRestore();
    });

    it('uses custom interval when specified', () => {
      const spy = jest.spyOn(global, 'setInterval');
      const CUSTOM_MS = 30 * 60 * 1000;
      svc.start(CUSTOM_MS);
      expect(spy).toHaveBeenCalledWith(expect.any(Function), CUSTOM_MS);
      spy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup — empty / fresh
  // ---------------------------------------------------------------------------
  describe('cleanup — empty or fresh directory', () => {
    it('returns 0 when directory has no entries', async () => {
      mockReaddir.mockResolvedValue([]);
      expect(await svc.cleanup()).toBe(0);
    });

    it('returns 0 when all files were modified within the last 24 hours', async () => {
      mockReaddir.mockResolvedValue(['upload.bin', 'upload.bin.info']);
      mockStat.mockResolvedValue({ mtimeMs: Date.now() - 60 * 1000 }); // 1 min ago
      expect(await svc.cleanup()).toBe(0);
      expect(mockRm).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup — stale file removal
  // ---------------------------------------------------------------------------
  describe('cleanup — stale file removal', () => {
    it('removes a single stale file and returns 1', async () => {
      mockReaddir.mockResolvedValue(['stale.bin']);
      mockStat.mockResolvedValue({ mtimeMs: Date.now() - STALE_AGE_MS });
      mockRm.mockResolvedValue(undefined);

      expect(await svc.cleanup()).toBe(1);
    });

    it('removes all stale files when multiple are present', async () => {
      mockReaddir.mockResolvedValue(['a.bin', 'b.bin', 'c.bin']);
      mockStat.mockResolvedValue({ mtimeMs: Date.now() - STALE_AGE_MS });
      mockRm.mockResolvedValue(undefined);

      expect(await svc.cleanup()).toBe(3);
      expect(mockRm).toHaveBeenCalledTimes(3);
    });

    it('calls rm with recursive:true and force:true', async () => {
      mockReaddir.mockResolvedValue(['stale.bin']);
      mockStat.mockResolvedValue({ mtimeMs: Date.now() - STALE_AGE_MS });
      mockRm.mockResolvedValue(undefined);

      await svc.cleanup();

      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('stale.bin'), {
        recursive: true,
        force: true,
      });
    });

    it('skips fresh files and removes only stale ones', async () => {
      mockReaddir.mockResolvedValue(['fresh.bin', 'stale.bin']);
      mockStat
        .mockResolvedValueOnce({ mtimeMs: Date.now() - 60 * 1000 })    // fresh
        .mockResolvedValueOnce({ mtimeMs: Date.now() - STALE_AGE_MS }); // stale
      mockRm.mockResolvedValue(undefined);

      expect(await svc.cleanup()).toBe(1);
      expect(mockRm).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup — error resilience
  // ---------------------------------------------------------------------------
  describe('cleanup — error resilience', () => {
    it('returns 0 when directory does not exist (ENOENT)', async () => {
      mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      expect(await svc.cleanup()).toBe(0);
    });

    it('returns 0 when readdir throws any unexpected error', async () => {
      mockReaddir.mockRejectedValue(new Error('Permission denied'));
      expect(await svc.cleanup()).toBe(0);
    });

    it('continues processing remaining files when stat throws for one file', async () => {
      mockReaddir.mockResolvedValue(['gone.bin', 'stale.bin']);
      mockStat
        .mockRejectedValueOnce(new Error('ENOENT')) // disappeared between readdir and stat
        .mockResolvedValueOnce({ mtimeMs: Date.now() - STALE_AGE_MS });
      mockRm.mockResolvedValue(undefined);

      expect(await svc.cleanup()).toBe(1);
    });

    it('continues processing when rm throws for one file', async () => {
      mockReaddir.mockResolvedValue(['bad.bin', 'good.bin']);
      mockStat.mockResolvedValue({ mtimeMs: Date.now() - STALE_AGE_MS });
      mockRm
        .mockRejectedValueOnce(new Error('EPERM'))
        .mockResolvedValueOnce(undefined);

      // rm error falls into the per-file catch — does not propagate
      const result = await svc.cleanup();
      // bad.bin threw during rm but good.bin counted; or bad.bin also not counted
      // Either 1 or 0 is valid depending on whether the rm throw happens after removed++
      // Looking at the source: rm() is called AFTER removed++ — so bad.bin increments removed
      // Actually: `await fs.rm(...)` throws → caught by per-file catch → removed stays at 1 (from bad.bin already incremented)
      // Wait: the source code is:
      //   await fs.rm(fullPath, ...)
      //   removed++;
      // So if rm throws, removed is NOT incremented for that file
      // Let me re-read... yes: removed++ is AFTER rm. So bad.bin = 0, good.bin = 1.
      // BUT rm throws and the per-file catch catches it, so good.bin still runs.
      expect(result).toBe(1);
    });
  });
});
