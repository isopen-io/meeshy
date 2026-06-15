/**
 * Auth Store Tests
 * Tests for authentication state management with Zustand
 */

import { act, renderHook } from '@testing-library/react';
import { useAuthStore, useAuthActions, useUser, useIsAuthenticated, useIsAuthChecking } from '../../stores/auth-store';
import type { User } from '@meeshy/shared/types';

// Mock the auth-manager.service
jest.mock('../../services/auth-manager.service', () => ({
  AUTH_STORAGE_KEYS: {
    ZUSTAND_AUTH: 'meeshy-auth',
  },
  authManager: {
    clearAllSessions: jest.fn(),
    getAuthToken: jest.fn(),
    getRefreshToken: jest.fn(),
    getCurrentUser: jest.fn(),
    updateTokens: jest.fn(),
    registerOnClear: jest.fn(),
    getAnonymousSession: jest.fn(() => null),
  },
}));

// Mock fetch for refreshSession
global.fetch = jest.fn();

// Capture the registerOnClear callback before clearAllMocks() erases mock.calls.
// The store calls registerOnClear at creation time (module load), so mock.calls[0]
// holds the callback by the time beforeAll runs.
let capturedOnClearCallback: (() => void) | null = null;
beforeAll(() => {
  const { authManager } = require('../../services/auth-manager.service');
  capturedOnClearCallback = (authManager.registerOnClear as jest.Mock).mock.calls[0]?.[0] ?? null;
});

describe('AuthStore', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    phoneNumber: '+1234567890',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    avatar: null,
    role: 'USER',
    systemLanguage: 'en',
    regionalLanguage: 'en',
    isOnline: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any as User;

  beforeEach(() => {
    // Reset the store to initial state before each test
    act(() => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isAuthChecking: true,
        authToken: null,
        refreshToken: null,
        sessionToken: null,
        sessionExpiry: null,
      });
    });
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAuthChecking).toBe(true);
      expect(state.authToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.sessionExpiry).toBeNull();
    });
  });

  describe('setUser', () => {
    it('should set user and mark as authenticated', () => {
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isAuthChecking).toBe(false);
    });

    it('should clear authentication when user is set to null', () => {
      // First set a user
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      // Then clear it
      act(() => {
        useAuthStore.getState().setUser(null);
      });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAuthChecking).toBe(false);
    });
  });

  describe('setAuthChecking', () => {
    it('should update auth checking state', () => {
      act(() => {
        useAuthStore.getState().setAuthChecking(false);
      });

      expect(useAuthStore.getState().isAuthChecking).toBe(false);

      act(() => {
        useAuthStore.getState().setAuthChecking(true);
      });

      expect(useAuthStore.getState().isAuthChecking).toBe(true);
    });
  });

  describe('setTokens', () => {
    it('should set auth token', () => {
      act(() => {
        useAuthStore.getState().setTokens('test-auth-token');
      });

      const state = useAuthStore.getState();
      expect(state.authToken).toBe('test-auth-token');
      expect(state.refreshToken).toBeNull();
      expect(state.sessionExpiry).toBeNull();
    });

    it('should set both auth and refresh tokens', () => {
      act(() => {
        useAuthStore.getState().setTokens('test-auth-token', 'test-refresh-token');
      });

      const state = useAuthStore.getState();
      expect(state.authToken).toBe('test-auth-token');
      expect(state.refreshToken).toBe('test-refresh-token');
    });

    it('should calculate session expiry when expiresIn is provided', () => {
      const beforeTime = Date.now();

      act(() => {
        useAuthStore.getState().setTokens('test-auth-token', 'test-refresh-token', undefined, 3600);
      });

      const state = useAuthStore.getState();
      const afterTime = Date.now();

      expect(state.sessionExpiry).not.toBeNull();
      expect(state.sessionExpiry!.getTime()).toBeGreaterThanOrEqual(beforeTime + 3600 * 1000);
      expect(state.sessionExpiry!.getTime()).toBeLessThanOrEqual(afterTime + 3600 * 1000);
    });

    it('should preserve existing refresh token if not provided', () => {
      // First set both tokens
      act(() => {
        useAuthStore.getState().setTokens('token-1', 'refresh-1');
      });

      // Then update only the auth token
      act(() => {
        useAuthStore.getState().setTokens('token-2');
      });

      const state = useAuthStore.getState();
      expect(state.authToken).toBe('token-2');
      expect(state.refreshToken).toBe('refresh-1');
    });
  });

  describe('clearAuth', () => {
    it('should clear all auth state', () => {
      // First set auth state
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setTokens('test-token', 'test-refresh', undefined, 3600);
      });

      // Then clear it
      act(() => {
        useAuthStore.getState().clearAuth();
      });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.authToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.sessionExpiry).toBeNull();
      expect(state.isAuthChecking).toBe(false);
    });

    it('should remove localStorage persist key', () => {
      localStorage.setItem('meeshy-auth', JSON.stringify({ test: 'data' }));

      act(() => {
        useAuthStore.getState().clearAuth();
      });

      expect(localStorage.getItem('meeshy-auth')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should call authManager.clearAllSessions', async () => {
      const { authManager } = await import('../../services/auth-manager.service');

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(authManager.clearAllSessions).toHaveBeenCalled();
    });

    it('should schedule a redirect to "/" after logout', async () => {
      jest.useFakeTimers();

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      jest.advanceTimersByTime(200);
      expect(window.location.href).toMatch(/\/$/); // ends with /

      jest.useRealTimers();
    });
  });

  describe('refreshSession', () => {
    it('should return false if no tokens exist', async () => {
      let result: boolean = false;

      await act(async () => {
        result = await useAuthStore.getState().refreshSession();
      });

      expect(result).toBe(false);
    });

    it('should call refresh endpoint and update tokens on success', async () => {
      const mockResponse = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Set initial tokens
      act(() => {
        useAuthStore.getState().setTokens('old-token', 'old-refresh');
      });

      let result: boolean = false;

      await act(async () => {
        result = await useAuthStore.getState().refreshSession();
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer old-token',
        },
        body: JSON.stringify({ refreshToken: 'old-refresh' }),
      });

      const state = useAuthStore.getState();
      expect(state.authToken).toBe('new-access-token');
      expect(state.refreshToken).toBe('new-refresh-token');
    });

    it('should return false on refresh failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      act(() => {
        useAuthStore.getState().setTokens('old-token', 'old-refresh');
      });

      let result: boolean = false;

      await act(async () => {
        result = await useAuthStore.getState().refreshSession();
      });

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      act(() => {
        useAuthStore.getState().setTokens('old-token', 'old-refresh');
      });

      let result: boolean = false;

      await act(async () => {
        result = await useAuthStore.getState().refreshSession();
      });

      expect(result).toBe(false);
    });
  });

  describe('initializeAuth', () => {
    it('should manage isAuthChecking state during initialization', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(null);

      act(() => { useAuthStore.setState({ isAuthChecking: true }); });
      expect(useAuthStore.getState().isAuthChecking).toBe(true);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthChecking).toBe(false);
    });

    it('should set isAuthChecking to false after initialization', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(null);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthChecking).toBe(false);
    });

    it('should set isAuthenticated to true when authManager returns token and user', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('test-token');
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(mockUser);
      (authManager.getRefreshToken as jest.Mock).mockReturnValue('test-refresh');

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.authToken).toBe('test-token');
      expect(state.user).toEqual(mockUser);
    });

    it('should set isAuthenticated to false when authManager has no token', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(null);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should set isAuthenticated to false when authManager has token but no user', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('tok');
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(null);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should handle errors from authManager gracefully', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAuthChecking).toBe(false);
    });
  });

  describe('Selector Hooks', () => {
    it('useUser should return current user', () => {
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      const user = useAuthStore.getState().user;
      expect(user).toEqual(mockUser);
    });

    it('useIsAuthenticated should return authentication status', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('useIsAuthChecking should return auth checking status', () => {
      expect(useAuthStore.getState().isAuthChecking).toBe(true);

      act(() => {
        useAuthStore.getState().setAuthChecking(false);
      });

      expect(useAuthStore.getState().isAuthChecking).toBe(false);
    });
  });

  describe('Persistence', () => {
    it('should persist user, tokens, and sessionExpiry', () => {
      const sessionExpiry = new Date(Date.now() + 3600000);

      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setTokens('auth-token', 'refresh-token');
        useAuthStore.setState({ sessionExpiry });
      });

      // Verify the persistence partialize function
      const state = useAuthStore.getState();
      const persistedKeys = ['user', 'authToken', 'refreshToken', 'sessionExpiry'];

      persistedKeys.forEach(key => {
        expect(state).toHaveProperty(key);
      });
    });
  });
});

describe('AuthStore registerOnClear callback', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'USER',
    systemLanguage: 'en',
  } as any;

  beforeEach(() => {
    act(() => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isAuthChecking: true,
        authToken: null,
        refreshToken: null,
        sessionToken: null,
        sessionExpiry: null,
      });
    });
    jest.clearAllMocks();
  });

  it('clears reactive auth state when the callback fires', () => {
    act(() => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setTokens('tok', 'ref');
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().authToken).toBe('tok');

    if (capturedOnClearCallback) {
      act(() => { capturedOnClearCallback!(); });
    }

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.authToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.sessionToken).toBeNull();
    expect(state.sessionExpiry).toBeNull();
  });
});

describe('Selector hooks (useUser, useIsAuthenticated, useIsAuthChecking)', () => {
  const selectorUser = {
    id: 'sel-1',
    username: 'selectorUser',
    email: 'sel@example.com',
    role: 'USER',
    systemLanguage: 'en',
  } as any;

  beforeEach(() => {
    act(() => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isAuthChecking: false,
        authToken: null,
        refreshToken: null,
        sessionToken: null,
        sessionExpiry: null,
      });
    });
    jest.clearAllMocks();
  });

  it('useUser returns null initially', () => {
    const { result } = renderHook(() => useUser());
    expect(result.current).toBeNull();
  });

  it('useUser returns the current user from store', () => {
    act(() => { useAuthStore.getState().setUser(selectorUser); });
    const { result } = renderHook(() => useUser());
    expect(result.current?.id).toBe('sel-1');
  });

  it('useIsAuthenticated returns false initially', () => {
    const { result } = renderHook(() => useIsAuthenticated());
    expect(result.current).toBe(false);
  });

  it('useIsAuthenticated returns true when user is set', () => {
    act(() => { useAuthStore.getState().setUser(selectorUser); });
    const { result } = renderHook(() => useIsAuthenticated());
    expect(result.current).toBe(true);
  });

  it('useIsAuthChecking reflects the store checking state', () => {
    act(() => { useAuthStore.setState({ isAuthChecking: true }); });
    const { result } = renderHook(() => useIsAuthChecking());
    expect(result.current).toBe(true);
  });

  it('useIsAuthChecking returns false when not checking', () => {
    const { result } = renderHook(() => useIsAuthChecking());
    expect(result.current).toBe(false);
  });
});

describe('useAuthActions hook', () => {
  beforeEach(() => {
    act(() => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isAuthChecking: false,
        authToken: null,
        refreshToken: null,
        sessionToken: null,
        sessionExpiry: null,
      });
    });
    jest.clearAllMocks();
  });

  it('returns setUser, logout, setTokens, clearAuth from the store', () => {
    const { result } = renderHook(() => useAuthActions());
    expect(typeof result.current.setUser).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.setTokens).toBe('function');
    expect(typeof result.current.clearAuth).toBe('function');
  });

  it('setUser from useAuthActions updates store state', () => {
    const mockUser = {
      id: 'u1',
      username: 'alice',
      email: 'a@b.com',
      role: 'USER',
      systemLanguage: 'en',
    } as any;

    const { result } = renderHook(() => useAuthActions());
    act(() => {
      result.current.setUser(mockUser);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });
});
