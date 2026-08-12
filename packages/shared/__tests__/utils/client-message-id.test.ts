import { describe, it, expect } from 'vitest';
import {
  generateClientMessageId,
  isValidClientMessageId,
  CLIENT_MESSAGE_ID_REGEX,
} from '../../utils/client-message-id.js';

describe('generateClientMessageId', () => {
  it('produces a string with cid_ prefix', () => {
    const id = generateClientMessageId();
    expect(id).toMatch(/^cid_/);
  });

  it('matches the full CLIENT_MESSAGE_ID_REGEX', () => {
    const id = generateClientMessageId();
    expect(CLIENT_MESSAGE_ID_REGEX.test(id)).toBe(true);
  });

  it('produces unique values on each call', () => {
    const ids = Array.from({ length: 20 }, () => generateClientMessageId());
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });

  it('UUID segment contains only lowercase hex and hyphens', () => {
    const id = generateClientMessageId();
    const uuid = id.slice('cid_'.length);
    expect(uuid).toMatch(/^[0-9a-f-]+$/);
  });

  it('UUID segment is version 4 (4xxx-yxxx pattern)', () => {
    const id = generateClientMessageId();
    const uuid = id.slice('cid_'.length);
    const parts = uuid.split('-');
    expect(parts).toHaveLength(5);
    expect(parts[2]?.[0]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(parts[3]?.[0]);
  });
});

describe('isValidClientMessageId', () => {
  it('returns true for a generated id', () => {
    expect(isValidClientMessageId(generateClientMessageId())).toBe(true);
  });

  it('returns true for a known-valid id', () => {
    expect(isValidClientMessageId('cid_550e8400-e29b-4d74-a716-446655440000')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidClientMessageId('')).toBe(false);
  });

  it('returns false for id without cid_ prefix', () => {
    expect(isValidClientMessageId('550e8400-e29b-4d74-a716-446655440000')).toBe(false);
  });

  it('returns false for uppercase UUID', () => {
    expect(isValidClientMessageId('cid_550E8400-E29B-4D74-A716-446655440000')).toBe(false);
  });

  it('returns false for wrong UUID version (not v4)', () => {
    expect(isValidClientMessageId('cid_550e8400-e29b-3d74-a716-446655440000')).toBe(false);
  });

  it('returns false for arbitrary string', () => {
    expect(isValidClientMessageId('not-an-id')).toBe(false);
  });

  it('returns false for cid_ prefix only', () => {
    expect(isValidClientMessageId('cid_')).toBe(false);
  });

  it('returns false for MongoDB ObjectId format', () => {
    expect(isValidClientMessageId('507f1f77bcf86cd799439011')).toBe(false);
  });
});

describe('CLIENT_MESSAGE_ID_REGEX', () => {
  it('is a RegExp', () => {
    expect(CLIENT_MESSAGE_ID_REGEX).toBeInstanceOf(RegExp);
  });

  it('does not match partial ids', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.test('cid_550e8400')).toBe(false);
  });
});
