/**
 * GeoIP Service for IP geolocation using MaxMind GeoIP2
 * Falls back to ip-api.com if MaxMind is not available
 */

import axios from 'axios';

export interface GeoLocation {
  ip: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp?: string;
}

export class GeoIPService {
  private maxmindLicenseKey: string;
  private cache: Map<string, { data: GeoLocation; expiresAt: number }> = new Map();
  private cacheTTL: number = 3600000; // 1 hour

  constructor() {
    this.maxmindLicenseKey = process.env.GEOIP_LICENSE_KEY || '';
  }

  /**
   * Lookup IP address geolocation
   */
  async lookup(ipAddress: string): Promise<GeoLocation | null> {
    // Normalize IP (remove IPv6 prefix if present)
    const ip = this.normalizeIP(ipAddress);

    // Check cache first
    const cached = this.cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      // Try MaxMind first (more accurate, requires license)
      if (this.maxmindLicenseKey) {
        const result = await this.lookupMaxMind(ip);
        if (result) {
          this.cacheResult(ip, result);
          return result;
        }
      }

      // Fallback to ip-api.com (free, but has rate limits)
      const result = await this.lookupIpApi(ip);
      if (result) {
        this.cacheResult(ip, result);
        return result;
      }

      return null;
    } catch (error) {
      console.error('[GeoIPService] Error looking up IP:', ip, error);
      return null;
    }
  }

  /**
   * Lookup using MaxMind GeoIP2 API
   */
  private async lookupMaxMind(ip: string): Promise<GeoLocation | null> {
    try {
      const accountId = process.env.MAXMIND_ACCOUNT_ID || '';
      const auth = Buffer.from(`${accountId}:${this.maxmindLicenseKey}`).toString('base64');

      const response = await axios.get(
        `https://geoip.maxmind.com/geoip/v2.1/city/${ip}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
          },
          validateStatus: (status) => status < 500
        }
      );

      if (response.status !== 200) {
        console.warn('[GeoIPService] MaxMind API error:', response.status);
        return null;
      }

      const data = response.data;

      return {
        ip,
        city: data.city?.names?.en || 'Unknown',
        region: data.subdivisions?.[0]?.names?.en || 'Unknown',
        country: data.country?.names?.en || 'Unknown',
        countryCode: data.country?.iso_code || 'XX',
        latitude: data.location?.latitude || 0,
        longitude: data.location?.longitude || 0,
        timezone: data.location?.time_zone || 'UTC',
        isp: data.traits?.isp || undefined
      };
    } catch (error) {
      console.error('[GeoIPService] MaxMind lookup failed:', error);
      return null;
    }
  }

  /**
   * Lookup using ip-api.com (free tier)
   */
  private async lookupIpApi(ip: string): Promise<GeoLocation | null> {
    try {
      // ip-api.com free tier: 45 requests/minute
      const response = await axios.get(
        `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,city,lat,lon,timezone,isp,query`,
        {
          headers: {
            'Accept': 'application/json'
          },
          validateStatus: (status) => status < 500
        }
      );

      if (response.status !== 200) {
        console.warn('[GeoIPService] ip-api.com error:', response.status);
        return null;
      }

      const data = response.data;

      if (data.status !== 'success') {
        console.warn('[GeoIPService] ip-api.com returned error:', data.message);
        return null;
      }

      return {
        ip: data.query,
        city: data.city || 'Unknown',
        region: data.region || 'Unknown',
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX',
        latitude: data.lat || 0,
        longitude: data.lon || 0,
        timezone: data.timezone || 'UTC',
        isp: data.isp || undefined
      };
    } catch (error) {
      console.error('[GeoIPService] ip-api.com lookup failed:', error);
      return null;
    }
  }

  /**
   * Normalize IP address (remove IPv6 prefix, handle localhost)
   */
  private normalizeIP(ip: string): string {
    // Remove IPv6 prefix (::ffff:)
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }

    // Handle localhost
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
      // Return a public IP for testing (Google DNS)
      // In production, this would be the actual client IP from headers
      return '8.8.8.8';
    }

    return ip;
  }

  /**
   * Cache result
   */
  private cacheResult(ip: string, data: GeoLocation): void {
    this.cache.set(ip, {
      data,
      expiresAt: Date.now() + this.cacheTTL
    });

    // Cleanup old cache entries (simple implementation)
    if (this.cache.size > 10000) {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (value.expiresAt < now) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   * Returns distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
      Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Convert degrees to radians
   */
  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Check if two locations represent impossible travel
   * Returns true if travel is impossible given time difference
   */
  isImpossibleTravel(
    location1: { latitude: number; longitude: number },
    location2: { latitude: number; longitude: number },
    timeDiffHours: number
  ): boolean {
    const distance = this.calculateDistance(
      location1.latitude,
      location1.longitude,
      location2.latitude,
      location2.longitude
    );

    // Average commercial airplane speed: 900 km/h
    // Add 20% buffer for fast jets
    const maxPossibleSpeed = 900 * 1.2; // 1080 km/h

    const maxPossibleDistance = maxPossibleSpeed * timeDiffHours;

    return distance > maxPossibleDistance;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: 0, // Would need to implement hit tracking
      misses: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[GeoIPService] Cache cleared');
  }
}
