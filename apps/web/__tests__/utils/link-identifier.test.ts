/**
 * Tests for link-identifier utility
 */

import {
  analyzeLinkIdentifier,
  generateFallbackIdentifiers,
  isValidForApiRequest,
  normalizeForDisplay,
  generateTemporaryLinkId,
  isTemporaryLinkId,
  extractConversationShareLinkId,
} from '../../utils/link-identifier';

describe('link-identifier', () => {
  describe('analyzeLinkIdentifier', () => {
    describe('conversationShareLinkId (ObjectId format)', () => {
      it('should identify valid ObjectId (24 hex chars)', () => {
        const result = analyzeLinkIdentifier('68ee540df062ef6a37bd3cca');
        expect(result.type).toBe('conversationShareLinkId');
        expect(result.isValid).toBe(true);
        expect(result.value).toBe('68ee540df062ef6a37bd3cca');
      });

      it('should handle uppercase ObjectId', () => {
        const result = analyzeLinkIdentifier('68EE540DF062EF6A37BD3CCA');
        expect(result.type).toBe('conversationShareLinkId');
        expect(result.isValid).toBe(true);
      });

      it('should handle mixed case ObjectId', () => {
        const result = analyzeLinkIdentifier('68eE540Df062eF6a37Bd3cCa');
        expect(result.type).toBe('conversationShareLinkId');
        expect(result.isValid).toBe(true);
      });
    });

    describe('linkId format (objectId.timestamp_random)', () => {
      it('should identify valid linkId format', () => {
        const result = analyzeLinkIdentifier('68ee540df062ef6a37bd3cca.2510141545_ordljlc5');
        expect(result.type).toBe('linkId');
        expect(result.isValid).toBe(true);
      });

      it('should handle different timestamp and random values', () => {
        const result = analyzeLinkIdentifier('68ee540df062ef6a37bd3cca.1234567890_abc123');
        expect(result.type).toBe('linkId');
        expect(result.isValid).toBe(true);
      });
    });

    describe('custom identifiers', () => {
      it('should identify custom identifier with dots as linkId', () => {
        const result = analyzeLinkIdentifier('my-custom.identifier');
        expect(result.type).toBe('linkId');
      });

      it('should identify custom identifier without dots as conversationShareLinkId', () => {
        const result = analyzeLinkIdentifier('my-custom-identifier');
        expect(result.type).toBe('conversationShareLinkId');
        expect(result.isValid).toBe(true);
      });

      it('should require minimum 3 characters for custom identifiers', () => {
        const shortResult = analyzeLinkIdentifier('ab');
        expect(shortResult.isValid).toBe(false);

        const validResult = analyzeLinkIdentifier('abc');
        expect(validResult.isValid).toBe(true);
      });

      it('should handle underscores in identifiers', () => {
        const result = analyzeLinkIdentifier('my_custom_id');
        expect(result.isValid).toBe(true);
      });
    });

    describe('invalid identifiers', () => {
      it('should reject empty string', () => {
        const result = analyzeLinkIdentifier('');
        expect(result.type).toBe('unknown');
        expect(result.isValid).toBe(false);
      });

      it('should reject null-like string', () => {
        const result = analyzeLinkIdentifier(null as any);
        expect(result.type).toBe('unknown');
        expect(result.isValid).toBe(false);
      });

      it('should reject undefined', () => {
        const result = analyzeLinkIdentifier(undefined as any);
        expect(result.type).toBe('unknown');
        expect(result.isValid).toBe(false);
      });

      it('should reject special characters', () => {
        const result = analyzeLinkIdentifier('id@with#special');
        expect(result.type).toBe('unknown');
        expect(result.isValid).toBe(false);
      });

      it('should reject spaces', () => {
        const result = analyzeLinkIdentifier('id with spaces');
        expect(result.type).toBe('unknown');
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('generateFallbackIdentifiers', () => {
    it('should generate conversationShareLinkId from linkId', () => {
      const fallbacks = generateFallbackIdentifiers('68ee540df062ef6a37bd3cca.2510141545_ordljlc5');
      expect(fallbacks).toContain('68ee540df062ef6a37bd3cca');
    });

    it('should return empty array for conversationShareLinkId', () => {
      const fallbacks = generateFallbackIdentifiers('68ee540df062ef6a37bd3cca');
      expect(fallbacks).toHaveLength(0);
    });

    it('should return empty array for invalid identifier', () => {
      const fallbacks = generateFallbackIdentifiers('invalid');
      expect(fallbacks).toHaveLength(0);
    });

    it('should not generate fallbacks for custom linkIds without ObjectId', () => {
      const fallbacks = generateFallbackIdentifiers('custom.identifier');
      expect(fallbacks).toHaveLength(0);
    });
  });

  describe('isValidForApiRequest', () => {
    it('should return true for valid ObjectId', () => {
      expect(isValidForApiRequest('68ee540df062ef6a37bd3cca')).toBe(true);
    });

    it('should return true for valid linkId', () => {
      expect(isValidForApiRequest('68ee540df062ef6a37bd3cca.2510141545_ordljlc5')).toBe(true);
    });

    it('should return true for valid custom identifier', () => {
      expect(isValidForApiRequest('my-custom-identifier')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidForApiRequest('')).toBe(false);
    });

    it('should return false for too short identifier', () => {
      expect(isValidForApiRequest('ab')).toBe(false);
    });

    it('should return false for invalid characters', () => {
      expect(isValidForApiRequest('id@with#special')).toBe(false);
    });
  });

  describe('normalizeForDisplay', () => {
    it('should handle identifier without mshy_ prefix', () => {
      // normalizeForDisplay only removes mshy_ when identifier is a linkId format (contains .)
      const result = normalizeForDisplay('mshy_12345');
      // Since mshy_12345 is not a linkId format (no .), it returns as-is
      expect(result).toBe('mshy_12345');
    });

    it('should remove mshy_ prefix from proper linkId format', () => {
      // Proper linkId format contains a dot
      const result = normalizeForDisplay('mshy_507f1f77bcf86cd799439011.2510141545_ordljlc5');
      expect(result).toBe('507f1f77bcf86cd799439011.2510141545_ordljlc5');
    });

    it('should return conversationShareLinkId as-is', () => {
      const result = normalizeForDisplay('68ee540df062ef6a37bd3cca');
      expect(result).toBe('68ee540df062ef6a37bd3cca');
    });

    it('should return regular linkId as-is if no mshy_ prefix', () => {
      const result = normalizeForDisplay('68ee540df062ef6a37bd3cca.2510141545_ordljlc5');
      expect(result).toBe('68ee540df062ef6a37bd3cca.2510141545_ordljlc5');
    });
  });

  describe('generateTemporaryLinkId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateTemporaryLinkId();
      const id2 = generateTemporaryLinkId();
      expect(id1).not.toBe(id2);
    });

    it('should start with temp_ prefix', () => {
      const id = generateTemporaryLinkId();
      expect(id.startsWith('temp_')).toBe(true);
    });

    it('should contain timestamp and random parts', () => {
      const id = generateTemporaryLinkId();
      const parts = id.split('_');
      expect(parts.length).toBe(3); // temp, timestamp, random
    });
  });

  describe('isTemporaryLinkId', () => {
    it('should return true for temporary IDs', () => {
      const tempId = generateTemporaryLinkId();
      expect(isTemporaryLinkId(tempId)).toBe(true);
    });

    it('should return true for any temp_ prefixed string', () => {
      expect(isTemporaryLinkId('temp_anything')).toBe(true);
    });

    it('should return false for ObjectId', () => {
      expect(isTemporaryLinkId('68ee540df062ef6a37bd3cca')).toBe(false);
    });

    it('should return false for linkId', () => {
      expect(isTemporaryLinkId('68ee540df062ef6a37bd3cca.2510141545_ordljlc5')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isTemporaryLinkId('')).toBe(false);
    });
  });

  describe('extractConversationShareLinkId', () => {
    it('should extract ObjectId from linkId', () => {
      const result = extractConversationShareLinkId('68ee540df062ef6a37bd3cca.2510141545_ordljlc5');
      expect(result).toBe('68ee540df062ef6a37bd3cca');
    });

    it('should return conversationShareLinkId as-is', () => {
      const result = extractConversationShareLinkId('68ee540df062ef6a37bd3cca');
      expect(result).toBe('68ee540df062ef6a37bd3cca');
    });

    it('should return null for custom linkId without ObjectId', () => {
      const result = extractConversationShareLinkId('custom.identifier');
      expect(result).toBeNull();
    });

    it('should return null for invalid identifier', () => {
      const result = extractConversationShareLinkId('invalid@id');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = extractConversationShareLinkId('');
      expect(result).toBeNull();
    });
  });
});
