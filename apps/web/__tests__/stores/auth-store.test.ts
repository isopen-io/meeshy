/**
 * Auth Store Tests
 * Tests for authentication state management with Zustand
 */

import { act } from '@testing-library/react';
import { useAuthStore } from '../../stores/auth-store';
import { buildApiUrl } from '../../lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import type { User } from '@meeshy/shared/types';

// Mock the auth-manager.service
// `getRefreshToken` n'existe plus (#4405, étape 3) — le store ne le
// consulte plus dans `initializeAuth()`, et le retirer du mock l'aligne
// sur la surface RÉELLE d'AuthManager.
jest.mock('../../services/auth-manager.service', () => ({
  authManager: {
    clearAllSessions: jest.fn(),
    getAuthToken: jest.fn(() => null),
    registerOnClear: jest.fn(),
    getAnonymousSession: jest.fn(() => null),
    updateTokens: jest.fn(),
    getCurrentUser: jest.fn(() => null),
  },
}));

// Mock the constants/auth module
jest.mock('../../constants/auth', () => ({
  AUTH_STORAGE_KEYS: {
    ZUSTAND_AUTH: 'meeshy-auth',
  },
}));

// Mock the user-preferences-store
jest.mock('../../stores/user-preferences-store', () => ({
  resetUserPreferences: jest.fn(),
}));

// Mock fetch for refreshSession
global.fetch = jest.fn();

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
      expect(state.sessionExpiry).toBeNull();
      // Le champ d'état réactif `refreshToken` a été retiré (#4405, étape 3)
      // — rien ne produisait jamais de valeur pour lui (mesuré).
      expect(state).not.toHaveProperty('refreshToken');
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
        useAuthStore.getState().setTokens({ authToken: 'test-auth-token' });
      });

      const state = useAuthStore.getState();
      expect(state.authToken).toBe('test-auth-token');
      expect(state.sessionExpiry).toBeNull();
    });

    // Le champ `refreshToken` reste ACCEPTÉ (nommé, #4491 — objet nommé,
    // miroir de #4450 sur `setCredentials`) mais n'a plus de contrepartie en
    // état réactif (#4405, étape 3) : rien ne produisait jamais de valeur
    // pour lui (mesuré). Une valeur qui y transite ne doit apparaître NULLE
    // PART dans l'état.
    it('drops the (now inert) refreshToken field — it never surfaces in state', () => {
      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'test-auth-token', refreshToken: 'legacy-value-that-must-be-dropped' });
      });

      const state = useAuthStore.getState();
      expect(state.authToken).toBe('test-auth-token');
      expect(state).not.toHaveProperty('refreshToken');
    });

    it('should calculate session expiry when expiresIn is provided', () => {
      const beforeTime = Date.now();

      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'test-auth-token', expiresIn: 3600 });
      });

      const state = useAuthStore.getState();
      const afterTime = Date.now();

      expect(state.sessionExpiry).not.toBeNull();
      expect(state.sessionExpiry!.getTime()).toBeGreaterThanOrEqual(beforeTime + 3600 * 1000);
      expect(state.sessionExpiry!.getTime()).toBeLessThanOrEqual(afterTime + 3600 * 1000);
    });

    // Miroir de l'ancien "should preserve existing refresh token if not
    // provided" (#4405) : le champ `refreshToken` a disparu, mais le MÊME
    // mécanisme de repli (`sessionToken || get().sessionToken`) reste vivant
    // pour `sessionToken` — c'est lui qui garde la couverture de cette logique.
    it('should preserve existing session token if not provided', () => {
      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'token-1', sessionToken: 'session-1' });
      });

      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'token-2' });
      });

      const state = useAuthStore.getState();
      expect(state.authToken).toBe('token-2');
      expect(state.sessionToken).toBe('session-1');
    });
  });

  describe('clearAuth', () => {
    it('should clear all auth state', () => {
      // First set auth state
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setTokens({ authToken: 'test-token', refreshToken: 'test-refresh', expiresIn: 3600 });
      });

      // Then clear it
      act(() => {
        useAuthStore.getState().clearAuth();
      });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.authToken).toBeNull();
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

    it('should call clearAllSessions on logout', async () => {
      const { authManager } = await import('../../services/auth-manager.service');

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(authManager.clearAllSessions).toHaveBeenCalled();
    });
  });

  describe('refreshSession', () => {
    it('should return false and never call fetch when no authToken exists', async () => {
      let result: boolean = false;

      await act(async () => {
        result = await useAuthStore.getState().refreshSession();
      });

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // #4338 — le bug mesuré : `refreshSession` postait `fetch('/api/auth/refresh', …)`
    // À LA MAIN, un chemin RELATIF sans `/v1` qui frappe le serveur Next (aucune
    // route `app/api/auth/refresh` n'existe) plutôt que le gateway. La correction
    // fait passer le store par `authService.refreshToken()` — déjà câblé sur
    // `buildApiUrl(API_ENDPOINTS.auth.refresh)` — au lieu de dupliquer un second
    // `fetch`. Ce témoin assert sur l'URL RÉELLEMENT passée à `fetch`, calculée par
    // le MÊME catalogue partagé que la production, jamais un littéral recopié.
    it("vise l'adresse SERVIE (catalogue partagé + gateway), jamais un chemin relatif du serveur Next", async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('manager-jwt');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: { token: 'new-jwt', expiresIn: 3600 },
        }),
      });

      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'store-jwt' });
      });

      await act(async () => {
        await useAuthStore.getState().refreshSession();
      });

      const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0] ?? [];
      expect(calledUrl).toBe(buildApiUrl(API_ENDPOINTS.auth.refresh));
    });

    // Le schéma serveur (`AuthSchemas.refreshToken`,
    // services/gateway/src/routes/auth/magic-link.ts) exige `token` et n'a AUCUN
    // champ `refreshToken` — le corps que l'ancien store envoyait
    // (`{ refreshToken }`, sans `token`) aurait été refusé (400, `token` manquant).
    // `sessionToken` est le nom réel du second champ, optionnel.
    it("envoie le corps que /auth/refresh exige (token requis, sessionToken optionnel — jamais 'refreshToken')", async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('manager-jwt');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: { token: 'new-jwt', sessionToken: 'same-session-token', expiresIn: 3600 },
        }),
      });

      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'store-jwt', sessionToken: 'store-session-token' });
      });

      await act(async () => {
        await useAuthStore.getState().refreshSession();
      });

      const [, calledInit] = (global.fetch as jest.Mock).mock.calls[0] ?? [];
      expect(JSON.parse((calledInit as RequestInit).body as string)).toEqual({
        token: 'manager-jwt',
        sessionToken: 'store-session-token',
      });
    });

    it('should update authToken and sessionToken and return true on successful refresh', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('manager-jwt');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: { token: 'new-jwt', sessionToken: 'same-session-token', expiresIn: 3600 },
        }),
      });

      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'store-jwt' });
      });

      let result: boolean = false;

      await act(async () => {
        result = await useAuthStore.getState().refreshSession();
      });

      expect(result).toBe(true);
      const state = useAuthStore.getState();
      expect(state.authToken).toBe('new-jwt');
      expect(state.sessionToken).toBe('same-session-token');
    });

    it('should return false when the server refuses the refresh', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('manager-jwt');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: false,
          error: 'Session révoquée — veuillez vous reconnecter',
        }),
      });

      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'store-jwt' });
      });

      let result: boolean = false;

      await act(async () => {
        result = await useAuthStore.getState().refreshSession();
      });

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('manager-jwt');
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      act(() => {
        useAuthStore.getState().setTokens({ authToken: 'store-jwt' });
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
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue('test-token');
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(mockUser);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should set isAuthenticated to false if no token', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(null);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should set isAuthenticated to false if authManager has no token', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);
      (authManager.getCurrentUser as jest.Mock).mockReturnValue(null);

      await act(async () => {
        await useAuthStore.getState().initializeAuth();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should set isAuthenticated to false if authManager throws', async () => {
      const { authManager } = await import('../../services/auth-manager.service');
      (authManager.getAuthToken as jest.Mock).mockImplementation(() => {
        throw new Error('Auth error');
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
    it('should persist user, authToken, sessionToken, and sessionExpiry', () => {
      const sessionExpiry = new Date(Date.now() + 3600000);

      act(() => {
        useAuthStore.getState().setUser(mockUser);
        // Le champ `refreshToken` (désormais inerte, #4405 ; nommé depuis
        // #4491) ne doit atterrir NULLE PART — ni en état, ni dans ce que
        // `partialize` retient pour la persistance.
        useAuthStore.getState().setTokens({ authToken: 'auth-token', refreshToken: 'legacy-refresh-slot-value' });
        useAuthStore.setState({ sessionExpiry });
      });

      // Verify the persistence partialize function
      const state = useAuthStore.getState();
      const persistedKeys = ['user', 'authToken', 'sessionToken', 'sessionExpiry'];

      persistedKeys.forEach(key => {
        expect(state).toHaveProperty(key);
      });
      expect(state).not.toHaveProperty('refreshToken');
    });
  });
});
