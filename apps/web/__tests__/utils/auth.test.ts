/**
 * Tests for auth utility
 */

import {
  isValidJWTFormat,
  isUserAnonymous,
  canAccessProtectedRoute,
  canAccessSharedConversation,
  redirectToAuth,
  redirectToHome,
  AuthState,
} from '../../utils/auth';

// Mock authManager
jest.mock('../../services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(),
    getAnonymousSession: jest.fn(),
    getCurrentUser: jest.fn(),
    clearAllSessions: jest.fn(),
    clearAnonymousSessions: jest.fn(),
  },
}));

describe('auth', () => {
  describe('isValidJWTFormat', () => {
    it('should return true for valid JWT format', () => {
      // A valid JWT has 3 base64 parts separated by dots
      const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(isValidJWTFormat(validJWT)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidJWTFormat('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidJWTFormat(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidJWTFormat(undefined as any)).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(isValidJWTFormat(123 as any)).toBe(false);
    });

    it('should return false for JWT with only 2 parts', () => {
      expect(isValidJWTFormat('part1.part2')).toBe(false);
    });

    it('should return false for JWT with 4 parts', () => {
      expect(isValidJWTFormat('part1.part2.part3.part4')).toBe(false);
    });

    it('should return false for JWT with empty parts', () => {
      expect(isValidJWTFormat('...')).toBe(false);
    });

    it('should return false for JWT with invalid base64', () => {
      expect(isValidJWTFormat('invalid!!!.base64@@@.characters###')).toBe(false);
    });

    it('should handle JWT with URL-safe base64 characters', () => {
      // JWT uses URL-safe base64 which may contain - and _
      const jwtWithUrlSafe = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      expect(isValidJWTFormat(jwtWithUrlSafe)).toBe(true);
    });
  });

  describe('isUserAnonymous', () => {
    const { authManager } = require('../../services/auth-manager.service');

    beforeEach(() => {
      authManager.getAnonymousSession.mockReset();
    });

    it('should return false for null user', () => {
      expect(isUserAnonymous(null)).toBe(false);
    });

    it('should return true for user with sessionToken property', () => {
      const user = { id: '123', sessionToken: 'token123' } as any;
      expect(isUserAnonymous(user)).toBe(true);
    });

    it('should return true for user with shareLinkId property', () => {
      const user = { id: '123', shareLinkId: 'link123' } as any;
      expect(isUserAnonymous(user)).toBe(true);
    });

    it('should return true for user with isAnonymous property', () => {
      const user = { id: '123', isAnonymous: true } as any;
      expect(isUserAnonymous(user)).toBe(true);
    });

    it('should return true if authManager has anonymous token', () => {
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });
      const user = { id: '123' } as any;
      expect(isUserAnonymous(user)).toBe(true);
    });

    it('should return true for user with anon_ prefix in id', () => {
      const user = { id: 'anon_12345' } as any;
      expect(isUserAnonymous(user)).toBe(true);
    });

    it('should return true for user with anonymous in id', () => {
      const user = { id: 'user_anonymous_123' } as any;
      expect(isUserAnonymous(user)).toBe(true);
    });

    it('should return true for user with long id (> 20 chars)', () => {
      const user = { id: 'a'.repeat(21) } as any;
      expect(isUserAnonymous(user)).toBe(true);
    });

    it('should return false for regular user', () => {
      authManager.getAnonymousSession.mockReturnValue(null);
      const user = { id: '12345678901234567890' } as any; // Exactly 20 chars
      expect(isUserAnonymous(user)).toBe(false);
    });
  });

  describe('canAccessProtectedRoute', () => {
    it('should return true when authenticated and not checking', () => {
      const authState: AuthState = {
        isAuthenticated: true,
        user: { id: '1' } as any,
        token: 'token',
        isChecking: false,
        isAnonymous: false,
      };
      expect(canAccessProtectedRoute(authState)).toBe(true);
    });

    it('should return false when not authenticated', () => {
      const authState: AuthState = {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false,
      };
      expect(canAccessProtectedRoute(authState)).toBe(false);
    });

    it('should return false when still checking', () => {
      const authState: AuthState = {
        isAuthenticated: true,
        user: { id: '1' } as any,
        token: 'token',
        isChecking: true,
        isAnonymous: false,
      };
      expect(canAccessProtectedRoute(authState)).toBe(false);
    });

    it('should return false when both not authenticated and checking', () => {
      const authState: AuthState = {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: true,
        isAnonymous: false,
      };
      expect(canAccessProtectedRoute(authState)).toBe(false);
    });
  });

  describe('canAccessSharedConversation', () => {
    it('should return true when authenticated', () => {
      const authState: AuthState = {
        isAuthenticated: true,
        user: { id: '1' } as any,
        token: 'token',
        isChecking: false,
        isAnonymous: false,
      };
      expect(canAccessSharedConversation(authState)).toBe(true);
    });

    it('should return true when anonymous', () => {
      const authState: AuthState = {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: true,
      };
      expect(canAccessSharedConversation(authState)).toBe(true);
    });

    it('should return true when both authenticated and anonymous', () => {
      const authState: AuthState = {
        isAuthenticated: true,
        user: { id: '1' } as any,
        token: 'token',
        isChecking: false,
        isAnonymous: true,
      };
      expect(canAccessSharedConversation(authState)).toBe(true);
    });

    it('should return false when neither authenticated nor anonymous', () => {
      const authState: AuthState = {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false,
      };
      expect(canAccessSharedConversation(authState)).toBe(false);
    });

    it('should return false when still checking', () => {
      const authState: AuthState = {
        isAuthenticated: true,
        user: { id: '1' } as any,
        token: 'token',
        isChecking: true,
        isAnonymous: false,
      };
      expect(canAccessSharedConversation(authState)).toBe(false);
    });
  });

  describe('redirectToAuth', () => {
    // Note: jsdom does not allow redefining window.location
    // These tests verify the function exists and is callable
    // Actual navigation behavior is tested in integration tests

    it('should be a function', () => {
      expect(typeof redirectToAuth).toBe('function');
    });

    it('should accept optional returnUrl parameter', () => {
      // Function has 0-1 parameters (optional)
      expect(redirectToAuth.length).toBeLessThanOrEqual(1);
    });
  });

  describe('redirectToHome', () => {
    it('should be a function', () => {
      expect(typeof redirectToHome).toBe('function');
    });

    it('should take no parameters', () => {
      expect(redirectToHome.length).toBe(0);
    });
  });
});
