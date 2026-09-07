/**
 * `validatePasswordStrength` — la règle unique extraite de
 * `PasswordResetService` par #3629, désormais partagée par l'inscription,
 * le changement de mot de passe authentifié, la création admin et la
 * réinitialisation admin.
 */
import { describe, it, expect } from '@jest/globals';
import { validatePasswordStrength, MIN_PASSWORD_SCORE } from '../../utils/password-strength';
import { PASSWORD_MIN_LENGTH } from '@meeshy/shared/utils/validation';

describe('validatePasswordStrength', () => {
  it('accepts a long, varied, high-entropy password', () => {
    const result = validatePasswordStrength('Xk9$mQ2vLp8#nR4wZ');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a password shorter than PASSWORD_MIN_LENGTH', () => {
    const short = 'Ab1'.padEnd(PASSWORD_MIN_LENGTH - 1, 'a');
    const result = validatePasswordStrength(short);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(`minimum ${PASSWORD_MIN_LENGTH} characters`);
  });

  it('rejects a password meeting the length bound but missing a character class', () => {
    // Exactement ce qu'un schéma qui ne borne QUE la longueur laissait passer
    // avant #3629 : douze caractères, tous minuscules.
    const result = validatePasswordStrength('a'.repeat(PASSWORD_MIN_LENGTH));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('one uppercase letter');
    expect(result.errors).toContain('one digit');
  });

  it('rejects a password without an uppercase letter', () => {
    const result = validatePasswordStrength('longenoughbutlowercase123');
    expect(result.errors).toContain('one uppercase letter');
  });

  it('rejects a password without a lowercase letter', () => {
    const result = validatePasswordStrength('LONGENOUGHBUTUPPERCASE123');
    expect(result.errors).toContain('one lowercase letter');
  });

  it('rejects a password without a digit', () => {
    const result = validatePasswordStrength('LongEnoughButNoDigitsHere');
    expect(result.errors).toContain('one digit');
  });

  it('rejects a common, guessable password on zxcvbn score alone, even at PASSWORD_MIN_LENGTH', () => {
    // Meets length + every character class, but is a well-known pattern —
    // exactly the case that length and character classes alone cannot catch.
    const result = validatePasswordStrength('Password12345');
    expect(result.isValid).toBe(false);
    const scoreError = result.errors.find((e) => e.includes('password strength score'));
    expect(scoreError).toBeDefined();
    expect(scoreError).toContain(`minimum: ${MIN_PASSWORD_SCORE}/4`);
  });
});
