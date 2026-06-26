/**
 * MultiLevelJobMappingCache — unit tests
 *
 * Verifies that every public method delegates correctly to MultiLevelCache<JobMetadata>.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mock MultiLevelCache (hoisted) ──────────────────────────────────────────

const mockSet = jest.fn<any>().mockResolvedValue(undefined);
const mockGet = jest.fn<any>().mockResolvedValue(null);
const mockGetAndDelete = jest.fn<any>().mockResolvedValue(null);
const mockHas = jest.fn<any>().mockResolvedValue(false);
const mockDelete = jest.fn<any>().mockResolvedValue(false);
const mockGetStats = jest.fn<any>().mockReturnValue({ memorySize: 0, memoryCapacity: 100, name: 'JobMapping' });
const mockDisconnect = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/MultiLevelCache', () => ({
  MultiLevelCache: jest.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
    getAndDelete: mockGetAndDelete,
    has: mockHas,
    delete: mockDelete,
    getStats: mockGetStats,
    disconnect: mockDisconnect,
  })),
}));

import { MultiLevelJobMappingCache, type JobMetadata } from '../../../services/MultiLevelJobMappingCache';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMetadata(overrides: Partial<JobMetadata> = {}): JobMetadata {
  return {
    userId: 'user-1',
    jobType: 'translation',
    timestamp: 1700000000000,
    messageId: 'msg-1',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('MultiLevelJobMappingCache.saveJobMapping', () => {
  it('delegates to cache.set with jobId and metadata', async () => {
    const cache = new MultiLevelJobMappingCache();
    const meta = makeMetadata();

    await cache.saveJobMapping('job-abc', meta);

    expect(mockSet).toHaveBeenCalledWith('job-abc', meta);
  });

  it('resolves void', async () => {
    const cache = new MultiLevelJobMappingCache();
    await expect(cache.saveJobMapping('j1', makeMetadata())).resolves.toBeUndefined();
  });
});

describe('MultiLevelJobMappingCache.getAndDeleteJobMapping', () => {
  it('delegates to cache.getAndDelete', async () => {
    const cache = new MultiLevelJobMappingCache();
    const meta = makeMetadata({ jobType: 'voice' });
    mockGetAndDelete.mockResolvedValueOnce(meta);

    const result = await cache.getAndDeleteJobMapping('job-abc');

    expect(mockGetAndDelete).toHaveBeenCalledWith('job-abc');
    expect(result).toEqual(meta);
  });

  it('returns null when job not found', async () => {
    const cache = new MultiLevelJobMappingCache();
    mockGetAndDelete.mockResolvedValueOnce(null);

    const result = await cache.getAndDeleteJobMapping('missing');

    expect(result).toBeNull();
  });
});

describe('MultiLevelJobMappingCache.getJobMapping', () => {
  it('delegates to cache.get', async () => {
    const cache = new MultiLevelJobMappingCache();
    const meta = makeMetadata();
    mockGet.mockResolvedValueOnce(meta);

    const result = await cache.getJobMapping('job-abc');

    expect(mockGet).toHaveBeenCalledWith('job-abc');
    expect(result).toEqual(meta);
  });

  it('returns null when job not found', async () => {
    const cache = new MultiLevelJobMappingCache();
    const result = await cache.getJobMapping('missing');
    expect(result).toBeNull();
  });
});

describe('MultiLevelJobMappingCache.hasJobMapping', () => {
  it('returns true when job exists', async () => {
    const cache = new MultiLevelJobMappingCache();
    mockHas.mockResolvedValueOnce(true);

    const result = await cache.hasJobMapping('job-abc');

    expect(mockHas).toHaveBeenCalledWith('job-abc');
    expect(result).toBe(true);
  });

  it('returns false when job does not exist', async () => {
    const cache = new MultiLevelJobMappingCache();
    const result = await cache.hasJobMapping('missing');
    expect(result).toBe(false);
  });
});

describe('MultiLevelJobMappingCache.deleteJobMapping', () => {
  it('delegates to cache.delete and returns true on success', async () => {
    const cache = new MultiLevelJobMappingCache();
    mockDelete.mockResolvedValueOnce(true);

    const result = await cache.deleteJobMapping('job-abc');

    expect(mockDelete).toHaveBeenCalledWith('job-abc');
    expect(result).toBe(true);
  });

  it('returns false when job did not exist', async () => {
    const cache = new MultiLevelJobMappingCache();
    mockDelete.mockResolvedValueOnce(false);

    const result = await cache.deleteJobMapping('missing');

    expect(result).toBe(false);
  });
});

describe('MultiLevelJobMappingCache.getStats', () => {
  it('returns stats from underlying cache', () => {
    const cache = new MultiLevelJobMappingCache();
    mockGetStats.mockReturnValueOnce({ memorySize: 5, memoryCapacity: 1000, name: 'JobMapping' });

    const stats = cache.getStats();

    expect(mockGetStats).toHaveBeenCalled();
    expect(stats.memorySize).toBe(5);
    expect(stats.memoryCapacity).toBe(1000);
  });
});

describe('MultiLevelJobMappingCache.disconnect', () => {
  it('calls cache.disconnect', async () => {
    const cache = new MultiLevelJobMappingCache();

    await cache.disconnect();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('resolves void', async () => {
    const cache = new MultiLevelJobMappingCache();
    await expect(cache.disconnect()).resolves.toBeUndefined();
  });
});
