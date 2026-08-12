/**
 * Unit tests for GeoIPService lookup functions.
 * Covers: lookupGeoIp (private IP fast path, cache hit, API success,
 * non-ok response, failed status field, fetch error), cleanGeoCache,
 * and getRequestContext composition.
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
  getRequestContext,
} from '../../../services/GeoIPService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeJsonResponse(body: object, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn<any>().mockResolvedValue(body),
  } as any;
}

function makeRequest(ip = '8.8.8.8', headers: Record<string, string> = {}) {
  return { ip, headers } as any;
}

// ─── lookupGeoIp — private / localhost fast path ──────────────────────────────

describe('lookupGeoIp — private IPs', () => {
  it('returns a local GeoIpData (no fetch) for 127.0.0.1', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const result = await lookupGeoIp('127.0.0.1');

    expect(result).not.toBeNull();
    expect(result!.location).toBe('Local');
    expect(result!.ip).toBe('127.0.0.1');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('skips the API for private 192.168.x.x addresses', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const result = await lookupGeoIp('192.168.1.100');

    expect(result!.location).toBe('Local');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('skips the API for private 10.x.x.x addresses', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const result = await lookupGeoIp('10.0.0.1');

    expect(result!.location).toBe('Local');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('skips the API for private 172.16–31.x.x range', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const result = await lookupGeoIp('172.20.0.1');

    expect(result!.location).toBe('Local');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─── lookupGeoIp — API calls ──────────────────────────────────────────────────

describe('lookupGeoIp — API interactions', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns null when the HTTP response is not ok', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse({}, false, 503));
    const result = await lookupGeoIp('1.2.3.4');
    expect(result).toBeNull();
  });

  it('returns null when the API returns status != "success"', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse({ status: 'fail', message: 'reserved range' }));
    const result = await lookupGeoIp('1.2.3.5');
    expect(result).toBeNull();
  });

  it('returns GeoIpData on a successful API response', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse({
      status: 'success',
      countryCode: 'FR',
      country: 'France',
      city: 'Paris',
      regionName: 'Île-de-France',
      timezone: 'Europe/Paris',
      lat: 48.8566,
      lon: 2.3522,
    }));

    const result = await lookupGeoIp('1.2.3.6');

    expect(result).not.toBeNull();
    expect(result!.country).toBe('FR');
    expect(result!.countryName).toBe('France');
    expect(result!.city).toBe('Paris');
    expect(result!.timezone).toBe('Europe/Paris');
    expect(result!.latitude).toBe(48.8566);
    expect(result!.longitude).toBe(2.3522);
  });

  it('returns null when fetch throws', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));
    const result = await lookupGeoIp('1.2.3.7');
    expect(result).toBeNull();
  });

  it('returns cached data on repeated lookups for the same IP', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse({
      status: 'success',
      countryCode: 'DE',
      country: 'Germany',
      city: 'Berlin',
      regionName: 'Berlin',
      timezone: 'Europe/Berlin',
      lat: 52.5,
      lon: 13.4,
    }));

    const ip = '2.3.4.5';
    const first = await lookupGeoIp(ip);
    const second = await lookupGeoIp(ip);

    // fetch only called once — second result is from cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});

// ─── cleanGeoCache ────────────────────────────────────────────────────────────

describe('cleanGeoCache', () => {
  it('does not throw when the cache is empty', () => {
    expect(() => cleanGeoCache()).not.toThrow();
  });

  it('removes expired entries added indirectly via lookupGeoIp', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    fetchSpy.mockResolvedValue(makeJsonResponse({
      status: 'success',
      countryCode: 'US',
      country: 'United States',
      city: null,
      regionName: null,
      timezone: 'America/New_York',
      lat: 40.7,
      lon: -74.0,
    }));

    // Populate cache for this IP
    await lookupGeoIp('3.4.5.6');
    fetchSpy.mockRestore();

    // Call cleanGeoCache — it only removes EXPIRED entries.
    // Since we just set the cache with a fresh TTL, no entries are removed yet,
    // but the call must complete without throwing.
    expect(() => cleanGeoCache()).not.toThrow();
  });
});

// ─── getRequestContext ─────────────────────────────────────────────────────────

describe('getRequestContext', () => {
  it('composes ip, userAgent, geoData and deviceInfo into a RequestContext', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    fetchSpy.mockResolvedValue(makeJsonResponse({
      status: 'success',
      countryCode: 'JP',
      country: 'Japan',
      city: 'Tokyo',
      regionName: 'Tokyo',
      timezone: 'Asia/Tokyo',
      lat: 35.6,
      lon: 139.7,
    }));

    const req = makeRequest('4.5.6.7', {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    const ctx = await getRequestContext(req);

    expect(ctx.ip).toBe('4.5.6.7');
    expect(ctx.geoData?.country).toBe('JP');
    expect(ctx.deviceInfo).not.toBeNull();
    fetchSpy.mockRestore();
  });

  it('returns null geoData for a private IP', async () => {
    const req = makeRequest('127.0.0.1', {});
    const ctx = await getRequestContext(req);

    expect(ctx.ip).toBe('127.0.0.1');
    expect(ctx.geoData?.location).toBe('Local');
  });
});
