/**
 * Tests for conversation-id-utils utility
 */

import {
  isValidObjectId,
  isConversationIdentifier,
  getConversationIdType,
  logConversationIdDebug,
  getConversationApiId,
  getConversationDisplayId,
} from '../../utils/conversation-id-utils';

describe('conversation-id-utils', () => {
  describe('isValidObjectId', () => {
    it('should return true for valid 24-char hex ObjectId', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('should return true for uppercase ObjectId', () => {
      expect(isValidObjectId('507F1F77BCF86CD799439011')).toBe(true);
    });

    it('should return true for mixed case ObjectId', () => {
      expect(isValidObjectId('507f1F77bCf86cD799439011')).toBe(true);
    });

    it('should return false for 23 characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd79943901')).toBe(false);
    });

    it('should return false for 25 characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd7994390111')).toBe(false);
    });

    it('should return false for non-hex characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd79943901g')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidObjectId('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidObjectId(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidObjectId(undefined as any)).toBe(false);
    });

    it('should return false for number', () => {
      expect(isValidObjectId(123 as any)).toBe(false);
    });
  });

  describe('isConversationIdentifier', () => {
    it('should return true for alphanumeric identifier', () => {
      expect(isConversationIdentifier('my-conversation-123')).toBe(true);
    });

    it('should return true for identifier with underscore', () => {
      expect(isConversationIdentifier('my_conversation_123')).toBe(true);
    });

    it('should return true for identifier with hyphen', () => {
      expect(isConversationIdentifier('my-conversation')).toBe(true);
    });

    it('should return false for valid ObjectId (24 hex chars)', () => {
      expect(isConversationIdentifier('507f1f77bcf86cd799439011')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isConversationIdentifier('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isConversationIdentifier(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isConversationIdentifier(undefined as any)).toBe(false);
    });

    it('should return false for special characters', () => {
      expect(isConversationIdentifier('my@conversation')).toBe(false);
    });

    it('should return false for spaces', () => {
      expect(isConversationIdentifier('my conversation')).toBe(false);
    });
  });

  describe('getConversationIdType', () => {
    it('should return objectId for valid ObjectId', () => {
      expect(getConversationIdType('507f1f77bcf86cd799439011')).toBe('objectId');
    });

    it('should return identifier for valid identifier', () => {
      expect(getConversationIdType('my-conversation-123')).toBe('identifier');
    });

    it('should return invalid for empty string', () => {
      expect(getConversationIdType('')).toBe('invalid');
    });

    it('should return invalid for null', () => {
      expect(getConversationIdType(null as any)).toBe('invalid');
    });

    it('should return invalid for undefined', () => {
      expect(getConversationIdType(undefined as any)).toBe('invalid');
    });

    it('should return invalid for special characters', () => {
      expect(getConversationIdType('my@conversation!')).toBe('invalid');
    });
  });

  describe('logConversationIdDebug', () => {
    it('should return objectId type for ObjectId', () => {
      const type = logConversationIdDebug('507f1f77bcf86cd799439011', 'test');
      expect(type).toBe('objectId');
    });

    it('should return identifier type for identifier', () => {
      const type = logConversationIdDebug('my-conversation', 'test');
      expect(type).toBe('identifier');
    });

    it('should return invalid type for invalid input', () => {
      const type = logConversationIdDebug('', 'test');
      expect(type).toBe('invalid');
    });

    it('should work without context parameter', () => {
      const type = logConversationIdDebug('507f1f77bcf86cd799439011');
      expect(type).toBe('objectId');
    });
  });

  describe('getConversationApiId', () => {
    it('should return id when it is a valid ObjectId', () => {
      const conversation = { id: '507f1f77bcf86cd799439011' };
      expect(getConversationApiId(conversation)).toBe('507f1f77bcf86cd799439011');
    });

    it('should throw error when conversation is null', () => {
      expect(() => getConversationApiId(null)).toThrow('Conversation object is null or undefined');
    });

    it('should throw error when conversation is undefined', () => {
      expect(() => getConversationApiId(undefined)).toThrow('Conversation object is null or undefined');
    });

    it('should throw error when id is not a valid ObjectId', () => {
      const conversation = { id: 'my-identifier' };
      expect(() => getConversationApiId(conversation)).toThrow(/Invalid conversation object: missing valid ObjectId/);
    });

    it('should throw error when id is missing', () => {
      const conversation = { identifier: 'my-identifier' };
      expect(() => getConversationApiId(conversation)).toThrow(/Invalid conversation object: missing valid ObjectId/);
    });

    it('should throw error when id is empty', () => {
      const conversation = { id: '' };
      expect(() => getConversationApiId(conversation)).toThrow(/Invalid conversation object: missing valid ObjectId/);
    });

    it('should return id when both id and identifier exist', () => {
      const conversation = {
        id: '507f1f77bcf86cd799439011',
        identifier: 'my-readable-id',
      };
      expect(getConversationApiId(conversation)).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('getConversationDisplayId', () => {
    it('should return identifier when it is valid', () => {
      const conversation = {
        id: '507f1f77bcf86cd799439011',
        identifier: 'my-readable-id',
      };
      expect(getConversationDisplayId(conversation)).toBe('my-readable-id');
    });

    it('should return id as fallback when identifier is missing', () => {
      const conversation = { id: '507f1f77bcf86cd799439011' };
      expect(getConversationDisplayId(conversation)).toBe('507f1f77bcf86cd799439011');
    });

    it('should return id when identifier is empty', () => {
      const conversation = {
        id: '507f1f77bcf86cd799439011',
        identifier: '',
      };
      expect(getConversationDisplayId(conversation)).toBe('507f1f77bcf86cd799439011');
    });

    it('should return id when identifier is an ObjectId (not readable)', () => {
      const conversation = {
        id: '507f1f77bcf86cd799439011',
        identifier: '507f1f77bcf86cd799439011',
      };
      // ObjectId is not considered a valid "identifier" so falls back to id
      expect(getConversationDisplayId(conversation)).toBe('507f1f77bcf86cd799439011');
    });

    it('should throw error when conversation is null', () => {
      expect(() => getConversationDisplayId(null)).toThrow('Conversation object is null or undefined');
    });

    it('should throw error when conversation is undefined', () => {
      expect(() => getConversationDisplayId(undefined)).toThrow('Conversation object is null or undefined');
    });

    it('should throw error when both identifier and id are missing', () => {
      const conversation = {};
      expect(() => getConversationDisplayId(conversation)).toThrow(/Invalid conversation object: missing identifier and id/);
    });

    it('should handle identifier with underscore', () => {
      const conversation = {
        id: '507f1f77bcf86cd799439011',
        identifier: 'my_readable_id',
      };
      expect(getConversationDisplayId(conversation)).toBe('my_readable_id');
    });

    it('should handle identifier with hyphen', () => {
      const conversation = {
        id: '507f1f77bcf86cd799439011',
        identifier: 'my-readable-id',
      };
      expect(getConversationDisplayId(conversation)).toBe('my-readable-id');
    });
  });
});
