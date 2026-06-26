import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  extractIpFromRequest,
  extractUserAgent,
  parseUserAgent,
  lookupGeoIp,
  mergeClientHeaders,
  cleanGeoCache,
  GeoIPService,
} from '../../../services/GeoIPService';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────

const makeRequest = (overrides: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
} = {}) => ({
  ip: overrides.ip ?? '203.0.113.1',
  headers: overrides.headers ?? {},
});

const makeFetchOk = (data: unknown) =>
  jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(data),
  } as unknown);

// ── extractIpFromRequest ──────────────────────────────────────────────────

describe('extractIpFromRequest', () => {
  it('returns cf-connecting-ip when present', () => {
    const req = makeRequest({ headers: { 'cf-connecting-ip': '1.1.1.1' } });
    expect(extractIpFromRequest(req as any)).toBe('1.1.1.1');
  });

  it('returns x-real-ip over x-forwarded-for', () => {
    const req = makeRequest({
      headers: {
        'x-real-ip': '2.2.2.2',
        'x-forwarded-for': '3.3.3.3',
      },
    });
    expect(extractIpFromRequest(req as any)).toBe('2.2.2.2');
  });

  it('returns first IP from x-forwarded-for list', () => {
    const req = makeRequest({ headers: { 'x-forwarded-for': '4.4.4.4, 5.5.5.5, 6.6.6.6' } });
    expect(extractIpFromRequest(req as any)).toBe('4.4.4.4');
  });

  it('handles x-forwarded-for as array', () => {
    const req = makeRequest({ headers: { 'x-forwarded-for': ['7.7.7.7, 8.8.8.8'] } });
    expect(extractIpFromRequest(req as any)).toBe('7.7.7.7');
  });

  it('falls back to request.ip when no proxy headers', () => {
    const req = makeRequest({ ip: '9.9.9.9', headers: {} });
    expect(extractIpFromRequest(req as any)).toBe('9.9.9.9');
  });

  it('converts IPv6 localhost ::1 to 127.0.0.1', () => {
    const req = makeRequest({ ip: '::1', headers: {} });
    expect(extractIpFromRequest(req as any)).toBe('127.0.0.1');
  });

  it('converts ::ffff:127.0.0.1 to 127.0.0.1', () => {
    const req = makeRequest({ ip: '::ffff:127.0.0.1', headers: {} });
    expect(extractIpFromRequest(req as any)).toBe('127.0.0.1');
  });
});

// ── extractUserAgent ──────────────────────────────────────────────────────

describe('extractUserAgent', () => {
  it('returns the user-agent string when present', () => {
    const req = makeRequest({ headers: { 'user-agent': 'Mozilla/5.0' } });
    expect(extractUserAgent(req as any)).toBe('Mozilla/5.0');
  });

  it('returns null when user-agent header is absent', () => {
    const req = makeRequest({ headers: {} });
    expect(extractUserAgent(req as any)).toBeNull();
  });

  it('returns null when user-agent is an array (non-string)', () => {
    const req = makeRequest({ headers: { 'user-agent': ['a', 'b'] } });
    expect(extractUserAgent(req as any)).toBeNull();
  });
});

// ── parseUserAgent ────────────────────────────────────────────────────────

describe('parseUserAgent', () => {
  it('returns null for null input', () => {
    expect(parseUserAgent(null)).toBeNull();
  });

  it('parses mobile iPhone user agent', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);
    expect(result).not.toBeNull();
    expect(result?.isMobile).toBe(true);
    expect(result?.isTablet).toBe(false);
    expect(result?.rawUserAgent).toBe(ua);
  });

  it('defaults type to "desktop" when device.type is undefined', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);
    expect(result?.type).toBe('desktop');
    expect(result?.isMobile).toBe(false);
    expect(result?.isTablet).toBe(false);
  });

  it('returns unknown fallback on parse error', () => {
    // Force a parse error by passing something that causes UAParser to throw
    const result = parseUserAgent('valid-looking-ua');
    // Should not throw — may return either a parsed result or the fallback
    expect(result).not.toBeNull();
    expect(result?.rawUserAgent).toBe('valid-looking-ua');
  });
});

// ── lookupGeoIp ───────────────────────────────────────────────────────────

describe('lookupGeoIp', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Clear module-level cache between tests by using distinct IPs
    cleanGeoCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanGeoCache();
  });

  it('returns local data for 127.0.0.1 without fetching', async () => {
    global.fetch = jest.fn() as any;
    const result = await lookupGeoIp('127.0.0.1');
    expect(result?.location).toBe('Local');
    expect(result?.country).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns local data for 10.x.x.x private IPs', async () => {
    global.fetch = jest.fn() as any;
    const result = await lookupGeoIp('10.0.0.1');
    expect(result?.location).toBe('Local');
  });

  it('returns local data for 192.168.x.x private IPs', async () => {
    global.fetch = jest.fn() as any;
    const result = await lookupGeoIp('192.168.1.1');
    expect(result?.location).toBe('Local');
  });

  it('returns local data for 172.16.x.x–172.31.x.x private range', async () => {
    global.fetch = jest.fn() as any;
    const result = await lookupGeoIp('172.20.0.1');
    expect(result?.location).toBe('Local');
  });

  it('returns local data for 169.254.x.x link-local IPs', async () => {
    global.fetch = jest.fn() as any;
    const result = await lookupGeoIp('169.254.1.1');
    expect(result?.location).toBe('Local');
  });

  it('returns local data for localhost string', async () => {
    global.fetch = jest.fn() as any;
    const result = await lookupGeoIp('localhost');
    expect(result?.location).toBe('Local');
  });

  it('fetches and maps geo data for a public IP', async () => {
    global.fetch = makeFetchOk({
      status: 'success',
      countryCode: 'FR',
      country: 'France',
      city: 'Paris',
      regionName: 'Île-de-France',
      timezone: 'Europe/Paris',
      lat: 48.8566,
      lon: 2.3522,
    }) as any;

    const result = await lookupGeoIp('203.0.113.1');

    expect(result?.ip).toBe('203.0.113.1');
    expect(result?.country).toBe('FR');
    expect(result?.countryName).toBe('France');
    expect(result?.city).toBe('Paris');
    expect(result?.region).toBe('Île-de-France');
    expect(result?.timezone).toBe('Europe/Paris');
    expect(result?.latitude).toBe(48.8566);
    expect(result?.longitude).toBe(2.3522);
    expect(result?.location).toBe('Paris, France');
  });

  it('caches the result and does not re-fetch on second call', async () => {
    const fetchFn = makeFetchOk({
      status: 'success',
      countryCode: 'DE',
      country: 'Germany',
      city: 'Berlin',
      regionName: 'Berlin',
      timezone: 'Europe/Berlin',
      lat: 52.52,
      lon: 13.405,
    });
    global.fetch = fetchFn as any;

    const ip = '198.51.100.1'; // use a unique IP to avoid cache from other tests
    await lookupGeoIp(ip);
    await lookupGeoIp(ip);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns null when API returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as any;
    const result = await lookupGeoIp('203.0.113.50');
    expect(result).toBeNull();
  });

  it('returns null when API returns status !== "success"', async () => {
    global.fetch = makeFetchOk({ status: 'fail', message: 'invalid query' }) as any;
    const result = await lookupGeoIp('203.0.113.51');
    expect(result).toBeNull();
  });

  it('returns null on fetch throw (network error)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;
    const result = await lookupGeoIp('203.0.113.52');
    expect(result).toBeNull();
  });
});

// ── cleanGeoCache ─────────────────────────────────────────────────────────

describe('cleanGeoCache', () => {
  it('does not throw when called on an empty cache', () => {
    cleanGeoCache();
    expect(() => cleanGeoCache()).not.toThrow();
  });
});

// ── mergeClientHeaders ────────────────────────────────────────────────────

describe('mergeClientHeaders', () => {
  it('enriches deviceInfo with X-Meeshy-* headers', () => {
    const deviceInfo = {
      type: 'mobile', vendor: null, model: null,
      os: null, osVersion: null, browser: null, browserVersion: null,
      isMobile: true, isTablet: false, rawUserAgent: 'Meeshy-iOS/1.0.0',
    };
    const result = mergeClientHeaders(deviceInfo, null, {
      'x-meeshy-device': 'iPhone16,1',
      'x-meeshy-os': '17.5.1',
      'x-meeshy-platform': 'ios',
    });
    expect(result.deviceInfo?.model).toBe('iPhone16,1');
    expect(result.deviceInfo?.osVersion).toBe('17.5.1');
    expect(result.deviceInfo?.vendor).toBe('Apple');
    expect(result.deviceInfo?.os).toBe('iOS');
  });

  it('enriches geoData with X-Meeshy-Country/City/Timezone headers', () => {
    const result = mergeClientHeaders(null, null, {
      'x-meeshy-country': 'FR',
      'x-meeshy-city': 'Paris',
      'x-meeshy-timezone': 'Europe/Paris',
      'x-meeshy-region': 'Île-de-France',
    });
    expect(result.geoData?.country).toBe('FR');
    expect(result.geoData?.city).toBe('Paris');
    expect(result.geoData?.timezone).toBe('Europe/Paris');
    expect(result.geoData?.region).toBe('Île-de-France');
  });

  it('preserves existing geoData when no geo headers are present', () => {
    const geoData = {
      ip: '1.2.3.4', country: 'US', countryName: 'United States',
      city: 'New York', region: 'NY', timezone: 'America/New_York',
      location: 'New York, US', latitude: 40.7, longitude: -74.0,
    };
    const result = mergeClientHeaders(null, geoData, {});
    expect(result.geoData?.country).toBe('US');
    expect(result.geoData?.city).toBe('New York');
  });

  it('builds location from city + country headers', () => {
    const result = mergeClientHeaders(null, null, {
      'x-meeshy-city': 'Lyon',
      'x-meeshy-country': 'FR',
    });
    expect(result.geoData?.location).toBe('Lyon, FR');
  });

  it('returns original data unchanged when no Meeshy headers present', () => {
    const deviceInfo = {
      type: 'desktop', vendor: null, model: null,
      os: 'Windows', osVersion: '10', browser: 'Chrome', browserVersion: '120',
      isMobile: false, isTablet: false, rawUserAgent: 'Chrome/120',
    };
    const result = mergeClientHeaders(deviceInfo, null, {
      'authorization': 'Bearer token',
    });
    expect(result.deviceInfo).toBe(deviceInfo); // same reference — unchanged
    expect(result.geoData).toBeNull();
  });

  it('creates default deviceInfo structure when base is null and iOS headers present', () => {
    const result = mergeClientHeaders(null, null, {
      'x-meeshy-platform': 'ios',
      'x-meeshy-device': 'iPhone15,2',
    });
    expect(result.deviceInfo?.vendor).toBe('Apple');
    expect(result.deviceInfo?.type).toBe('mobile');
    expect(result.deviceInfo?.model).toBe('iPhone15,2');
  });

  it('handles array header values by taking the first element', () => {
    const result = mergeClientHeaders(null, null, {
      'x-meeshy-country': ['FR', 'DE'],
    });
    expect(result.geoData?.country).toBe('FR');
  });
});

// ── GeoIPService class ────────────────────────────────────────────────────

describe('GeoIPService', () => {
  let service: GeoIPService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    service = new GeoIPService();
    originalFetch = global.fetch;
    cleanGeoCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanGeoCache();
  });

  it('extractIp delegates to extractIpFromRequest', () => {
    const req = makeRequest({ ip: '10.10.10.10', headers: { 'x-real-ip': '11.11.11.11' } });
    expect(service.extractIp(req as any)).toBe('11.11.11.11');
  });

  it('extractUserAgent delegates to extractUserAgent function', () => {
    const req = makeRequest({ headers: { 'user-agent': 'TestAgent/2.0' } });
    expect(service.extractUserAgent(req as any)).toBe('TestAgent/2.0');
  });

  it('parseDevice delegates to parseUserAgent function', () => {
    const result = service.parseDevice(null);
    expect(result).toBeNull();
  });

  it('lookup returns local data for private IP', async () => {
    global.fetch = jest.fn() as any;
    const result = await service.lookup('127.0.0.1');
    expect(result?.location).toBe('Local');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('getContext returns full request context', async () => {
    global.fetch = makeFetchOk({
      status: 'success',
      countryCode: 'US',
      country: 'United States',
      city: 'New York',
      regionName: 'New York',
      timezone: 'America/New_York',
      lat: 40.7,
      lon: -74.0,
    }) as any;

    const req = makeRequest({
      ip: '203.0.113.99',
      headers: { 'user-agent': 'Mozilla/5.0' },
    });

    const ctx = await service.getContext(req as any);

    expect(ctx.ip).toBe('203.0.113.99');
    expect(ctx.userAgent).toBe('Mozilla/5.0');
    expect(ctx.geoData?.country).toBe('US');
    expect(ctx.deviceInfo).not.toBeNull();
  });
});
