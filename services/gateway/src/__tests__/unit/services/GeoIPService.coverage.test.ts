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

  it('returns request.ip even when the caller forges cf-connecting-ip, x-real-ip and x-forwarded-for (#9608)', () => {
    const req = makeRequest({
      ip: '9.9.9.9',
      headers: {
        'cf-connecting-ip': '5.5.5.5',
        'x-forwarded-for': ['11.11.11.11, 12.12.12.12'],
        'x-real-ip': '3.3.3.3',
      },
    });
    expect(extractIpFromRequest(req)).toBe('9.9.9.9');
  });

  it('normalises IPv6 localhost ::1 to 127.0.0.1', () => {
    const req = makeRequest({ ip: '::1' });
    expect(extractIpFromRequest(req)).toBe('127.0.0.1');
  });

  it('normalises ::ffff:127.0.0.1 to 127.0.0.1', () => {
    const req = makeRequest({ ip: '::ffff:127.0.0.1' });
    expect(extractIpFromRequest(req)).toBe('127.0.0.1');
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

// lookupGeoIp lit désormais une base LOCALE (#9609) : ses cas vivent dans
// `geoip-local-database.test.ts`, jamais plus contre un tiers simulé.

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
