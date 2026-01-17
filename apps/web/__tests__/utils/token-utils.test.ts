/**
 * Tests for token-utils utility
 */

import {
  getAuthToken,
  getTokenType,
  createAuthHeaders,
  isAuthenticated,
  isAnonymousUser,
} from '../../utils/token-utils';

// Mock authManager
jest.mock('../../services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(),
    getAnonymousSession: jest.fn(),
  },
}));

describe('token-utils', () => {
  const { authManager } = require('../../services/auth-manager.service');

  beforeEach(() => {
    authManager.getAuthToken.mockReset();
    authManager.getAnonymousSession.mockReset();
  });

  describe('getAuthToken', () => {
    it('should return auth token info when auth token exists', () => {
      authManager.getAuthToken.mockReturnValue('auth-token-123');
      authManager.getAnonymousSession.mockReturnValue(null);

      const result = getAuthToken();

      expect(result).not.toBeNull();
      expect(result?.value).toBe('auth-token-123');
      expect(result?.type).toBe('auth');
      expect(result?.header.name).toBe('Authorization');
      expect(result?.header.value).toBe('Bearer auth-token-123');
    });

    it('should return anonymous token info when only anonymous session exists', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token-456' });

      const result = getAuthToken();

      expect(result).not.toBeNull();
      expect(result?.value).toBe('anon-token-456');
      expect(result?.type).toBe('anonymous');
      expect(result?.header.name).toBe('X-Session-Token');
      expect(result?.header.value).toBe('anon-token-456');
    });

    it('should prioritize auth token over anonymous token', () => {
      authManager.getAuthToken.mockReturnValue('auth-token');
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      const result = getAuthToken();

      expect(result?.type).toBe('auth');
      expect(result?.value).toBe('auth-token');
    });

    it('should return null when no tokens exist', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue(null);

      const result = getAuthToken();

      expect(result).toBeNull();
    });

    it('should return null when anonymous session has no token', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue({});

      const result = getAuthToken();

      expect(result).toBeNull();
    });
  });

  describe('getTokenType', () => {
    it('should return anonymous for matching anonymous token', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      const result = getTokenType('anon-token');

      expect(result).toBe('anonymous');
    });

    it('should return auth for matching auth token', () => {
      authManager.getAuthToken.mockReturnValue('auth-token');
      authManager.getAnonymousSession.mockReturnValue(null);

      const result = getTokenType('auth-token');

      expect(result).toBe('auth');
    });

    it('should return auth as default for unknown token', () => {
      authManager.getAuthToken.mockReturnValue('auth-token');
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      const result = getTokenType('unknown-token');

      expect(result).toBe('auth');
    });

    it('should return null for empty string', () => {
      const result = getTokenType('');
      expect(result).toBeNull();
    });

    it('should return null for falsy value', () => {
      const result = getTokenType(null as any);
      expect(result).toBeNull();
    });
  });

  describe('createAuthHeaders', () => {
    it('should create Bearer header for auth token', () => {
      authManager.getAuthToken.mockReturnValue('auth-token');
      authManager.getAnonymousSession.mockReturnValue(null);

      const headers = createAuthHeaders('auth-token');

      expect(headers).toEqual({
        'Authorization': 'Bearer auth-token',
      });
    });

    it('should create X-Session-Token header for anonymous token', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      const headers = createAuthHeaders('anon-token');

      expect(headers).toEqual({
        'X-Session-Token': 'anon-token',
      });
    });

    it('should use current token info when no token provided', () => {
      authManager.getAuthToken.mockReturnValue('current-auth-token');
      authManager.getAnonymousSession.mockReturnValue(null);

      const headers = createAuthHeaders();

      expect(headers).toEqual({
        'Authorization': 'Bearer current-auth-token',
      });
    });

    it('should return empty object when no token and no current token', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue(null);

      const headers = createAuthHeaders();

      expect(headers).toEqual({});
    });

    it('should use anonymous header when only anonymous token exists', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-only' });

      const headers = createAuthHeaders();

      expect(headers).toEqual({
        'X-Session-Token': 'anon-only',
      });
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when auth token exists', () => {
      authManager.getAuthToken.mockReturnValue('auth-token');
      authManager.getAnonymousSession.mockReturnValue(null);

      expect(isAuthenticated()).toBe(true);
    });

    it('should return true when anonymous token exists', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      expect(isAuthenticated()).toBe(true);
    });

    it('should return false when no tokens exist', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue(null);

      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('isAnonymousUser', () => {
    it('should return true when only anonymous token exists', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      expect(isAnonymousUser()).toBe(true);
    });

    it('should return false when auth token exists', () => {
      authManager.getAuthToken.mockReturnValue('auth-token');
      authManager.getAnonymousSession.mockReturnValue(null);

      expect(isAnonymousUser()).toBe(false);
    });

    it('should return false when auth token has priority over anonymous', () => {
      authManager.getAuthToken.mockReturnValue('auth-token');
      authManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      expect(isAnonymousUser()).toBe(false);
    });

    it('should return false when no tokens exist', () => {
      authManager.getAuthToken.mockReturnValue(null);
      authManager.getAnonymousSession.mockReturnValue(null);

      expect(isAnonymousUser()).toBe(false);
    });
  });
});
