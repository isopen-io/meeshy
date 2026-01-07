/**
 * Normalize Utilities Unit Tests
 *
 * Comprehensive tests for normalization utilities covering:
 * - Email normalization
 * - Phone number normalization (E.164 format)
 * - Username normalization and validation
 * - Name capitalization
 * - Display name normalization
 * - User data normalization (composite)
 *
 * Run with: npm test -- normalize.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  normalizeEmail,
  normalizePhoneNumber,
  normalizeUsername,
  capitalizeName,
  normalizeDisplayName,
  normalizeUserData,
  UserDataToNormalize
} from '../../../utils/normalize';

describe('normalizeEmail', () => {
  describe('basic functionality', () => {
    it('should convert email to lowercase', () => {
      expect(normalizeEmail('Test@Example.com')).toBe('test@example.com');
    });

    it('should trim whitespace from email', () => {
      expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com');
    });

    it('should handle already lowercase email', () => {
      expect(normalizeEmail('test@example.com')).toBe('test@example.com');
    });

    it('should handle mixed case domain', () => {
      expect(normalizeEmail('user@GMAIL.COM')).toBe('user@gmail.com');
    });
  });

  describe('edge cases', () => {
    it('should handle email with plus sign', () => {
      expect(normalizeEmail('User+Tag@Example.com')).toBe('user+tag@example.com');
    });

    it('should handle email with dots in local part', () => {
      expect(normalizeEmail('User.Name@Example.com')).toBe('user.name@example.com');
    });

    it('should handle email with numbers', () => {
      expect(normalizeEmail('User123@Example456.com')).toBe('user123@example456.com');
    });

    it('should handle email with subdomain', () => {
      expect(normalizeEmail('USER@MAIL.EXAMPLE.COM')).toBe('user@mail.example.com');
    });

    it('should handle email with hyphens', () => {
      expect(normalizeEmail('User-Name@Example-Domain.com')).toBe('user-name@example-domain.com');
    });

    it('should handle leading and trailing tabs', () => {
      expect(normalizeEmail('\ttest@example.com\t')).toBe('test@example.com');
    });

    it('should handle newlines in whitespace', () => {
      expect(normalizeEmail('\ntest@example.com\n')).toBe('test@example.com');
    });

    it('should handle empty string after trim', () => {
      expect(normalizeEmail('   ')).toBe('');
    });
  });
});

describe('normalizePhoneNumber', () => {
  describe('basic E.164 formatting', () => {
    it('should add + prefix to number without prefix', () => {
      expect(normalizePhoneNumber('33654321987')).toBe('+33654321987');
    });

    it('should replace 00 prefix with + prefix', () => {
      expect(normalizePhoneNumber('0033654321987')).toBe('+33654321987');
    });

    it('should preserve existing + prefix', () => {
      expect(normalizePhoneNumber('+33654321987')).toBe('+33654321987');
    });
  });

  describe('removing special characters', () => {
    it('should remove spaces', () => {
      expect(normalizePhoneNumber('00 33 6 54 32 19 87')).toBe('+33654321987');
    });

    it('should remove hyphens', () => {
      expect(normalizePhoneNumber('+33-6-54-32-19-87')).toBe('+33654321987');
    });

    it('should remove parentheses', () => {
      expect(normalizePhoneNumber('+33 (6) 54 32 19 87')).toBe('+33654321987');
    });

    it('should remove dots', () => {
      expect(normalizePhoneNumber('+33.6.54.32.19.87')).toBe('+33654321987');
    });

    it('should handle mixed special characters', () => {
      expect(normalizePhoneNumber('00 33-(6).54 32-19.87')).toBe('+33654321987');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(normalizePhoneNumber('')).toBe('');
    });

    it('should return empty string for undefined-like input', () => {
      expect(normalizePhoneNumber(null as unknown as string)).toBe('');
      expect(normalizePhoneNumber(undefined as unknown as string)).toBe('');
    });

    it('should handle very short number', () => {
      expect(normalizePhoneNumber('123')).toBe('+123');
    });

    it('should handle long international number', () => {
      expect(normalizePhoneNumber('001234567890123456')).toBe('+1234567890123456');
    });

    it('should handle number starting with 00 followed by 0', () => {
      expect(normalizePhoneNumber('000123456789')).toBe('+0123456789');
    });

    it('should handle number with only spaces', () => {
      expect(normalizePhoneNumber('   ')).toBe('+');
    });

    it('should handle US number format', () => {
      expect(normalizePhoneNumber('+1 (555) 123-4567')).toBe('+15551234567');
    });

    it('should handle UK number format', () => {
      expect(normalizePhoneNumber('00 44 20 7946 0958')).toBe('+442079460958');
    });
  });
});

describe('normalizeUsername', () => {
  describe('basic functionality', () => {
    it('should trim whitespace', () => {
      expect(normalizeUsername('  testuser  ')).toBe('testuser');
    });

    it('should preserve capitalization', () => {
      expect(normalizeUsername('TestUser')).toBe('TestUser');
    });

    it('should allow underscores', () => {
      expect(normalizeUsername('test_user')).toBe('test_user');
    });

    it('should allow hyphens', () => {
      expect(normalizeUsername('test-user')).toBe('test-user');
    });

    it('should allow numbers', () => {
      expect(normalizeUsername('user123')).toBe('user123');
    });

    it('should allow mixed valid characters', () => {
      expect(normalizeUsername('Test_User-123')).toBe('Test_User-123');
    });
  });

  describe('length validation', () => {
    it('should accept username with exactly 2 characters', () => {
      expect(normalizeUsername('ab')).toBe('ab');
    });

    it('should throw error for username with 1 character', () => {
      expect(() => normalizeUsername('a')).toThrow('Le nom d\'utilisateur doit contenir au moins 2 caractères');
    });

    it('should throw error for empty username after trim', () => {
      expect(() => normalizeUsername('   ')).toThrow('Le nom d\'utilisateur doit contenir au moins 2 caractères');
    });

    it('should accept username with exactly 16 characters', () => {
      expect(normalizeUsername('1234567890123456')).toBe('1234567890123456');
    });

    it('should throw error for username with 17 characters', () => {
      expect(() => normalizeUsername('12345678901234567')).toThrow('Le nom d\'utilisateur ne peut pas dépasser 16 caractères');
    });

    it('should throw error for very long username', () => {
      expect(() => normalizeUsername('a'.repeat(100))).toThrow('Le nom d\'utilisateur ne peut pas dépasser 16 caractères');
    });
  });

  describe('character validation', () => {
    it('should throw error for username with spaces', () => {
      expect(() => normalizeUsername('test user')).toThrow('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    });

    it('should throw error for username with special characters', () => {
      expect(() => normalizeUsername('test@user')).toThrow('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    });

    it('should throw error for username with dots', () => {
      expect(() => normalizeUsername('test.user')).toThrow('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    });

    it('should throw error for username with unicode emojis', () => {
      expect(() => normalizeUsername('test\u{1F600}user')).toThrow('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    });

    it('should throw error for username with exclamation mark', () => {
      expect(() => normalizeUsername('test!')).toThrow('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    });

    it('should throw error for username with hash', () => {
      expect(() => normalizeUsername('test#user')).toThrow('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    });
  });

  describe('edge cases', () => {
    it('should handle username starting with underscore', () => {
      expect(normalizeUsername('_user')).toBe('_user');
    });

    it('should handle username starting with hyphen', () => {
      expect(normalizeUsername('-user')).toBe('-user');
    });

    it('should handle username starting with number', () => {
      expect(normalizeUsername('123user')).toBe('123user');
    });

    it('should handle all uppercase username', () => {
      expect(normalizeUsername('TESTUSER')).toBe('TESTUSER');
    });

    it('should handle all lowercase username', () => {
      expect(normalizeUsername('testuser')).toBe('testuser');
    });

    it('should handle username with only numbers', () => {
      expect(normalizeUsername('12345')).toBe('12345');
    });

    it('should handle username with only underscores and hyphens', () => {
      expect(normalizeUsername('_-_-')).toBe('_-_-');
    });
  });
});

describe('capitalizeName', () => {
  describe('basic functionality', () => {
    it('should capitalize first letter and lowercase rest', () => {
      expect(capitalizeName('john')).toBe('John');
    });

    it('should handle all uppercase input', () => {
      expect(capitalizeName('JOHN')).toBe('John');
    });

    it('should handle mixed case input', () => {
      expect(capitalizeName('jOhN')).toBe('John');
    });

    it('should trim whitespace', () => {
      expect(capitalizeName('  john  ')).toBe('John');
    });
  });

  describe('compound names', () => {
    it('should capitalize each word in compound name', () => {
      expect(capitalizeName('jean pierre')).toBe('Jean Pierre');
    });

    it('should handle multiple spaces between words', () => {
      // The function splits by space and rejoins, preserving empty segments
      expect(capitalizeName('jean    pierre')).toBe('Jean    Pierre');
    });

    it('should handle three-word name', () => {
      expect(capitalizeName('mary jane watson')).toBe('Mary Jane Watson');
    });

    it('should handle all uppercase compound name', () => {
      expect(capitalizeName('JEAN PIERRE')).toBe('Jean Pierre');
    });

    it('should handle all lowercase compound name', () => {
      expect(capitalizeName('jean pierre')).toBe('Jean Pierre');
    });
  });

  describe('edge cases', () => {
    it('should handle single character name', () => {
      expect(capitalizeName('j')).toBe('J');
    });

    it('should handle empty string after trim', () => {
      expect(capitalizeName('   ')).toBe('');
    });

    it('should handle name with leading/trailing spaces in words', () => {
      expect(capitalizeName(' jean  pierre ')).toBe('Jean  Pierre');
    });

    it('should handle name with numbers', () => {
      expect(capitalizeName('john3')).toBe('John3');
    });

    it('should handle name starting with number', () => {
      expect(capitalizeName('3john')).toBe('3john');
    });

    it('should handle empty word segments', () => {
      // Multiple spaces create empty strings when split
      const result = capitalizeName('a  b');
      expect(result).toBe('A  B');
    });
  });
});

describe('normalizeDisplayName', () => {
  describe('basic functionality', () => {
    it('should trim whitespace', () => {
      expect(normalizeDisplayName('  Test User  ')).toBe('Test User');
    });

    it('should preserve capitalization', () => {
      expect(normalizeDisplayName('Test User')).toBe('Test User');
    });

    it('should preserve special characters', () => {
      expect(normalizeDisplayName('Test@User#123!')).toBe('Test@User#123!');
    });
  });

  describe('removing control characters', () => {
    it('should remove newlines', () => {
      expect(normalizeDisplayName('Test\nUser')).toBe('TestUser');
    });

    it('should remove tabs', () => {
      expect(normalizeDisplayName('Test\tUser')).toBe('TestUser');
    });

    it('should remove multiple newlines and tabs', () => {
      expect(normalizeDisplayName('Test\n\t\nUser\t')).toBe('TestUser');
    });

    it('should remove carriage return-newline combination', () => {
      expect(normalizeDisplayName('Test\r\nUser')).toBe('Test\rUser');
    });
  });

  describe('preserving special content', () => {
    it('should preserve emojis', () => {
      expect(normalizeDisplayName('Test User')).toBe('Test User');
    });

    it('should preserve unicode characters', () => {
      expect(normalizeDisplayName('Jean-Pierre Dupont')).toBe('Jean-Pierre Dupont');
    });

    it('should preserve multiple emojis', () => {
      expect(normalizeDisplayName('Cool User')).toBe('Cool User');
    });

    it('should preserve parentheses and brackets', () => {
      expect(normalizeDisplayName('User (Admin) [VIP]')).toBe('User (Admin) [VIP]');
    });

    it('should preserve quotes', () => {
      expect(normalizeDisplayName('User "The Best"')).toBe('User "The Best"');
    });
  });

  describe('edge cases', () => {
    it('should handle only whitespace', () => {
      expect(normalizeDisplayName('   ')).toBe('');
    });

    it('should handle only newlines and tabs', () => {
      expect(normalizeDisplayName('\n\t\n')).toBe('');
    });

    it('should handle mix of whitespace and control characters', () => {
      expect(normalizeDisplayName('  \nTest\t  ')).toBe('Test');
    });

    it('should handle very long display name', () => {
      const longName = 'A'.repeat(1000);
      expect(normalizeDisplayName(longName)).toBe(longName);
    });

    it('should handle display name with inner spaces', () => {
      expect(normalizeDisplayName('Test   User')).toBe('Test   User');
    });
  });
});

describe('normalizeUserData', () => {
  describe('complete user data', () => {
    it('should normalize all fields when provided', () => {
      const data: UserDataToNormalize = {
        email: '  TEST@EXAMPLE.COM  ',
        username: '  TestUser  ',
        firstName: 'JOHN',
        lastName: 'DOE',
        displayName: '  John Doe\n  '
      };

      const result = normalizeUserData(data);

      expect(result.email).toBe('test@example.com');
      expect(result.username).toBe('TestUser');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.displayName).toBe('John Doe');
    });
  });

  describe('partial user data', () => {
    it('should normalize only email when only email provided', () => {
      const data: UserDataToNormalize = {
        email: 'TEST@EXAMPLE.COM'
      };

      const result = normalizeUserData(data);

      expect(result.email).toBe('test@example.com');
      expect(result.username).toBeUndefined();
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
      expect(result.displayName).toBeUndefined();
    });

    it('should normalize only username when only username provided', () => {
      const data: UserDataToNormalize = {
        username: '  ValidUser  '
      };

      const result = normalizeUserData(data);

      expect(result.email).toBeUndefined();
      expect(result.username).toBe('ValidUser');
    });

    it('should normalize only names when only names provided', () => {
      const data: UserDataToNormalize = {
        firstName: 'JOHN',
        lastName: 'DOE'
      };

      const result = normalizeUserData(data);

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.email).toBeUndefined();
      expect(result.username).toBeUndefined();
    });

    it('should normalize only displayName when only displayName provided', () => {
      const data: UserDataToNormalize = {
        displayName: '  Cool User\n  '
      };

      const result = normalizeUserData(data);

      expect(result.displayName).toBe('Cool User');
      expect(result.email).toBeUndefined();
    });
  });

  describe('empty data', () => {
    it('should return empty object when no data provided', () => {
      const data: UserDataToNormalize = {};

      const result = normalizeUserData(data);

      expect(result).toEqual({});
    });

    it('should skip undefined fields', () => {
      const data: UserDataToNormalize = {
        email: undefined,
        username: undefined
      };

      const result = normalizeUserData(data);

      expect(result).toEqual({});
    });

    it('should skip empty string fields for email', () => {
      const data: UserDataToNormalize = {
        email: ''
      };

      const result = normalizeUserData(data);

      // Empty string is falsy, so email won't be normalized
      expect(result.email).toBeUndefined();
    });
  });

  describe('error propagation', () => {
    it('should throw error for invalid username in composite data', () => {
      const data: UserDataToNormalize = {
        email: 'test@example.com',
        username: 'a' // Too short
      };

      expect(() => normalizeUserData(data)).toThrow('Le nom d\'utilisateur doit contenir au moins 2 caractères');
    });

    it('should throw error for username with invalid characters in composite data', () => {
      const data: UserDataToNormalize = {
        email: 'test@example.com',
        username: 'invalid@user'
      };

      expect(() => normalizeUserData(data)).toThrow('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    });
  });

  describe('complex scenarios', () => {
    it('should handle compound names correctly', () => {
      const data: UserDataToNormalize = {
        firstName: 'JEAN PIERRE',
        lastName: 'VAN DER BERG'
      };

      const result = normalizeUserData(data);

      expect(result.firstName).toBe('Jean Pierre');
      expect(result.lastName).toBe('Van Der Berg');
    });

    it('should handle display name with emojis', () => {
      const data: UserDataToNormalize = {
        displayName: '  Cool User  '
      };

      const result = normalizeUserData(data);

      expect(result.displayName).toBe('Cool User');
    });

    it('should handle realistic registration data', () => {
      const data: UserDataToNormalize = {
        email: '  John.Doe@Gmail.COM  ',
        username: '  JohnDoe123  ',
        firstName: 'john',
        lastName: 'doe',
        displayName: 'John Doe'
      };

      const result = normalizeUserData(data);

      expect(result.email).toBe('john.doe@gmail.com');
      expect(result.username).toBe('JohnDoe123');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.displayName).toBe('John Doe');
    });
  });
});

describe('Integration scenarios', () => {
  describe('realistic user data scenarios', () => {
    it('should normalize French user data', () => {
      const data: UserDataToNormalize = {
        email: '  Jean-Pierre.Dupont@Orange.FR  ',
        username: 'JPDupont',
        firstName: 'JEAN-PIERRE',
        lastName: 'DUPONT',
        displayName: '  Jean-Pierre Dupont  '
      };

      const result = normalizeUserData(data);

      expect(result.email).toBe('jean-pierre.dupont@orange.fr');
      expect(result.username).toBe('JPDupont');
      expect(result.firstName).toBe('Jean-pierre');
      expect(result.lastName).toBe('Dupont');
      expect(result.displayName).toBe('Jean-Pierre Dupont');
    });

    it('should handle international phone numbers', () => {
      // Test various international formats
      expect(normalizePhoneNumber('+1 (555) 123-4567')).toBe('+15551234567'); // US
      expect(normalizePhoneNumber('00 44 20 7946 0958')).toBe('+442079460958'); // UK
      expect(normalizePhoneNumber('0033 6 12 34 56 78')).toBe('+33612345678'); // France
      expect(normalizePhoneNumber('+49 30 12345678')).toBe('+493012345678'); // Germany
      expect(normalizePhoneNumber('0081 3 1234 5678')).toBe('+81312345678'); // Japan
    });

    it('should handle edge case usernames', () => {
      // Valid edge cases
      expect(normalizeUsername('AB')).toBe('AB');
      expect(normalizeUsername('1234567890123456')).toBe('1234567890123456');
      expect(normalizeUsername('_-_-_-_-_-_-_-_-')).toBe('_-_-_-_-_-_-_-_-');
      expect(normalizeUsername('CamelCaseUser')).toBe('CamelCaseUser');
    });
  });
});
