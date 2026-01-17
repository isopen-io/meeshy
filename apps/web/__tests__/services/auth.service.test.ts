/**
 * Tests for AuthService
 *
 * Tests authentication flow including login, logout, getCurrentUser, and refreshToken
 */

// Create mock functions
let mockSetCredentials = jest.fn();
let mockClearAllSessions = jest.fn();
let mockGetAuthToken = jest.fn();
let mockGetRefreshToken = jest.fn();
let mockUpdateUser = jest.fn();
let mockUpdateTokens = jest.fn();

// Mock modules BEFORE importing the service
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    setCredentials: (...args: any[]) => mockSetCredentials(...args),
    clearAllSessions: (...args: any[]) => mockClearAllSessions(...args),
    getAuthToken: (...args: any[]) => mockGetAuthToken(...args),
    getRefreshToken: (...args: any[]) => mockGetRefreshToken(...args),
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

    const mockLoginResponse = {
      success: true,
      data: {
        user: mockUser,
        token: 'jwt-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 3600,
      },
    };

    it('should successfully login and set credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockLoginResponse),
      });

      const result = await authService.login('testuser', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'testuser', password: 'password123' }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data?.user).toEqual(mockUser);
      expect(mockSetCredentials).toHaveBeenCalledWith(
        mockUser,
        'jwt-token-123',
        'refresh-token-123',
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
        'https://gate.meeshy.me/auth/logout',
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
        'https://gate.meeshy.me/auth/me',
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
    const mockRefreshResponse = {
      success: true,
      data: {
        token: 'new-jwt-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      },
    };

    it('should refresh token successfully', async () => {
      mockGetAuthToken.mockReturnValue('old-jwt-token');
      mockGetRefreshToken.mockReturnValue('old-refresh-token');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockRefreshResponse),
      });

      const result = await authService.refreshToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'old-jwt-token',
            refreshToken: 'old-refresh-token',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(mockUpdateTokens).toHaveBeenCalledWith(
        'new-jwt-token',
        'new-refresh-token',
        3600
      );
    });

    it('should return error when no tokens available', async () => {
      mockGetAuthToken.mockReturnValue(null);
      mockGetRefreshToken.mockReturnValue(null);

      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Aucun token à rafraîchir");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle failed refresh', async () => {
      mockGetAuthToken.mockReturnValue('old-jwt-token');
      mockGetRefreshToken.mockReturnValue('old-refresh-token');
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
      mockGetRefreshToken.mockReturnValue('old-refresh-token');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur de connexion au serveur');
    });

    it('should work with only auth token (no refresh token)', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token');
      mockGetRefreshToken.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockRefreshResponse),
      });

      const result = await authService.refreshToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/auth/refresh',
        expect.objectContaining({
          body: JSON.stringify({
            token: 'jwt-token',
            refreshToken: null,
          }),
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
