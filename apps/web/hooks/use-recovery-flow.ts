'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { usePasswordResetStore } from '@/stores/password-reset-store';
import { magicLinkService } from '@/services/magic-link.service';
import { phonePasswordResetService } from '@/services/phone-password-reset.service';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { COUNTRY_CODES } from '@/constants/countries';

export type RecoveryMethod = 'choice' | 'email' | 'phone' | 'phone_identity' | 'phone_code' | 'success';

interface ExistingAccountInfo {
  type: 'email' | 'phone';
  maskedDisplayName?: string;
  maskedUsername?: string;
  maskedEmail?: string;
  maskedPhone?: string;
  avatarUrl?: string;
}

interface UseRecoveryFlowProps {
  isOpen: boolean;
  email: string;
  phone: string;
  existingAccount: ExistingAccountInfo | null;
  conflictType?: 'email' | 'phone' | 'both' | null;
}

export function useRecoveryFlow({
  isOpen,
  email,
  phone,
  existingAccount,
  conflictType,
}: UseRecoveryFlowProps) {
  const router = useRouter();
  const { t } = useI18n('auth');

  const {
    setEmail: setStoredEmail,
    setPhoneResetTokenId,
    setMaskedUserInfo,
  } = usePasswordResetStore();

  const [step, setStep] = useState<RecoveryMethod>('choice');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [recoveryEmail, setRecoveryEmail] = useState(email);
  const [recoveryPhone, setRecoveryPhone] = useState(phone);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [guessUsername, setGuessUsername] = useState('');
  const [guessEmail, setGuessEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Bot protection
  const { honeypotProps, validateSubmission, reset: resetBotProtection } = useBotProtection({
    minSubmitTime: 2000,
  });

  // Check if error requires session reset
  const isSessionExpiredError = (errorCode: string): boolean => {
    return ['invalid_token', 'token_expired', 'invalid_step'].includes(errorCode);
  };

  // Handle session expired - reset flow completely
  const handleSessionExpired = () => {
    setTokenId('');
    setStep('choice');
    setGuessUsername('');
    setGuessEmail('');
    setOtpCode('');
    setError(null);
    toast.error(t('phoneReset.errors.tokenExpired') || 'Session expirée. Veuillez recommencer.');
  };

  // Reset on open/close and set initial step based on existingAccount type or conflictType
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setRecoveryEmail(email);
      setRecoveryPhone(phone);
      setGuessUsername('');
      setGuessEmail('');
      setOtpCode('');
      setTokenId('');
      setResendCooldown(0);

      const accountType = existingAccount?.type || conflictType;

      if (accountType === 'email') {
        setStep('email');
      } else if (accountType === 'phone') {
        setStep('phone');
      } else if (accountType === 'both') {
        setStep('choice');
      } else {
        setStep('choice');
      }
    } else {
      const timeout = setTimeout(() => {
        setStep('choice');
        setError(null);
        setOtpCode('');
        setTokenId('');
        setGuessUsername('');
        setGuessEmail('');
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isOpen, email, phone, existingAccount?.type, conflictType]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  return {
    // State
    step,
    setStep,
    isLoading,
    setIsLoading,
    error,
    setError,

    // Form data
    recoveryEmail,
    setRecoveryEmail,
    recoveryPhone,
    setRecoveryPhone,
    selectedCountry,
    setSelectedCountry,
    guessUsername,
    setGuessUsername,
    guessEmail,
    setGuessEmail,
    otpCode,
    setOtpCode,
    tokenId,
    setTokenId,
    resendCooldown,
    setResendCooldown,

    // Bot protection
    honeypotProps,
    validateSubmission,
    resetBotProtection,

    // Store actions
    setStoredEmail,
    setPhoneResetTokenId,
    setMaskedUserInfo,

    // Utilities
    router,
    t,
    isSessionExpiredError,
    handleSessionExpired,
  };
}
