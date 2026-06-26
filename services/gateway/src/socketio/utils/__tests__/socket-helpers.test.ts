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
  type SocketUser,
} from '../socket-helpers';

function makeSocket(overrides: Record<string, unknown> = {}): import('socket.io').Socket {
  return {
    handshake: {
      auth: {},
      headers: {},
      ...overrides,
    },
  } as unknown as import('socket.io').Socket;
}

function makeSocketUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return {
    id: 'user-1',
    socketId: 'socket-1',
    isAnonymous: false,
    language: 'fr',
    resolvedLanguages: ['fr', 'en'],
    ...overrides,
  };
}

describe('extractJWTToken', () => {
  it('extracts Bearer token from auth.token', () => {
    const socket = makeSocket({ auth: { token: 'Bearer abc123' } });
    expect(extractJWTToken(socket)).toBe('abc123');
  });

  it('extracts Bearer token from auth.authToken', () => {
    const socket = makeSocket({ auth: { authToken: 'Bearer xyz' } });
    expect(extractJWTToken(socket)).toBe('xyz');
  });

  it('extracts Bearer token from headers.authorization', () => {
    const socket = makeSocket({ auth: {}, headers: { authorization: 'Bearer hdr-token' } });
    expect(extractJWTToken(socket)).toBe('hdr-token');
  });

  it('returns raw token when no Bearer prefix', () => {
    const socket = makeSocket({ auth: { token: 'rawtoken' } });
    expect(extractJWTToken(socket)).toBe('rawtoken');
  });

  it('returns undefined when no auth info', () => {
    const socket = makeSocket({ auth: {}, headers: {} });
    expect(extractJWTToken(socket)).toBeUndefined();
  });

  it('returns undefined when auth header is not a string', () => {
    const socket = makeSocket({ auth: { token: 42 } });
    expect(extractJWTToken(socket)).toBeUndefined();
  });
});

describe('extractSessionToken', () => {
  it('extracts sessionToken from auth.sessionToken', () => {
    const socket = makeSocket({ auth: { sessionToken: 'sess-abc' } });
    expect(extractSessionToken(socket)).toBe('sess-abc');
  });

  it('extracts sessionToken from x-session-token header', () => {
    const socket = makeSocket({ auth: {}, headers: { 'x-session-token': 'sess-hdr' } });
    expect(extractSessionToken(socket)).toBe('sess-hdr');
  });

  it('returns undefined when no session token present', () => {
    const socket = makeSocket({ auth: {}, headers: {} });
    expect(extractSessionToken(socket)).toBeUndefined();
  });

  it('returns undefined when session token is not a string', () => {
    const socket = makeSocket({ auth: { sessionToken: 123 } });
    expect(extractSessionToken(socket)).toBeUndefined();
  });
});

describe('getConnectedUser', () => {
  it('returns user when found in connectedUsers map', () => {
    const user = makeSocketUser();
    const map = new Map<string, SocketUser>([['user-1', user]]);
    const result = getConnectedUser('user-1', map);
    expect(result).not.toBeNull();
    expect(result!.user).toBe(user);
    expect(result!.realUserId).toBe('user-1');
  });

  it('returns null when user not found', () => {
    const map = new Map<string, SocketUser>();
    expect(getConnectedUser('unknown', map)).toBeNull();
  });
});

describe('normalizeConversationId', () => {
  const mockFind = jest.fn();

  beforeEach(() => mockFind.mockReset());

  it('returns ObjectId directly without DB lookup', async () => {
    const objectId = 'a1b2c3d4e5f6a1b2c3d4e5f6';
    const result = await normalizeConversationId(objectId, mockFind);
    expect(result).toBe(objectId);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('looks up identifier in DB and caches result', async () => {
    mockFind.mockResolvedValueOnce({ id: 'resolved-id', identifier: 'my-convo' });
    const result = await normalizeConversationId('my-convo', mockFind);
    expect(result).toBe('resolved-id');
    expect(mockFind).toHaveBeenCalledWith({ identifier: 'my-convo' });
  });

  it('returns original identifier when DB returns null', async () => {
    mockFind.mockResolvedValueOnce(null);
    const result = await normalizeConversationId('unknown-convo', mockFind);
    expect(result).toBe('unknown-convo');
  });

  it('returns original identifier on DB error', async () => {
    mockFind.mockRejectedValueOnce(new Error('DB error'));
    const result = await normalizeConversationId('error-convo', mockFind);
    expect(result).toBe('error-convo');
  });

  it('returns cached result on second call without hitting DB again', async () => {
    mockFind.mockResolvedValueOnce({ id: 'resolved-cached', identifier: 'cached-convo' });
    await normalizeConversationId('cached-convo', mockFind);
    mockFind.mockReset();

    const second = await normalizeConversationId('cached-convo', mockFind);
    expect(second).toBe('resolved-cached');
    expect(mockFind).not.toHaveBeenCalled();
  });
});

describe('buildParticipantDisplayName', () => {
  it('returns Anonymous User for null participant', () => {
    expect(buildParticipantDisplayName(null)).toBe('Anonymous User');
  });

  it('prefers nickname over displayName', () => {
    expect(buildParticipantDisplayName({ displayName: 'Full Name', nickname: 'nick' })).toBe('nick');
  });

  it('falls back to displayName when no nickname', () => {
    expect(buildParticipantDisplayName({ displayName: 'Full Name', nickname: null })).toBe('Full Name');
  });

  it('falls back to Anonymous User when both are empty', () => {
    expect(buildParticipantDisplayName({ displayName: '', nickname: null })).toBe('Anonymous User');
  });
});

describe('buildAnonymousDisplayName', () => {
  it('returns Anonymous User for null input', () => {
    expect(buildAnonymousDisplayName(null)).toBe('Anonymous User');
  });

  it('builds full name from firstName and lastName', () => {
    expect(buildAnonymousDisplayName({ username: null, firstName: 'John', lastName: 'Doe' })).toBe('John Doe');
  });

  it('uses firstName alone when lastName is null', () => {
    expect(buildAnonymousDisplayName({ username: null, firstName: 'Alice', lastName: null })).toBe('Alice');
  });

  it('falls back to username when no name parts', () => {
    expect(buildAnonymousDisplayName({ username: 'user42', firstName: null, lastName: null })).toBe('user42');
  });

  it('falls back to Anonymous User when all fields are null', () => {
    expect(buildAnonymousDisplayName({ username: null, firstName: null, lastName: null })).toBe('Anonymous User');
  });
});

describe('isValidConversationId', () => {
  it('returns true for non-empty string', () => {
    expect(isValidConversationId('abc123')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidConversationId('')).toBe(false);
  });

  it('returns false for non-string types', () => {
    expect(isValidConversationId(null)).toBe(false);
    expect(isValidConversationId(undefined)).toBe(false);
    expect(isValidConversationId(123)).toBe(false);
  });
});

describe('isValidMessageContent', () => {
  it('returns true for any string including empty', () => {
    expect(isValidMessageContent('')).toBe(true);
    expect(isValidMessageContent('hello')).toBe(true);
  });

  it('returns false for non-string', () => {
    expect(isValidMessageContent(null)).toBe(false);
    expect(isValidMessageContent(undefined)).toBe(false);
    expect(isValidMessageContent(42)).toBe(false);
  });
});

describe('getConversationRoomId', () => {
  it('formats room id with conversation prefix', () => {
    expect(getConversationRoomId('abc123')).toBe('conversation:abc123');
  });
});

describe('extractConversationIdFromRoom', () => {
  it('extracts conversation id from valid room id', () => {
    expect(extractConversationIdFromRoom('conversation:abc123')).toBe('abc123');
  });

  it('returns null for non-conversation room id', () => {
    expect(extractConversationIdFromRoom('user:abc')).toBeNull();
    expect(extractConversationIdFromRoom('abc123')).toBeNull();
  });

  it('handles ObjectId format correctly', () => {
    const id = 'a1b2c3d4e5f6a1b2c3d4e5f6';
    expect(extractConversationIdFromRoom(`conversation:${id}`)).toBe(id);
  });
});
