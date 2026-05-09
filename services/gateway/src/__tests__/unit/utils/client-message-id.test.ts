/**
 * client-message-id helper — cross-platform contract tests
 *
 * These tests pin the `cid_<UUID v4 lowercase>` shape that the iOS SDK
 * (`packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`),
 * the Web client and the Gateway dedup contract all rely on.
 *
 * If any of these break, the iOS offline queue / web optimistic-send /
 * gateway `(conversationId, clientMessageId)` partial-unique index will
 * silently drift out of sync — protect this contract aggressively.
 *
 * Run with: pnpm test client-message-id
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateClientMessageId,
  CLIENT_MESSAGE_ID_REGEX,
  isValidClientMessageId,
} from '@meeshy/shared/utils/client-message-id';

describe('client-message-id helper (cross-platform contract)', () => {
  it('generates ids that match the canonical cid_<uuid v4 lowercase> format', () => {
    for (let i = 0; i < 100; i++) {
      const cid = generateClientMessageId();
      expect(cid).toMatch(CLIENT_MESSAGE_ID_REGEX);
      expect(cid).toMatch(/^cid_/);
      expect(cid).toBe(cid.toLowerCase());
    }
  });

  it('produces unique ids across 1000 invocations', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateClientMessageId());
    }
    expect(seen.size).toBe(1000);
  });

  it('total length is 40 characters (cid_ prefix + 36-char UUID)', () => {
    const cid = generateClientMessageId();
    expect(cid.length).toBe(40);
  });

  it('rejects uppercase hex (Swift UUID().uuidString default — would break the regex)', () => {
    const upper = 'cid_550E8400-E29B-41D4-A716-446655440000';
    expect(isValidClientMessageId(upper)).toBe(false);
  });

  it('rejects missing cid_ prefix', () => {
    expect(isValidClientMessageId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects non-v4 version digit', () => {
    // version digit (13th hex char of the UUID, after `cid_`) must be `4`.
    expect(isValidClientMessageId('cid_550e8400-e29b-11d4-a716-446655440000')).toBe(false);
  });

  it('rejects invalid variant digit', () => {
    // variant digit must be one of 8/9/a/b — `c` is invalid.
    expect(isValidClientMessageId('cid_550e8400-e29b-41d4-c716-446655440000')).toBe(false);
  });

  it('rejects truncated values', () => {
    expect(isValidClientMessageId('cid_550e8400-e29b-41d4-a716-44665544')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidClientMessageId('')).toBe(false);
  });

  it('rejects legacy temp_/offline_/retry_ prefixes', () => {
    expect(isValidClientMessageId('temp_550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    expect(isValidClientMessageId('offline_550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    expect(isValidClientMessageId('retry_550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('regex is anchored (no leading/trailing slop)', () => {
    expect(CLIENT_MESSAGE_ID_REGEX.source.startsWith('^')).toBe(true);
    expect(CLIENT_MESSAGE_ID_REGEX.source.endsWith('$')).toBe(true);
  });

  it('rejects ids with leading/trailing whitespace or extra suffix', () => {
    const valid = generateClientMessageId();
    expect(isValidClientMessageId(` ${valid}`)).toBe(false);
    expect(isValidClientMessageId(`${valid} `)).toBe(false);
    expect(isValidClientMessageId(`${valid}x`)).toBe(false);
    expect(isValidClientMessageId(`x${valid}`)).toBe(false);
  });

  it('accepts a known-good Swift-style id (lowercased UUID v4)', () => {
    // What the iOS helper produces after `UUID().uuidString.lowercased()`.
    const swiftStyle = 'cid_550e8400-e29b-41d4-a716-446655440000';
    expect(isValidClientMessageId(swiftStyle)).toBe(true);
  });
});
