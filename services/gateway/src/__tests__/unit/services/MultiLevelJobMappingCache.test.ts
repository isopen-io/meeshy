/**
 * Unit tests for MultiLevelJobMappingCache
 * Uses the real MultiLevelCache implementation (memory-only, no CacheStore).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
  }
}));

import { MultiLevelJobMappingCache, type JobMetadata } from '../../../services/MultiLevelJobMappingCache';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMetadata(overrides: Partial<JobMetadata> = {}): JobMetadata {
  return {
    userId: 'user-123',
    jobType: 'transcription',
    timestamp: Date.now(),
    ...overrides
  };
}

function makeCache(): MultiLevelJobMappingCache {
  return new MultiLevelJobMappingCache();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MultiLevelJobMappingCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('saveJobMapping then getJobMapping returns stored metadata', async () => {
    const cache = makeCache();
    const metadata = makeMetadata({ messageId: 'msg-1', jobType: 'translation' });

    await cache.saveJobMapping('job-1', metadata);
    const result = await cache.getJobMapping('job-1');

    expect(result).toEqual(metadata);
  });

  it('hasJobMapping returns false for an unknown jobId', async () => {
    const cache = makeCache();

    const result = await cache.hasJobMapping('nonexistent-job');

    expect(result).toBe(false);
  });

  it('hasJobMapping returns true after saveJobMapping', async () => {
    const cache = makeCache();
    const metadata = makeMetadata({ attachmentId: 'att-42', jobType: 'voice' });

    await cache.saveJobMapping('job-voice', metadata);
    const result = await cache.hasJobMapping('job-voice');

    expect(result).toBe(true);
  });

  it('getAndDeleteJobMapping returns metadata and then hasJobMapping returns false', async () => {
    const cache = makeCache();
    const metadata = makeMetadata({ conversationId: 'conv-99', jobType: 'audio' });

    await cache.saveJobMapping('job-audio', metadata);
    const fetched = await cache.getAndDeleteJobMapping('job-audio');

    expect(fetched).toEqual(metadata);
    expect(await cache.hasJobMapping('job-audio')).toBe(false);
  });

  it('deleteJobMapping returns true when key exists', async () => {
    const cache = makeCache();
    await cache.saveJobMapping('job-del', makeMetadata());

    const result = await cache.deleteJobMapping('job-del');

    expect(result).toBe(true);
  });

  it('deleteJobMapping returns false when key does not exist', async () => {
    const cache = makeCache();

    const result = await cache.deleteJobMapping('no-such-job');

    expect(result).toBe(false);
  });

  it('getStats returns memorySize and memoryCapacity', async () => {
    const cache = makeCache();
    await cache.saveJobMapping('j1', makeMetadata());
    await cache.saveJobMapping('j2', makeMetadata());

    const stats = cache.getStats();

    expect(typeof stats.memorySize).toBe('number');
    expect(typeof stats.memoryCapacity).toBe('number');
    expect(stats.memorySize).toBe(2);
  });

  it('disconnect resolves without throwing', async () => {
    const cache = makeCache();
    await cache.saveJobMapping('job-x', makeMetadata());

    await expect(cache.disconnect()).resolves.toBeUndefined();
  });
});
