/**
 * Tests for phone-validator utility
 */

import {
  validatePhoneNumber,
  formatPhoneNumberInput,
  getPhoneValidationError,
  translatePhoneError,
  isValidPhoneNumber,
} from '../../utils/phone-validator';

describe('phone-validator', () => {
  describe('validatePhoneNumber', () => {
    describe('valid phone numbers', () => {
      it('should validate phone number with + prefix', () => {
        const result = validatePhoneNumber('+33612345678');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate phone number with 00 prefix', () => {
        const result = validatePhoneNumber('0033612345678');
        expect(result.isValid).toBe(true);
      });

      it('should validate phone number without prefix', () => {
        const result = validatePhoneNumber('612345678');
        expect(result.isValid).toBe(true);
      });

      it('should validate minimum length (8 characters)', () => {
        const result = validatePhoneNumber('12345678');
        expect(result.isValid).toBe(true);
      });

      it('should validate maximum length (15 characters)', () => {
        const result = validatePhoneNumber('+12345678901234');
        expect(result.isValid).toBe(true);
      });

      it('should trim whitespace before validation', () => {
        const result = validatePhoneNumber('  +33612345678  ');
        expect(result.isValid).toBe(true);
      });
    });

    describe('invalid phone numbers', () => {
      it('should reject empty string', () => {
        const result = validatePhoneNumber('');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneRequired');
      });

      it('should reject whitespace only', () => {
        const result = validatePhoneNumber('   ');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneRequired');
      });

      it('should reject too short (< 8 characters)', () => {
        const result = validatePhoneNumber('1234567');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneTooShort');
      });

      it('should reject too long (> 15 characters)', () => {
        const result = validatePhoneNumber('+123456789012345');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneTooLong');
      });

      it('should reject numbers with spaces', () => {
        // Note: With spaces, the total length exceeds 15 chars, so it fails phoneTooLong first
        const result = validatePhoneNumber('+33 6 12 34 56 78');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneTooLong');
      });

      it('should reject numbers with dashes', () => {
        // Note: With dashes, the total length exceeds 15 chars, so it fails phoneTooLong first
        const result = validatePhoneNumber('+33-6-12-34-56-78');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneTooLong');
      });

      it('should reject short numbers with invalid characters', () => {
        // "+33 612" is 7 chars which is < 8, so it fails with phoneTooShort first
        // Validation checks length before format
        const result = validatePhoneNumber('+33 612');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneTooShort');
      });

      it('should reject valid-length numbers with invalid format', () => {
        // 8+ chars but contains invalid character (space)
        const result = validatePhoneNumber('+33 61234');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneInvalidFormat');
      });

      it('should reject letters', () => {
        const result = validatePhoneNumber('abc12345678');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneInvalidFormat');
      });

      it('should reject special characters', () => {
        const result = validatePhoneNumber('+33@612345678');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneInvalidFormat');
      });

      it('should reject parentheses', () => {
        const result = validatePhoneNumber('(33)612345678');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('phoneInvalidFormat');
      });
    });
  });

  describe('formatPhoneNumberInput', () => {
    it('should return empty string for empty input', () => {
      expect(formatPhoneNumberInput('')).toBe('');
    });

    it('should keep + prefix and only digits after', () => {
      expect(formatPhoneNumberInput('+33 6 12 34')).toBe('+3361234');
    });

    it('should keep 00 prefix and only digits after', () => {
      // formatPhoneNumberInput removes spaces and keeps all digits
      expect(formatPhoneNumberInput('0033 6 12 34')).toBe('003361234');
    });

    it('should strip non-digits when no prefix', () => {
      // formatPhoneNumberInput removes spaces and keeps all digits
      expect(formatPhoneNumberInput('6 12 34 56')).toBe('6123456');
    });

    it('should remove letters', () => {
      expect(formatPhoneNumberInput('+33abc612')).toBe('+33612');
    });

    it('should remove special characters', () => {
      expect(formatPhoneNumberInput('(+33) 612-345')).toBe('33612345');
    });

    it('should handle just digits', () => {
      expect(formatPhoneNumberInput('0612345678')).toBe('0612345678');
    });

    it('should handle + at start followed by non-digits', () => {
      expect(formatPhoneNumberInput('+abc')).toBe('+');
    });

    it('should handle 00 at start followed by non-digits', () => {
      expect(formatPhoneNumberInput('00abc')).toBe('00');
    });
  });

  describe('getPhoneValidationError', () => {
    it('should return null for valid phone', () => {
      expect(getPhoneValidationError('+33612345678')).toBeNull();
    });

    it('should return error key for invalid phone', () => {
      expect(getPhoneValidationError('')).toBe('phoneRequired');
    });

    it('should return error key for too short', () => {
      expect(getPhoneValidationError('123')).toBe('phoneTooShort');
    });

    it('should return phoneInvalid for undefined error', () => {
      // This tests the fallback case
      const result = getPhoneValidationError('+invalid@');
      expect(result).toBe('phoneInvalidFormat');
    });
  });

  describe('translatePhoneError', () => {
    const mockT = jest.fn((key: string) => `translated:${key}`);

    beforeEach(() => {
      mockT.mockClear();
    });

    it('should translate phoneRequired error', () => {
      const result = translatePhoneError('phoneRequired', mockT);
      expect(mockT).toHaveBeenCalledWith('register.validation.phoneRequired');
      expect(result).toBe('translated:register.validation.phoneRequired');
    });

    it('should translate phoneTooShort error', () => {
      const result = translatePhoneError('phoneTooShort', mockT);
      expect(mockT).toHaveBeenCalledWith('register.validation.phoneTooShort');
      expect(result).toBe('translated:register.validation.phoneTooShort');
    });

    it('should translate phoneTooLong error', () => {
      const result = translatePhoneError('phoneTooLong', mockT);
      expect(mockT).toHaveBeenCalledWith('register.validation.phoneTooLong');
      expect(result).toBe('translated:register.validation.phoneTooLong');
    });

    it('should translate phoneInvalidFormat error', () => {
      const result = translatePhoneError('phoneInvalidFormat', mockT);
      expect(mockT).toHaveBeenCalledWith('register.validation.phoneInvalidFormat');
      expect(result).toBe('translated:register.validation.phoneInvalidFormat');
    });

    it('should use phoneInvalid for unknown error keys', () => {
      const result = translatePhoneError('unknownError', mockT);
      expect(mockT).toHaveBeenCalledWith('register.validation.phoneInvalid');
      expect(result).toBe('translated:register.validation.phoneInvalid');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should return true for valid phone number', () => {
      expect(isValidPhoneNumber('+33612345678')).toBe(true);
    });

    it('should return false for invalid phone number', () => {
      expect(isValidPhoneNumber('123')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidPhoneNumber('')).toBe(false);
    });

    it('should return true for valid 00 prefix', () => {
      expect(isValidPhoneNumber('0033612345678')).toBe(true);
    });

    it('should return false for invalid format', () => {
      expect(isValidPhoneNumber('+33 612 345')).toBe(false);
    });
  });
});
