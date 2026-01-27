'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '@/lib/config';
import { getEmailValidationError } from '@meeshy/shared/utils/email-validator';
import type { TFunction } from '@/hooks/useI18n';

const AVAILABILITY_CHECK_DEBOUNCE = 2000;

export type ValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'taken' | 'available';

interface UseFieldValidationProps {
  value: string;
  disabled?: boolean;
  t: TFunction;
  type: 'username' | 'email' | 'phone';
}

export function useFieldValidation({ value, disabled, t, type }: UseFieldValidationProps) {
  const [status, setStatus] = useState<ValidationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const checkTimeout = useRef<NodeJS.Timeout | null>(null);

  const validateFormat = useCallback(async (val: string) => {
    if (!val.trim()) {
      setStatus('idle');
      setErrorMessage('');
      return false;
    }

    if (type === 'email') {
      const error = getEmailValidationError(val);
      if (error) {
        setStatus('invalid');
        setErrorMessage(error);
        return false;
      }
      return true;
    }

    if (type === 'phone') {
      const { getPhoneValidationError, translatePhoneError } = await import('@/utils/phone-validator');
      const errorKey = getPhoneValidationError(val);
      if (errorKey) {
        setStatus('invalid');
        setErrorMessage(translatePhoneError(errorKey, t));
        return false;
      }
      return true;
    }

    if (type === 'username') {
      if (val.length < 2 || val.length > 16 || !/^[a-zA-Z0-9_-]+$/.test(val)) {
        setStatus('idle');
        return false;
      }
      return true;
    }

    return true;
  }, [type, t]);

  const checkAvailability = useCallback(async (val: string) => {
    try {
      const param = type === 'username' ? 'username' : type === 'email' ? 'email' : 'phoneNumber';
      const response = await fetch(
        buildApiUrl(`/auth/check-availability?${param}=${encodeURIComponent(val.trim())}`)
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const availableKey = type === 'username' ? 'usernameAvailable' :
                               type === 'email' ? 'emailAvailable' : 'phoneNumberAvailable';

          if (result.data?.[availableKey]) {
            setStatus(type === 'username' ? 'available' : 'valid');
            setErrorMessage('');
          } else {
            setStatus('taken');
            const errorKey = type === 'username' ? 'usernameExists' :
                             type === 'email' ? 'emailExists' : 'phoneExists';
            setErrorMessage(t(`register.errors.${errorKey}`));
          }
        }
      }
    } catch (error) {
      console.error(`Erreur vérification ${type}:`, error);
      setStatus('valid');
      setErrorMessage('');
    }
  }, [type, t]);

  useEffect(() => {
    if (disabled) return;

    if (checkTimeout.current) {
      clearTimeout(checkTimeout.current);
    }

    const performValidation = async () => {
      const isFormatValid = await validateFormat(value);

      if (!isFormatValid) {
        return;
      }

      setStatus('checking');
      setErrorMessage('');

      checkTimeout.current = setTimeout(() => {
        checkAvailability(value);
      }, AVAILABILITY_CHECK_DEBOUNCE);
    };

    performValidation();

    return () => {
      if (checkTimeout.current) {
        clearTimeout(checkTimeout.current);
      }
    };
  }, [value, disabled, validateFormat, checkAvailability]);

  const validate = useCallback((val: string) => {
    validateFormat(val);
  }, [validateFormat]);

  return {
    status,
    errorMessage,
    validate,
  };
}
