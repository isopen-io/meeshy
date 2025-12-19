/**
 * Tests for Email Validator Utility
 */
import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  validateAndNormalizeEmail,
  getEmailValidationError
} from '../utils/email-validator';

describe('isValidEmail', () => {
  describe('valid emails', () => {
    const validEmails = [
      'user@example.com',
      'first.last@example.com',
      'user+tag@example.com',
      'user123@example.com',
      '123@example.com',
      'user@example.co.uk',
      'user@sub.example.com',
      'USER@EXAMPLE.COM',
      'user@example.io',
    ];

    it.each(validEmails)('should accept valid email: %s', (email) => {
      expect(isValidEmail(email)).toBe(true);
    });
  });

  describe('invalid emails', () => {
    const invalidEmails = [
      'debu@',
      'debute@email',
      'test@.com',
      '@example.com',
      'user@domain',
      '',
      'not-an-email',
      'user@',
      '@',
      'user@@example.com',
      'user@example..com',
      '.user@example.com',
      'user.@example.com',
      'user@.example.com',
      'user@example.',
    ];

    it.each(invalidEmails)('should reject invalid email: %s', (email) => {
      expect(isValidEmail(email)).toBe(false);
    });
  });

  it('should reject null/undefined', () => {
    expect(isValidEmail(null as any)).toBe(false);
    expect(isValidEmail(undefined as any)).toBe(false);
  });

  it('should reject very long emails', () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    expect(isValidEmail(longEmail)).toBe(false);
  });

  it('should trim whitespace', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
});

describe('validateAndNormalizeEmail', () => {
  it('should normalize valid email to lowercase', () => {
    expect(validateAndNormalizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
  });

  it('should trim whitespace', () => {
    expect(validateAndNormalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('should return null for invalid email', () => {
    expect(validateAndNormalizeEmail('invalid')).toBeNull();
    expect(validateAndNormalizeEmail('user@')).toBeNull();
    expect(validateAndNormalizeEmail('@example.com')).toBeNull();
  });
});

describe('getEmailValidationError', () => {
  it('should return null for valid email', () => {
    expect(getEmailValidationError('user@example.com')).toBeNull();
  });

  it('should return error for missing email', () => {
    expect(getEmailValidationError('')).toBe('Email requis');
    expect(getEmailValidationError(null as any)).toBe('Email requis');
  });

  it('should return error for email too short', () => {
    expect(getEmailValidationError('a@')).toBe('Email trop court (minimum 3 caractères)');
  });

  it('should return error for missing @', () => {
    expect(getEmailValidationError('userexample.com')).toBe('Email doit contenir un @');
  });

  it('should return error for multiple @', () => {
    expect(getEmailValidationError('user@@example.com')).toBe("Email ne peut contenir qu'un seul @");
  });

  it('should return error for missing domain', () => {
    expect(getEmailValidationError('user@')).toBe('Domaine après @ manquant');
  });

  it('should return error for domain without TLD', () => {
    expect(getEmailValidationError('user@domain')).toBe('Domaine doit contenir un point (ex: exemple.com)');
  });

  it('should return error for invalid TLD', () => {
    expect(getEmailValidationError('user@example.c')).toBe('Extension de domaine invalide (ex: .com, .fr)');
  });

  it('should return error for domain starting with dot', () => {
    expect(getEmailValidationError('user@.example.com')).toBe('Domaine ne peut pas commencer par un point');
  });

  it('should return error for consecutive dots', () => {
    expect(getEmailValidationError('user@example..com')).toBe('Email ne peut pas contenir deux points consécutifs');
  });

  it('should return error for domain ending with dot', () => {
    // When domain ends with dot, TLD is empty so it fails TLD validation first
    expect(getEmailValidationError('user@example.com.')).toBe('Extension de domaine invalide (ex: .com, .fr)');
  });

  it('should return error for local part starting with dot', () => {
    expect(getEmailValidationError('.user@example.com')).toBe('Email ne peut pas commencer ou finir par un point');
  });

  it('should return error for local part ending with dot', () => {
    expect(getEmailValidationError('user.@example.com')).toBe('Email ne peut pas commencer ou finir par un point');
  });

  it('should return error for email too long', () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    expect(getEmailValidationError(longEmail)).toBe('Email trop long (maximum 255 caractères)');
  });

  it('should return error for invalid format (fails regex)', () => {
    // Edge case: passes all checks but fails the final regex
    expect(getEmailValidationError('user@-example.com')).toBe('Format d\'email invalide');
  });
});
