/**
 * GeoIPService — additional coverage tests
 *
 * Covers: extractIpFromRequest, extractUserAgent, parseUserAgent,
 * lookupGeoIp (including cache, private IP, error paths),
 * cleanGeoCache, getRequestContext, GeoIPService class methods.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const mockUaParserResult = {
  device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
  os: { name: 'iOS', version: '17.0' },
  browser: { name: 'Safari', version: '17.0' },
};

jest.mock('ua-parser-js', () => {
  const UAParser = jest.fn(() => mockUaParserResult);
  return { UAParser };
});

import {
  extractIpFromRequest,
  extractUserAgent,
  parseUserAgent,
  lookupGeoIp,
  cleanGeoCache,
  getRequestContext,
  GeoIPService,
} from '../../../services/GeoIPService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    ip: '1.2.3.4',
    headers: {},
    ...overrides,
  };
}

function makeFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 503,
    json: () => Promise.resolve(body),
  } as Response);
}

// ─── extractIpFromRequest ─────────────────────────────────────────────────────

describe('extractIpFromRequest', () => {
  it('returns request.ip when no proxy headers are set', () => {
    const req = makeRequest({ ip: '1.2.3.4' });
    expect(extractIpFromRequest(req)).toBe('1.2.3.4');
  });

  it('prefers cf-connecting-ip over other headers', () => {
    const req = makeRequest({
      ip: '9.9.9.9',
      headers: {
        'cf-connecting-ip': '5.5.5.5',
        'x-forwarded-for': '4.4.4.4',
        'x-real-ip': '3.3.3.3',
      },
    });
    expect(extractIpFromRequest(req)).toBe('5.5.5.5');
  });

  it('uses x-real-ip when no cf-connecting-ip', () => {
    const req = makeRequest({
      ip: '9.9.9.9',
      headers: { 'x-real-ip': '6.6.6.6', 'x-forwarded-for': '4.4.4.4' },
    });
    expect(extractIpFromRequest(req)).toBe('6.6.6.6');
  });

  it('uses first IP from x-forwarded-for (comma-separated)', () => {
    const req = makeRequest({
      ip: '9.9.9.9',
      headers: { 'x-forwarded-for': '7.7.7.7, 8.8.8.8, 9.9.9.9' },
    });
    expect(extractIpFromRequest(req)).toBe('7.7.7.7');
  });

  it('normalises IPv6 localhost ::1 to 127.0.0.1', () => {
    const req = makeRequest({ ip: '::1' });
    expect(extractIpFromRequest(req)).toBe('127.0.0.1');
  });

  it('normalises ::ffff:127.0.0.1 to 127.0.0.1', () => {
    const req = makeRequest({ ip: '::ffff:127.0.0.1' });
    expect(extractIpFromRequest(req)).toBe('127.0.0.1');
  });

  it('handles x-forwarded-for as array', () => {
    const req = makeRequest({
      ip: '9.9.9.9',
      headers: { 'x-forwarded-for': ['11.11.11.11, 12.12.12.12'] },
    });
    expect(extractIpFromRequest(req)).toBe('11.11.11.11');
  });
});

// ─── extractUserAgent ─────────────────────────────────────────────────────────

describe('extractUserAgent', () => {
  it('returns the user-agent header string', () => {
    const req = makeRequest({ headers: { 'user-agent': 'Mozilla/5.0' } });
    expect(extractUserAgent(req)).toBe('Mozilla/5.0');
  });

  it('returns null when user-agent is absent', () => {
    const req = makeRequest({ headers: {} });
    expect(extractUserAgent(req)).toBeNull();
  });

  it('returns null when user-agent is an array (non-string)', () => {
    const req = makeRequest({ headers: { 'user-agent': ['a', 'b'] } });
    expect(extractUserAgent(req)).toBeNull();
  });
});

// ─── parseUserAgent ───────────────────────────────────────────────────────────

describe('parseUserAgent', () => {
  it('returns null for null input', () => {
    expect(parseUserAgent(null)).toBeNull();
  });

  it('returns structured DeviceInfo for a user agent string', () => {
    const result = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('mobile');
    expect(result!.vendor).toBe('Apple');
    expect(result!.os).toBe('iOS');
    expect(result!.isMobile).toBe(true);
    expect(result!.isTablet).toBe(false);
    expect(result!.rawUserAgent).toBe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');
  });
});

// ─── lookupGeoIp ─────────────────────────────────────────────────────────────

describe('lookupGeoIp', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    cleanGeoCache(); // clear any cached results
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanGeoCache();
  });

  it('returns local-IP placeholder for private addresses without calling fetch', async () => {
    global.fetch = jest.fn() as typeof fetch;

    const result = await lookupGeoIp('127.0.0.1');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.ip).toBe('127.0.0.1');
    expect(result!.location).toBe('Local');
    expect(result!.country).toBeNull();
  });

  it('returns placeholder for 192.168.x.x private range', async () => {
    global.fetch = jest.fn() as typeof fetch;

    const result = await lookupGeoIp('192.168.1.100');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result!.location).toBe('Local');
  });

  it('calls ip-api.com and returns GeoIpData on success', async () => {
    global.fetch = jest.fn().mockReturnValue(makeFetchResponse({
      status: 'success',
      countryCode: 'FR',
      country: 'France',
      city: 'Paris',
      regionName: 'Île-de-France',
      timezone: 'Europe/Paris',
      lat: 48.8566,
      lon: 2.3522,
    })) as typeof fetch;

    const result = await lookupGeoIp('8.8.8.8');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('8.8.8.8'),
      expect.anything()
    );
    expect(result).not.toBeNull();
    expect(result!.country).toBe('FR');
    expect(result!.countryName).toBe('France');
    expect(result!.city).toBe('Paris');
    expect(result!.timezone).toBe('Europe/Paris');
    expect(result!.latitude).toBe(48.8566);
  });

  it('returns cached result on second call without hitting the API', async () => {
    const mockFetch = jest.fn().mockReturnValue(makeFetchResponse({
      status: 'success',
      countryCode: 'DE',
      country: 'Germany',
      city: 'Berlin',
      regionName: 'Berlin',
      timezone: 'Europe/Berlin',
      lat: 52.52,
      lon: 13.405,
    }));
    global.fetch = mockFetch as typeof fetch;

    await lookupGeoIp('5.5.5.5');
    await lookupGeoIp('5.5.5.5');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when HTTP response is not ok', async () => {
    global.fetch = jest.fn().mockReturnValue(makeFetchResponse({}, false)) as typeof fetch;

    const result = await lookupGeoIp('8.8.4.4');

    expect(result).toBeNull();
  });

  it('returns null when API status is not success', async () => {
    global.fetch = jest.fn().mockReturnValue(makeFetchResponse({
      status: 'fail',
      message: 'reserved range',
    })) as typeof fetch;

    const result = await lookupGeoIp('1.1.1.1');

    expect(result).toBeNull();
  });

  it('returns null on fetch error (network failure)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as typeof fetch;

    const result = await lookupGeoIp('9.9.9.9');

    expect(result).toBeNull();
  });
});

// ─── cleanGeoCache ────────────────────────────────────────────────────────────

describe('cleanGeoCache', () => {
  it('does not throw when cache is empty', () => {
    cleanGeoCache();
    expect(() => cleanGeoCache()).not.toThrow();
  });
});

// ─── getRequestContext ────────────────────────────────────────────────────────

describe('getRequestContext', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    cleanGeoCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanGeoCache();
  });

  it('returns context with ip, userAgent, geoData, deviceInfo', async () => {
    global.fetch = jest.fn().mockReturnValue(makeFetchResponse({ location: 'Local', status: 'fail' })) as typeof fetch;

    const req = makeRequest({
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' },
    });

    const ctx = await getRequestContext(req);

    expect(ctx.ip).toBe('127.0.0.1');
    expect(ctx.userAgent).toBe('Mozilla/5.0 (iPhone)');
    expect(ctx.geoData).not.toBeNull();
    expect(ctx.geoData!.location).toBe('Local');
    expect(ctx.deviceInfo).not.toBeNull();
  });
});

// ─── GeoIPService class ───────────────────────────────────────────────────────

describe('GeoIPService class', () => {
  let svc: GeoIPService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    svc = new GeoIPService();
    originalFetch = global.fetch;
    cleanGeoCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanGeoCache();
  });

  it('lookup() returns local placeholder for private IP', async () => {
    global.fetch = jest.fn() as typeof fetch;
    const result = await svc.lookup('127.0.0.1');
    expect(result!.location).toBe('Local');
  });

  it('extractIp() delegates to extractIpFromRequest', () => {
    const req = makeRequest({ ip: '2.2.2.2' });
    expect(svc.extractIp(req)).toBe('2.2.2.2');
  });

  it('extractUserAgent() returns user-agent header', () => {
    const req = makeRequest({ headers: { 'user-agent': 'TestAgent/1.0' } });
    expect(svc.extractUserAgent(req)).toBe('TestAgent/1.0');
  });

  it('parseDevice() returns null for null input', () => {
    expect(svc.parseDevice(null)).toBeNull();
  });

  it('parseDevice() returns DeviceInfo for valid user agent', () => {
    const info = svc.parseDevice('Mozilla/5.0 (iPhone)');
    expect(info).not.toBeNull();
    expect(info!.isMobile).toBe(true);
  });

  it('getContext() returns full RequestContext', async () => {
    global.fetch = jest.fn().mockReturnValue(makeFetchResponse({ status: 'fail' })) as typeof fetch;
    const req = makeRequest({ ip: '127.0.0.1', headers: { 'user-agent': 'TestAgent' } });
    const ctx = await svc.getContext(req);
    expect(ctx.ip).toBe('127.0.0.1');
    expect(ctx.userAgent).toBe('TestAgent');
  });
});
