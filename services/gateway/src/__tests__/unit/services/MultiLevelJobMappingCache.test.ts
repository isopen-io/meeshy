/**
 * Unit tests for MultiLevelJobMappingCache
 *
 * Covers: saveJobMapping, getAndDeleteJobMapping, getJobMapping,
 * hasJobMapping, deleteJobMapping, getStats, disconnect
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

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

import { MultiLevelJobMappingCache } from '../../../services/MultiLevelJobMappingCache';
import type { JobMetadata } from '../../../services/MultiLevelJobMappingCache';

function makeMetadata(overrides: Partial<JobMetadata> = {}): JobMetadata {
  return {
    userId: 'user-1',
    jobType: 'translation',
    timestamp: Date.now(),
    messageId: 'msg-1',
    conversationId: 'conv-1',
    ...overrides,
  };
}

describe('MultiLevelJobMappingCache', () => {
  let sut: MultiLevelJobMappingCache;

  beforeEach(() => {
    sut = new MultiLevelJobMappingCache(); // no store — memory-only
  });

  afterEach(async () => {
    await sut.disconnect();
    jest.clearAllMocks();
  });

  it('saveJobMapping persists and getJobMapping retrieves the metadata', async () => {
    const meta = makeMetadata({ jobType: 'voice' });
    await sut.saveJobMapping('job-1', meta);
    const result = await sut.getJobMapping('job-1');
    expect(result).toEqual(meta);
  });

  it('getAndDeleteJobMapping returns metadata then null on second call', async () => {
    const meta = makeMetadata({ jobType: 'audio' });
    await sut.saveJobMapping('job-2', meta);

    const first = await sut.getAndDeleteJobMapping('job-2');
    const second = await sut.getAndDeleteJobMapping('job-2');

    expect(first).toEqual(meta);
    expect(second).toBeNull();
  });

  it('getJobMapping returns null for an unknown job', async () => {
    const result = await sut.getJobMapping('nonexistent');
    expect(result).toBeNull();
  });

  it('hasJobMapping returns true when key exists, false otherwise', async () => {
    await sut.saveJobMapping('job-3', makeMetadata());
    expect(await sut.hasJobMapping('job-3')).toBe(true);
    expect(await sut.hasJobMapping('unknown')).toBe(false);
  });

  it('deleteJobMapping removes the key and returns true', async () => {
    await sut.saveJobMapping('job-4', makeMetadata());
    const deleted = await sut.deleteJobMapping('job-4');
    expect(deleted).toBe(true);
    expect(await sut.hasJobMapping('job-4')).toBe(false);
  });

  it('deleteJobMapping returns false for a non-existent key', async () => {
    const result = await sut.deleteJobMapping('ghost');
    expect(result).toBe(false);
  });

  it('getStats returns memorySize reflecting current entry count', async () => {
    await sut.saveJobMapping('j1', makeMetadata());
    await sut.saveJobMapping('j2', makeMetadata());
    const stats = sut.getStats();
    expect(stats.memorySize).toBe(2);
    expect(typeof stats.memoryCapacity).toBe('number');
  });

  it('disconnect empties the cache', async () => {
    await sut.saveJobMapping('j5', makeMetadata());
    await sut.disconnect();
    expect(sut.getStats().memorySize).toBe(0);
  });
});
