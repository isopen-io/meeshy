/**
 * GeoIP Service - Capture location data from IP addresses
 * Uses ip-api.com (free tier: 45 requests/minute) or falls back gracefully
 */

import { FastifyRequest } from 'fastify';
import * as UAParserModule from 'ua-parser-js';

// UAParser v2 exports both as function and class
const UAParser = UAParserModule.UAParser || (UAParserModule as any).default || UAParserModule;

export interface GeoIpData {
  ip: string;
  country: string | null;      // ISO 3166-1 alpha-2 (e.g., "FR", "US")
  countryName: string | null;  // Full name (e.g., "France", "United States")
  city: string | null;
  region: string | null;
  timezone: string | null;     // IANA timezone (e.g., "Europe/Paris")
  location: string | null;     // Formatted "City, Country"
  latitude: number | null;     // GPS latitude
  longitude: number | null;    // GPS longitude
}

export interface DeviceInfo {
  /** Device type: mobile, tablet, desktop, smarttv, wearable, embedded, etc. */
  type: string;
  /** Device vendor: Apple, Samsung, Huawei, etc. */
  vendor: string | null;
  /** Device model: iPhone, Galaxy S21, Pixel 8, etc. */
  model: string | null;
  /** OS name: iOS, Android, Windows, macOS, Linux */
  os: string | null;
  /** OS version: 17.0, 14, 10, etc. */
  osVersion: string | null;
  /** Browser name: Safari, Chrome, Firefox, etc. */
  browser: string | null;
  /** Browser version */
  browserVersion: string | null;
  /** Is mobile device */
  isMobile: boolean;
  /** Is tablet */
  isTablet: boolean;
  /** Raw user agent string */
  rawUserAgent: string;
}

export interface RequestContext {
  ip: string;
  userAgent: string | null;
  geoData: GeoIpData | null;
  deviceInfo: DeviceInfo | null;
}

// Cache to avoid hitting rate limits (5 min TTL)
const geoCache = new Map<string, { data: GeoIpData; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extract real IP from request, handling proxies
 */
export function extractIpFromRequest(request: FastifyRequest): string {
  // Check various headers for proxy/load balancer setups
  const xForwardedFor = request.headers['x-forwarded-for'];
  const xRealIp = request.headers['x-real-ip'];
  const cfConnectingIp = request.headers['cf-connecting-ip']; // Cloudflare

  let ip: string;

  if (cfConnectingIp && typeof cfConnectingIp === 'string') {
    ip = cfConnectingIp;
  } else if (xRealIp && typeof xRealIp === 'string') {
    ip = xRealIp;
  } else if (xForwardedFor) {
    // X-Forwarded-For can be a comma-separated list, take the first
    const forwardedIps = typeof xForwardedFor === 'string'
      ? xForwardedFor
      : xForwardedFor[0];
    ip = forwardedIps.split(',')[0].trim();
  } else {
    ip = request.ip;
  }

  // Handle IPv6 localhost
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }

  return ip;
}

/**
 * Extract user agent from request
 */
export function extractUserAgent(request: FastifyRequest): string | null {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

/**
 * Parse user agent string into structured device info
 */
export function parseUserAgent(userAgent: string | null): DeviceInfo | null {
  if (!userAgent) return null;

  try {
    // UAParser v2 can be called as a function directly
    const result = UAParser(userAgent);

    const deviceType = result.device.type || 'desktop';
    const isMobile = deviceType === 'mobile';
    const isTablet = deviceType === 'tablet';

    return {
      type: deviceType,
      vendor: result.device.vendor || null,
      model: result.device.model || null,
      os: result.os.name || null,
      osVersion: result.os.version || null,
      browser: result.browser.name || null,
      browserVersion: result.browser.version || null,
      isMobile,
      isTablet,
      rawUserAgent: userAgent
    };
  } catch (error) {
    console.warn('[GeoIP] User agent parse error:', error);
    return {
      type: 'unknown',
      vendor: null,
      model: null,
      os: null,
      osVersion: null,
      browser: null,
      browserVersion: null,
      isMobile: false,
      isTablet: false,
      rawUserAgent: userAgent
    };
  }
}

/**
 * Look up geolocation data for an IP address
 * Uses ip-api.com free tier (no API key needed)
 */
export async function lookupGeoIp(ip: string): Promise<GeoIpData | null> {
  // Don't lookup localhost/private IPs
  if (isPrivateIp(ip)) {
    return {
      ip,
      country: null,
      countryName: null,
      city: null,
      region: null,
      timezone: null,
      location: 'Local',
      latitude: null,
      longitude: null
    };
  }

  // Check cache
  const cached = geoCache.get(ip);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    // ip-api.com free tier (HTTP only, 45 req/min)
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,timezone,lat,lon`,
      { signal: AbortSignal.timeout(3000) } // 3s timeout
    );

    if (!response.ok) {
      console.warn('[GeoIP] API request failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'success') {
      console.warn('[GeoIP] Lookup failed for IP:', ip, data.message);
      return null;
    }

    const geoData: GeoIpData = {
      ip,
      country: data.countryCode || null,
      countryName: data.country || null,
      city: data.city || null,
      region: data.regionName || null,
      timezone: data.timezone || null,
      location: formatLocation(data.city, data.country),
      latitude: data.lat || null,
      longitude: data.lon || null
    };

    // Cache result
    geoCache.set(ip, { data: geoData, expiry: Date.now() + CACHE_TTL_MS });

    return geoData;

  } catch (error) {
    console.warn('[GeoIP] Lookup error for IP:', ip, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Get full request context including IP, user agent, geo data, and device info
 */
export async function getRequestContext(request: FastifyRequest): Promise<RequestContext> {
  const ip = extractIpFromRequest(request);
  const userAgent = extractUserAgent(request);
  const geoData = await lookupGeoIp(ip);
  const deviceInfo = parseUserAgent(userAgent);

  return { ip, userAgent, geoData, deviceInfo };
}

/**
 * Format location string as "City, Country"
 */
function formatLocation(city: string | null, country: string | null): string | null {
  if (city && country) {
    return `${city}, ${country}`;
  }
  return country || city || null;
}

/**
 * Check if IP is private/localhost
 */
function isPrivateIp(ip: string): boolean {
  // Localhost
  if (ip === '127.0.0.1' || ip === 'localhost') return true;

  // Private IPv4 ranges
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31) return true;
  if (ip.startsWith('192.168.')) return true;

  // Link-local
  if (ip.startsWith('169.254.')) return true;

  return false;
}

/**
 * Clear expired cache entries (call periodically)
 */
export function cleanGeoCache(): void {
  const now = Date.now();
  for (const [ip, entry] of geoCache.entries()) {
    if (entry.expiry < now) {
      geoCache.delete(ip);
    }
  }
}

/**
 * GeoIPService class wrapper (for dependency injection)
 */
export class GeoIPService {
  /**
   * Look up geolocation data for an IP address
   */
  async lookup(ip: string): Promise<GeoIpData | null> {
    return lookupGeoIp(ip);
  }

  /**
   * Get full request context
   */
  async getContext(request: FastifyRequest): Promise<RequestContext> {
    return getRequestContext(request);
  }

  /**
   * Extract IP from request
   */
  extractIp(request: FastifyRequest): string {
    return extractIpFromRequest(request);
  }

  /**
   * Extract user agent from request
   */
  extractUserAgent(request: FastifyRequest): string | null {
    return extractUserAgent(request);
  }

  /**
   * Parse user agent into structured device info
   */
  parseDevice(userAgent: string | null): DeviceInfo | null {
    return parseUserAgent(userAgent);
  }
}
