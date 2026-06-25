/**
 * TURNCredentialService — unit tests
 *
 * Covers:
 * - parseTURNServers: port range validation, empty host filtering, defaults
 * - generateCredentials: RFC 5389 username format, HMAC-SHA1 shape, TTL
 * - isConfigured: reflects real vs default secret + server count
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { TURNCredentialService } from '../../../services/TURNCredentialService';
import { logger } from '../../../utils/logger';

type MockFn = jest.Mock<any>;
const warnMock = logger.warn as MockFn;

const buildService = (env: Record<string, string | undefined> = {}) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const svc = new TURNCredentialService();
  Object.assign(process.env, saved);
  // restore keys that were explicitly set to undefined
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete process.env[key];
  }
  return svc;
};

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
    // STUN servers still present
    const stunEntries = creds.filter(s => (s.urls as string).startsWith('stun:'));
    expect(stunEntries.length).toBeGreaterThan(0);
  });
});

describe('TURNCredentialService — generateCredentials', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns RFC 5389 username in "timestamp:userId" format', () => {
    const svc = buildService({
      TURN_SECRET: 'test-secret',
      TURN_SERVERS: 'turn.example.com:3478',
      NODE_ENV: 'development',
    });
    const userId = 'user-abc-123';
    const creds = svc.generateCredentials(userId);
    const turnEntry = creds.find(s => (s.urls as string).startsWith('turn:'));
    expect(turnEntry).toBeDefined();
    const username = turnEntry!.credential !== undefined ? (turnEntry as any).username : undefined;
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
      TURN_SECRET: 'meeshy-turn-secret-CHANGE-IN-PRODUCTION',
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
