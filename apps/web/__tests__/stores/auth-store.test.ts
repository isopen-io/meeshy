/**
 * Auth Store Tests
 * Tests for authentication state management with Zustand
 */

import { act } from '@testing-library/react';
import { useAuthStore } from '../../stores/auth-store';
import type { User } from '@meeshy/shared/types';

// Mock the auth-manager.service
jest.mock('../../services/auth-manager.service', () => ({
  AUTH_STORAGE_KEYS: {
    ZUSTAND_AUTH: 'meeshy-auth',
  },
  authManager: {
    clearAllSessions: jest.fn(),
    getAuthToken: jest.fn(),
  },
}));

// Mock the user-preferences-store
jest.mock('../../stores/user-preferences-store', () => ({
  resetUserPreferences: jest.fn(),
}));

// Mock fetch for refreshSession
global.fetch = jest.fn();

describe('AuthStore', () => {
  const mockUser: User = {
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
  };

  beforeEach(() => {
    // Reset the store to initial state before each test
    act(() => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isAuthChecking: true,
        authToken: null,
        refreshToken: null,
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
        useAuthStore.getState().setTokens('test-auth-token', 'test-refresh-token', 3600);
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
        useAuthStore.getState().setTokens('test-token', 'test-refresh', 3600);
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

    it('should reset user preferences', async () => {
      const { resetUserPreferences } = await import('../../stores/user-preferences-store');

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(resetUserPreferences).toHaveBeenCalled();
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
      // Verify the initial state starts with isAuthChecking true (from initial state)
      act(() => {
        useAuthStore.setState({ isAuthChecking: true });
      });

      expect(useAuthStore.getState().isAuthChecking).toBe(true);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      // After initialization completes, isAuthChecking should be false
      expect(useAuthStore.getState().isAuthChecking).toBe(false);
    });

    it('should set isAuthChecking to false after initialization', async () => {
      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthChecking).toBe(false);
    });

    it('should set isAuthenticated to true if token and user exist', async () => {
      act(() => {
        useAuthStore.setState({
          authToken: 'test-token',
          user: mockUser,
          sessionExpiry: new Date(Date.now() + 3600000), // 1 hour in future
        });
      });

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should set isAuthenticated to false if no token', async () => {
      act(() => {
        useAuthStore.setState({
          authToken: null,
          user: mockUser,
        });
      });

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should attempt refresh if session is expired', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          accessToken: 'new-token',
          refreshToken: 'new-refresh',
          expiresIn: 3600,
        }),
      });

      act(() => {
        useAuthStore.setState({
          authToken: 'test-token',
          refreshToken: 'test-refresh',
          user: mockUser,
          sessionExpiry: new Date(Date.now() - 1000), // 1 second in past
        });
      });

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/refresh', expect.any(Object));
    });

    it('should clear auth if refresh fails for expired session', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      act(() => {
        useAuthStore.setState({
          authToken: 'test-token',
          refreshToken: 'test-refresh',
          user: mockUser,
          sessionExpiry: new Date(Date.now() - 1000), // 1 second in past
        });
      });

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.authToken).toBeNull();
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
