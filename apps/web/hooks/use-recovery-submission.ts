'use client';

import { toast } from 'sonner';
import { magicLinkService } from '@/services/magic-link.service';
import { phonePasswordResetService } from '@/services/phone-password-reset.service';
import type { RecoveryMethod } from './use-recovery-flow';
import { logger } from '@/utils/logger';

interface UseRecoverySubmissionProps {
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null | undefined) => void;
  setStep: (step: RecoveryMethod) => void;
  setStoredEmail: (email: string) => void;
  setPhoneResetTokenId: (tokenId: string) => void;
  setMaskedUserInfo: (info: any) => void;
  setTokenId: (tokenId: string) => void;
  setResendCooldown: (cooldown: number) => void;
  setOtpCode: (code: string) => void;
  resetBotProtection: () => void;
  isSessionExpiredError: (errorCode: string) => boolean;
  handleSessionExpired: () => void;
  t: (key: string) => string;
  router: any;
  onClose: () => void;
}

export function useRecoverySubmission({
  setIsLoading,
  setError,
  setStep,
  setStoredEmail,
  setPhoneResetTokenId,
  setMaskedUserInfo,
  setTokenId,
  setResendCooldown,
  setOtpCode,
  resetBotProtection,
  isSessionExpiredError,
  handleSessionExpired,
  t,
  router,
  onClose,
}: UseRecoverySubmissionProps) {

  const handleEmailRecovery = async (email: string) => {
    setIsLoading(true);
    setError(null);

    try {
      logger.info('[useRecoverySubmission]', 'Sending magic link request for', { data: email.trim() });
      const result = await magicLinkService.requestMagicLink(email.trim(), true);
      logger.info('[useRecoverySubmission]', 'Magic link response', { data: result });

      if (result.success) {
        setStoredEmail(email.trim());
        resetBotProtection();
        toast.success(t('magicLink.success.title') || 'Magic Link envoyé !');
        setStep('success');
      } else {
        logger.error('[useRecoverySubmission]', 'Magic link error', { error: result.error });
        if (result.error === 'RATE_LIMITED') {
          setError(t('magicLink.errors.rateLimited') || 'Trop de tentatives. Veuillez réessayer dans environ une heure.');
        } else {
          setError(result.error || t('magicLink.errors.requestFailed'));
        }
      }
    } catch (err) {
      logger.error('[useRecoverySubmission]', 'Magic link exception', { error: err });
      setError(err instanceof Error ? err.message : t('magicLink.errors.requestFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLookup = async (phone: string, countryCode: string, selectedCountry: any) => {
    const fullPhone = phone.startsWith('+')
      ? phone.replace(/[^\d+]/g, '')
      : selectedCountry.dial + phone.replace(/\D/g, '');

    setIsLoading(true);
    setError(null);

    try {
      const result = await phonePasswordResetService.lookupByPhone({
        phoneNumber: fullPhone,
        countryCode: countryCode,
      });

      if (result.success && result.tokenId && result.maskedUserInfo) {
        setTokenId(result.tokenId);
        setPhoneResetTokenId(result.tokenId);
        setMaskedUserInfo(result.maskedUserInfo);
        setStep('phone_identity');
      } else {
        setError(result.error || t('phoneReset.errors.lookupFailed'));
      }
    } catch (err) {
      setError(t('phoneReset.errors.networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyIdentity = async (tokenId: string, username: string, email: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await phonePasswordResetService.verifyIdentity({
        tokenId,
        fullUsername: username.trim(),
        fullEmail: email.trim(),
      });

      if (result.success && result.codeSent) {
        setStep('phone_code');
        setResendCooldown(60);
        toast.success(t('phoneReset.codeSent'));
      } else {
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          return;
        }
        setError(result.error || t('phoneReset.errors.identityFailed'));
      }
    } catch (err) {
      setError(t('phoneReset.errors.networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (tokenId: string, code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await phonePasswordResetService.verifyCode({
        tokenId,
        code,
      });

      if (result.success && result.resetToken) {
        toast.success(t('phoneReset.success'));
        router.push(`/reset-password?token=${result.resetToken}`);
        onClose();
      } else {
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          return;
        }
        setError(result.error || t('phoneReset.errors.codeFailed'));
        setOtpCode('');
      }
    } catch (err) {
      setError(t('phoneReset.errors.networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async (tokenId: string, resendCooldown: number) => {
    if (resendCooldown > 0) return;

    try {
      const result = await phonePasswordResetService.resendCode({ tokenId });
      if (result.success) {
        setResendCooldown(60);
        setOtpCode('');
        toast.success(t('phoneReset.codeResent'));
      } else {
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          return;
        }
        toast.error(result.error || t('phoneReset.errors.resendFailed'));
      }
    } catch (err) {
      toast.error(t('phoneReset.errors.networkError'));
    }
  };

  return {
    handleEmailRecovery,
    handlePhoneLookup,
    handleVerifyIdentity,
    handleVerifyCode,
    handleResendCode,
  };
}
