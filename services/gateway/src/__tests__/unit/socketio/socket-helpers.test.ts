/**
 * Unit tests for socketio/utils/socket-helpers utility functions.
 * Covers: extractJWTToken, extractSessionToken, getConnectedUser,
 * normalizeConversationId, buildParticipantDisplayName,
 * buildAnonymousDisplayName, isValidConversationId,
 * isValidMessageContent, getConversationRoomId,
 * extractConversationIdFromRoom.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSocket(opts: {
  authToken?: string;
  token?: string;
  authorization?: string;
  sessionToken?: string;
} = {}) {
  return {
    handshake: {
      auth: {
        token: opts.token,
        authToken: opts.authToken,
        sessionToken: opts.sessionToken,
      },
      headers: {
        authorization: opts.authorization,
        'x-session-token': opts.sessionToken,
      },
    },
  } as any;
}

function makeSocketUser(overrides: Partial<any> = {}): any {
  return {
    id: 'user-1',
    socketId: 'sock-1',
    isAnonymous: false,
    language: 'en',
    resolvedLanguages: ['en'],
    ...overrides,
  };
}

// ─── extractJWTToken ──────────────────────────────────────────────────────────

describe('extractJWTToken', () => {
  it('strips the "Bearer " prefix from auth.token', () => {
    const socket = makeSocket({ token: 'Bearer my.jwt.token' });
    expect(extractJWTToken(socket)).toBe('my.jwt.token');
  });

  it('returns a bare token (no "Bearer " prefix) directly', () => {
    const socket = makeSocket({ token: 'raw.token.value' });
    expect(extractJWTToken(socket)).toBe('raw.token.value');
  });

  it('reads from auth.authToken when auth.token is absent', () => {
    const socket = makeSocket({ authToken: 'Bearer from-auth-token' });
    expect(extractJWTToken(socket)).toBe('from-auth-token');
  });

  it('reads from handshake.headers.authorization as fallback', () => {
    const socket = makeSocket({ authorization: 'Bearer header-token' });
    expect(extractJWTToken(socket)).toBe('header-token');
  });

  it('returns undefined when no auth header is present', () => {
    const socket = makeSocket();
    expect(extractJWTToken(socket)).toBeUndefined();
  });
});

// ─── extractSessionToken ──────────────────────────────────────────────────────

describe('extractSessionToken', () => {
  it('returns auth.sessionToken when present', () => {
    const socket = makeSocket({ sessionToken: 'anon-session-token' });
    expect(extractSessionToken(socket)).toBe('anon-session-token');
  });

  it('returns undefined when no session token is set', () => {
    const socket = makeSocket();
    expect(extractSessionToken(socket)).toBeUndefined();
  });
});

// ─── getConnectedUser ─────────────────────────────────────────────────────────

describe('getConnectedUser', () => {
  it('returns null when the userId is not in the connected users map', () => {
    const result = getConnectedUser('unknown', new Map());
    expect(result).toBeNull();
  });

  it('returns the user and realUserId when found', () => {
    const user = makeSocketUser({ id: 'u-99' });
    const map = new Map([['u-99', user]]);

    const result = getConnectedUser('u-99', map);

    expect(result).not.toBeNull();
    expect(result!.user).toBe(user);
    expect(result!.realUserId).toBe('u-99');
  });
});

// ─── normalizeConversationId ──────────────────────────────────────────────────

describe('normalizeConversationId', () => {
  it('returns a valid 24-char ObjectId as-is without querying', async () => {
    const objectId = 'a'.repeat(24);
    const findFn = jest.fn<any>();

    const result = await normalizeConversationId(objectId, findFn);

    expect(result).toBe(objectId);
    expect(findFn).not.toHaveBeenCalled();
  });

  it('resolves an identifier to its ObjectId via the finder', async () => {
    const findFn = jest.fn<any>().mockResolvedValue({ id: 'resolved-id', identifier: 'my-conv' });

    const result = await normalizeConversationId('my-conv', findFn);

    expect(result).toBe('resolved-id');
    expect(findFn).toHaveBeenCalledWith({ identifier: 'my-conv' });
  });

  it('returns the identifier unchanged when the finder returns null', async () => {
    const findFn = jest.fn<any>().mockResolvedValue(null);

    const result = await normalizeConversationId('unknown-ident', findFn);

    expect(result).toBe('unknown-ident');
  });

  it('returns the identifier when the finder throws', async () => {
    const findFn = jest.fn<any>().mockRejectedValue(new Error('DB down'));

    const result = await normalizeConversationId('fallback-ident', findFn);

    expect(result).toBe('fallback-ident');
  });
});

// ─── buildParticipantDisplayName ──────────────────────────────────────────────

describe('buildParticipantDisplayName', () => {
  it('returns "Anonymous User" for null participant', () => {
    expect(buildParticipantDisplayName(null)).toBe('Anonymous User');
  });

  it('prefers nickname over displayName', () => {
    expect(buildParticipantDisplayName({ displayName: 'Bob Smith', nickname: 'Bobby' })).toBe('Bobby');
  });

  it('falls back to displayName when nickname is null', () => {
    expect(buildParticipantDisplayName({ displayName: 'Bob Smith', nickname: null })).toBe('Bob Smith');
  });

  it('returns "Anonymous User" when both nickname and displayName are empty', () => {
    expect(buildParticipantDisplayName({ displayName: '', nickname: null })).toBe('Anonymous User');
  });
});

// ─── buildAnonymousDisplayName ────────────────────────────────────────────────

describe('buildAnonymousDisplayName', () => {
  it('returns "Anonymous User" for null input', () => {
    expect(buildAnonymousDisplayName(null)).toBe('Anonymous User');
  });

  it('returns full name when both firstName and lastName are present', () => {
    expect(buildAnonymousDisplayName({ firstName: 'Jane', lastName: 'Doe', username: 'jdoe' }))
      .toBe('Jane Doe');
  });

  it('returns firstName only when lastName is null', () => {
    expect(buildAnonymousDisplayName({ firstName: 'Jane', lastName: null, username: 'jdoe' }))
      .toBe('Jane');
  });

  it('falls back to username when no name is available', () => {
    expect(buildAnonymousDisplayName({ firstName: null, lastName: null, username: 'jdoe' }))
      .toBe('jdoe');
  });

  it('returns "Anonymous User" when no identifying info is present', () => {
    expect(buildAnonymousDisplayName({ firstName: null, lastName: null, username: null }))
      .toBe('Anonymous User');
  });
});

// ─── isValidConversationId ────────────────────────────────────────────────────

describe('isValidConversationId', () => {
  it('returns true for a non-empty string', () => {
    expect(isValidConversationId('conv-123')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidConversationId('')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isValidConversationId(42)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidConversationId(null)).toBe(false);
  });
});

// ─── isValidMessageContent ────────────────────────────────────────────────────

describe('isValidMessageContent', () => {
  it('returns true for a string (including empty)', () => {
    expect(isValidMessageContent('')).toBe(true);
    expect(isValidMessageContent('Hello!')).toBe(true);
  });

  it('returns false for a number', () => {
    expect(isValidMessageContent(42)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidMessageContent(null)).toBe(false);
  });
});

// ─── getConversationRoomId ────────────────────────────────────────────────────

describe('getConversationRoomId', () => {
  it('prefixes the conversationId with "conversation:"', () => {
    expect(getConversationRoomId('conv-abc')).toBe('conversation:conv-abc');
  });
});

// ─── extractConversationIdFromRoom ────────────────────────────────────────────

describe('extractConversationIdFromRoom', () => {
  it('extracts the conversationId from a valid room string', () => {
    expect(extractConversationIdFromRoom('conversation:conv-abc')).toBe('conv-abc');
  });

  it('returns null for a non-matching room string', () => {
    expect(extractConversationIdFromRoom('user:u-1')).toBeNull();
    expect(extractConversationIdFromRoom('invalid')).toBeNull();
  });
});
