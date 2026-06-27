/**
 * Tests for utils/token-utils.ts
 */

const mockGetAuthToken = jest.fn();
const mockGetAnonymousSession = jest.fn();
const mockGetSessionToken = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getAnonymousSession: () => mockGetAnonymousSession(),
    getSessionToken: () => mockGetSessionToken(),
  },
}));

import {
  getAuthToken,
  getTokenType,
  createAuthHeaders,
  isAuthenticated,
  isAnonymousUser,
} from '@/utils/token-utils';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue(null);
  mockGetAnonymousSession.mockReturnValue(null);
  mockGetSessionToken.mockReturnValue(null);
});

// ─── getAuthToken ─────────────────────────────────────────────────────────────

describe('getAuthToken', () => {
  it('returns null when no auth token or anonymous session', () => {
    expect(getAuthToken()).toBeNull();
  });

  it('returns auth token info when authManager has an auth token', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    const info = getAuthToken();
    expect(info?.type).toBe('auth');
    expect(info?.value).toBe('jwt-abc');
    expect(info?.header.name).toBe('Authorization');
    expect(info?.header.value).toBe('Bearer jwt-abc');
  });

  it('returns anonymous token info when only anonymous session exists', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
    const info = getAuthToken();
    expect(info?.type).toBe('anonymous');
    expect(info?.value).toBe('anon-tok');
    expect(info?.header.name).toBe('X-Session-Token');
    expect(info?.header.value).toBe('anon-tok');
  });

  it('prioritizes auth token over anonymous session', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
    const info = getAuthToken();
    expect(info?.type).toBe('auth');
  });
});

// ─── getTokenType ─────────────────────────────────────────────────────────────

describe('getTokenType', () => {
  it('returns null for empty string', () => {
    expect(getTokenType('')).toBeNull();
  });

  it('returns "anonymous" when token matches anonymous session token', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
    expect(getTokenType('anon-tok')).toBe('anonymous');
  });

  it('returns "auth" when token matches auth token', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    expect(getTokenType('jwt-abc')).toBe('auth');
  });

  it('defaults to "auth" for an unknown token', () => {
    expect(getTokenType('some-other-token')).toBe('auth');
  });
});

// ─── createAuthHeaders ────────────────────────────────────────────────────────

describe('createAuthHeaders', () => {
  it('returns empty object when no token and no auth session', () => {
    expect(createAuthHeaders()).toEqual({});
  });

  it('returns Authorization header for auth token (no explicit token)', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    const headers = createAuthHeaders() as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-abc');
  });

  it('includes X-Session-Token alongside Authorization for auth users with session', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    mockGetSessionToken.mockReturnValue('sess-123');
    const headers = createAuthHeaders() as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-abc');
    expect(headers['X-Session-Token']).toBe('sess-123');
  });

  it('returns X-Session-Token for anonymous token (no explicit token)', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
    const headers = createAuthHeaders() as Record<string, string>;
    expect(headers['X-Session-Token']).toBe('anon-tok');
  });

  it('returns Authorization when explicit auth token is passed', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    const headers = createAuthHeaders('jwt-abc') as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-abc');
  });

  it('returns X-Session-Token when explicit anonymous token is passed', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
    const headers = createAuthHeaders('anon-tok') as Record<string, string>;
    expect(headers['X-Session-Token']).toBe('anon-tok');
  });
});

// ─── isAuthenticated ──────────────────────────────────────────────────────────

describe('isAuthenticated', () => {
  it('returns false when there is no token', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it('returns true when there is an auth token', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    expect(isAuthenticated()).toBe(true);
  });

  it('returns true when there is an anonymous session', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
    expect(isAuthenticated()).toBe(true);
  });
});

// ─── isAnonymousUser ──────────────────────────────────────────────────────────

describe('isAnonymousUser', () => {
  it('returns false when there is no token', () => {
    expect(isAnonymousUser()).toBe(false);
  });

  it('returns false for a regular auth user', () => {
    mockGetAuthToken.mockReturnValue('jwt-abc');
    expect(isAnonymousUser()).toBe(false);
  });

  it('returns true for an anonymous user', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
    expect(isAnonymousUser()).toBe(true);
  });
});
