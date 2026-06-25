/**
 * TURNCredentialService Unit Tests
 *
 * Regression guard for the "call drops after a few minutes" bug.
 *
 * Root cause: TURN credentials are generated ONCE at call:initiate / call:join
 * and embed an expiration timestamp (`now + credentialTTL`) inside the coturn
 * `use-auth-secret` username. coturn refuses to refresh a relay allocation once
 * that timestamp has passed, so any call whose media is relayed through TURN
 * (symmetric / carrier-grade NAT — common on cellular) loses its relay and
 * tears down (`disconnected` → ICE restart reusing the SAME expired creds →
 * `failed`) at roughly `credentialTTL` seconds.
 *
 * The previous default of 600 s (10 min) is shorter than the maximum lifetime
 * the server itself grants an active call (CallCleanupService MAX_ACTIVE_MS =
 * 2 h), so a perfectly healthy 11-minute call was being killed by credential
 * expiry. The TTL must therefore always cover the maximum active-call duration.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { TURNCredentialService } from '../../../services/TURNCredentialService';

// Mirror of CallCleanupService.MAX_ACTIVE_MS (2 h) expressed in seconds. An
// active call can legitimately live this long server-side, so TURN credentials
// must stay valid at least as long or the relay dies mid-call.
const MAX_ACTIVE_CALL_SECONDS = 2 * 60 * 60;

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

        // username format is `${expirationTimestamp}:${userId}`
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
