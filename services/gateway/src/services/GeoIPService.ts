/**
 * GeoIP Service - Capture location data from IP addresses
 * Uses ip-api.com (free tier: 45 requests/minute) or falls back gracefully
 */

import { FastifyRequest } from 'fastify';
import * as UAParserModule from 'ua-parser-js';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'GeoIPService' });

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
    logger.warn('User agent parse error', error as Error);
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

/** Combien de temps attendre le tiers de géolocalisation, par défaut. */
const GEO_TIMEOUT_MS = 3000;

/**
 * Look up geolocation data for an IP address
 * Uses ip-api.com free tier (no API key needed)
 *
 * `timeoutMs` est un PARAMÈTRE parce que la patience acceptable dépend du
 * chemin (#5216). Trois secondes sont raisonnables sur une tâche de fond ;
 * elles sont inacceptables sur l'inscription, où elles s'ajoutent telles quelles
 * au temps que la personne passe devant un écran de chargement. La porte
 * d'inscription accorde 400 ms, puis reprend la recherche APRÈS la réponse :
 * la ligne se complète, et personne n'attend.
 */
export async function lookupGeoIp(
  ip: string,
  options?: { readonly timeoutMs?: number }
): Promise<GeoIpData | null> {
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
      { signal: AbortSignal.timeout(options?.timeoutMs ?? GEO_TIMEOUT_MS) }
    );

    if (!response.ok) {
      logger.warn('API request failed', { status: response.status });
      return null;
    }

    const data = await response.json();

    if (data.status !== 'success') {
      logger.warn('Lookup failed', { message: data.message });
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
    logger.warn('Lookup error', error instanceof Error ? error : { error });
    return null;
  }
}

/**
 * Get full request context including IP, user agent, geo data, and device info
 *
 * `geoTimeoutMs` borne l'attente du tiers de géolocalisation — voir
 * {@link lookupGeoIp}. Un contexte dont `geoData` vaut `null` reste
 * parfaitement utilisable : l'appelant qui tient à la localisation la reprend
 * après avoir répondu.
 */
export async function getRequestContext(
  request: FastifyRequest,
  options?: { readonly geoTimeoutMs?: number }
): Promise<RequestContext> {
  const ip = extractIpFromRequest(request);
  const userAgent = extractUserAgent(request);
  const geoData = await lookupGeoIp(ip, { timeoutMs: options?.geoTimeoutMs });
  const deviceInfo = parseUserAgent(userAgent);

  const { deviceInfo: enrichedDevice, geoData: enrichedGeo } =
    mergeClientHeaders(deviceInfo, geoData, request.headers);

  return { ip, userAgent, geoData: enrichedGeo, deviceInfo: enrichedDevice };
}

/**
 * Enrichit deviceInfo et geoData depuis les headers X-Meeshy-* envoyés par le client iOS.
 * Les valeurs client ont priorité sur la déduction UA/IP (plus précises).
 */
export function mergeClientHeaders(
  deviceInfo: DeviceInfo | null,
  geoData: GeoIpData | null,
  headers: Record<string, string | string[] | undefined>
): { deviceInfo: DeviceInfo | null; geoData: GeoIpData | null } {
  const get = (key: string): string | null => {
    const val = headers[key.toLowerCase()];
    return typeof val === 'string' ? val : Array.isArray(val) ? val[0] : null;
  };

  const platform  = get('x-meeshy-platform');
  const device    = get('x-meeshy-device');
  const osVersion = get('x-meeshy-os');
  const country   = get('x-meeshy-country');
  const city      = get('x-meeshy-city');
  const timezone  = get('x-meeshy-timezone');
  const region    = get('x-meeshy-region');

  // Enrichir deviceInfo si headers présents
  let enrichedDevice = deviceInfo;
  if (platform || device || osVersion) {
    const isIos = platform === 'ios';
    enrichedDevice = {
      ...(deviceInfo ?? {
        type: 'mobile', vendor: null, model: null,
        os: null, osVersion: null, browser: null, browserVersion: null,
        isMobile: true, isTablet: false, rawUserAgent: '',
      }),
      ...(device    ? { model: device }        : {}),
      ...(osVersion ? { osVersion }             : {}),
      ...(isIos     ? { os: 'iOS', vendor: 'Apple', type: 'mobile', isMobile: true } : {}),
    };
  }

  // Enrichir geoData si headers présents
  let enrichedGeo = geoData;
  if (country || city || timezone || region) {
    // `location` doit refléter le résultat de la fusion (valeurs client
    // prioritaires), pas le couple brut des headers : un override partiel
    // (ex. `x-meeshy-country` seul) laissait sinon la `location` déduite de
    // l'IP en contradiction avec le `country` client.
    const mergedCity    = city    || geoData?.city    || null;
    const mergedCountry = country || geoData?.country || null;
    enrichedGeo = {
      ...(geoData ?? {
        ip: '', country: null, countryName: null,
        city: null, region: null, timezone: null, location: null,
        latitude: null, longitude: null,
      }),
      ...(country  ? { country }  : {}),
      ...(city     ? { city }     : {}),
      ...(timezone ? { timezone } : {}),
      ...(region   ? { region }   : {}),
      location: formatLocation(mergedCity, mergedCountry) ?? geoData?.location ?? null,
    };
  }

  return { deviceInfo: enrichedDevice, geoData: enrichedGeo };
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
 * Check if IP is private/localhost.
 *
 * This is the gate that keeps an internal address from being sent to the
 * third-party geo API (ip-api.com). Exportée depuis #5216 : l'inscription
 * reprend la géolocalisation APRÈS avoir répondu, et n'a de raison de la
 * reprendre que pour une adresse PUBLIQUE — une adresse privée a déjà rendu
 * tout ce qu'elle rendra jamais (`location: 'Local'`), sans appel réseau. It must recognise BOTH families: a private
 * IPv6 address that slips through would leak internal network topology to an
 * external service AND burn the 45/min rate-limit budget on a lookup that can
 * only fail.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (`::ffff:a.b.c.d`) — re-check on the embedded IPv4.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return isPrivateIp(mapped[1]);

  if (isPrivateIpv4(ip)) return true;
  if (isPrivateIpv6(ip)) return true;

  return false;
}

function isPrivateIpv4(ip: string): boolean {
  // Localhost
  if (ip === '127.0.0.1' || ip === 'localhost') return true;

  // Private IPv4 ranges
  if (ip.startsWith('10.')) return true;
  const secondOctet = parseInt(ip.split('.')[1], 10);
  if (ip.startsWith('172.') && secondOctet >= 16 && secondOctet <= 31) return true;
  if (ip.startsWith('192.168.')) return true;

  // Link-local
  if (ip.startsWith('169.254.')) return true;

  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // Loopback (`::1`) and unspecified (`::`)
  if (lower === '::1' || lower === '::') return true;

  // Unique local addresses — fc00::/7 (first byte 1111110x ⇒ `fc`/`fd`)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

  // Link-local — fe80::/10 (`fe80`–`febf` ⇒ `fe8`/`fe9`/`fea`/`feb`)
  if (/^fe[89ab]/.test(lower)) return true;

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
