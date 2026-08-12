/**
 * Unit tests for AuthTestService (the dev/test credential helper).
 * Covers: authenticate, authenticateById, generateToken, verifyToken,
 * getAllUsers (password masking), getUserByUsername, getUserById.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { AuthService, TEST_USERS } from '../../../services/AuthTestService';

// Pick a known test user to anchor assertions against a real constant.
const ALICE = TEST_USERS.find((u) => u.username === 'alice_fr')!;
const BOB = TEST_USERS.find((u) => u.username === 'bob_en')!;

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  it('returns the user when username and password match', () => {
    const user = AuthService.authenticate(ALICE.username, ALICE.password);

    expect(user).not.toBeNull();
    expect(user!.username).toBe(ALICE.username);
  });

  it('returns null for a correct username but wrong password', () => {
    expect(AuthService.authenticate(ALICE.username, 'wrong')).toBeNull();
  });

  it('returns null for an unknown username', () => {
    expect(AuthService.authenticate('nobody', 'password123')).toBeNull();
  });

  it('returns null when both username and password are empty', () => {
    expect(AuthService.authenticate('', '')).toBeNull();
  });
});

// ─── authenticateById ─────────────────────────────────────────────────────────

describe('authenticateById', () => {
  it('returns the user when the id matches', () => {
    const user = AuthService.authenticateById(ALICE.id);

    expect(user).not.toBeNull();
    expect(user!.id).toBe(ALICE.id);
  });

  it('returns null for an unknown id', () => {
    expect(AuthService.authenticateById('no-such-id')).toBeNull();
  });
});

// ─── generateToken ────────────────────────────────────────────────────────────

describe('generateToken', () => {
  it('returns a non-empty base64 string', () => {
    const token = AuthService.generateToken(ALICE);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('encodes the userId, username and role in the payload', () => {
    const token = AuthService.generateToken(BOB);
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());

    expect(payload.userId).toBe(BOB.id);
    expect(payload.username).toBe(BOB.username);
    expect(payload.role).toBe(BOB.role);
  });

  it('sets exp to roughly 24 hours from now', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = AuthService.generateToken(ALICE);
    const after = Math.floor(Date.now() / 1000);
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());

    const expectedMin = before + 24 * 3600 - 2;
    const expectedMax = after + 24 * 3600 + 2;
    expect(payload.exp).toBeGreaterThanOrEqual(expectedMin);
    expect(payload.exp).toBeLessThanOrEqual(expectedMax);
  });
});

// ─── verifyToken ──────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  it('returns userId/username/role for a freshly generated token', () => {
    const token = AuthService.generateToken(ALICE);
    const result = AuthService.verifyToken(token);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(ALICE.id);
    expect(result!.username).toBe(ALICE.username);
    expect(result!.role).toBe(ALICE.role);
  });

  it('returns null for a token that has already expired', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredPayload = {
      userId: 'u1',
      username: 'test',
      email: 'test@test.com',
      role: 'USER',
      iat: nowSeconds - 200,
      exp: nowSeconds - 100,
    };
    const token = Buffer.from(JSON.stringify(expiredPayload)).toString('base64');

    expect(AuthService.verifyToken(token)).toBeNull();
  });

  it('returns null for a malformed (non-base64-JSON) token', () => {
    expect(AuthService.verifyToken('not.a.valid.token')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(AuthService.verifyToken('')).toBeNull();
  });
});

// ─── getAllUsers ───────────────────────────────────────────────────────────────

describe('getAllUsers', () => {
  it('returns all test users', () => {
    const users = AuthService.getAllUsers();

    expect(users.length).toBe(TEST_USERS.length);
  });

  it('masks passwords with "***"', () => {
    const users = AuthService.getAllUsers();

    for (const u of users) {
      expect(u.password).toBe('***');
    }
  });

  it('does not mutate the original TEST_USERS array', () => {
    AuthService.getAllUsers();

    for (const u of TEST_USERS) {
      expect(u.password).not.toBe('***');
    }
  });
});

// ─── getUserByUsername ────────────────────────────────────────────────────────

describe('getUserByUsername', () => {
  it('returns the matching user', () => {
    const user = AuthService.getUserByUsername(BOB.username);

    expect(user).not.toBeNull();
    expect(user!.id).toBe(BOB.id);
  });

  it('returns null for an unknown username', () => {
    expect(AuthService.getUserByUsername('ghost')).toBeNull();
  });
});

// ─── getUserById ──────────────────────────────────────────────────────────────

describe('getUserById', () => {
  it('returns the matching user', () => {
    const user = AuthService.getUserById(BOB.id);

    expect(user).not.toBeNull();
    expect(user!.username).toBe(BOB.username);
  });

  it('returns null for an unknown id', () => {
    expect(AuthService.getUserById('ghost-id')).toBeNull();
  });
});
