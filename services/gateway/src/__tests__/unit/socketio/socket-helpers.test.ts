/**
 * Unit tests for socketio/utils/socket-helpers.ts
 * Covers all exported functions: extractJWTToken, extractSessionToken,
 * getConnectedUser, normalizeConversationId, buildParticipantDisplayName,
 * buildAnonymousDisplayName, isValidConversationId, isValidMessageContent,
 * getConversationRoomId, extractConversationIdFromRoom
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  extractJWTToken,
  extractSessionToken,
  getConnectedUser,
  normalizeConversationId,
  buildParticipantDisplayName,
  buildAnonymousDisplayName,
  isValidConversationId,
  isValidMessageContent,
  getConversationRoomId,
  extractConversationIdFromRoom,
} from '../../../socketio/utils/socket-helpers';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

function makeSocket(auth: Record<string, unknown> = {}, headers: Record<string, unknown> = {}): any {
  return { handshake: { auth, headers } };
}

// ── extractJWTToken ────────────────────────────────────────────────────────

describe('extractJWTToken', () => {
  it('returns undefined when no auth header present', () => {
    expect(extractJWTToken(makeSocket())).toBeUndefined();
  });

  it('strips Bearer prefix from auth.token', () => {
    const socket = makeSocket({ token: 'Bearer my-jwt-token' });
    expect(extractJWTToken(socket)).toBe('my-jwt-token');
  });

  it('returns raw string token when no Bearer prefix', () => {
    const socket = makeSocket({ token: 'raw-token' });
    expect(extractJWTToken(socket)).toBe('raw-token');
  });

  it('uses auth.authToken when auth.token is absent', () => {
    const socket = makeSocket({ authToken: 'Bearer alias-token' });
    expect(extractJWTToken(socket)).toBe('alias-token');
  });

  it('uses headers.authorization when auth fields are absent', () => {
    const socket = makeSocket({}, { authorization: 'Bearer header-token' });
    expect(extractJWTToken(socket)).toBe('header-token');
  });

  it('returns undefined when auth token is not a string', () => {
    const socket = makeSocket({ token: 12345 });
    expect(extractJWTToken(socket)).toBeUndefined();
  });
});

// ── extractSessionToken ───────────────────────────────────────────────────

describe('extractSessionToken', () => {
  it('returns undefined when no session token present', () => {
    expect(extractSessionToken(makeSocket())).toBeUndefined();
  });

  it('returns session token from auth.sessionToken', () => {
    const socket = makeSocket({ sessionToken: 'sess-abc' });
    expect(extractSessionToken(socket)).toBe('sess-abc');
  });

  it('returns session token from x-session-token header', () => {
    const socket = makeSocket({}, { 'x-session-token': 'sess-header' });
    expect(extractSessionToken(socket)).toBe('sess-header');
  });

  it('returns undefined when session token is not a string', () => {
    const socket = makeSocket({ sessionToken: 42 });
    expect(extractSessionToken(socket)).toBeUndefined();
  });
});

// ── getConnectedUser ──────────────────────────────────────────────────────

describe('getConnectedUser', () => {
  const mockUser = {
    id: 'user-1',
    socketId: 'sock-1',
    isAnonymous: false,
    language: 'en',
    resolvedLanguages: ['en'],
  };

  it('returns user and realUserId when found', () => {
    const users = new Map([['user-1', mockUser]]);
    const result = getConnectedUser('user-1', users);
    expect(result).not.toBeNull();
    expect(result!.user).toBe(mockUser);
    expect(result!.realUserId).toBe('user-1');
  });

  it('returns null when user not in map', () => {
    const result = getConnectedUser('unknown', new Map());
    expect(result).toBeNull();
  });
});

// ── normalizeConversationId ────────────────────────────────────────────────

describe('normalizeConversationId', () => {
  it('returns ObjectId directly without querying', async () => {
    const finder = jest.fn<any>();
    const id = '507f1f77bcf86cd799439011';
    const result = await normalizeConversationId(id, finder);
    expect(result).toBe(id);
    expect(finder).not.toHaveBeenCalled();
  });

  it('caches identifier → id after first DB lookup', async () => {
    const id = '507f1f77bcf86cd799439022';
    const finder = jest.fn<any>().mockResolvedValue({ id, identifier: 'conv-slug-unique-1' });

    const result1 = await normalizeConversationId('conv-slug-unique-1', finder);
    expect(result1).toBe(id);
    expect(finder).toHaveBeenCalledTimes(1);

    const result2 = await normalizeConversationId('conv-slug-unique-1', finder);
    expect(result2).toBe(id);
    expect(finder).toHaveBeenCalledTimes(1);
  });

  it('returns original identifier when DB lookup returns null', async () => {
    const finder = jest.fn<any>().mockResolvedValue(null);
    const result = await normalizeConversationId('unknown-slug', finder);
    expect(result).toBe('unknown-slug');
  });

  it('returns original identifier when DB throws', async () => {
    const finder = jest.fn<any>().mockRejectedValue(new Error('DB error'));
    const result = await normalizeConversationId('error-slug', finder);
    expect(result).toBe('error-slug');
  });
});

// ── buildParticipantDisplayName ───────────────────────────────────────────

describe('buildParticipantDisplayName', () => {
  it('returns Anonymous User when participant is null', () => {
    expect(buildParticipantDisplayName(null)).toBe('Anonymous User');
  });

  it('returns nickname when available', () => {
    expect(buildParticipantDisplayName({ displayName: 'Alice', nickname: 'Ali' })).toBe('Ali');
  });

  it('returns displayName when nickname is null', () => {
    expect(buildParticipantDisplayName({ displayName: 'Alice', nickname: null })).toBe('Alice');
  });

  it('returns Anonymous User when neither nickname nor displayName', () => {
    expect(buildParticipantDisplayName({ displayName: '', nickname: null })).toBe('Anonymous User');
  });
});

// ── buildAnonymousDisplayName ─────────────────────────────────────────────

describe('buildAnonymousDisplayName', () => {
  it('returns Anonymous User when user is null', () => {
    expect(buildAnonymousDisplayName(null)).toBe('Anonymous User');
  });

  it('returns full name when both firstName and lastName are set', () => {
    expect(buildAnonymousDisplayName({ username: 'user1', firstName: 'Alice', lastName: 'Smith' })).toBe('Alice Smith');
  });

  it('returns first name alone when lastName is null', () => {
    expect(buildAnonymousDisplayName({ username: null, firstName: 'Alice', lastName: null })).toBe('Alice');
  });

  it('falls back to username when no name parts', () => {
    expect(buildAnonymousDisplayName({ username: 'ghostUser', firstName: null, lastName: null })).toBe('ghostUser');
  });

  it('returns Anonymous User when all fields are null', () => {
    expect(buildAnonymousDisplayName({ username: null, firstName: null, lastName: null })).toBe('Anonymous User');
  });
});

// ── isValidConversationId ─────────────────────────────────────────────────

describe('isValidConversationId', () => {
  it('returns true for a non-empty string', () => {
    expect(isValidConversationId('abc')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidConversationId('')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(isValidConversationId(123)).toBe(false);
  });
});

// ── isValidMessageContent ─────────────────────────────────────────────────

describe('isValidMessageContent', () => {
  it('returns true for a string', () => {
    expect(isValidMessageContent('hello')).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isValidMessageContent('')).toBe(true);
  });

  it('returns false for non-string', () => {
    expect(isValidMessageContent(null)).toBe(false);
  });
});

// ── getConversationRoomId ─────────────────────────────────────────────────

describe('getConversationRoomId', () => {
  it('returns conversation:<id> format', () => {
    expect(getConversationRoomId('conv-123')).toBe('conversation:conv-123');
  });
});

// ── extractConversationIdFromRoom ─────────────────────────────────────────

describe('extractConversationIdFromRoom', () => {
  it('extracts conversation id from valid room id', () => {
    expect(extractConversationIdFromRoom('conversation:conv-abc')).toBe('conv-abc');
  });

  it('returns null for non-matching room id', () => {
    expect(extractConversationIdFromRoom('user:user-abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractConversationIdFromRoom('')).toBeNull();
  });
});
