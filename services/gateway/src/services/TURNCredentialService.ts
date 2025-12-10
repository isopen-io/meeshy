/**
 * TURNCredentialService - Secure TURN credential generation
 *
 * CVE-005: Insecure TURN Server Credentials Fix
 * Implements time-limited, HMAC-based TURN credentials following RFC 5389
 *
 * Security Features:
 * - Time-limited credentials (default: 24 hours)
 * - HMAC-SHA1 based credential generation
 * - Dynamic username format: timestamp:userId
 * - Prevents credential reuse and abuse
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface TURNServerConfig {
  host: string;
  port?: number;
}

export class TURNCredentialService {
  private readonly turnSecret: string;
  private readonly turnServers: TURNServerConfig[];
  private readonly credentialTTL: number;
  private readonly stunServers: RTCIceServer[];

  constructor() {
    // Load TURN secret from environment (CRITICAL: must be set in production)
    this.turnSecret = process.env.TURN_SECRET || 'default-turn-secret-CHANGE-IN-PRODUCTION';

    // Parse TURN servers from environment
    // Format: TURN_SERVERS=turn1.example.com:3478,turn2.example.com:3478
    const turnServersEnv = process.env.TURN_SERVERS || '';
    this.turnServers = this.parseTURNServers(turnServersEnv);

    // Credential TTL in seconds (default: 24 hours)
    this.credentialTTL = parseInt(process.env.TURN_CREDENTIAL_TTL || '86400', 10);

    // STUN servers (public Google STUN servers)
    this.stunServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];

    // Warn if using default secret in production
    if (this.turnSecret === 'default-turn-secret-CHANGE-IN-PRODUCTION' && process.env.NODE_ENV === 'production') {
      logger.warn('⚠️ [SECURITY] Using default TURN secret in production! Set TURN_SECRET environment variable.');
    }

    logger.info('🔐 TURNCredentialService initialized', {
      turnServersCount: this.turnServers.length,
      credentialTTL: this.credentialTTL,
      hasCustomSecret: this.turnSecret !== 'default-turn-secret-CHANGE-IN-PRODUCTION'
    });
  }

  /**
   * Parse TURN servers from environment string
   * Format: "host1:port1,host2:port2" or "host1,host2" (default port: 3478)
   */
  private parseTURNServers(serversEnv: string): TURNServerConfig[] {
    if (!serversEnv.trim()) {
      logger.warn('⚠️ No TURN servers configured. Video calls may fail behind restrictive NATs/firewalls.');
      return [];
    }

    const servers = serversEnv
      .split(',')
      .filter(s => s.trim())
      .map(serverStr => {
        const [host, portStr] = serverStr.trim().split(':');
        const port = portStr ? parseInt(portStr, 10) : 3478;

        return {
          host: host.trim(),
          port: isNaN(port) ? 3478 : port
        };
      });

    return servers;
  }

  /**
   * Generate time-limited TURN credentials for a user
   *
   * RFC 5389 Compliant Implementation:
   * - username format: "timestamp:userId"
   * - credential: base64(HMAC-SHA1(secret, username))
   * - timestamp: current_time + TTL (seconds since Unix epoch)
   *
   * @param userId - User ID (regular user or anonymous participant)
   * @returns Array of RTCIceServer configurations with dynamic credentials
   */
  generateCredentials(userId: string): RTCIceServer[] {
    // Calculate expiration timestamp (current time + TTL)
    const expirationTimestamp = Math.floor(Date.now() / 1000) + this.credentialTTL;

    // Format: timestamp:userId (RFC 5389 compliant)
    const username = `${expirationTimestamp}:${userId}`;

    // Generate HMAC-SHA1 credential
    const hmac = crypto.createHmac('sha1', this.turnSecret);
    hmac.update(username);
    const credential = hmac.digest('base64');

    logger.debug('🔐 Generated TURN credentials', {
      userId,
      expirationTimestamp,
      expiresIn: this.credentialTTL,
      turnServersCount: this.turnServers.length
    });

    // Build TURN server configurations
    const turnServerConfigs: RTCIceServer[] = this.turnServers.map(server => {
      const turnUrl = server.port
        ? `turn:${server.host}:${server.port}`
        : `turn:${server.host}`;

      return {
        urls: turnUrl,
        username,
        credential
      };
    });

    // Combine STUN and TURN servers
    const iceServers = [...this.stunServers, ...turnServerConfigs];

    logger.info('✅ ICE servers configured', {
      userId,
      stunServers: this.stunServers.length,
      turnServers: turnServerConfigs.length,
      totalServers: iceServers.length
    });

    return iceServers;
  }

  /**
   * Validate if TURN credentials are properly configured
   * Used for health checks and monitoring
   */
  isConfigured(): boolean {
    return this.turnServers.length > 0 && this.turnSecret !== 'default-turn-secret-CHANGE-IN-PRODUCTION';
  }

  /**
   * Get configuration status for monitoring/diagnostics
   */
  getStatus(): {
    configured: boolean;
    turnServersCount: number;
    stunServersCount: number;
    credentialTTL: number;
    hasCustomSecret: boolean;
  } {
    return {
      configured: this.isConfigured(),
      turnServersCount: this.turnServers.length,
      stunServersCount: this.stunServers.length,
      credentialTTL: this.credentialTTL,
      hasCustomSecret: this.turnSecret !== 'default-turn-secret-CHANGE-IN-PRODUCTION'
    };
  }
}
