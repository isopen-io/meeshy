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
import { CallCleanupService } from './CallCleanupService';

export interface TURNServerConfig {
  host: string;
  port?: number;
}

const DEFAULT_INSECURE_TURN_SECRET = 'meeshy-turn-secret-CHANGE-IN-PRODUCTION';

export class TURNCredentialService {
  private readonly turnSecret: string;
  private readonly turnServers: TURNServerConfig[];
  private readonly credentialTTL: number;
  private readonly stunServers: RTCIceServer[];
  private readonly turnTlsPort: number;

  constructor() {
    // Load TURN secret from environment (CRITICAL: must be set in production)
    const envSecret = process.env.TURN_SECRET;
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const isProductionOrStaging = nodeEnv === 'production' || nodeEnv === 'staging';

    if (isProductionOrStaging) {
      // In production / staging the default secret is committed to the repo —
      // anyone with read access can forge HMAC credentials and abuse the TURN
      // relay (bandwidth theft, amplification, internal-network pivot via
      // host-mode networking). Refuse to start instead of warning silently.
      if (!envSecret || envSecret === DEFAULT_INSECURE_TURN_SECRET) {
        throw new Error(
          '[SECURITY] TURN_SECRET environment variable must be set to a strong, ' +
          'non-default value in production/staging. The committed default secret ' +
          'cannot be used because it is public.'
        );
      }
      // A short secret provides insufficient entropy for HMAC-SHA1 credential
      // generation: a ≤16-char secret can be brute-forced offline from a single
      // captured TURN allocation request, allowing an attacker to forge credentials
      // and abuse the relay (bandwidth theft, internal-network pivot).
      if (envSecret.length < 32) {
        throw new Error(
          '[SECURITY] TURN_SECRET must be at least 32 characters in production/staging ' +
          'to provide adequate key entropy for HMAC-SHA1 credential generation. ' +
          'Generate with: openssl rand -hex 32'
        );
      }
      this.turnSecret = envSecret;
    } else {
      // dev / local / test: tolerate the committed default (it is only used
      // against the local coturn container) but still log a warning so it is
      // never silently inherited.
      this.turnSecret = envSecret || DEFAULT_INSECURE_TURN_SECRET;
      if (this.turnSecret === DEFAULT_INSECURE_TURN_SECRET) {
        logger.warn('⚠️ [SECURITY] Using committed default TURN secret — DEV/LOCAL ONLY.');
      } else if (this.turnSecret.length < 32) {
        // Non-fatal here (unlike production/staging above): dev fixtures and
        // local coturn setups routinely use short convenience secrets. Just
        // surface the risk so a short secret is never silently carried into
        // a shared/staging environment via copied env files.
        logger.warn(
          '⚠️ [SECURITY] Custom TURN_SECRET is shorter than 32 characters — fine for local ' +
          'dev, but do not reuse it in a shared or staging environment.'
        );
      }
    }

    // Parse TURN servers from environment
    // Format: TURN_SERVERS=turn1.example.com:3478,turn2.example.com:3478
    const turnServersEnv = process.env.TURN_SERVERS || '';
    this.turnServers = this.parseTURNServers(turnServersEnv, isProductionOrStaging);

    // Credential TTL in seconds.
    //
    // CALL-FIX 2026-06-25 — restored to 24h. The Audit P2-GW-4 value of 600s
    // (10 min) silently killed any call relayed through TURN: credentials are
    // minted ONCE at call:initiate / call:join and embed `now + TTL` in the
    // coturn `use-auth-secret` username. coturn refuses to refresh a relay
    // allocation past that timestamp, so a call behind symmetric / carrier-grade
    // NAT (no direct path — common on cellular) lost its relay and tore down
    // (`disconnected` → ICE restart reusing the SAME expired creds → `failed`)
    // at ~10 min. The TTL MUST cover the maximum lifetime the server grants an
    // active call (CallCleanupService MAX_ACTIVE_MS = 2h) — otherwise credential
    // expiry, not the call itself, decides when it ends. 24h is the coturn
    // reference window for REST time-limited credentials and leaves ample
    // headroom above the 2h hard cap. The blast radius of a leaked, per-user,
    // relay-only credential is bandwidth use on our own TURN server, not data
    // exposure. Operators can still tighten/loosen via env (must stay ≥ 2h).
    //
    // The 2026-06-25 incident happened because that constraint was only
    // documented in prose — nothing actually enforced it, so a bad env value
    // silently reintroduced the outage. Enforce the floor here: reject it
    // outright in production/staging (same treatment as a weak TURN_SECRET
    // above), clamp-and-warn in dev/test so local overrides for other
    // purposes don't need to think about this floor.
    const requestedTTL = parseInt(process.env.TURN_CREDENTIAL_TTL || '86400', 10);
    const minTTL = CallCleanupService.MAX_ACTIVE_MS / 1000;
    if (requestedTTL < minTTL) {
      if (isProductionOrStaging) {
        throw new Error(
          `[SECURITY] TURN_CREDENTIAL_TTL (${requestedTTL}s) must be at least ${minTTL}s ` +
          '(CallCleanupService.MAX_ACTIVE_MS) in production/staging — a lower value expires ' +
          'TURN-relayed calls mid-call once the credential outlives its embedded expiry ' +
          '(see the 2026-06-25 incident note above).'
        );
      }
      logger.warn(
        `⚠️ TURN_CREDENTIAL_TTL (${requestedTTL}s) is below the ${minTTL}s floor — clamping. ` +
        'This value would drop TURN-relayed calls mid-call in production; fine to override for ' +
        'local testing, but never carry it into a shared/staging environment.'
      );
    }
    this.credentialTTL = Math.max(requestedTTL, minTTL);

    // TURN-over-TLS port (coturn `tls-listening-port`, default 5349). Plain
    // `turn:` (UDP/TCP) is blocked outright by some corporate/mobile-carrier
    // firewalls that only allow 443-like outbound TLS — those users cannot
    // place a call at all without a `turns:` option. The coturn TLS infra
    // (Traefik cert-dumper sidecar, see
    // docs/superpowers/specs/2026-05-11-coturn-tls-via-traefik-design.md) is
    // deployed and serving a valid Let's Encrypt cert on this port, so we can
    // now emit `turns:` alongside `turn:` for every configured host. Set to
    // 0 to disable (e.g. an environment where 5349 isn't provisioned).
    this.turnTlsPort = parseInt(process.env.TURN_TLS_PORT || '5349', 10);

    // STUN servers. Cloudflare is a second provider alongside Google so a
    // Google STUN outage doesn't strand every call on TURN alone — mirrors
    // the redundancy already documented on the iOS client's STUN-only
    // fallback (`IceServer.defaultServers` in WebRTCTypes.swift), which was
    // previously only reachable when TURN credential fetch failed entirely,
    // never on the normal server-issued path used by every call.
    this.stunServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];

    logger.info('🔐 TURNCredentialService initialized', {
      turnServersCount: this.turnServers.length,
      credentialTTL: this.credentialTTL,
      hasCustomSecret: this.turnSecret !== DEFAULT_INSECURE_TURN_SECRET
    });
  }

  /**
   * Parse TURN servers from environment string
   * Format: "host1:port1,host2:port2" or "host1,host2" (default port: 3478)
   */
  private parseTURNServers(serversEnv: string, isProductionOrStaging: boolean): TURNServerConfig[] {
    if (!serversEnv.trim()) {
      // Audit finding — a missing TURN_SERVERS in prod/staging previously only
      // logged at `warn`, so a call failing 100% of the time behind a
      // symmetric/carrier-grade NAT (common on cellular) had no signal an
      // operator would notice. `error` surfaces in the log-based alerting
      // every environment already has, without hard-failing startup (some
      // deployments intentionally run STUN-only for LAN-only testing).
      const message = '⚠️ No TURN servers configured. Calls WILL fail 100% of the time behind restrictive/symmetric NATs (common on cellular) — STUN-only cannot relay media.';
      if (isProductionOrStaging) {
        logger.error(message);
      } else {
        logger.warn(message);
      }
      return [];
    }

    const servers = serversEnv
      .split(',')
      .filter(s => s.trim())
      .reduce<TURNServerConfig[]>((acc, serverStr) => {
        const [host, portStr] = serverStr.trim().split(':');
        const trimmedHost = host?.trim() ?? '';
        if (!trimmedHost) {
          logger.warn('⚠️ TURN server entry has empty host — skipping', { entry: serverStr });
          return acc;
        }

        const parsedPort = portStr ? parseInt(portStr, 10) : 3478;
        const port = isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535 ? 3478 : parsedPort;
        if (parsedPort !== port) {
          logger.warn('⚠️ TURN server port out of range [1-65535] — defaulting to 3478', { entry: serverStr, parsedPort });
        }

        acc.push({ host: trimmedHost, port });
        return acc;
      }, []);

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

    // TURN-over-TLS (turns:) — same credentials, TCP-only transport (RFC
    // 5766 §2.1: TURNS requires a reliable transport). Additive alongside
    // the turn: entries above so most clients keep using plain UDP/TCP and
    // only clients behind TLS-only firewalls fall back to this one.
    if (this.turnTlsPort > 0) {
      for (const server of this.turnServers) {
        turnServerConfigs.push({
          urls: `turns:${server.host}:${this.turnTlsPort}?transport=tcp`,
          username,
          credential
        });
      }
    }

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
    return this.turnServers.length > 0 && this.turnSecret !== DEFAULT_INSECURE_TURN_SECRET;
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
      hasCustomSecret: this.turnSecret !== DEFAULT_INSECURE_TURN_SECRET
    };
  }
}
