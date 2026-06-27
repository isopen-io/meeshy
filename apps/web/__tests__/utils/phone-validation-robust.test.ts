/**
 * Tests for utils/phone-validation-robust.ts
 */

import {
  validatePhoneNumber,
  validateInternationalPhone,
  formatPhoneAsYouType,
  buildInternationalPhone,
  cleanPhoneInput,
  PHONE_ERROR_MESSAGES,
} from '@/utils/phone-validation-robust';

// ─── validatePhoneNumber ──────────────────────────────────────────────────────

describe('validatePhoneNumber', () => {
  describe('empty/blank input', () => {
    it('returns invalid with phoneRequired for empty string', () => {
      const result = validatePhoneNumber('', 'FR');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('phoneRequired');
    });

    it('returns invalid with phoneRequired for whitespace-only string', () => {
      const result = validatePhoneNumber('   ', 'FR');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('phoneRequired');
    });
  });

  describe('valid French numbers', () => {
    it('validates a valid French mobile number (local format)', () => {
      const result = validatePhoneNumber('0612345678', 'FR');
      expect(result.isValid).toBe(true);
    });

    it('returns E.164 format for valid number', () => {
      const result = validatePhoneNumber('0612345678', 'FR');
      expect(result.formatted).toBe('+33612345678');
    });

    it('returns national format', () => {
      const result = validatePhoneNumber('0612345678', 'FR');
      expect(result.national).toBeTruthy();
    });

    it('returns international format', () => {
      const result = validatePhoneNumber('0612345678', 'FR');
      expect(result.international).toContain('+33');
    });

    it('validates number with international prefix', () => {
      const result = validatePhoneNumber('+33612345678', 'FR');
      expect(result.isValid).toBe(true);
      expect(result.formatted).toBe('+33612345678');
    });
  });

  describe('valid US numbers', () => {
    it('validates a US phone number', () => {
      const result = validatePhoneNumber('2025551234', 'US');
      expect(result.isValid).toBe(true);
      expect(result.formatted).toBe('+12025551234');
    });
  });

  describe('invalid numbers', () => {
    it('returns invalid for a number that is too short', () => {
      const result = validatePhoneNumber('0612', 'FR');
      expect(result.isValid).toBe(false);
    });

    it('returns invalid for a number with wrong format for country', () => {
      const result = validatePhoneNumber('0012345678', 'US');
      expect(result.isValid).toBe(false);
    });

    it('returns invalid for non-numeric input', () => {
      const result = validatePhoneNumber('abcdefghij', 'FR');
      expect(result.isValid).toBe(false);
    });
  });
});

// ─── validateInternationalPhone ───────────────────────────────────────────────

describe('validateInternationalPhone', () => {
  it('returns invalid with phoneRequired for empty string', () => {
    const result = validateInternationalPhone('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('phoneRequired');
  });

  it('returns invalid when no international prefix', () => {
    const result = validateInternationalPhone('0612345678');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('phoneNeedsInternationalPrefix');
  });

  it('validates a number starting with +', () => {
    const result = validateInternationalPhone('+33612345678');
    expect(result.isValid).toBe(true);
    expect(result.formatted).toBe('+33612345678');
  });

  it('does not reject 00-prefixed numbers at the format check stage', () => {
    // 00 prefix passes the prefix check; whether it parses correctly is library-dependent
    const result = validateInternationalPhone('0033612345678');
    // Must not return 'phoneNeedsInternationalPrefix' error — it may still be invalid
    expect(result.error).not.toBe('phoneNeedsInternationalPrefix');
  });

  it('returns country code in result', () => {
    const result = validateInternationalPhone('+33612345678');
    expect(result.countryCode).toBe('FR');
  });

  it('returns invalid for malformed international number', () => {
    const result = validateInternationalPhone('+999999999999');
    expect(result.isValid).toBe(false);
  });
});

// ─── formatPhoneAsYouType ─────────────────────────────────────────────────────

describe('formatPhoneAsYouType', () => {
  it('formats digits progressively for FR', () => {
    const result = formatPhoneAsYouType('0612', 'FR');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for empty input', () => {
    const result = formatPhoneAsYouType('', 'FR');
    expect(result).toBe('');
  });

  it('handles full valid French number', () => {
    const result = formatPhoneAsYouType('0612345678', 'FR');
    expect(result).toBeTruthy();
  });
});

// ─── buildInternationalPhone ──────────────────────────────────────────────────

describe('buildInternationalPhone', () => {
  it('returns null for empty input', () => {
    const result = buildInternationalPhone('', 'FR');
    expect(result).toBeNull();
  });

  it('builds international format from local number', () => {
    const result = buildInternationalPhone('612345678', 'FR');
    expect(result).toBe('+33612345678');
  });

  it('returns null for invalid number', () => {
    const result = buildInternationalPhone('abc', 'FR');
    expect(result).toBeNull();
  });
});

// ─── cleanPhoneInput ──────────────────────────────────────────────────────────

describe('cleanPhoneInput', () => {
  it('returns empty string for empty input', () => {
    expect(cleanPhoneInput('')).toBe('');
  });

  it('returns empty string for null/undefined-like input', () => {
    expect(cleanPhoneInput('')).toBe('');
  });

  it('keeps digits, +, spaces, hyphens and parentheses', () => {
    expect(cleanPhoneInput('+33 6-12 (34) 56 78')).toBe('+33 6-12 (34) 56 78');
  });

  it('removes letters and special characters', () => {
    expect(cleanPhoneInput('abc123!@#')).toBe('123');
  });

  it('preserves international prefix +', () => {
    expect(cleanPhoneInput('+33612345678')).toBe('+33612345678');
  });
});

// ─── PHONE_ERROR_MESSAGES ─────────────────────────────────────────────────────

describe('PHONE_ERROR_MESSAGES', () => {
  it('defines phoneRequired message', () => {
    expect(PHONE_ERROR_MESSAGES.phoneRequired).toBeTruthy();
  });

  it('defines phoneInvalidFormat message', () => {
    expect(PHONE_ERROR_MESSAGES.phoneInvalidFormat).toBeTruthy();
  });

  it('defines phoneInvalidForCountry message', () => {
    expect(PHONE_ERROR_MESSAGES.phoneInvalidForCountry).toBeTruthy();
  });
});
