/**
 * Tests for hooks/use-recovery-validation.ts
 */

import { renderHook } from '@testing-library/react';
import { useRecoveryValidation } from '@/hooks/use-recovery-validation';

const ERROR = 'invalid';

const useValidators = () => renderHook(() => useRecoveryValidation()).result.current;

// ─── validateEmail ────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  it('returns invalid when email has no @ symbol', () => {
    const { validateEmail } = useValidators();
    expect(validateEmail('notanemail', ERROR)).toEqual({ isValid: false, error: ERROR });
  });

  it('returns valid for a well-formed email', () => {
    const { validateEmail } = useValidators();
    expect(validateEmail('user@example.com', ERROR)).toEqual({ isValid: true });
  });

  it('passes the caller-supplied error message through', () => {
    const { validateEmail } = useValidators();
    const msg = 'Adresse email invalide';
    expect(validateEmail('bad', msg)).toEqual({ isValid: false, error: msg });
  });
});

// ─── validatePhone ────────────────────────────────────────────────────────────

describe('validatePhone', () => {
  it('returns invalid when stripped digits are fewer than 8', () => {
    const { validatePhone } = useValidators();
    expect(validatePhone('123', ERROR)).toEqual({ isValid: false, error: ERROR });
  });

  it('returns valid for a phone with at least 8 digits', () => {
    const { validatePhone } = useValidators();
    expect(validatePhone('+33 6 12 34 56 78', ERROR)).toEqual({ isValid: true });
  });

  it('strips non-digit characters before counting', () => {
    const { validatePhone } = useValidators();
    // '12345678' → 8 digits → valid
    expect(validatePhone('12345678', ERROR)).toEqual({ isValid: true });
    // '1234567' → 7 digits → invalid
    expect(validatePhone('1234567', ERROR)).toEqual({ isValid: false, error: ERROR });
  });
});

// ─── validateIdentity ────────────────────────────────────────────────────────

describe('validateIdentity', () => {
  it('returns invalid when username is empty', () => {
    const { validateIdentity } = useValidators();
    expect(validateIdentity('', 'user@example.com', ERROR)).toEqual({ isValid: false, error: ERROR });
  });

  it('returns invalid when email is empty', () => {
    const { validateIdentity } = useValidators();
    expect(validateIdentity('alice', '', ERROR)).toEqual({ isValid: false, error: ERROR });
  });

  it('returns invalid when both username and email are blank (spaces)', () => {
    const { validateIdentity } = useValidators();
    expect(validateIdentity('   ', '   ', ERROR)).toEqual({ isValid: false, error: ERROR });
  });

  it('returns valid when both username and email are non-empty', () => {
    const { validateIdentity } = useValidators();
    expect(validateIdentity('alice', 'alice@example.com', ERROR)).toEqual({ isValid: true });
  });
});

// ─── validateOtpCode ─────────────────────────────────────────────────────────

describe('validateOtpCode', () => {
  it('returns invalid when code length is not 6', () => {
    const { validateOtpCode } = useValidators();
    expect(validateOtpCode('12345', ERROR)).toEqual({ isValid: false, error: ERROR });
    expect(validateOtpCode('1234567', ERROR)).toEqual({ isValid: false, error: ERROR });
    expect(validateOtpCode('', ERROR)).toEqual({ isValid: false, error: ERROR });
  });

  it('returns valid when code is exactly 6 characters', () => {
    const { validateOtpCode } = useValidators();
    expect(validateOtpCode('123456', ERROR)).toEqual({ isValid: true });
  });
});
