/**
 * Tests for the canonical string-based initials utility
 */

import { getInitials } from '../../utils/initials';

describe('getInitials', () => {
  describe('empty / null inputs', () => {
    it('should return the default fallback for null', () => {
      expect(getInitials(null)).toBe('?');
    });

    it('should return the default fallback for undefined', () => {
      expect(getInitials(undefined)).toBe('?');
    });

    it('should return the default fallback for an empty string', () => {
      expect(getInitials('')).toBe('?');
    });

    it('should return the default fallback for whitespace-only', () => {
      expect(getInitials('   ')).toBe('?');
    });

    it('should honour a custom fallback', () => {
      expect(getInitials('', '??')).toBe('??');
    });

    it('should not crash on a lone @ symbol', () => {
      expect(getInitials('@')).toBe('?');
    });
  });

  describe('single word', () => {
    it('should return the first two letters uppercased', () => {
      expect(getInitials('alice')).toBe('AL');
    });

    it('should return a single uppercased letter for a one-char name', () => {
      expect(getInitials('a')).toBe('A');
    });

    it('should uppercase already-uppercase input', () => {
      expect(getInitials('BOB')).toBe('BO');
    });
  });

  describe('multi word', () => {
    it('should combine first and last word initials', () => {
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('should use first and LAST word for three words', () => {
      expect(getInitials('Mary Jane Watson')).toBe('MW');
    });

    it('should collapse multiple spaces between words', () => {
      expect(getInitials('John    Doe')).toBe('JD');
    });

    it('should ignore leading/trailing whitespace', () => {
      expect(getInitials('  John Doe  ')).toBe('JD');
    });
  });

  describe('@ stripping', () => {
    it('should strip a leading @ before computing initials', () => {
      expect(getInitials('@john')).toBe('JO');
    });

    it('should strip a leading @ on a multi-word handle', () => {
      expect(getInitials('@john doe')).toBe('JD');
    });

    it('should strip multiple leading @', () => {
      expect(getInitials('@@john')).toBe('JO');
    });

    it('should not strip an interior @', () => {
      expect(getInitials('john@doe')).toBe('JO');
    });
  });
});
