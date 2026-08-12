/**
 * Extended unit tests for GeoIPService utility functions.
 * Covers: extractIpFromRequest (proxy headers, Cloudflare, IPv6 localhost),
 * extractUserAgent, parseUserAgent (real UA strings, null, error fallback).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  extractIpFromRequest,
  extractUserAgent,
  parseUserAgent,
} from '../../../services/GeoIPService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string | string[] | undefined>, ip = '1.2.3.4') {
  return { headers, ip } as any;
}

// ─── extractIpFromRequest ─────────────────────────────────────────────────────

describe('extractIpFromRequest', () => {
  it('uses cf-connecting-ip (Cloudflare) when present', () => {
    const req = makeRequest({ 'cf-connecting-ip': '5.6.7.8' });
    expect(extractIpFromRequest(req)).toBe('5.6.7.8');
  });

  it('prefers cf-connecting-ip over x-real-ip', () => {
    const req = makeRequest({
      'cf-connecting-ip': '5.6.7.8',
      'x-real-ip': '9.10.11.12',
    });
    expect(extractIpFromRequest(req)).toBe('5.6.7.8');
  });

  it('uses x-real-ip when no cf-connecting-ip', () => {
    const req = makeRequest({ 'x-real-ip': '9.10.11.12' });
    expect(extractIpFromRequest(req)).toBe('9.10.11.12');
  });

  it('takes the first IP from x-forwarded-for comma list', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' });
    expect(extractIpFromRequest(req)).toBe('1.1.1.1');
  });

  it('handles x-forwarded-for as a string array (takes first element)', () => {
    const req = makeRequest({ 'x-forwarded-for': ['4.4.4.4, 5.5.5.5', '6.6.6.6'] });
    expect(extractIpFromRequest(req)).toBe('4.4.4.4');
  });

  it('falls back to request.ip when no proxy headers', () => {
    const req = makeRequest({}, '8.8.8.8');
    expect(extractIpFromRequest(req)).toBe('8.8.8.8');
  });

  it('normalises ::1 (IPv6 loopback) to 127.0.0.1', () => {
    const req = makeRequest({}, '::1');
    expect(extractIpFromRequest(req)).toBe('127.0.0.1');
  });

  it('normalises ::ffff:127.0.0.1 (IPv4-mapped loopback) to 127.0.0.1', () => {
    const req = makeRequest({}, '::ffff:127.0.0.1');
    expect(extractIpFromRequest(req)).toBe('127.0.0.1');
  });

  it('trims whitespace from x-forwarded-for entries', () => {
    const req = makeRequest({ 'x-forwarded-for': '  10.0.0.1  , 10.0.0.2' });
    expect(extractIpFromRequest(req)).toBe('10.0.0.1');
  });
});

// ─── extractUserAgent ─────────────────────────────────────────────────────────

describe('extractUserAgent', () => {
  it('returns the user-agent header string', () => {
    const req = makeRequest({ 'user-agent': 'Mozilla/5.0' });
    expect(extractUserAgent(req)).toBe('Mozilla/5.0');
  });

  it('returns null when user-agent header is absent', () => {
    const req = makeRequest({});
    expect(extractUserAgent(req)).toBeNull();
  });

  it('returns null when user-agent is an array (non-string)', () => {
    const req = makeRequest({ 'user-agent': ['ua1', 'ua2'] as any });
    expect(extractUserAgent(req)).toBeNull();
  });
});

// ─── parseUserAgent ───────────────────────────────────────────────────────────

describe('parseUserAgent', () => {
  it('returns null for null input', () => {
    expect(parseUserAgent(null)).toBeNull();
  });

  it('returns a DeviceInfo object for a known mobile UA', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);

    expect(result).not.toBeNull();
    expect(result!.isMobile).toBe(true);
    expect(result!.isTablet).toBe(false);
    expect(result!.rawUserAgent).toBe(ua);
  });

  it('returns a DeviceInfo object for a desktop browser UA', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);

    expect(result).not.toBeNull();
    expect(result!.isMobile).toBe(false);
    expect(result!.rawUserAgent).toBe(ua);
  });

  it('preserves the rawUserAgent field', () => {
    const ua = 'CustomApp/2.0';
    const result = parseUserAgent(ua);

    expect(result!.rawUserAgent).toBe(ua);
  });

  it('returns a valid DeviceInfo shape for any non-null input', () => {
    const result = parseUserAgent('SomeAgent/1.0');

    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('isMobile');
    expect(result).toHaveProperty('isTablet');
    expect(typeof result!.isMobile).toBe('boolean');
    expect(typeof result!.isTablet).toBe('boolean');
  });
});
