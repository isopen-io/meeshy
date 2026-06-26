/**
 * Additional coverage for normalize.ts — lines not reached by the primary suite:
 *  - looksLikePhoneNumber: empty string (line 23), email with @ (line 30)
 *  - normalizePhoneWithCountry: empty input (line 72), parsed===null guard (line 82),
 *    error catch (lines 92-93)
 *  - validatePhoneNumber: all branches (lines 104-111)
 */

import { describe, it, expect } from '@jest/globals';
import {
  looksLikePhoneNumber,
  normalizePhoneWithCountry,
  validatePhoneNumber,
} from '../../../utils/normalize';

describe('looksLikePhoneNumber', () => {
  it('returns false for empty string', () => {
    expect(looksLikePhoneNumber('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(looksLikePhoneNumber('   ')).toBe(false);
  });

  it('returns false for string containing @', () => {
    expect(looksLikePhoneNumber('user@example.com')).toBe(false);
  });

  it('returns true for a valid E.164-style number', () => {
    expect(looksLikePhoneNumber('+33612345678')).toBe(true);
  });

  it('returns true for a digit-only string with 6+ digits', () => {
    expect(looksLikePhoneNumber('0612345678')).toBe(true);
  });

  it('returns false for a short digit string (< 6 digits)', () => {
    expect(looksLikePhoneNumber('12345')).toBe(false);
  });

  it('returns false for a username (letters, no + or digit start)', () => {
    expect(looksLikePhoneNumber('johnsmith')).toBe(false);
  });
});

describe('normalizePhoneWithCountry', () => {
  it('returns null for empty string', () => {
    expect(normalizePhoneWithCountry('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizePhoneWithCountry('   ')).toBeNull();
  });

  it('returns a result for a valid French national number with country hint', () => {
    const result = normalizePhoneWithCountry('0612345678', 'FR');
    expect(result).not.toBeNull();
    expect(result?.phoneNumber).toBe('+33612345678');
    expect(result?.countryCode).toBe('FR');
    expect(result?.isValid).toBe(true);
  });

  it('returns null and does not throw for a completely invalid input', () => {
    // "zzz" can't be parsed as a phone number — library throws, catch returns null
    const result = normalizePhoneWithCountry('zzz-not-a-phone');
    expect(result).toBeNull();
  });

  it('returns country code from parsed result for a known international number', () => {
    // A valid French E.164 number — libphonenumber resolves country to 'FR'
    const result = normalizePhoneWithCountry('+33612345678');
    expect(result).not.toBeNull();
    expect(result?.countryCode).toBe('FR');
    expect(result?.isValid).toBe(true);
  });
});

describe('validatePhoneNumber', () => {
  it('returns false for empty string', () => {
    expect(validatePhoneNumber('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(validatePhoneNumber('   ')).toBe(false);
  });

  it('returns true for a valid E.164 phone number', () => {
    expect(validatePhoneNumber('+33612345678')).toBe(true);
  });

  it('returns true for a valid national number when country code provided', () => {
    expect(validatePhoneNumber('0612345678', 'FR')).toBe(true);
  });

  it('returns false for an invalid phone number', () => {
    expect(validatePhoneNumber('not-a-phone')).toBe(false);
  });

  it('returns false and does not throw when isValidPhoneNumber throws internally', () => {
    // An input that causes the library to throw is caught and returns false
    expect(validatePhoneNumber('+++')).toBe(false);
  });
});
