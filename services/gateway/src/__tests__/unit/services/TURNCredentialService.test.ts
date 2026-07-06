/**
 * TURNCredentialService — unit tests
 *
 * Regression guard for the "call drops after a few minutes" bug.
 * Also covers RFC 5389 HMAC-SHA1 compliance, security guards, and
 * server parsing edge cases.
 *
 * Root cause: TURN credentials are generated ONCE at call:initiate / call:join
 * and embed an expiration timestamp (`now + credentialTTL`) inside the coturn
 * `use-auth-secret` username. coturn refuses to refresh a relay allocation once
 * that timestamp has passed, so any call whose media is relayed through TURN
 * (symmetric / carrier-grade NAT — common on cellular) loses its relay and
 * tears down at roughly `credentialTTL` seconds.
 *
 * The TTL MUST cover the maximum lifetime the server grants an active call
 * (CallCleanupService MAX_ACTIVE_MS = 2 h).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock logger before importing TURNCredentialService
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { TURNCredentialService } from '../../../services/TURNCredentialService';
import { CallCleanupService } from '../../../services/CallCleanupService';
import { logger } from '../../../utils/logger';
import crypto from 'crypto';

type MockFn = jest.Mock<any>;
const warnMock = logger.warn as MockFn;

// Imported (not hand-duplicated) so a future change to either service's
// constant can't silently drift out of sync and reintroduce the "call drops
// after ~10 min behind TURN" regression this suite guards against.
const MAX_ACTIVE_CALL_SECONDS = CallCleanupService.MAX_ACTIVE_MS / 1000;

const DEFAULT_INSECURE_SECRET = 'meeshy-turn-secret-CHANGE-IN-PRODUCTION';
const STRONG_SECRET = 'a9f2c3e4b5d6a7f8c9e0b1d2a3f4c5e6';
const TEST_USER_ID = 'user-abc-123';

const ENV_KEYS = ['TURN_CREDENTIAL_TTL', 'TURN_SERVERS', 'TURN_SECRET', 'NODE_ENV'] as const;

const withEnv = <T>(overrides: Record<string, string | undefined>, run: () => T): T => {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
};

const buildService = (env: Record<string, string | undefined> = {}) =>
  withEnv(env, () => new TURNCredentialService());

// ---------------------------------------------------------------------------
// Production security guard
// ---------------------------------------------------------------------------

describe('TURNCredentialService — production security guard', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.clearAllMocks());

  it('throws when NODE_ENV=production and no TURN_SECRET is set', () => {
    withEnv({ NODE_ENV: 'production', TURN_SECRET: undefined }, () => {
      expect(() => new TURNCredentialService()).toThrow('[SECURITY]');
    });
  });

  it('throws when NODE_ENV=production and TURN_SECRET is the default insecure value', () => {
    withEnv({ NODE_ENV: 'production', TURN_SECRET: DEFAULT_INSECURE_SECRET }, () => {
      expect(() => new TURNCredentialService()).toThrow('[SECURITY]');
    });
  });

  it('throws when NODE_ENV=staging and TURN_SECRET is the default insecure value', () => {
    withEnv({ NODE_ENV: 'staging', TURN_SECRET: DEFAULT_INSECURE_SECRET }, () => {
      expect(() => new TURNCredentialService()).toThrow('[SECURITY]');
    });
  });

  it('does NOT throw in production when a strong custom TURN_SECRET is provided', () => {
    withEnv({ NODE_ENV: 'production', TURN_SECRET: STRONG_SECRET }, () => {
      expect(() => new TURNCredentialService()).not.toThrow();
    });
  });

  it('throws when NODE_ENV=production and TURN_SECRET is set but shorter than 32 characters', () => {
    withEnv({ NODE_ENV: 'production', TURN_SECRET: 'short_custom_secret' }, () => {
      expect(() => new TURNCredentialService()).toThrow('[SECURITY]');
      expect(() => new TURNCredentialService()).toThrow('32 characters');
    });
  });

  it('throws when NODE_ENV=staging and TURN_SECRET is set but shorter than 32 characters', () => {
    withEnv({ NODE_ENV: 'staging', TURN_SECRET: 'too_short_stg' }, () => {
      expect(() => new TURNCredentialService()).toThrow('[SECURITY]');
    });
  });

  it('does NOT throw in dev even when no TURN_SECRET is set', () => {
    withEnv({ NODE_ENV: 'development', TURN_SECRET: undefined }, () => {
      expect(() => new TURNCredentialService()).not.toThrow();
    });
  });

  it('does NOT throw in test environment with no TURN_SECRET', () => {
    withEnv({ NODE_ENV: 'test', TURN_SECRET: undefined }, () => {
      expect(() => new TURNCredentialService()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Credential TTL covers max call duration
// ---------------------------------------------------------------------------

describe('TURNCredentialService — credential TTL covers max call duration', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.clearAllMocks());

  it('defaults the credential TTL to at least the max active-call duration', () => {
    withEnv({ TURN_CREDENTIAL_TTL: undefined, NODE_ENV: 'test' }, () => {
      const service = new TURNCredentialService();
      expect(service.getStatus().credentialTTL).toBeGreaterThanOrEqual(MAX_ACTIVE_CALL_SECONDS);
    });
  });

  it('embeds an expiration timestamp that outlives a 2-hour call', () => {
    withEnv(
      { TURN_CREDENTIAL_TTL: undefined, NODE_ENV: 'test', TURN_SERVERS: 'turn.example.com:3478' },
      () => {
        const service = new TURNCredentialService();
        const nowSeconds = Math.floor(Date.now() / 1000);

        const iceServers = service.generateCredentials('user-123');
        const turnServer = iceServers.find((s) =>
          (Array.isArray(s.urls) ? s.urls.join(',') : s.urls).includes('turn:')
        );
        expect(turnServer).toBeDefined();

        const [expiryStr] = String(turnServer!.username).split(':');
        const expirationTimestamp = parseInt(expiryStr, 10);

        expect(expirationTimestamp - nowSeconds).toBeGreaterThanOrEqual(MAX_ACTIVE_CALL_SECONDS);
      }
    );
  });

  it('still honours an explicit TURN_CREDENTIAL_TTL override', () => {
    withEnv({ TURN_CREDENTIAL_TTL: '99999', NODE_ENV: 'test' }, () => {
      const service = new TURNCredentialService();
      expect(service.getStatus().credentialTTL).toBe(99999);
    });
  });
});

// ---------------------------------------------------------------------------
// TURN server parsing
// ---------------------------------------------------------------------------

describe('TURNCredentialService — parseTURNServers', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.clearAllMocks());

  it('parses a single host:port pair', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry).toBeDefined();
    expect(turnEntry!.urls).toBe('turn:turn.example.com:3478');
  });

  it('uses default port 3478 when port is omitted', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry!.urls).toBe('turn:turn.example.com:3478');
  });

  it('parses multiple servers separated by commas', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn1.example.com:3478,turn2.example.com:5349',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntries = creds.filter(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntries).toHaveLength(2);
    expect(turnEntries.map(e => e.urls)).toContain('turn:turn1.example.com:3478');
    expect(turnEntries.map(e => e.urls)).toContain('turn:turn2.example.com:5349');
  });

  it('falls back to port 3478 when port is NaN', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:abc',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry!.urls).toBe('turn:turn.example.com:3478');
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('out of range'),
      expect.objectContaining({ entry: 'turn.example.com:abc' })
    );
  });

  it('falls back to port 3478 when port is 0 (out of range)', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:0',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry!.urls).toBe('turn:turn.example.com:3478');
  });

  it('falls back to port 3478 when port exceeds 65535', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:99999',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry!.urls).toBe('turn:turn.example.com:3478');
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('out of range'),
      expect.objectContaining({ parsedPort: 99999 })
    );
  });

  it('skips entries with empty host and logs a warning', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: ':3478',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntries = creds.filter(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntries).toHaveLength(0);
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('empty host'),
      expect.any(Object)
    );
  });

  it('skips empty entries from trailing commas', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:3478,,',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntries = creds.filter(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntries).toHaveLength(1);
  });

  it('warns and returns STUN-only when TURN_SERVERS is empty', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: '',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntries = creds.filter(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntries).toHaveLength(0);
    const stunEntries = creds.filter(s => (s.urls as string).startsWith('stun:'));
    expect(stunEntries.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generateCredentials — RFC 5389 + HMAC-SHA1 compliance
// ---------------------------------------------------------------------------

describe('TURNCredentialService — generateCredentials', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns RFC 5389 username in "timestamp:userId" format', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    const userId = TEST_USER_ID;
    const creds = svc.generateCredentials(userId);
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry).toBeDefined();
    const username = (turnEntry as any).username as string;
    expect(username).toMatch(/^\d+:user-abc-123$/);
  });

  it('credential is a non-empty base64 string', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(typeof (turnEntry as any).credential).toBe('string');
    expect((turnEntry as any).credential.length).toBeGreaterThan(0);
  });

  it('expiration timestamp is in the future', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:3478',
      TURN_CREDENTIAL_TTL: '600',
      NODE_ENV: 'development',
    });
    const now = Math.floor(Date.now() / 1000);
    const creds = svc.generateCredentials('user-1');
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    const [expirationStr] = ((turnEntry as any).username as string).split(':');
    const expiration = parseInt(expirationStr, 10);
    expect(expiration).toBeGreaterThan(now);
    expect(expiration).toBeLessThanOrEqual(now + 660); // 600s TTL + 60s slack
  });

  it('credential is valid HMAC-SHA1 of username using the configured secret', () => {
    const svc = buildService({
      TURN_SECRET: STRONG_SECRET,
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials(TEST_USER_ID);
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry).toBeDefined();
    const username = String((turnEntry as any).username);
    const credential = String((turnEntry as any).credential);
    const expected = crypto.createHmac('sha1', STRONG_SECRET)
      .update(username)
      .digest('base64');
    expect(credential).toBe(expected);
  });

  it('different userIds produce different credentials', () => {
    const svc = buildService({
      TURN_SECRET: STRONG_SECRET,
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    const ice1 = svc.generateCredentials('user-1');
    const ice2 = svc.generateCredentials('user-2');
    const turn1 = ice1.find(s => (s.urls as string).startsWith('turn:'));
    const turn2 = ice2.find(s => (s.urls as string).startsWith('turn:'));
    expect((turn1 as any).credential).not.toBe((turn2 as any).credential);
  });

  it('always includes STUN servers regardless of TURN config', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    const creds = svc.generateCredentials('user-1');
    const stunEntries = creds.filter(s => (s.urls as string).startsWith('stun:'));
    expect(stunEntries.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// isConfigured
// ---------------------------------------------------------------------------

describe('TURNCredentialService — isConfigured', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when a custom secret and TURN servers are configured', () => {
    const svc = buildService({
      TURN_SECRET: 'my-real-secret',
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    expect(svc.isConfigured()).toBe(true);
  });

  it('returns false when using the default insecure secret', () => {
    const svc = buildService({
      TURN_SECRET: DEFAULT_INSECURE_SECRET,
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    expect(svc.isConfigured()).toBe(false);
  });

  it('returns false when no TURN servers are configured', () => {
    const svc = buildService({
      TURN_SECRET: 'my-real-secret',
      TURN_SERVERS: '',
      NODE_ENV: 'development',
    });
    expect(svc.isConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('TURNCredentialService — getStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reflects the number of configured TURN servers', () => {
    const svc = buildService({
      TURN_SERVERS: 'turn1.example.com:3478,turn2.example.com:3478',
      TURN_SECRET: STRONG_SECRET,
      NODE_ENV: 'development',
    });
    const status = svc.getStatus();
    expect(status.turnServersCount).toBe(2);
  });

  it('reports hasCustomSecret correctly', () => {
    const svc = buildService({ TURN_SECRET: STRONG_SECRET, NODE_ENV: 'development' });
    expect(svc.getStatus().hasCustomSecret).toBe(true);
  });

  it('reports hasCustomSecret false when using the default', () => {
    const svc = buildService({ TURN_SECRET: undefined, NODE_ENV: 'test' });
    expect(svc.getStatus().hasCustomSecret).toBe(false);
  });

  it('exposes credentialTTL in seconds', () => {
    const svc = buildService({ TURN_CREDENTIAL_TTL: '300', NODE_ENV: 'test' });
    expect(svc.getStatus().credentialTTL).toBe(300);
  });
});
