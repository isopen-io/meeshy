import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn<any>(),
    stat: jest.fn<any>(),
    rm: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

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

import { promises as fs } from 'fs';
import { TusCleanupService } from '../../../services/TusCleanupService';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('TusCleanupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (mockFs.rm as jest.Mock<any>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // start / stop lifecycle
  // ---------------------------------------------------------------------------
  describe('start', () => {
    it('sets an interval when started', () => {
      const service = new TusCleanupService();

      service.start(60_000);

      expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);

      service.stop();
    });
  });

  describe('stop', () => {
    it('clears the interval after stop', () => {
      const service = new TusCleanupService();

      service.start(60_000);
      const timersBefore = jest.getTimerCount();
      service.stop();

      expect(jest.getTimerCount()).toBeLessThan(timersBefore);
    });

    it('is safe when called without start', () => {
      const service = new TusCleanupService();

      expect(() => service.stop()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup
  // ---------------------------------------------------------------------------
  describe('cleanup', () => {
    it('returns 0 when directory is empty', async () => {
      (mockFs.readdir as jest.Mock<any>).mockResolvedValue([]);
      const service = new TusCleanupService();

      const result = await service.cleanup();

      expect(result).toBe(0);
    });

    it('removes files older than 24h and returns count', async () => {
      const now = Date.now();
      (mockFs.readdir as jest.Mock<any>).mockResolvedValue(['old-file', 'new-file']);
      (mockFs.stat as jest.Mock<any>).mockImplementation((filePath: string) => {
        if ((filePath as string).includes('old-file')) {
          return Promise.resolve({ mtimeMs: now - 25 * 60 * 60 * 1000 });
        }
        return Promise.resolve({ mtimeMs: now - 1000 });
      });

      const service = new TusCleanupService();
      const result = await service.cleanup();

      expect(result).toBe(1);
      expect(mockFs.rm).toHaveBeenCalledTimes(1);
    });

    it('does NOT remove files newer than 24h', async () => {
      const now = Date.now();
      (mockFs.readdir as jest.Mock<any>).mockResolvedValue(['old-file', 'new-file']);
      (mockFs.stat as jest.Mock<any>).mockImplementation((filePath: string) => {
        if ((filePath as string).includes('old-file')) {
          return Promise.resolve({ mtimeMs: now - 25 * 60 * 60 * 1000 });
        }
        return Promise.resolve({ mtimeMs: now - 1000 });
      });

      const service = new TusCleanupService();
      await service.cleanup();

      const rmCalls = (mockFs.rm as jest.Mock<any>).mock.calls as string[][];
      const removedNewFile = rmCalls.some((args) => (args[0] as string).includes('new-file'));
      expect(removedNewFile).toBe(false);
    });

    it('returns 0 when readdir throws (directory not found)', async () => {
      (mockFs.readdir as jest.Mock<any>).mockRejectedValue(new Error('ENOENT: no such file or directory'));
      const service = new TusCleanupService();

      const result = await service.cleanup();

      expect(result).toBe(0);
    });

    it('continues with remaining files when one stat throws', async () => {
      const now = Date.now();
      (mockFs.readdir as jest.Mock<any>).mockResolvedValue(['bad-file', 'old-file']);
      (mockFs.stat as jest.Mock<any>).mockImplementation((filePath: string) => {
        if ((filePath as string).includes('bad-file')) {
          return Promise.reject(new Error('ENOENT: bad-file disappeared'));
        }
        return Promise.resolve({ mtimeMs: now - 25 * 60 * 60 * 1000 });
      });

      const service = new TusCleanupService();
      const result = await service.cleanup();

      expect(result).toBe(1);
      expect(mockFs.rm).toHaveBeenCalledTimes(1);
    });
  });
});
