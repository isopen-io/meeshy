/**
 * Tests for utils/client-message-id.ts
 */

import {
  generateClientMessageId,
  isValidClientMessageId,
  CLIENT_MESSAGE_ID_REGEX,
} from '@/utils/client-message-id';

// ─── CLIENT_MESSAGE_ID_REGEX ──────────────────────────────────────────────────

describe('CLIENT_MESSAGE_ID_REGEX', () => {
  it('matches a valid clientMessageId', () => {
    const id = generateClientMessageId();
    expect(CLIENT_MESSAGE_ID_REGEX.test(id)).toBe(true);
  });

  it('does not match a plain UUID', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('does not match a MongoDB ObjectId', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('6507f1f77bcf86cd79943901')).toBe(false);
  });

  it('does not match empty string', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('')).toBe(false);
  });
});

// ─── generateClientMessageId ──────────────────────────────────────────────────

describe('generateClientMessageId', () => {
  it('returns a string starting with "cid_"', () => {
    const id = generateClientMessageId();
    expect(id.startsWith('cid_')).toBe(true);
  });

  it('returns a string matching the regex', () => {
    const id = generateClientMessageId();
    expect(CLIENT_MESSAGE_ID_REGEX.test(id)).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateClientMessageId()));
    expect(ids.size).toBe(100);
  });

  it('UUID part has version 4 (4 at position 13)', () => {
    // format: cid_xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx
    for (let i = 0; i < 10; i++) {
      const id = generateClientMessageId();
      const uuidPart = id.slice(4); // strip "cid_"
      expect(uuidPart[14]).toBe('4'); // version digit
    }
  });
});

// ─── isValidClientMessageId ───────────────────────────────────────────────────

describe('isValidClientMessageId', () => {
  it('returns true for a generated clientMessageId', () => {
    const id = generateClientMessageId();
    expect(isValidClientMessageId(id)).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidClientMessageId('')).toBe(false);
  });

  it('returns false for plain UUID without cid_ prefix', () => {
    expect(isValidClientMessageId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('returns false for MongoDB ObjectId', () => {
    expect(isValidClientMessageId('6507f1f77bcf86cd79943901')).toBe(false);
  });

  it('returns false for cid_ prefix alone', () => {
    expect(isValidClientMessageId('cid_')).toBe(false);
  });
});
