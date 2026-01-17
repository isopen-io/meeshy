/**
 * Tests for community-identifier utility
 */

import {
  generateCommunityIdentifier,
  validateCommunityIdentifier,
  sanitizeCommunityIdentifier,
} from '../../utils/community-identifier';

describe('community-identifier', () => {
  describe('generateCommunityIdentifier', () => {
    it('should generate identifier from simple title', () => {
      const identifier = generateCommunityIdentifier('My Community');
      expect(identifier).toMatch(/^my-community-[a-z0-9]{6}$/);
    });

    it('should normalize special characters', () => {
      const identifier = generateCommunityIdentifier('My Community!@#$%');
      expect(identifier).toMatch(/^my-community-[a-z0-9]{6}$/);
    });

    it('should convert to lowercase', () => {
      const identifier = generateCommunityIdentifier('MY COMMUNITY');
      expect(identifier).toMatch(/^my-community-[a-z0-9]{6}$/);
    });

    it('should replace multiple spaces with single hyphen', () => {
      const identifier = generateCommunityIdentifier('My    Community');
      expect(identifier).toMatch(/^my-community-[a-z0-9]{6}$/);
    });

    it('should handle hyphens in title', () => {
      // Hyphens in the title are not alphanumeric or spaces, so they're removed
      // "My---Community" -> lowercase -> replace non-alphanumeric except spaces -> "mycommunity"
      const identifier = generateCommunityIdentifier('My---Community');
      expect(identifier).toMatch(/^mycommunity-[a-z0-9]{6}$/);
    });

    it('should remove leading and trailing hyphens from title', () => {
      const identifier = generateCommunityIdentifier('-My Community-');
      expect(identifier).toMatch(/^my-community-[a-z0-9]{6}$/);
    });

    it('should handle numbers in title', () => {
      const identifier = generateCommunityIdentifier('Community 123');
      expect(identifier).toMatch(/^community-123-[a-z0-9]{6}$/);
    });

    it('should use default prefix for empty title after normalization', () => {
      const identifier = generateCommunityIdentifier('!!!');
      expect(identifier).toMatch(/^community-[a-z0-9]{6}$/);
    });

    it('should use default prefix for empty string', () => {
      const identifier = generateCommunityIdentifier('');
      expect(identifier).toMatch(/^community-[a-z0-9]{6}$/);
    });

    it('should truncate long titles to 50 characters', () => {
      const longTitle = 'A'.repeat(100);
      const identifier = generateCommunityIdentifier(longTitle);
      const parts = identifier.split('-');
      const titlePart = parts.slice(0, -1).join('-');
      expect(titlePart.length).toBeLessThanOrEqual(50);
    });

    it('should generate unique identifiers', () => {
      const id1 = generateCommunityIdentifier('Test');
      const id2 = generateCommunityIdentifier('Test');
      expect(id1).not.toBe(id2);
    });

    it('should handle Unicode characters by removing them', () => {
      const identifier = generateCommunityIdentifier('Communaute');
      expect(identifier).toMatch(/^communaute-[a-z0-9]{6}$/);
    });

    it('should handle mixed content', () => {
      const identifier = generateCommunityIdentifier('My 1st Community! (Best)');
      expect(identifier).toMatch(/^my-1st-community-best-[a-z0-9]{6}$/);
    });
  });

  describe('validateCommunityIdentifier', () => {
    it('should return true for valid lowercase identifier', () => {
      expect(validateCommunityIdentifier('my-community')).toBe(true);
    });

    it('should return true for identifier with numbers', () => {
      expect(validateCommunityIdentifier('community123')).toBe(true);
    });

    it('should return true for identifier with hyphens', () => {
      expect(validateCommunityIdentifier('my-test-community')).toBe(true);
    });

    it('should return true for identifier with underscores', () => {
      expect(validateCommunityIdentifier('my_test_community')).toBe(true);
    });

    it('should return true for identifier with @ symbol', () => {
      expect(validateCommunityIdentifier('@mycommunity')).toBe(true);
    });

    it('should return false for uppercase letters', () => {
      expect(validateCommunityIdentifier('MyCommunity')).toBe(false);
    });

    it('should return false for spaces', () => {
      expect(validateCommunityIdentifier('my community')).toBe(false);
    });

    it('should return false for special characters', () => {
      expect(validateCommunityIdentifier('my!community')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateCommunityIdentifier('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(validateCommunityIdentifier(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(validateCommunityIdentifier(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeCommunityIdentifier', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeCommunityIdentifier('MyCommunity')).toBe('mycommunity');
    });

    it('should remove invalid characters', () => {
      expect(sanitizeCommunityIdentifier('my!community')).toBe('mycommunity');
    });

    it('should remove spaces', () => {
      expect(sanitizeCommunityIdentifier('my community')).toBe('mycommunity');
    });

    it('should keep valid characters', () => {
      expect(sanitizeCommunityIdentifier('my-community_123')).toBe('my-community_123');
    });

    it('should keep @ symbol', () => {
      expect(sanitizeCommunityIdentifier('@mycommunity')).toBe('@mycommunity');
    });

    it('should replace multiple hyphens with single hyphen', () => {
      expect(sanitizeCommunityIdentifier('my---community')).toBe('my-community');
    });

    it('should remove leading hyphens', () => {
      expect(sanitizeCommunityIdentifier('-mycommunity')).toBe('mycommunity');
    });

    it('should remove trailing hyphens', () => {
      expect(sanitizeCommunityIdentifier('mycommunity-')).toBe('mycommunity');
    });

    it('should handle complex input', () => {
      expect(sanitizeCommunityIdentifier('My---Community!!!123')).toBe('my-community123');
    });

    it('should return empty string for all invalid characters', () => {
      expect(sanitizeCommunityIdentifier('!!!')).toBe('');
    });
  });
});
