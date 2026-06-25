/**
 * TURNCredentialService Unit Tests
 *
 * Tests the RFC 5389 HMAC-SHA1 time-limited TURN credential generation.
 * Security-critical: validates that production guard rejects default secrets,
 * that credentials are correctly formatted and cryptographically sound.
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
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INSECURE_SECRET = 'meeshy-turn-secret-CHANGE-IN-PRODUCTION';
const STRONG_SECRET = 'a9f2c3e4b5d6a7f8c9e0b1d2a3f4c5e6';
const TEST_USER_ID = 'user-abc-123';

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

let savedEnv: NodeJS.ProcessEnv;

function setEnv(overrides: Record<string, string | undefined>): void {
  Object.assign(process.env, overrides);
}

function makeService(): TURNCredentialService {
  return new TURNCredentialService();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TURNCredentialService', () => {

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Start each test in a clean dev environment
    delete process.env.TURN_SECRET;
    delete process.env.TURN_SERVERS;
    delete process.env.TURN_CREDENTIAL_TTL;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  // -------------------------------------------------------------------------
  // Construction: security guard
  // -------------------------------------------------------------------------

  describe('production security guard', () => {
    it('throws when NODE_ENV=production and no TURN_SECRET is set', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TURN_SECRET;
      expect(() => makeService()).toThrow('[SECURITY]');
    });

    it('throws when NODE_ENV=production and TURN_SECRET is the default insecure value', () => {
      process.env.NODE_ENV = 'production';
      process.env.TURN_SECRET = DEFAULT_INSECURE_SECRET;
      expect(() => makeService()).toThrow('[SECURITY]');
    });

    it('throws when NODE_ENV=staging and TURN_SECRET is the default insecure value', () => {
      process.env.NODE_ENV = 'staging';
      process.env.TURN_SECRET = DEFAULT_INSECURE_SECRET;
      expect(() => makeService()).toThrow('[SECURITY]');
    });

    it('does NOT throw in production when a strong custom TURN_SECRET is provided', () => {
      process.env.NODE_ENV = 'production';
      process.env.TURN_SECRET = STRONG_SECRET;
      expect(() => makeService()).not.toThrow();
    });

    it('does NOT throw in dev even when no TURN_SECRET is set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.TURN_SECRET;
      expect(() => makeService()).not.toThrow();
    });

    it('does NOT throw in test environment with no TURN_SECRET', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.TURN_SECRET;
      expect(() => makeService()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // TURN server parsing
  // -------------------------------------------------------------------------

  describe('TURN server parsing', () => {
    it('returns empty array when TURN_SERVERS is not set', () => {
      delete process.env.TURN_SERVERS;
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turnServers = ice.filter(s => String(s.urls).startsWith('turn:'));
      expect(turnServers).toHaveLength(0);
    });

    it('parses a single TURN server with explicit port', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turnServers = ice.filter(s => String(s.urls).startsWith('turn:'));
      expect(turnServers).toHaveLength(1);
      expect(turnServers[0].urls).toBe('turn:turn.example.com:3478');
    });

    it('parses multiple TURN servers separated by commas', () => {
      process.env.TURN_SERVERS = 'turn1.example.com:3478,turn2.example.com:5349';
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turnServers = ice.filter(s => String(s.urls).startsWith('turn:'));
      expect(turnServers).toHaveLength(2);
    });

    it('uses default port 3478 when no port is specified', () => {
      process.env.TURN_SERVERS = 'turn.example.com';
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turnServers = ice.filter(s => String(s.urls).startsWith('turn:'));
      expect(String(turnServers[0].urls)).toContain(':3478');
    });
  });

  // -------------------------------------------------------------------------
  // STUN servers always present
  // -------------------------------------------------------------------------

  describe('STUN servers', () => {
    it('always includes Google STUN servers', () => {
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const stunServers = ice.filter(s => String(s.urls).startsWith('stun:'));
      expect(stunServers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // generateCredentials: RFC 5389 compliance
  // -------------------------------------------------------------------------

  describe('generateCredentials — RFC 5389 compliance', () => {
    it('returns an array of RTCIceServer objects', () => {
      const svc = makeService();
      const result = svc.generateCredentials(TEST_USER_ID);
      expect(Array.isArray(result)).toBe(true);
    });

    it('TURN credentials include username and credential fields', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turn = ice.find(s => String(s.urls).startsWith('turn:'));
      expect(turn).toBeDefined();
      expect(turn!.username).toBeDefined();
      expect(turn!.credential).toBeDefined();
    });

    it('username follows RFC 5389 format: timestamp:userId', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turn = ice.find(s => String(s.urls).startsWith('turn:'));
      const [timestamp, userId] = String(turn!.username).split(':');
      expect(Number(timestamp)).toBeGreaterThan(0);
      expect(userId).toBe(TEST_USER_ID);
    });

    it('username timestamp is in the future (expiry, not issue time)', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      const before = Math.floor(Date.now() / 1000);
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turn = ice.find(s => String(s.urls).startsWith('turn:'));
      const timestamp = Number(String(turn!.username).split(':')[0]);
      expect(timestamp).toBeGreaterThan(before);
    });

    it('credential is valid HMAC-SHA1 of username using the configured secret', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turn = ice.find(s => String(s.urls).startsWith('turn:'));
      const username = String(turn!.username);
      const credential = String(turn!.credential);

      // Recompute expected HMAC
      const expected = crypto.createHmac('sha1', STRONG_SECRET)
        .update(username)
        .digest('base64');

      expect(credential).toBe(expected);
    });

    it('all TURN entries share the same username and credential (consistent session)', () => {
      process.env.TURN_SERVERS = 'turn1.example.com:3478,turn2.example.com:5349';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turns = ice.filter(s => String(s.urls).startsWith('turn:'));
      const usernames = turns.map(t => t.username);
      const credentials = turns.map(t => t.credential);
      expect(new Set(usernames).size).toBe(1);
      expect(new Set(credentials).size).toBe(1);
    });

    it('different userIds produce different credentials', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      const ice1 = svc.generateCredentials('user-1');
      const ice2 = svc.generateCredentials('user-2');
      const turn1 = ice1.find(s => String(s.urls).startsWith('turn:'));
      const turn2 = ice2.find(s => String(s.urls).startsWith('turn:'));
      expect(turn1!.credential).not.toBe(turn2!.credential);
    });
  });

  // -------------------------------------------------------------------------
  // credentialTTL: custom TTL from env
  // -------------------------------------------------------------------------

  describe('credentialTTL configuration', () => {
    it('defaults to 600 seconds (10 minutes)', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      delete process.env.TURN_CREDENTIAL_TTL;
      const svc = makeService();
      const before = Math.floor(Date.now() / 1000);
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turn = ice.find(s => String(s.urls).startsWith('turn:'));
      const expiry = Number(String(turn!.username).split(':')[0]);
      expect(expiry - before).toBeGreaterThanOrEqual(599);
      expect(expiry - before).toBeLessThanOrEqual(601);
    });

    it('uses TURN_CREDENTIAL_TTL when provided', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      process.env.TURN_CREDENTIAL_TTL = '1800';
      const svc = makeService();
      const before = Math.floor(Date.now() / 1000);
      const ice = svc.generateCredentials(TEST_USER_ID);
      const turn = ice.find(s => String(s.urls).startsWith('turn:'));
      const expiry = Number(String(turn!.username).split(':')[0]);
      expect(expiry - before).toBeGreaterThanOrEqual(1799);
      expect(expiry - before).toBeLessThanOrEqual(1801);
    });
  });

  // -------------------------------------------------------------------------
  // isConfigured / getStatus
  // -------------------------------------------------------------------------

  describe('isConfigured()', () => {
    it('returns false when TURN_SERVERS is not set', () => {
      delete process.env.TURN_SERVERS;
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      expect(svc.isConfigured()).toBe(false);
    });

    it('returns false when using the default insecure secret', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      delete process.env.TURN_SECRET;
      const svc = makeService();
      expect(svc.isConfigured()).toBe(false);
    });

    it('returns true when TURN_SERVERS is set and a custom secret is used', () => {
      process.env.TURN_SERVERS = 'turn.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      expect(svc.isConfigured()).toBe(true);
    });
  });

  describe('getStatus()', () => {
    it('reflects the number of configured TURN servers', () => {
      process.env.TURN_SERVERS = 'turn1.example.com:3478,turn2.example.com:3478';
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      const status = svc.getStatus();
      expect(status.turnServersCount).toBe(2);
    });

    it('reports hasCustomSecret correctly', () => {
      process.env.TURN_SECRET = STRONG_SECRET;
      const svc = makeService();
      expect(svc.getStatus().hasCustomSecret).toBe(true);
    });

    it('reports hasCustomSecret false when using the default', () => {
      delete process.env.TURN_SECRET;
      const svc = makeService();
      expect(svc.getStatus().hasCustomSecret).toBe(false);
    });

    it('exposes credentialTTL in seconds', () => {
      process.env.TURN_CREDENTIAL_TTL = '300';
      const svc = makeService();
      expect(svc.getStatus().credentialTTL).toBe(300);
    });
  });
});
