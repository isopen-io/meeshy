/**
 * Tests for utils/conversation-id-utils.ts
 */

import {
  isValidObjectId,
  isConversationIdentifier,
  getConversationIdType,
  getConversationApiId,
  getConversationDisplayId,
} from '@/utils/conversation-id-utils';

const VALID_OBJECT_ID = '6507f1f77bcf86cd79943901'; // 24 hex chars
const VALID_IDENTIFIER = 'my-cool-channel';

// ─── isValidObjectId ──────────────────────────────────────────────────────────

describe('isValidObjectId', () => {
  it('returns true for a valid 24-char hex string', () => {
    expect(isValidObjectId(VALID_OBJECT_ID)).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidObjectId('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidObjectId(null as any)).toBe(false);
  });

  it('returns false for a string shorter than 24 chars', () => {
    expect(isValidObjectId('6507f1f77bcf86cd7994390')).toBe(false);
  });

  it('returns false for a string longer than 24 chars', () => {
    expect(isValidObjectId('6507f1f77bcf86cd799439011')).toBe(false);
  });

  it('returns false when the string contains non-hex characters', () => {
    expect(isValidObjectId('6507f1f77bcf86cd79943g01')).toBe(false);
  });

  it('returns true for uppercase hex', () => {
    expect(isValidObjectId('6507F1F77BCF86CD79943901')).toBe(true);
  });
});

// ─── isConversationIdentifier ─────────────────────────────────────────────────

describe('isConversationIdentifier', () => {
  it('returns true for alphanumeric strings', () => {
    expect(isConversationIdentifier('mychannel')).toBe(true);
  });

  it('returns true for strings with hyphens', () => {
    expect(isConversationIdentifier('my-cool-channel')).toBe(true);
  });

  it('returns true for strings with underscores', () => {
    expect(isConversationIdentifier('my_channel')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isConversationIdentifier('')).toBe(false);
  });

  it('returns false for a valid ObjectId (24 hex chars)', () => {
    expect(isConversationIdentifier(VALID_OBJECT_ID)).toBe(false);
  });

  it('returns false for strings with spaces', () => {
    expect(isConversationIdentifier('my channel')).toBe(false);
  });

  it('returns false for strings with special characters', () => {
    expect(isConversationIdentifier('my#channel')).toBe(false);
  });
});

// ─── getConversationIdType ────────────────────────────────────────────────────

describe('getConversationIdType', () => {
  it('returns "objectId" for a valid ObjectId', () => {
    expect(getConversationIdType(VALID_OBJECT_ID)).toBe('objectId');
  });

  it('returns "identifier" for a readable identifier', () => {
    expect(getConversationIdType(VALID_IDENTIFIER)).toBe('identifier');
  });

  it('returns "invalid" for an empty string', () => {
    expect(getConversationIdType('')).toBe('invalid');
  });

  it('returns "invalid" for a string with special characters', () => {
    expect(getConversationIdType('my channel!')).toBe('invalid');
  });

  it('returns "invalid" for null', () => {
    expect(getConversationIdType(null as any)).toBe('invalid');
  });
});

// ─── getConversationApiId ─────────────────────────────────────────────────────

describe('getConversationApiId', () => {
  it('returns the id when it is a valid ObjectId', () => {
    expect(getConversationApiId({ id: VALID_OBJECT_ID })).toBe(VALID_OBJECT_ID);
  });

  it('throws for null conversation', () => {
    expect(() => getConversationApiId(null)).toThrow();
  });

  it('throws when the conversation has no valid ObjectId', () => {
    expect(() => getConversationApiId({ id: 'not-an-objectid' })).toThrow();
  });

  it('throws when the conversation has no id at all', () => {
    expect(() => getConversationApiId({})).toThrow();
  });
});

// ─── getConversationDisplayId ─────────────────────────────────────────────────

describe('getConversationDisplayId', () => {
  it('returns the identifier when it is a valid readable identifier', () => {
    expect(getConversationDisplayId({ id: VALID_OBJECT_ID, identifier: VALID_IDENTIFIER })).toBe(VALID_IDENTIFIER);
  });

  it('falls back to the id when identifier is absent', () => {
    expect(getConversationDisplayId({ id: VALID_OBJECT_ID })).toBe(VALID_OBJECT_ID);
  });

  it('falls back to the id when identifier is an ObjectId (not a readable id)', () => {
    expect(getConversationDisplayId({ id: VALID_OBJECT_ID, identifier: VALID_OBJECT_ID })).toBe(VALID_OBJECT_ID);
  });

  it('throws for null conversation', () => {
    expect(() => getConversationDisplayId(null)).toThrow();
  });

  it('throws when neither identifier nor id is present', () => {
    expect(() => getConversationDisplayId({})).toThrow();
  });
});
