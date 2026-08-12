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

    it('should use two letters of firstName when lastName is missing', () => {
      const user = {
        id: '1',
        firstName: 'John',
      };

      // Nom résolu "John" → mot unique → 2 premières lettres (canonique)
      expect(getUserInitials(user as any)).toBe('JO');
    });

    it('should use two letters of lastName when firstName is missing', () => {
      const user = {
        id: '1',
        lastName: 'Doe',
      };

      // Nom résolu "Doe" → mot unique → 2 premières lettres
      expect(getUserInitials(user as any)).toBe('DO');
    });

    it('should use displayName when no first/last name', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
      };

      expect(getUserInitials(user as any)).toBe('JD');
    });

    it('should use two letters from displayName with one word', () => {
      const user = {
        id: '1',
        displayName: 'John',
      };

      // Mot unique → 2 premières lettres (canonique)
      expect(getUserInitials(user as any)).toBe('JO');
    });

    it('should use two letters from username when no other name data', () => {
      const user = {
        id: '1',
        username: 'johndoe123',
      };

      // Nom résolu "johndoe123" → mot unique → 2 premières lettres
      expect(getUserInitials(user as any)).toBe('JO');
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

      // Nom résolu "Doe" → mot unique → 2 premières lettres
      expect(getUserInitials(user as any)).toBe('DO');
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

      // Multi-mot → 1ʳᵉ lettre du 1er + 1ʳᵉ lettre du dernier mot (canonique)
      expect(getUserInitials(user as any)).toBe('JD');
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

    it('should use sender with anonymous participant data', () => {
      const message = {
        sender: {
          id: 'anon-1',
          firstName: 'Anonymous',
          lastName: 'User',
          type: 'anonymous',
        },
      };

      expect(getMessageInitials(message)).toBe('AU');
    });

    it('should handle sender with only firstName', () => {
      const message = {
        sender: {
          id: 'anon-1',
          firstName: 'Anonymous',
        },
      };

      // Nom résolu "Anonymous" → mot unique → 2 premières lettres
      expect(getMessageInitials(message)).toBe('AN');
    });

    it('should handle sender with only lastName', () => {
      const message = {
        sender: {
          id: 'anon-1',
          lastName: 'User',
        },
      };

      // Nom résolu "User" → mot unique → 2 premières lettres
      expect(getMessageInitials(message)).toBe('US');
    });

    it('should handle sender with username only', () => {
      const message = {
        sender: {
          id: 'anon-1',
          username: 'anon123',
        },
      };

      // Nom résolu "anon123" → mot unique → 2 premières lettres
      expect(getMessageInitials(message)).toBe('AN');
    });

    it('should return ?? when no sender data', () => {
      const message = {};

      expect(getMessageInitials(message)).toBe('??');
    });

    it('should return ?? when sender has no useful data', () => {
      const message = {
        sender: {},
      };

      expect(getMessageInitials(message)).toBe('??');
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
    it('should derive initials from the resolved display name (displayName > firstName+lastName > username)', () => {
      // displayName présent → initiales du nom affiché "Johnny D" → "JD"
      const fullUser = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'Johnny D',
        username: 'jdoe',
      };
      expect(getUserInitials(fullUser as any)).toBe('JD');

      // displayName l'emporte sur firstName seul → "Johnny D" → "JD"
      const noLastName = {
        id: '1',
        firstName: 'John',
        displayName: 'Johnny D',
        username: 'jdoe',
      };
      expect(getUserInitials(noLastName as any)).toBe('JD');

      // displayName l'emporte sur lastName seul → "Johnny D" → "JD"
      const noFirstName = {
        id: '1',
        lastName: 'Doe',
        displayName: 'Johnny D',
        username: 'jdoe',
      };
      expect(getUserInitials(noFirstName as any)).toBe('JD');

      // Pas de displayName → firstName+lastName → "John Doe" → "JD"
      const noDisplay = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        username: 'jdoe',
      };
      expect(getUserInitials(noDisplay as any)).toBe('JD');

      // username seul (mot unique) → 2 premières lettres "jdoe" → "JD"
      const onlyUsername = {
        id: '1',
        username: 'jdoe',
      };
      expect(getUserInitials(onlyUsername as any)).toBe('JD');
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
