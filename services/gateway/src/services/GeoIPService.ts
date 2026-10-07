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
 * LE CACHE GEOIP A UN SEUL ÉCRIVAIN ET UN SEUL LECTEUR (#9239).
 *
 * La table était écrite en ligne depuis `lookupGeoIp`, sans plafond, et les
 * entrées expirées n'étaient qu'IGNORÉES à la lecture — jamais retirées.
 * Sa clé est l'IP du client : elle retenait donc une entrée par IP distincte
 * vue depuis le démarrage du processus, et sa taille n'était pilotée ni par la
 * charge ni par le TTL. `cleanGeoCache()` existait, son commentaire disait
 * « call periodically », et personne ne l'appelait.
 *
 * Trois fonctions portent désormais toute la vie de cette table, pour qu'un
 * futur site ne puisse plus y écrire sans passer par le plafond.
 */
export function cachedGeo(ip: string, now: number = Date.now()): GeoIpData | null {
  const entry = geoCache.get(ip);
  return entry !== undefined && entry.expiry > now ? entry.data : null;
}

/**
 * LE PLAFOND, nommé et exporté — un nombre en dur ne se mesure pas.
 *
 * Dix mille entrées : chacune porte neuf champs courts, donc l'ordre de
 * grandeur est le méga-octet, pas la dizaine. Ce qu'il borne n'est pas une
 * consommation nominale (le TTL de cinq minutes suffirait) mais le cas où le
 * nombre d'IP distinctes n'est plus corrélé à celui des clients : un balayage,
 * un proxy qui tourne ses sorties, une botnet.
 */
export const MAX_GEO_CACHE_ENTRIES = 10_000;

/**
 * L'ÉVICTION EST FIFO, et c'est suffisant : la clé la plus anciennement
 * insérée est aussi la plus proche de son TTL, les entrées ayant toutes la
 * même durée de vie. Le premier élément d'un `Map` est sa plus ancienne
 * insertion, donc l'éviction est en O(1) et n'a besoin d'aucune structure de
 * plus.
 *
 * LE PIÈGE, et la raison du `delete` avant le `set` : `Map.set` sur une clé
 * qui EXISTE ne déplace pas son rang d'insertion. Une entrée revue — donc
 * vivante, donc utile — garderait son vieux rang et partirait avant une
 * entrée plus ancienne jamais revue. Le cache aurait son plafond et perdrait
 * précisément ce qu'il sert à garder.
 */
export function rememberGeo(ip: string, data: GeoIpData, now: number = Date.now()): void {
  geoCache.delete(ip);
  while (geoCache.size >= MAX_GEO_CACHE_ENTRIES) {
    const plusAncienne = geoCache.keys().next();
    if (plusAncienne.done === true) break;
    geoCache.delete(plusAncienne.value);
  }
  geoCache.set(ip, { data, expiry: now + CACHE_TTL_MS });
}

/** Le nombre d'entrées RETENUES — la seule lecture de taille, pour les témoins. */
export function geoCacheSize(): number {
  return geoCache.size;
}

/**
 * Remet la table à zéro. Un témoin qui mesure un plafond doit partir d'une
 * table vide, et un `Map` de module survit d'un cas à l'autre dans le même
 * fichier de test : sans ce point d'entrée, l'ordre des cas déciderait du
 * verdict.
 */
export function resetGeoCacheForTests(): void {
  geoCache.clear();
}

/**
 * **L'adresse du client est celle que NOTRE proxy atteste** (#9608).
 *
 * Elle lisait `cf-connecting-ip`, puis `x-real-ip`, puis le PREMIER maillon de
 * `x-forwarded-for` — trois en-têtes que l'appelant écrit lui-même (Traefik ne
 * retire ni `cf-connecting-ip` ni la gauche de la chaîne) : n'importe qui
 * choisissait l'IP enregistrée sur sa session, donc le pays et la ville
 * affichés dans « Sessions », et l'adresse de l'alerte « nouvelle connexion ».
 *
 * `request.ip` est résolu par Fastify sous `trustProxy` BORNÉ
 * (`config/trust-proxy.ts`, #4137) : il ne croit que les `TRUST_PROXY_HOPS`
 * derniers maillons de `X-Forwarded-For`, ceux que notre infrastructure a
 * posés. C'est la même valeur que la clé de débit (`utils/client-rate-key.ts`)
 * — une seule adresse par requête dans toute la passerelle.
 */
export function extractIpFromRequest(request: FastifyRequest): string {
  const ip = request.ip;
  return ip === '::1' || ip === '::ffff:127.0.0.1' ? '127.0.0.1' : ip;
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
  const cached = cachedGeo(ip);
  if (cached !== null) {
    return cached;
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
    rememberGeo(ip, geoData);

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
 * **Les en-têtes `X-Meeshy-*` ne remettent que ce que le serveur ne peut pas
 * savoir** (#9608) : le MODÈLE exact de l'appareil, la VERSION du système, la
 * PLATEFORME, le FUSEAU horaire.
 *
 * Le LIEU — pays, ville, région, et le `location` qui en dérive — se déduit de
 * l'adresse attestée par le proxy, et de rien d'autre. Ces en-têtes l'écrasaient :
 * `X-Meeshy-Country` est la RÉGION réglée dans iOS (`Locale.current.region`),
 * pas l'endroit où se trouve l'appareil, et tous trois sont écrits par
 * l'appelant. Un voleur de mot de passe y posait la ville de sa victime.
 *
 * Le FUSEAU reste remis par le client : il dit comment afficher l'heure à la
 * personne, et le serveur ne le connaît qu'à travers l'IP — approximatif, faux
 * derrière un VPN.
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
  const timezone  = get('x-meeshy-timezone');

  const enrichedDevice: DeviceInfo | null = platform || device || osVersion
    ? {
        ...(deviceInfo ?? {
          type: 'mobile', vendor: null, model: null,
          os: null, osVersion: null, browser: null, browserVersion: null,
          isMobile: true, isTablet: false, rawUserAgent: '',
        }),
        ...(device    ? { model: device } : {}),
        ...(osVersion ? { osVersion }     : {}),
        ...(platform === 'ios' ? { os: 'iOS', vendor: 'Apple', type: 'mobile', isMobile: true } : {}),
      }
    : deviceInfo;

  const enrichedGeo: GeoIpData | null = timezone
    ? {
        ...(geoData ?? {
          ip: '', country: null, countryName: null,
          city: null, region: null, timezone: null, location: null,
          latitude: null, longitude: null,
        }),
        timezone,
      }
    : geoData;

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
 * LIBÈRE les entrées expirées, et rend COMBIEN elle en a retiré (#9239).
 *
 * Elle rendait `void`, ce qui ne laissait aucune façon de vérifier qu'elle
 * avait fait quelque chose : son ordonnancement pouvait être retiré sans que
 * rien ne le dise. Le nombre rendu sert la trace de l'ordonnanceur ET le
 * témoin.
 */
export function cleanGeoCache(now: number = Date.now()): number {
  let liberees = 0;
  for (const [ip, entry] of geoCache.entries()) {
    if (entry.expiry < now) {
      geoCache.delete(ip);
      liberees += 1;
    }
  }
  return liberees;
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
