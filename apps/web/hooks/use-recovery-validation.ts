'use client';

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function useRecoveryValidation() {
  const validateEmail = (email: string, errorMsg: string): ValidationResult => {
    if (!email.includes('@')) {
      return { isValid: false, error: errorMsg };
    }
    return { isValid: true };
  };

  const validatePhone = (phone: string, errorMsg: string): ValidationResult => {
    if (phone.replace(/\D/g, '').length < 8) {
      return { isValid: false, error: errorMsg };
    }
    return { isValid: true };
  };

  const validateIdentity = (username: string, email: string, errorMsg: string): ValidationResult => {
    if (!username.trim() || !email.trim()) {
      return { isValid: false, error: errorMsg };
    }
    return { isValid: true };
  };

  const validateOtpCode = (code: string, errorMsg: string): ValidationResult => {
    if (code.length !== 6) {
      return { isValid: false, error: errorMsg };
    }
    return { isValid: true };
  };

  return {
    validateEmail,
    validatePhone,
    validateIdentity,
    validateOtpCode,
  };
}
