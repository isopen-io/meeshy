/**
 * Tests for avatar-utils module
 * Tests user initials and display name generation
 */

import {
  getUserInitials,
  getMessageInitials,
  getUserDisplayName,
} from '../../lib/avatar-utils';

describe('Avatar Utils Module', () => {
  describe('getUserInitials', () => {
    it('should return ?? for null user', () => {
      expect(getUserInitials(null)).toBe('??');
    });

    it('should return ?? for undefined user', () => {
      expect(getUserInitials(undefined)).toBe('??');
    });

    it('should use firstName and lastName when both are present', () => {
      const user = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
      };

      expect(getUserInitials(user as any)).toBe('JD');
    });

    it('should use firstName only when lastName is missing', () => {
      const user = {
        id: '1',
        firstName: 'John',
      };

      expect(getUserInitials(user as any)).toBe('J');
    });

    it('should use lastName only when firstName is missing', () => {
      const user = {
        id: '1',
        lastName: 'Doe',
      };

      expect(getUserInitials(user as any)).toBe('D');
    });

    it('should use displayName when no first/last name', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
      };

      expect(getUserInitials(user as any)).toBe('JD');
    });

    it('should use single initial from displayName with one word', () => {
      const user = {
        id: '1',
        displayName: 'John',
      };

      expect(getUserInitials(user as any)).toBe('J');
    });

    it('should use username when no other name data', () => {
      const user = {
        id: '1',
        username: 'johndoe123',
      };

      expect(getUserInitials(user as any)).toBe('J');
    });

    it('should return ?? when user has no name data', () => {
      const user = {
        id: '1',
      };

      expect(getUserInitials(user as any)).toBe('??');
    });

    it('should convert initials to uppercase', () => {
      const user = {
        id: '1',
        firstName: 'john',
        lastName: 'doe',
      };

      expect(getUserInitials(user as any)).toBe('JD');
    });

    it('should handle empty string firstName', () => {
      const user = {
        id: '1',
        firstName: '',
        lastName: 'Doe',
      };

      expect(getUserInitials(user as any)).toBe('D');
    });

    it('should handle whitespace in displayName', () => {
      const user = {
        id: '1',
        displayName: '  John   Doe  ',
      };

      expect(getUserInitials(user as any)).toBe('JD');
    });

    it('should handle multiple words in displayName', () => {
      const user = {
        id: '1',
        displayName: 'John Michael Doe',
      };

      // Should use first two words
      expect(getUserInitials(user as any)).toBe('JM');
    });

    it('should handle special characters in names', () => {
      const user = {
        id: '1',
        firstName: 'Jean-Pierre',
        lastName: "O'Connor",
      };

      expect(getUserInitials(user as any)).toBe('JO');
    });

    it('should handle unicode characters', () => {
      const user = {
        id: '1',
        firstName: 'Carlos',
        lastName: 'Nunez',
      };

      expect(getUserInitials(user as any)).toBe('CN');
    });
  });

  describe('getMessageInitials', () => {
    it('should use sender initials when sender is present', () => {
      const message = {
        sender: {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      expect(getMessageInitials(message)).toBe('JD');
    });

    it('should use anonymous sender when no regular sender', () => {
      const message = {
        anonymousSender: {
          firstName: 'Anonymous',
          lastName: 'User',
        },
      };

      expect(getMessageInitials(message)).toBe('AU');
    });

    it('should handle anonymous sender with only firstName', () => {
      const message = {
        anonymousSender: {
          firstName: 'Anonymous',
        },
      };

      expect(getMessageInitials(message)).toBe('A');
    });

    it('should handle anonymous sender with only lastName', () => {
      const message = {
        anonymousSender: {
          lastName: 'User',
        },
      };

      expect(getMessageInitials(message)).toBe('U');
    });

    it('should handle anonymous sender with username', () => {
      const message = {
        anonymousSender: {
          username: 'anon123',
        },
      };

      expect(getMessageInitials(message)).toBe('A');
    });

    it('should return ?? when no sender data', () => {
      const message = {};

      expect(getMessageInitials(message)).toBe('??');
    });

    it('should return ?? when anonymous sender has no data', () => {
      const message = {
        anonymousSender: {},
      };

      expect(getMessageInitials(message)).toBe('??');
    });

    it('should prefer sender over anonymousSender', () => {
      const message = {
        sender: {
          id: '1',
          firstName: 'Regular',
          lastName: 'User',
        },
        anonymousSender: {
          firstName: 'Anonymous',
          lastName: 'User',
        },
      };

      expect(getMessageInitials(message)).toBe('RU');
    });
  });

  describe('getUserDisplayName', () => {
    it('should return "Utilisateur inconnu" for null user', () => {
      expect(getUserDisplayName(null)).toBe('Utilisateur inconnu');
    });

    it('should return "Utilisateur inconnu" for undefined user', () => {
      expect(getUserDisplayName(undefined)).toBe('Utilisateur inconnu');
    });

    it('should use displayName when present', () => {
      const user = {
        id: '1',
        displayName: 'Custom Name',
        firstName: 'John',
        lastName: 'Doe',
      };

      expect(getUserDisplayName(user as any)).toBe('Custom Name');
    });

    it('should use firstName + lastName when no displayName', () => {
      const user = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
      };

      expect(getUserDisplayName(user as any)).toBe('John Doe');
    });

    it('should use firstName only when lastName is missing', () => {
      const user = {
        id: '1',
        firstName: 'John',
      };

      expect(getUserDisplayName(user as any)).toBe('John');
    });

    it('should use lastName only when firstName is missing', () => {
      const user = {
        id: '1',
        lastName: 'Doe',
      };

      expect(getUserDisplayName(user as any)).toBe('Doe');
    });

    it('should use username when no other name data', () => {
      const user = {
        id: '1',
        username: 'johndoe123',
      };

      expect(getUserDisplayName(user as any)).toBe('johndoe123');
    });

    it('should return "Utilisateur inconnu" when user has no name data', () => {
      const user = {
        id: '1',
      };

      expect(getUserDisplayName(user as any)).toBe('Utilisateur inconnu');
    });

    it('should handle empty string firstName', () => {
      const user = {
        id: '1',
        firstName: '',
        lastName: 'Doe',
      };

      expect(getUserDisplayName(user as any)).toBe('Doe');
    });

    it('should handle empty string lastName', () => {
      const user = {
        id: '1',
        firstName: 'John',
        lastName: '',
      };

      expect(getUserDisplayName(user as any)).toBe('John');
    });

    it('should preserve case in names', () => {
      const user = {
        id: '1',
        firstName: 'JOHN',
        lastName: 'doe',
      };

      expect(getUserDisplayName(user as any)).toBe('JOHN doe');
    });

    it('should handle special characters in displayName', () => {
      const user = {
        id: '1',
        displayName: "Jean-Pierre O'Connor",
      };

      expect(getUserDisplayName(user as any)).toBe("Jean-Pierre O'Connor");
    });
  });

  describe('Priority order verification', () => {
    it('should follow correct priority for initials: firstName+lastName > firstName > lastName > displayName > username', () => {
      // Full data - uses firstName + lastName
      const fullUser = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'Johnny D',
        username: 'jdoe',
      };
      expect(getUserInitials(fullUser as any)).toBe('JD');

      // No lastName - uses firstName
      const noLastName = {
        id: '1',
        firstName: 'John',
        displayName: 'Johnny D',
        username: 'jdoe',
      };
      expect(getUserInitials(noLastName as any)).toBe('J');

      // No firstName - uses lastName
      const noFirstName = {
        id: '1',
        lastName: 'Doe',
        displayName: 'Johnny D',
        username: 'jdoe',
      };
      expect(getUserInitials(noFirstName as any)).toBe('D');

      // No firstName/lastName - uses displayName
      const onlyDisplayName = {
        id: '1',
        displayName: 'Johnny D',
        username: 'jdoe',
      };
      expect(getUserInitials(onlyDisplayName as any)).toBe('JD');

      // Only username
      const onlyUsername = {
        id: '1',
        username: 'jdoe',
      };
      expect(getUserInitials(onlyUsername as any)).toBe('J');
    });

    it('should follow correct priority for displayName: displayName > firstName+lastName > firstName > lastName > username', () => {
      // Has displayName - uses it
      const withDisplayName = {
        id: '1',
        displayName: 'Custom Name',
        firstName: 'John',
        lastName: 'Doe',
        username: 'jdoe',
      };
      expect(getUserDisplayName(withDisplayName as any)).toBe('Custom Name');

      // No displayName - uses firstName + lastName
      const noDisplayName = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        username: 'jdoe',
      };
      expect(getUserDisplayName(noDisplayName as any)).toBe('John Doe');
    });
  });
});
