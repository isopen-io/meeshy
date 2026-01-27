'use client';

import { useState, useCallback, useEffect } from 'react';
import { buildApiUrl } from '@/lib/config';
import { isValidEmail, getEmailValidationError } from '@meeshy/shared/utils/email-validator';
import type { WizardFormData } from './use-registration-wizard';

export type ValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'available' | 'taken' | 'exists';

export interface ExistingAccountInfo {
  type: 'email' | 'phone';
  maskedDisplayName?: string;
  maskedUsername?: string;
  maskedEmail?: string;
  maskedPhone?: string;
  avatarUrl?: string;
}

interface UseRegistrationValidationOptions {
  formData: WizardFormData;
  currentStepId?: string;
  disabled?: boolean;
}

export function useRegistrationValidation({
  formData,
  currentStepId,
  disabled = false
}: UseRegistrationValidationOptions) {
  // Username validation
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<ValidationStatus>('idle');
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Email validation
  const [emailValidationStatus, setEmailValidationStatus] = useState<ValidationStatus>('idle');
  const [emailErrorMessage, setEmailErrorMessage] = useState('');

  // Phone validation
  const [phoneValidationStatus, setPhoneValidationStatus] = useState<ValidationStatus>('idle');
  const [phoneErrorMessage, setPhoneErrorMessage] = useState('');

  // Existing account detection
  const [existingAccount, setExistingAccount] = useState<ExistingAccountInfo | null>(null);

  // Validate username format
  const validateUsername = useCallback((username: string) => {
    if (username.length < 2 || username.length > 16) return false;
    return /^[a-zA-Z0-9_-]+$/.test(username);
  }, []);

  // Check username availability
  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (!username || username.length < 2 || !validateUsername(username)) {
      setUsernameCheckStatus('idle');
      setUsernameSuggestions([]);
      return;
    }

    setUsernameCheckStatus('checking');
    setUsernameSuggestions([]);

    try {
      const response = await fetch(
        buildApiUrl(`/auth/check-availability?username=${encodeURIComponent(username.trim())}`)
      );
      if (response.ok) {
        const data = await response.json();
        const isAvailable = data.data?.usernameAvailable;
        setUsernameCheckStatus(isAvailable ? 'available' : 'taken');

        if (!isAvailable && data.data?.suggestions && Array.isArray(data.data.suggestions)) {
          setUsernameSuggestions(data.data.suggestions);
        }
      } else {
        setUsernameCheckStatus('idle');
      }
    } catch {
      setUsernameCheckStatus('idle');
    }
  }, [validateUsername]);

  // Check email availability
  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email || !isValidEmail(email)) return;

    try {
      const response = await fetch(
        buildApiUrl(`/auth/check-availability?email=${encodeURIComponent(email)}`)
      );
      if (response.ok) {
        const data = await response.json();
        if (data.data.emailAvailable === false) {
          setEmailValidationStatus('exists');
          if (data.data.accountInfo) {
            setExistingAccount({
              type: 'email',
              maskedDisplayName: data.data.accountInfo.maskedDisplayName,
              maskedUsername: data.data.accountInfo.maskedUsername,
              maskedPhone: data.data.accountInfo.maskedPhone,
              avatarUrl: data.data.accountInfo.avatarUrl,
            });
          } else {
            setExistingAccount({ type: 'email' });
          }
        } else {
          setEmailValidationStatus('valid');
          setExistingAccount(prev => prev?.type === 'email' ? null : prev);
        }
      }
    } catch {
      // Silent fail
    }
  }, []);

  // Check phone availability
  const checkPhoneAvailability = useCallback(async (phone: string) => {
    if (!phone || phone.length < 8) return;

    try {
      const response = await fetch(
        buildApiUrl(`/auth/check-availability?phoneNumber=${encodeURIComponent(phone)}`)
      );
      if (response.ok) {
        const data = await response.json();
        if (data.data.phoneNumberAvailable === false) {
          setPhoneValidationStatus('exists');
          if (data.data.accountInfo) {
            setExistingAccount({
              type: 'phone',
              maskedDisplayName: data.data.accountInfo.maskedDisplayName,
              maskedUsername: data.data.accountInfo.maskedUsername,
              maskedEmail: data.data.accountInfo.maskedEmail,
              avatarUrl: data.data.accountInfo.avatarUrl,
            });
          } else {
            setExistingAccount({ type: 'phone' });
          }
        } else {
          setPhoneValidationStatus('valid');
          setExistingAccount(prev => prev?.type === 'phone' ? null : prev);
        }
      }
    } catch {
      // Silent fail
    }
  }, []);

  // Username validation effect
  useEffect(() => {
    if (disabled || currentStepId !== 'username') return;

    if (!formData.username.trim() || !validateUsername(formData.username)) {
      setUsernameCheckStatus('idle');
      return;
    }

    checkUsernameAvailability(formData.username);
  }, [formData.username, disabled, currentStepId, validateUsername, checkUsernameAvailability]);

  // Email validation effect
  useEffect(() => {
    if (!formData.email) {
      setEmailValidationStatus('idle');
      setEmailErrorMessage('');
      setExistingAccount(prev => prev?.type === 'email' ? null : prev);
      return;
    }

    const error = getEmailValidationError(formData.email);
    if (error) {
      setEmailValidationStatus('invalid');
      setEmailErrorMessage(error);
      setExistingAccount(prev => prev?.type === 'email' ? null : prev);
      return;
    }

    setEmailErrorMessage('');
    checkEmailAvailability(formData.email);
  }, [formData.email, checkEmailAvailability]);

  // Phone validation effect - Will be replaced by usePhoneValidation hook in parent
  useEffect(() => {
    if (!formData.phoneNumber) {
      setPhoneValidationStatus('idle');
      setPhoneErrorMessage('');
      setExistingAccount(prev => prev?.type === 'phone' ? null : prev);
      return;
    }

    // Basic validation - robust validation is done in parent with usePhoneValidation
    const cleanNumber = formData.phoneNumber.replace(/\s/g, '');
    if (cleanNumber.length < 6) {
      setPhoneValidationStatus('invalid');
      setPhoneErrorMessage('Phone number too short');
      setExistingAccount(prev => prev?.type === 'phone' ? null : prev);
      return;
    }

    setPhoneErrorMessage('');
    setPhoneValidationStatus('idle');
  }, [formData.phoneNumber]);

  const hasExistingAccount = emailValidationStatus === 'exists' || phoneValidationStatus === 'exists';

  return {
    // Username
    usernameCheckStatus,
    usernameSuggestions,
    validateUsername,
    checkUsernameAvailability,

    // Email
    emailValidationStatus,
    emailErrorMessage,
    checkEmailAvailability,

    // Phone
    phoneValidationStatus,
    phoneErrorMessage,
    checkPhoneAvailability,

    // Existing account
    existingAccount,
    hasExistingAccount,

    // Utils
    setUsernameSuggestions,
    setPhoneErrorMessage,
    setPhoneValidationStatus,
  };
}
