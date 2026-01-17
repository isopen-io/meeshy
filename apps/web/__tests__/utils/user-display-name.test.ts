/**
 * Tests for user-display-name utility
 */

import {
  getUserDisplayName,
  getUserDisplayNameOrNull,
} from '../../utils/user-display-name';

describe('user-display-name', () => {
  describe('getUserDisplayName', () => {
    describe('with displayName', () => {
      it('should return displayName when set', () => {
        const user = { displayName: 'John Doe' };
        expect(getUserDisplayName(user)).toBe('John Doe');
      });

      it('should trim displayName', () => {
        const user = { displayName: '  John Doe  ' };
        expect(getUserDisplayName(user)).toBe('John Doe');
      });

      it('should prefer displayName over firstName/lastName', () => {
        const user = {
          displayName: 'Johnny',
          firstName: 'John',
          lastName: 'Doe',
        };
        expect(getUserDisplayName(user)).toBe('Johnny');
      });

      it('should ignore empty displayName', () => {
        const user = {
          displayName: '',
          firstName: 'John',
        };
        expect(getUserDisplayName(user)).toBe('John');
      });

      it('should ignore whitespace-only displayName', () => {
        const user = {
          displayName: '   ',
          username: 'johndoe',
        };
        expect(getUserDisplayName(user)).toBe('johndoe');
      });
    });

    describe('with firstName and lastName', () => {
      it('should return full name when both are set', () => {
        const user = {
          firstName: 'John',
          lastName: 'Doe',
        };
        expect(getUserDisplayName(user)).toBe('John Doe');
      });

      it('should return firstName only when lastName is missing', () => {
        const user = { firstName: 'John' };
        expect(getUserDisplayName(user)).toBe('John');
      });

      it('should return lastName only when firstName is missing', () => {
        const user = { lastName: 'Doe' };
        expect(getUserDisplayName(user)).toBe('Doe');
      });

      it('should trim first and last name', () => {
        const user = {
          firstName: '  John  ',
          lastName: '  Doe  ',
        };
        expect(getUserDisplayName(user)).toBe('John Doe');
      });

      it('should handle null firstName', () => {
        const user = {
          firstName: null,
          lastName: 'Doe',
        };
        expect(getUserDisplayName(user)).toBe('Doe');
      });

      it('should handle null lastName', () => {
        const user = {
          firstName: 'John',
          lastName: null,
        };
        expect(getUserDisplayName(user)).toBe('John');
      });
    });

    describe('with username', () => {
      it('should return username as fallback', () => {
        const user = { username: 'johndoe' };
        expect(getUserDisplayName(user)).toBe('johndoe');
      });

      it('should trim username', () => {
        const user = { username: '  johndoe  ' };
        expect(getUserDisplayName(user)).toBe('johndoe');
      });

      it('should use username when firstName/lastName are empty', () => {
        const user = {
          firstName: '',
          lastName: '',
          username: 'johndoe',
        };
        expect(getUserDisplayName(user)).toBe('johndoe');
      });

      it('should ignore whitespace-only username', () => {
        const user = { username: '   ' };
        expect(getUserDisplayName(user)).toBe('Utilisateur inconnu');
      });
    });

    describe('fallback behavior', () => {
      it('should return default fallback for null user', () => {
        expect(getUserDisplayName(null)).toBe('Utilisateur inconnu');
      });

      it('should return default fallback for undefined user', () => {
        expect(getUserDisplayName(undefined)).toBe('Utilisateur inconnu');
      });

      it('should return default fallback for empty user object', () => {
        expect(getUserDisplayName({})).toBe('Utilisateur inconnu');
      });

      it('should return custom fallback when provided', () => {
        expect(getUserDisplayName(null, 'Anonymous')).toBe('Anonymous');
      });

      it('should return custom fallback for empty user', () => {
        expect(getUserDisplayName({}, 'Guest')).toBe('Guest');
      });

      it('should return fallback when all fields are null', () => {
        const user = {
          displayName: null,
          firstName: null,
          lastName: null,
          username: null,
        };
        expect(getUserDisplayName(user, 'Unknown')).toBe('Unknown');
      });
    });

    describe('priority order', () => {
      it('should prefer displayName > firstName+lastName > username', () => {
        const user = {
          displayName: 'Display Name',
          firstName: 'First',
          lastName: 'Last',
          username: 'username',
        };
        expect(getUserDisplayName(user)).toBe('Display Name');
      });

      it('should prefer firstName+lastName when displayName is empty', () => {
        const user = {
          displayName: '',
          firstName: 'First',
          lastName: 'Last',
          username: 'username',
        };
        expect(getUserDisplayName(user)).toBe('First Last');
      });

      it('should prefer username when displayName and names are empty', () => {
        const user = {
          displayName: '',
          firstName: '',
          lastName: '',
          username: 'username',
        };
        expect(getUserDisplayName(user)).toBe('username');
      });
    });
  });

  describe('getUserDisplayNameOrNull', () => {
    it('should return displayName when set', () => {
      const user = { displayName: 'John Doe' };
      expect(getUserDisplayNameOrNull(user)).toBe('John Doe');
    });

    it('should return full name when available', () => {
      const user = {
        firstName: 'John',
        lastName: 'Doe',
      };
      expect(getUserDisplayNameOrNull(user)).toBe('John Doe');
    });

    it('should return username as fallback', () => {
      const user = { username: 'johndoe' };
      expect(getUserDisplayNameOrNull(user)).toBe('johndoe');
    });

    it('should return null for null user', () => {
      expect(getUserDisplayNameOrNull(null)).toBeNull();
    });

    it('should return null for undefined user', () => {
      expect(getUserDisplayNameOrNull(undefined)).toBeNull();
    });

    it('should return null for empty user object', () => {
      expect(getUserDisplayNameOrNull({})).toBeNull();
    });

    it('should return null when all fields are empty', () => {
      const user = {
        displayName: '',
        firstName: '',
        lastName: '',
        username: '',
      };
      expect(getUserDisplayNameOrNull(user)).toBeNull();
    });

    it('should return null when all fields are whitespace', () => {
      const user = {
        displayName: '   ',
        firstName: '   ',
        lastName: '   ',
        username: '   ',
      };
      expect(getUserDisplayNameOrNull(user)).toBeNull();
    });

    it('should trim returned values', () => {
      const user = { displayName: '  John Doe  ' };
      expect(getUserDisplayNameOrNull(user)).toBe('John Doe');
    });
  });
});
