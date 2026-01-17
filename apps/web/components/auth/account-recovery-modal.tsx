'use client';

import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/use-i18n';
import { useRecoveryFlow } from '@/hooks/use-recovery-flow';
import { useRecoveryValidation } from '@/hooks/use-recovery-validation';
import { useRecoverySubmission } from '@/hooks/use-recovery-submission';
import { RecoveryChoiceStep } from './recovery/RecoveryChoiceStep';
import { EmailRecoveryStep } from './recovery/EmailRecoveryStep';
import { PhoneRecoveryStep } from './recovery/PhoneRecoveryStep';
import { PhoneIdentityStep } from './recovery/PhoneIdentityStep';
import { PhoneCodeStep } from './recovery/PhoneCodeStep';
import { SuccessStep } from './recovery/SuccessStep';

interface ExistingAccountInfo {
  type: 'email' | 'phone';
  maskedDisplayName?: string;
  maskedUsername?: string;
  maskedEmail?: string;
  maskedPhone?: string;
  avatarUrl?: string;
}

interface AccountRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingAccount: ExistingAccountInfo | null;
  email: string;
  phone: string;
  conflictType?: 'email' | 'phone' | 'both' | null;
}

export function AccountRecoveryModal({
  isOpen,
  onClose,
  existingAccount,
  email,
  phone,
  conflictType,
}: AccountRecoveryModalProps) {
  const router = useRouter();
  const { t } = useI18n('auth');

  const flow = useRecoveryFlow({
    isOpen,
    email,
    phone,
    existingAccount,
    conflictType,
  });

  const validation = useRecoveryValidation();

  const submission = useRecoverySubmission({
    setIsLoading: flow.setIsLoading,
    setError: flow.setError,
    setStep: flow.setStep,
    setStoredEmail: flow.setStoredEmail,
    setPhoneResetTokenId: flow.setPhoneResetTokenId,
    setMaskedUserInfo: flow.setMaskedUserInfo,
    setTokenId: flow.setTokenId,
    setResendCooldown: flow.setResendCooldown,
    setOtpCode: flow.setOtpCode,
    resetBotProtection: flow.resetBotProtection,
    isSessionExpiredError: flow.isSessionExpiredError,
    handleSessionExpired: flow.handleSessionExpired,
    t: flow.t,
    router,
    onClose,
  });

  const handleEmailRecovery = async () => {
    const { isHuman, botError } = flow.validateSubmission();
    if (!isHuman) {
      flow.setError(botError);
      return;
    }

    const validationResult = validation.validateEmail(
      flow.recoveryEmail,
      t('forgotPassword.errors.invalidEmail') || 'Email invalide'
    );

    if (!validationResult.isValid) {
      flow.setError(validationResult.error || null);
      return;
    }

    await submission.handleEmailRecovery(flow.recoveryEmail);
  };

  const handlePhoneLookup = async () => {
    const validationResult = validation.validatePhone(
      flow.recoveryPhone,
      t('phoneReset.errors.invalidPhone') || 'Numéro invalide'
    );

    if (!validationResult.isValid) {
      flow.setError(validationResult.error || null);
      return;
    }

    await submission.handlePhoneLookup(
      flow.recoveryPhone,
      flow.selectedCountry.code,
      flow.selectedCountry
    );
  };

  const handleVerifyIdentity = async () => {
    const validationResult = validation.validateIdentity(
      flow.guessUsername,
      flow.guessEmail,
      t('phoneReset.errors.identityRequired') || 'Veuillez remplir tous les champs'
    );

    if (!validationResult.isValid) {
      flow.setError(validationResult.error || null);
      return;
    }

    await submission.handleVerifyIdentity(flow.tokenId, flow.guessUsername, flow.guessEmail);
  };

  const handleVerifyCode = async () => {
    const validationResult = validation.validateOtpCode(
      flow.otpCode,
      t('phoneReset.errors.codeRequired') || 'Code requis'
    );

    if (!validationResult.isValid) {
      flow.setError(validationResult.error || null);
      return;
    }

    await submission.handleVerifyCode(flow.tokenId, flow.otpCode);
  };

  const handleResendCode = async () => {
    await submission.handleResendCode(flow.tokenId, flow.resendCooldown);
  };

  const renderContent = () => {
    switch (flow.step) {
      case 'choice':
        return (
          <RecoveryChoiceStep
            existingAccount={existingAccount}
            onEmailChoice={() => flow.setStep('email')}
            onPhoneChoice={() => flow.setStep('phone')}
            onLogin={() => router.push('/login')}
            t={t}
          />
        );

      case 'email':
        return (
          <EmailRecoveryStep
            email={flow.recoveryEmail}
            onEmailChange={flow.setRecoveryEmail}
            onSubmit={handleEmailRecovery}
            onBack={() => flow.setStep('choice')}
            isLoading={flow.isLoading}
            error={flow.error}
            honeypotProps={flow.honeypotProps}
            t={t}
          />
        );

      case 'phone':
        return (
          <PhoneRecoveryStep
            phone={flow.recoveryPhone}
            selectedCountry={flow.selectedCountry}
            onPhoneChange={flow.setRecoveryPhone}
            onCountryChange={flow.setSelectedCountry}
            onSubmit={handlePhoneLookup}
            onBack={() => flow.setStep('choice')}
            isLoading={flow.isLoading}
            error={flow.error}
            t={t}
          />
        );

      case 'phone_identity':
        return (
          <PhoneIdentityStep
            username={flow.guessUsername}
            email={flow.guessEmail}
            onUsernameChange={flow.setGuessUsername}
            onEmailChange={flow.setGuessEmail}
            onSubmit={handleVerifyIdentity}
            onBack={() => flow.setStep('phone')}
            isLoading={flow.isLoading}
            error={flow.error}
            t={t}
          />
        );

      case 'phone_code':
        return (
          <PhoneCodeStep
            code={flow.otpCode}
            onCodeChange={flow.setOtpCode}
            onSubmit={handleVerifyCode}
            onBack={() => flow.setStep('phone_identity')}
            onResend={handleResendCode}
            isLoading={flow.isLoading}
            error={flow.error}
            resendCooldown={flow.resendCooldown}
            t={t}
          />
        );

      case 'success':
        return (
          <SuccessStep
            onClose={onClose}
            onNavigateToLogin={() => router.push('/login')}
            t={t}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogTitle className="sr-only">
          {t('register.wizard.recoverAccount') || 'Récupération de compte'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('register.wizard.recoverAccountDescription') || 'Récupérez l\'accès à votre compte existant'}
        </DialogDescription>
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
