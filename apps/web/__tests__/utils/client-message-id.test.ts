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
  it('matches a valid cid_ prefixed UUID v4', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('cid_550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects a plain UUID without cid_ prefix', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects wrong prefix', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('msg_550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('')).toBe(false);
  });
});

// ─── generateClientMessageId ──────────────────────────────────────────────────

describe('generateClientMessageId', () => {
  it('starts with cid_', () => {
    const id = generateClientMessageId();
    expect(id.startsWith('cid_')).toBe(true);
  });

  it('matches the CLIENT_MESSAGE_ID_REGEX pattern', () => {
    const id = generateClientMessageId();
    expect(CLIENT_MESSAGE_ID_REGEX.test(id)).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateClientMessageId()));
    expect(ids.size).toBe(20);
  });
});

// ─── isValidClientMessageId ───────────────────────────────────────────────────

describe('isValidClientMessageId', () => {
  it('returns true for a generated ID', () => {
    const id = generateClientMessageId();
    expect(isValidClientMessageId(id)).toBe(true);
  });

  it('returns false for arbitrary string', () => {
    expect(isValidClientMessageId('not-a-message-id')).toBe(false);
  });

  it('returns false for plain UUID', () => {
    expect(isValidClientMessageId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidClientMessageId('')).toBe(false);
  });
});
