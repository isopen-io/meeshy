import { describe, it, expect } from '@jest/globals';
import { AuthService, TEST_USERS } from '../../../services/AuthTestService';
import { UserRoleEnum } from '@meeshy/shared/types';

describe('AuthTestService', () => {
  describe('authenticate()', () => {
    it('returns the matching user when credentials are correct', () => {
      const user = AuthService.authenticate('alice_fr', 'password123');
      expect(user).not.toBeNull();
      expect(user?.username).toBe('alice_fr');
      expect(user?.email).toBe('alice@meeshy.me');
    });

    it('returns null when the password is wrong', () => {
      const user = AuthService.authenticate('alice_fr', 'wrongpassword');
      expect(user).toBeNull();
    });

    it('returns null when the username does not exist', () => {
      const user = AuthService.authenticate('nonexistent_user', 'password123');
      expect(user).toBeNull();
    });
  });

  describe('authenticateById()', () => {
    it('returns the matching user when the id exists', () => {
      const user = AuthService.authenticateById('alice_fr_id');
      expect(user).not.toBeNull();
      expect(user?.username).toBe('alice_fr');
    });

    it('returns null when the id does not exist', () => {
      const user = AuthService.authenticateById('unknown_id');
      expect(user).toBeNull();
    });
  });

  describe('generateToken()', () => {
    it('returns a base64 string that decodes to the correct shape', () => {
      const user = TEST_USERS.find(u => u.username === 'alice_fr')!;
      const token = AuthService.generateToken(user);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      expect(decoded.userId).toBe(user.id);
      expect(decoded.username).toBe(user.username);
      expect(decoded.email).toBe(user.email);
      expect(decoded.role).toBe(user.role);
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('verifyToken()', () => {
    it('returns payload when the token is valid', () => {
      const user = TEST_USERS.find(u => u.username === 'bob_en')!;
      const token = AuthService.generateToken(user);
      const payload = AuthService.verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(user.id);
      expect(payload?.username).toBe(user.username);
      expect(payload?.email).toBe(user.email);
      expect(payload?.role).toBe(user.role);
    });

    it('returns null when the token is not valid base64 JSON', () => {
      const payload = AuthService.verifyToken('not-valid-base64!!!');
      expect(payload).toBeNull();
    });

    it('returns null when the token is expired', () => {
      const user = TEST_USERS.find(u => u.username === 'alice_fr')!;
      const expiredPayload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };
      const expiredToken = Buffer.from(JSON.stringify(expiredPayload)).toString('base64');

      const result = AuthService.verifyToken(expiredToken);
      expect(result).toBeNull();
    });
  });

  describe('getAllUsers()', () => {
    it('returns all users with password masked as "***"', () => {
      const users = AuthService.getAllUsers();

      expect(users.length).toBe(TEST_USERS.length);
      for (const user of users) {
        expect(user.password).toBe('***');
      }
    });

    it('does not expose original passwords', () => {
      const users = AuthService.getAllUsers();
      const hasRealPassword = users.some(u => u.password !== '***');
      expect(hasRealPassword).toBe(false);
    });
  });

  describe('getUserByUsername()', () => {
    it('returns the user when the username exists', () => {
      const user = AuthService.getUserByUsername('carlos_es');
      expect(user).not.toBeNull();
      expect(user?.id).toBe('carlos_es_id');
    });

    it('returns null when the username does not exist', () => {
      const user = AuthService.getUserByUsername('nobody');
      expect(user).toBeNull();
    });
  });

  describe('getUserById()', () => {
    it('returns the user when the id exists', () => {
      const user = AuthService.getUserById('bob_en_id');
      expect(user).not.toBeNull();
      expect(user?.username).toBe('bob_en');
    });

    it('returns null when the id does not exist', () => {
      const user = AuthService.getUserById('ghost_id');
      expect(user).toBeNull();
    });
  });

  describe('UserRoleEnum integration', () => {
    it('TEST_USERS contains users with recognised roles', () => {
      const roles = TEST_USERS.map(u => u.role);
      for (const role of roles) {
        expect(Object.values(UserRoleEnum)).toContain(role);
      }
    });
  });
});
