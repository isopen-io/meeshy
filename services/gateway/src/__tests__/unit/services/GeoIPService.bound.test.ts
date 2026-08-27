/**
 * Unit tests for the GeoIP cache MEMORY BOUND.
 *
 * The geo cache is populated for every distinct public IP that reaches the
 * gateway (login, register, magic-link, phone-transfer via getRequestContext).
 * Expired entries are only skipped on READ — they are never removed on read —
 * so without a bound the map grows with the count of distinct IPs seen over the
 * whole process lifetime. This suite proves the map is bounded regardless of how
 * many distinct IPs are looked up, and that cleanGeoCache reports what it removed.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  lookupGeoIp,
  cleanGeoCache,
  geoCacheSize,
  MAX_GEO_CACHE_ENTRIES,
} from '../../../services/GeoIPService';

function makeSuccessResponse() {
  return {
    ok: true,
    status: 200,
    json: jest.fn<any>().mockResolvedValue({
      status: 'success',
      countryCode: 'US',
      country: 'United States',
      city: 'New York',
      regionName: 'NY',
      timezone: 'America/New_York',
      lat: 40.7,
      lon: -74.0,
    }),
  } as any;
}

// A distinct, PUBLIC, non-private IPv4 for each index so every lookup produces a
// new cache entry (private/localhost IPs take the no-fetch fast path and are not
// cached the same way).
// Fully drain the module-global cache regardless of when its entries were
// written: cleanGeoCache only removes EXPIRED entries, so advance "now" past any
// possible TTL first, then restore. Keeps this suite hermetic across describes.
function resetGeoCache(): void {
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
  cleanGeoCache();
  nowSpy.mockRestore();
}

function publicIpForIndex(i: number): string {
  // 8.a.b.c — stays inside a non-private block, and 8.0.0.0/8 is globally routable.
  const a = (i >> 16) & 0xff;
  const b = (i >> 8) & 0xff;
  const c = i & 0xff;
  return `8.${a}.${b}.${c}`;
}

describe('GeoIP cache bound', () => {
  beforeEach(() => {
    resetGeoCache();
  });

  afterEach(() => {
    resetGeoCache();
    jest.restoreAllMocks();
  });

  it('never grows past MAX_GEO_CACHE_ENTRIES no matter how many distinct IPs are looked up', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    fetchSpy.mockImplementation(() => Promise.resolve(makeSuccessResponse()));

    const overflow = 25;
    for (let i = 0; i < MAX_GEO_CACHE_ENTRIES + overflow; i++) {
      await lookupGeoIp(publicIpForIndex(i));
      // Invariant holds at EVERY step, not just at the end.
      expect(geoCacheSize()).toBeLessThanOrEqual(MAX_GEO_CACHE_ENTRIES);
    }

    expect(geoCacheSize()).toBe(MAX_GEO_CACHE_ENTRIES);
  });

  it('MAX_GEO_CACHE_ENTRIES is a positive finite bound', () => {
    expect(MAX_GEO_CACHE_ENTRIES).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_GEO_CACHE_ENTRIES)).toBe(true);
  });
});

describe('cleanGeoCache return value', () => {
  beforeEach(() => {
    resetGeoCache();
  });

  afterEach(() => {
    resetGeoCache();
    jest.restoreAllMocks();
  });

  it('returns 0 when there is nothing expired to remove', () => {
    expect(cleanGeoCache()).toBe(0);
  });

  it('returns the number of expired entries it removed', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    fetchSpy.mockImplementation(() => Promise.resolve(makeSuccessResponse()));

    const nowSpy = jest.spyOn(Date, 'now');
    // Freeze "now" so the three entries are written with a known expiry.
    nowSpy.mockReturnValue(1_000_000);
    await lookupGeoIp('8.8.4.1');
    await lookupGeoIp('8.8.4.2');
    await lookupGeoIp('8.8.4.3');
    expect(geoCacheSize()).toBe(3);

    // Jump far past the 5-minute TTL: all three are now expired.
    nowSpy.mockReturnValue(1_000_000 + 60 * 60 * 1000);
    expect(cleanGeoCache()).toBe(3);
    expect(geoCacheSize()).toBe(0);
  });
});
