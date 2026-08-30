/**
 * Tests for AuthService
 *
 * Tests authentication flow including login, logout, getCurrentUser, and refreshToken
 */

// Create mock functions
let mockSetCredentials = jest.fn();
let mockClearAllSessions = jest.fn();
let mockGetAuthToken = jest.fn();
let mockUpdateUser = jest.fn();
let mockUpdateTokens = jest.fn();

// Mock modules BEFORE importing the service
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    setCredentials: (...args: any[]) => mockSetCredentials(...args),
    clearAllSessions: (...args: any[]) => mockClearAllSessions(...args),
    getAuthToken: (...args: any[]) => mockGetAuthToken(...args),
    updateUser: (...args: any[]) => mockUpdateUser(...args),
    updateTokens: (...args: any[]) => mockUpdateTokens(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `https://gate.meeshy.me${path}`),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { authService, AuthResponse, UserProfileResponse } from '@/services/auth.service';

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('login', () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      systemLanguage: 'fr',
      regionalLanguage: 'fr',
      isOnline: true,
    };

    // Forme RÉELLE de POST /auth/login (`services/gateway/src/routes/auth/login.ts`,
    // branche hors-2FA) : `{ user, token, sessionToken, session, expiresIn }`.
    // AUCUN champ `refreshToken` — mesuré, #4405. `sessionToken` est un jeton
    // distinct de `expiresIn` (un nombre) : les confondre est exactement le
    // défaut de #4404.
    const mockLoginResponse = {
      success: true,
      data: {
        user: mockUser,
        token: 'jwt-token-123',
        sessionToken: 'session-token-123',
        expiresIn: 3600,
      },
    };

    it('should successfully login and set credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockLoginResponse),
      });

      const result = await authService.login('testuser', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/api/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'testuser', password: 'password123' }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data?.user).toEqual(mockUser);
      // setCredentials(user, authToken, refreshToken?, sessionToken?, expiresIn?)
      // — cinq créneaux. `refreshToken` est `undefined` : la route ne le rend
      // jamais (#4405), et #4404 interdit de l'inventer. `sessionToken` DOIT
      // atterrir dans SON propre créneau (le troisième), jamais dans celui
      // d'`expiresIn` — c'est le défaut mesuré sur ce site précis.
      expect(mockSetCredentials).toHaveBeenCalledWith(
        mockUser,
        'jwt-token-123',
        undefined,
        'session-token-123',
        3600
      );
    });

    // Le concept `refreshToken` n'est pas retiré par #4404 (c'est #4405) : s'il
    // arrivait un jour du serveur, il doit toujours atterrir dans SON créneau —
    // jamais perdu, jamais glissé ailleurs.
    it('threads a refreshToken through to its own slot when the server does send one', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: { ...mockLoginResponse.data, refreshToken: 'refresh-token-123' },
        }),
      });

      await authService.login('testuser', 'password123');

      expect(mockSetCredentials).toHaveBeenCalledWith(
        mockUser,
        'jwt-token-123',
        'refresh-token-123',
        'session-token-123',
        3600
      );
    });

    it('should handle login failure and clear sessions', async () => {
      const failedResponse = {
        success: false,
        error: 'Invalid credentials',
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(failedResponse),
      });

      const result = await authService.login('wronguser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(mockClearAllSessions).toHaveBeenCalled();
      expect(mockSetCredentials).not.toHaveBeenCalled();
    });

    it('should handle network error during login', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.login('testuser', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur de connexion au serveur');
      expect(mockClearAllSessions).toHaveBeenCalled();
    });

    it('should handle login response without token', async () => {
      const responseWithoutToken = {
        success: true,
        data: {
          user: mockUser,
          // No token provided
        },
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(responseWithoutToken),
      });

      const result = await authService.login('testuser', 'password123');

      expect(result.success).toBe(true);
      expect(mockClearAllSessions).toHaveBeenCalled();
      expect(mockSetCredentials).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout user and clear sessions', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token-123');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      await authService.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/api/v1/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer jwt-token-123',
          }),
        })
      );
      expect(mockClearAllSessions).toHaveBeenCalled();
    });

    it('should clear sessions even if logout API call fails', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token-123');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await authService.logout();

      expect(mockClearAllSessions).toHaveBeenCalled();
    });

    it('should clear sessions even without auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);

      await authService.logout();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockClearAllSessions).toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    const mockUserProfile = {
      success: true,
      data: {
        user: {
          id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
        },
        permissions: {
          canAccessAdmin: false,
          canManageUsers: false,
        },
      },
    };

    it('should fetch current user profile', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token-123');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockUserProfile),
      });

      const result = await authService.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/api/v1/auth/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer jwt-token-123',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data?.user.username).toBe('testuser');
      expect(mockUpdateUser).toHaveBeenCalledWith(mockUserProfile.data.user);
    });

    it('should return error when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);

      const result = await authService.getCurrentUser();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Aucun token d'authentification");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle network error', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token-123');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.getCurrentUser();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur de connexion au serveur');
    });

    it('should not update user when response fails', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token-123');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: false,
          error: 'Unauthorized',
        }),
      });

      const result = await authService.getCurrentUser();

      expect(result.success).toBe(false);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    // Le schéma serveur de POST /api/v1/auth/refresh (`AuthSchemas.refreshToken`,
    // services/gateway/src/routes/auth/magic-link.ts) n'a QUE deux champs :
    // `token` (le JWT, REQUIS) et `sessionToken` (le jeton de session longue
    // durée du login, optionnel — active le renouvellement à fenêtre glissante).
    // Il n'y a AUCUN champ `refreshToken` dans ce schéma, et la route ne lit
    // jamais l'en-tête `Authorization` (`security: []`, aucun hook d'auth monté
    // sur cette route — vérifié : aucune référence à `request.headers.authorization`
    // dans magic-link.ts).
    const mockRefreshResponse = {
      success: true,
      data: {
        token: 'new-jwt-token',
        sessionToken: 'new-session-token',
        expiresIn: 3600,
      },
    };

    it('should refresh token successfully, sending the session token the caller holds', async () => {
      mockGetAuthToken.mockReturnValue('old-jwt-token');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockRefreshResponse),
      });

      const result = await authService.refreshToken('caller-session-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/api/v1/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: 'old-jwt-token',
            sessionToken: 'caller-session-token',
          }),
        })
      );
      expect(result.success).toBe(true);
      // `updateTokens(authToken, refreshToken, sessionToken, expiresIn)` — le
      // serveur ne rend JAMAIS de `refreshToken` (absent de son schéma) ; le
      // `sessionToken` qu'il rend (même valeur, TTL glissé côté serveur) doit
      // atterrir dans SON propre créneau, le troisième — jamais dans le second
      // (c'est exactement le bug que le commentaire d'origine documentait :
      // « passé troisième il était écrit comme session anonyme »).
      expect(mockUpdateTokens).toHaveBeenCalledWith(
        'new-jwt-token',
        undefined,
        'new-session-token',
        3600
      );
    });

    it('should return error when no auth token is available — a sessionToken alone is never enough', async () => {
      mockGetAuthToken.mockReturnValue(null);

      const result = await authService.refreshToken('a-session-token-with-no-jwt');

      expect(result.success).toBe(false);
      expect(result.error).toBe("Aucun token à rafraîchir");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle failed refresh', async () => {
      mockGetAuthToken.mockReturnValue('old-jwt-token');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: false,
          error: 'Invalid refresh token',
        }),
      });

      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
      expect(mockUpdateTokens).not.toHaveBeenCalled();
    });

    it('should handle network error during refresh', async () => {
      mockGetAuthToken.mockReturnValue('old-jwt-token');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur de connexion au serveur');
    });

    it('should work with only the auth token — no sessionToken key sent when none is passed', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockRefreshResponse),
      });

      const result = await authService.refreshToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/api/v1/auth/refresh',
        expect.objectContaining({
          body: JSON.stringify({ token: 'jwt-token' }),
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Singleton pattern', () => {
    it('should return the same instance', () => {
      // AuthService uses singleton pattern via getInstance
      // The exported authService should be the same instance
      expect(authService).toBeDefined();

      // Since it's a private constructor singleton, we can only verify
      // that the instance exists and has expected methods
      expect(typeof authService.login).toBe('function');
      expect(typeof authService.logout).toBe('function');
      expect(typeof authService.getCurrentUser).toBe('function');
      expect(typeof authService.refreshToken).toBe('function');
    });
  });
});
