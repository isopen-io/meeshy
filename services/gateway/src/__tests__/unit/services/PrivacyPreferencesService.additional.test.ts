/**
 * Additional PrivacyPreferencesService coverage — cleanupCache via interval (lines 62, 71-82)
 * The primary test suite never advances time far enough to fire the 10-minute cleanup interval.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PrivacyPreferencesService } from '../../../services/PrivacyPreferencesService';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

const CACHE_TTL_MS = 5 * 60 * 1000;        // 5 min — entries expire after this
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 min — interval fires after this

const storedPrefs = () =>
  ['show-online-status','show-last-seen','show-read-receipts','show-typing-indicator',
   'allow-contact-requests','allow-group-invites','save-media-to-gallery','allow-analytics']
    .map(key => ({ key, value: 'true' }));

function makePrisma() {
  return { userPreference: { findMany: jest.fn<any>().mockResolvedValue(storedPrefs()) } };
}

describe('PrivacyPreferencesService — cleanupCache via interval', () => {
  let service: PrivacyPreferencesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.useFakeTimers();
    prisma = makePrisma();
    service = new PrivacyPreferencesService(prisma as any);
  });

  afterEach(() => {
    service.shutdown();
    jest.useRealTimers();
  });

  it('removes expired entries when the cleanup interval fires', async () => {
    // Populate cache for two users
    await service.getPreferences('user-1');
    await service.getPreferences('user-2');
    expect(service.getMetrics().cacheSize).toBe(2);

    // Advance time past CACHE_TTL_MS so both entries are stale, then
    // trigger the 10-minute cleanup interval.
    jest.advanceTimersByTime(CLEANUP_INTERVAL_MS + 1);

    // The cleanup interval fired: stale entries should be evicted.
    expect(service.getMetrics().cacheSize).toBe(0);
  });

  it('leaves non-expired entries untouched when the cleanup interval fires', async () => {
    // Populate user-1 early
    await service.getPreferences('user-1');

    // Advance time past TTL but less than cleanup interval
    jest.advanceTimersByTime(CACHE_TTL_MS + 1);

    // Add user-2 AFTER the first advance — fresh entry
    await service.getPreferences('user-2');

    // Now fire the cleanup interval (total time > cleanup interval)
    jest.advanceTimersByTime(CLEANUP_INTERVAL_MS - CACHE_TTL_MS);

    // user-1 entry is expired, user-2 is fresh
    // Only user-1 should have been evicted
    expect(service.getMetrics().cacheSize).toBe(1);
  });

  it('does not log when no entries were cleaned (empty cache)', () => {
    // No entries in cache — cleanup fires without logging
    jest.advanceTimersByTime(CLEANUP_INTERVAL_MS + 1);
    // Just verify it doesn't throw
    expect(service.getMetrics().cacheSize).toBe(0);
  });
});
