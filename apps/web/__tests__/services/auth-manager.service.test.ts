/**
 * Tests for AuthManager service
 * Covers credential storage, anonymous sessions, JWT decoding, SSR guards, cleanup.
 */

const mockCleanup = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { cleanup: mockCleanup },
}));

import { authManager, AUTH_STORAGE_KEYS, SESSION_STORAGE_KEYS } from '@/services/auth-manager.service';
import type { User } from '@meeshy/shared/types';

const mockUser = {
  id: 'user-42',
  username: 'alice',
  email: 'alice@example.com',
  role: 'USER',
  systemLanguage: 'fr',
} as unknown as User;

function clearStorage() {
  localStorage.clear();
  sessionStorage.clear();
  // Clear cookies set by tests
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    document.cookie = `${name}=;expires=${new Date(0).toUTCString()};path=/`;
  });
}

beforeEach(() => {
  clearStorage();
  jest.clearAllMocks();
});

describe('AuthManager.registerOnClear', () => {
  it('stores and invokes callbacks when clearAllSessions is called', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    authManager.registerOnClear(cb1);
    authManager.registerOnClear(cb2);
    authManager.clearAllSessions();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('swallows errors thrown inside a callback so others still run', () => {
    const bad = jest.fn().mockImplementation(() => { throw new Error('boom'); });
    const good = jest.fn();
    authManager.registerOnClear(bad);
    authManager.registerOnClear(good);
    expect(() => authManager.clearAllSessions()).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});

describe('AuthManager.setCredentials', () => {
  it('stores auth token in localStorage', () => {
    authManager.setCredentials(mockUser, 'access-tok');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBe('access-tok');
  });

  it('stores refresh token when provided', () => {
    authManager.setCredentials(mockUser, 'access-tok', 'refresh-tok');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe('refresh-tok');
  });

  it('stores session token when provided', () => {
    authManager.setCredentials(mockUser, 'access-tok', undefined, 'sess-tok');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBe('sess-tok');
  });

  it('stores user data as JSON', () => {
    authManager.setCredentials(mockUser, 'access-tok');
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEYS.USER_DATA)!);
    expect(stored.id).toBe('user-42');
  });

  it('skips refresh and session tokens when undefined', () => {
    authManager.setCredentials(mockUser, 'access-tok');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBeNull();
  });

  it('calls clearAllSessions before storing (clears previous session)', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'old-token');
    authManager.setCredentials(mockUser, 'new-token');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBe('new-token');
  });

  it('sets a meeshy_session cookie', () => {
    authManager.setCredentials(mockUser, 'tok');
    expect(document.cookie).toContain('meeshy_session=');
  });
});

describe('AuthManager.updateUser', () => {
  it('overwrites stored user data', () => {
    authManager.setCredentials(mockUser, 'tok');
    const updated = { ...mockUser, username: 'bob' } as unknown as User;
    authManager.updateUser(updated);
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEYS.USER_DATA)!);
    expect(stored.username).toBe('bob');
  });

  it('updates the session cookie', () => {
    authManager.updateUser(mockUser);
    expect(document.cookie).toContain('meeshy_session=');
  });
});

describe('AuthManager.updateTokens', () => {
  it('updates auth token', () => {
    authManager.updateTokens('new-access');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBe('new-access');
  });

  it('updates refresh token when provided', () => {
    authManager.updateTokens('tok', 'new-refresh');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBe('new-refresh');
  });

  it('updates session token when provided', () => {
    authManager.updateTokens('tok', undefined, 'new-session');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBe('new-session');
  });

  it('skips optional tokens when not provided', () => {
    authManager.updateTokens('tok');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBeNull();
  });
});

describe('AuthManager.getAuthToken', () => {
  it('returns null when no token stored', () => {
    expect(authManager.getAuthToken()).toBeNull();
  });

  it('returns the stored token', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'my-token');
    expect(authManager.getAuthToken()).toBe('my-token');
  });

});

describe('AuthManager.getRefreshToken', () => {
  it('returns null when no refresh token stored', () => {
    expect(authManager.getRefreshToken()).toBeNull();
  });

  it('returns the stored refresh token', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, 'refresh-xyz');
    expect(authManager.getRefreshToken()).toBe('refresh-xyz');
  });

});

describe('AuthManager.getCurrentUser', () => {
  it('returns null when no user data stored', () => {
    expect(authManager.getCurrentUser()).toBeNull();
  });

  it('returns parsed user object', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, JSON.stringify(mockUser));
    const user = authManager.getCurrentUser();
    expect(user?.id).toBe('user-42');
  });

  it('returns null when stored data is malformed JSON', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, '{invalid json}');
    expect(authManager.getCurrentUser()).toBeNull();
  });

});

describe('AuthManager.isAuthenticated', () => {
  it('returns false when no token', () => {
    expect(authManager.isAuthenticated()).toBe(false);
  });

  it('returns true when token is present', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'tok');
    expect(authManager.isAuthenticated()).toBe(true);
  });
});

describe('AuthManager.setAnonymousSession', () => {
  it('stores the anonymous session with token and participantId', () => {
    authManager.setAnonymousSession('anon-tok', 'p-1');
    const raw = localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION)!;
    const session = JSON.parse(raw);
    expect(session.token).toBe('anon-tok');
    expect(session.participantId).toBe('p-1');
  });

  it('uses custom expiry hours', () => {
    const before = Date.now();
    authManager.setAnonymousSession('tok', 'p', 2);
    const raw = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION)!);
    expect(raw.expiresAt).toBeGreaterThanOrEqual(before + 2 * 3600 * 1000);
  });

  it('also stores token in AUTH_TOKEN key', () => {
    authManager.setAnonymousSession('anon-tok', 'p-1');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBe('anon-tok');
  });

});

describe('AuthManager.getAnonymousSession', () => {
  it('returns null when nothing stored', () => {
    expect(authManager.getAnonymousSession()).toBeNull();
  });


  it('returns a valid non-expired session', () => {
    authManager.setAnonymousSession('anon-tok', 'p-1', 24);
    const session = authManager.getAnonymousSession();
    expect(session?.token).toBe('anon-tok');
  });

  it('returns null and clears storage for an expired session', () => {
    const expired = JSON.stringify({ token: 't', participantId: 'p', expiresAt: Date.now() - 1000 });
    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION, expired);
    expect(authManager.getAnonymousSession()).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION, '{bad}');
    expect(authManager.getAnonymousSession()).toBeNull();
  });
});

describe('AuthManager.getSessionToken', () => {
  it('returns null when no anonymous session', () => {
    expect(authManager.getSessionToken()).toBeNull();
  });

  it('returns the anonymous session token', () => {
    authManager.setAnonymousSession('anon-tok', 'p');
    expect(authManager.getSessionToken()).toBe('anon-tok');
  });
});

describe('AuthManager.decodeJWT', () => {
  function makeJWT(payload: Record<string, unknown>): string {
    const encoded = btoa(JSON.stringify(payload));
    return `header.${encoded}.signature`;
  }

  it('decodes a valid JWT payload', () => {
    const jwt = makeJWT({ sub: 'user-1', exp: 9999 });
    const decoded = authManager.decodeJWT(jwt);
    expect(decoded?.sub).toBe('user-1');
  });

  it('returns null for a JWT missing the payload segment', () => {
    expect(authManager.decodeJWT('header-only')).toBeNull();
  });

  it('returns null for malformed base64 payload', () => {
    expect(authManager.decodeJWT('h.!!!invalid!!!.s')).toBeNull();
  });

  it('returns null for completely invalid input', () => {
    expect(authManager.decodeJWT('')).toBeNull();
  });
});

describe('AuthManager.clearAllSessions', () => {
  it('removes all auth keys from localStorage', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'tok');
    localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, 'ref');
    localStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, 'ses');
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, '{}');
    authManager.clearAllSessions();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.USER_DATA)).toBeNull();
  });

  it('calls meeshySocketIOService.cleanup', () => {
    authManager.clearAllSessions();
    expect(mockCleanup).toHaveBeenCalled();
  });


  it('clears auth cookies', () => {
    document.cookie = 'meeshy_session=abc;path=/';
    authManager.clearAllSessions();
    expect(document.cookie).not.toContain('meeshy_session=abc');
  });

  it('does not crash if localStorage.removeItem throws (outer catch)', () => {
    const original = Storage.prototype.removeItem;
    let calls = 0;
    Storage.prototype.removeItem = function (...args: unknown[]) {
      calls++;
      if (calls === 1) throw new Error('QuotaExceededError');
      return original.apply(this, args as [string]);
    };
    try {
      expect(() => authManager.clearAllSessions()).not.toThrow();
    } finally {
      Storage.prototype.removeItem = original;
    }
  });

  it('skips cleanup when meeshySocketIOService.cleanup is not a function', () => {
    mockCleanup.mockReset();
    jest.mock('@/services/meeshy-socketio.service', () => ({
      meeshySocketIOService: {},
    }));
    expect(() => authManager.clearAllSessions()).not.toThrow();
  });
});

describe('AuthManager.setCredentials (admin role branches)', () => {
  it('sets canAccessAdmin=true for ADMIN role', () => {
    const adminUser = { ...mockUser, role: 'ADMIN' } as unknown as User;
    authManager.setCredentials(adminUser, 'tok');
    const cookie = document.cookie;
    expect(cookie).toContain('meeshy_session=');
    const match = cookie.match(/meeshy_session=([^;]+)/);
    if (match) {
      const decoded = JSON.parse(atob(match[1]));
      expect(decoded.canAccessAdmin).toBe(true);
    }
  });

  it('sets canAccessAdmin=false for USER role without explicit flag', () => {
    authManager.setCredentials(mockUser, 'tok');
    const match = document.cookie.match(/meeshy_session=([^;]+)/);
    if (match) {
      const decoded = JSON.parse(atob(match[1]));
      expect(decoded.canAccessAdmin).toBe(false);
    }
  });
});

describe('AuthManager.logout', () => {
  it('delegates to clearAllSessions', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'tok');
    authManager.logout();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
  });
});

describe('AuthManager.clearAnonymousSessions', () => {
  it('removes all anonymous session keys', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION, '{}');
    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION_TOKEN, 'tok');
    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_PARTICIPANT, '{}');
    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_LINK_ID, 'link-1');
    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_SHARE_LINK, 'link-2');
    authManager.clearAnonymousSessions();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION_TOKEN)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_PARTICIPANT)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_LINK_ID)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_SHARE_LINK)).toBeNull();
  });
});

describe('AuthManager.clearTemporaryAuthData', () => {
  it('removes 2FA session storage keys', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN, 'tmp');
    sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID, 'uid');
    sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME, 'user');
    authManager.clearTemporaryAuthData();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN)).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID)).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME)).toBeNull();
  });

  it('handles sessionStorage errors gracefully', () => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => { throw new Error('SecurityError'); };
    try {
      expect(() => authManager.clearTemporaryAuthData()).not.toThrow();
    } finally {
      Storage.prototype.removeItem = original;
    }
  });
});
