/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  MESSAGE_LIMITS,
  validateMessageLength,
  shouldConvertToTextAttachment,
  canTranslateMessage,
} from '../../../config/message-limits';

describe('MESSAGE_LIMITS', () => {
  it('has expected default values', () => {
    expect(MESSAGE_LIMITS.MAX_MESSAGE_LENGTH).toBe(4000);
    expect(MESSAGE_LIMITS.MAX_TEXT_ATTACHMENT_THRESHOLD).toBe(4000);
    expect(MESSAGE_LIMITS.MAX_TRANSLATION_LENGTH).toBe(10000);
  });
});

describe('validateMessageLength', () => {
  it('rejects empty string', () => {
    const result = validateMessageLength('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects whitespace-only string', () => {
    const result = validateMessageLength('   ');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('accepts a short valid message', () => {
    const result = validateMessageLength('Hello world');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a message exactly at the limit', () => {
    const atLimit = 'x'.repeat(MESSAGE_LIMITS.MAX_MESSAGE_LENGTH);
    const result = validateMessageLength(atLimit);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects a message one character over the limit', () => {
    const overLimit = 'x'.repeat(MESSAGE_LIMITS.MAX_MESSAGE_LENGTH + 1);
    const result = validateMessageLength(overLimit);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`${MESSAGE_LIMITS.MAX_MESSAGE_LENGTH}`);
    expect(result.error).toContain(`${overLimit.length}`);
  });

  it('error message includes both limit and actual length', () => {
    const overLimit = 'y'.repeat(5000);
    const result = validateMessageLength(overLimit);
    expect(result.error).toContain('5000');
  });
});

describe('shouldConvertToTextAttachment', () => {
  it('returns false for content at the threshold (not over)', () => {
    const atThreshold = 'a'.repeat(MESSAGE_LIMITS.MAX_TEXT_ATTACHMENT_THRESHOLD);
    expect(shouldConvertToTextAttachment(atThreshold)).toBe(false);
  });

  it('returns true for content one character over the threshold', () => {
    const overThreshold = 'a'.repeat(MESSAGE_LIMITS.MAX_TEXT_ATTACHMENT_THRESHOLD + 1);
    expect(shouldConvertToTextAttachment(overThreshold)).toBe(true);
  });

  it('returns false for short content', () => {
    expect(shouldConvertToTextAttachment('short')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(shouldConvertToTextAttachment('')).toBe(false);
  });
});

describe('canTranslateMessage', () => {
  it('returns true for content within translation limit', () => {
    const withinLimit = 'b'.repeat(MESSAGE_LIMITS.MAX_TRANSLATION_LENGTH);
    expect(canTranslateMessage(withinLimit)).toBe(true);
  });

  it('returns false for content one character over the translation limit', () => {
    const overLimit = 'b'.repeat(MESSAGE_LIMITS.MAX_TRANSLATION_LENGTH + 1);
    expect(canTranslateMessage(overLimit)).toBe(false);
  });

  it('returns true for short content', () => {
    expect(canTranslateMessage('Bonjour')).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(canTranslateMessage('')).toBe(true);
  });
});
