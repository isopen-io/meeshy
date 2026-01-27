'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeft, Sparkles, Mail, User as UserIcon, Lock, Globe } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { useAuthFormStore } from '@/stores/auth-form-store';
import { COUNTRY_CODES } from '@/constants/countries';
import { authManager } from '@/services/auth-manager.service';
import { AccountRecoveryModal } from './account-recovery-modal';
import { PhoneExistsModal } from './PhoneExistsModal';
import type { User } from '@/types';
import type { JoinConversationResponse } from '@/types/frontend';

// Hooks
import { useRegistrationWizard, WIZARD_STEPS } from '@/hooks/use-registration-wizard';
import { useRegistrationValidation } from '@/hooks/use-registration-validation';
import { useRegistrationSubmit } from '@/hooks/use-registration-submit';
import { usePhoneValidation } from '@/hooks/use-phone-validation';
import type { CountryCode } from 'libphonenumber-js';

// Step Components (dynamically imported)
import {
  ContactStep,
  IdentityStep,
  UsernameStep,
  SecurityStep,
  PreferencesStep,
} from './wizard-steps';
import { WizardProgress } from './wizard-steps/WizardProgress';
import { ExistingAccountAlert } from './wizard-steps/ExistingAccountAlert';

interface RegisterFormWizardProps {
  onSuccess?: (user: User, token: string) => void;
  disabled?: boolean;
  linkId?: string;
  onJoinSuccess?: (userData: JoinConversationResponse) => void;
  formPrefix?: string;
}

// Fun tips for each step
const STEP_TIPS: Record<string, { emoji: string; tip: string; tipFr: string }> = {
  contact: {
    emoji: '📬',
    tip: "We won't sell your email to buy plantains 😉",
    tipFr: "On va pas vendre ton email pour acheter le plantain hein! 😉"
  },
  identity: {
    emoji: '🎭',
    tip: "Your real name, not your feyman alias!",
    tipFr: "Ton vrai nom-là, pas ton nom de feyman! 🙅‍♂️"
  },
  username: {
    emoji: '✨',
    tip: "Choose well, it's your gos name forever!",
    tipFr: "Choisis bien, c'est ton nom de go pour la vie! ✨"
  },
  security: {
    emoji: '🔐',
    tip: "Make it strong! '123456' c'est trop djôlô 💪",
    tipFr: "Faut que ce soit costaud! '123456' c'est trop djôlô 💪"
  },
  preferences: {
    emoji: '🌍',
    tip: "Talk to anyone, even your mola from Bafoussam!",
    tipFr: "Parle avec tout le monde, même ton mola de Bafoussam! 🌍"
  },
};

// Add icons to steps
const STEPS_WITH_ICONS = WIZARD_STEPS.map(step => {
  const iconMap = {
    contact: Mail,
    identity: UserIcon,
    username: Sparkles,
    security: Lock,
    preferences: Globe,
  };
  return { ...step, icon: iconMap[step.id] };
});

export function RegisterFormWizard({
  onSuccess,
  disabled = false,
  linkId,
  onJoinSuccess,
  formPrefix = 'register-wizard'
}: RegisterFormWizardProps) {
  const { t, locale } = useI18n('auth');
  const { setIdentifier } = useAuthFormStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Session verification
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Additional form fields not in wizard hook
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Bot protection
  const { honeypotProps, validateSubmission } = useBotProtection({
    minSubmitTime: 3000,
  });

  // Use custom hooks
  const wizard = useRegistrationWizard({ linkId });
  const {
    formData,
    updateFormData,
    currentStep,
    direction,
    activeSteps,
    totalSteps,
    currentStepData,
    isFirstStep,
    isLastStep,
    nextStep,
    prevStep,
    goToStep,
    clearFormStorage,
  } = wizard;

  const validation = useRegistrationValidation({
    formData,
    currentStepId: currentStepData?.id,
    disabled,
  });

  const {
    usernameCheckStatus,
    usernameSuggestions,
    emailValidationStatus,
    emailErrorMessage,
    existingAccount,
    hasExistingAccount,
    checkPhoneAvailability,
    setUsernameSuggestions,
  } = validation;

  // Robust phone validation with libphonenumber-js
  const phoneValidation = usePhoneValidation({
    countryCode: selectedCountry.code as CountryCode,
    phoneNumber: formData.phoneNumber,
    disabled: disabled || currentStepData?.id !== 'contact',
    checkAvailability: true,
    onValidationChange: (isValid, formatted) => {
      if (isValid && formatted) {
        // Check if phone already exists
        checkPhoneAvailability(formatted);
      }
    }
  });

  const {
    status: phoneValidationStatus,
    errorMessage: phoneErrorMessage,
    formattedE164,
    formatAsYouType,
  } = phoneValidation;

  const submission = useRegistrationSubmit({
    onSuccess,
    linkId,
    onJoinSuccess,
  });

  const {
    isLoading,
    showPhoneExistsModal,
    phoneOwnerInfo,
    pendingRegistration,
    setShowPhoneExistsModal,
    handleSubmit: submitRegistration,
    handleContinueWithoutPhone,
    handlePhoneTransferred,
  } = submission;

  // Add icons to active steps
  const activeStepsWithIcons = activeSteps.map(step => {
    const stepWithIcon = STEPS_WITH_ICONS.find(s => s.id === step.id);
    return stepWithIcon || step;
  });

  // Check existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        setIsCheckingSession(true);
        const authToken = authManager.getAuthToken();
        const anonymousSession = authManager.getAnonymousSession();

        if (authToken || (anonymousSession && anonymousSession.token)) {
          const response = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${authToken || anonymousSession?.token}`
            }
          });

          if (response.ok) {
            if (anonymousSession) {
              const shareLinkId = localStorage.getItem('anonymous_current_share_link') ||
                                 localStorage.getItem('anonymous_current_link_id');
              if (shareLinkId) {
                window.location.href = `/chat/${shareLinkId}`;
                return;
              }
            }
            window.location.href = '/dashboard';
            return;
          } else {
            authManager.clearAllSessions();
          }
        }
      } catch (error) {
        console.error('[SIGNUP_WIZARD] Session check error:', error);
        authManager.clearAllSessions();
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, []);

  // Focus input on step change
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // Phone formatting with as-you-type using libphonenumber-js
  const handlePhoneChange = useCallback((value: string) => {
    // Format as user types
    const formatted = formatAsYouType(value);
    updateFormData({ phoneNumber: formatted });
  }, [updateFormData, formatAsYouType]);

  // Get validated E.164 phone number for submission
  const getFullPhoneNumber = useCallback(() => {
    return formattedE164 || '';
  }, [formattedE164]);

  // Email change handler
  const handleEmailChange = useCallback((value: string) => {
    const cleanValue = value.replace(/\s/g, '');
    updateFormData({ email: cleanValue });
    if (cleanValue.includes('@')) setIdentifier(cleanValue);
  }, [updateFormData, setIdentifier]);

  // Step validation
  const canProceed = useCallback(() => {
    const step = activeSteps[currentStep];
    if (!step) return false;

    switch (step.id) {
      case 'contact':
        const emailOk = emailValidationStatus === 'valid';
        // Phone is optional but if provided must be valid
        const phoneOk = !formData.phoneNumber.trim() ||
                       (phoneValidationStatus === 'valid' && formattedE164 !== null);
        return emailOk && phoneOk;
      case 'identity':
        return formData.firstName.trim().length >= 2 && formData.lastName.trim().length >= 2;
      case 'username':
        return validation.validateUsername(formData.username) && usernameCheckStatus === 'available';
      case 'security':
        return formData.password.length >= 6 && formData.password === confirmPassword;
      case 'preferences':
        return acceptTerms;
      default:
        return true;
    }
  }, [currentStep, activeSteps, formData, validation, usernameCheckStatus, emailValidationStatus, phoneValidationStatus, confirmPassword, acceptTerms]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && canProceed() && !hasExistingAccount) {
        e.preventDefault();
        if (isLastStep) {
          handleFormSubmit(e as unknown as React.FormEvent);
        } else {
          nextStep();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canProceed, isLastStep, nextStep, hasExistingAccount]);

  // Submit handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fullPhoneNumber = getFullPhoneNumber();

    // Phone validation is already done by usePhoneValidation hook
    // If phone is provided, it must be valid (E.164 format)
    if (formData.phoneNumber.trim() && !fullPhoneNumber) {
      toast.error(t('register.validation.phoneInvalid'));
      return;
    }

    await submitRegistration(formData, fullPhoneNumber, {
      validatePhoneField: async () => true, // Already validated by usePhoneValidation
      validateSubmission,
      confirmPassword,
      acceptTerms,
    });

    clearFormStorage();
  };

  // Animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 100 : -100,
      opacity: 0,
    }),
  };

  const currentTip = STEP_TIPS[currentStepData?.id || 'contact'];

  // Render step content
  const renderStepContent = () => {
    const step = activeSteps[currentStep];
    if (!step) return null;

    switch (step.id) {
      case 'contact':
        return (
          <>
            <ContactStep
              ref={inputRef}
              formData={formData}
              emailValidationStatus={emailValidationStatus}
              emailErrorMessage={emailErrorMessage}
              phoneValidationStatus={phoneValidationStatus}
              phoneErrorMessage={phoneErrorMessage}
              selectedCountry={selectedCountry}
              disabled={isLoading || disabled}
              onEmailChange={handleEmailChange}
              onPhoneChange={handlePhoneChange}
              onCountryChange={setSelectedCountry}
            />
            <ExistingAccountAlert
              hasExistingAccount={hasExistingAccount}
              emailValidationStatus={emailValidationStatus}
              phoneValidationStatus={phoneValidationStatus}
              existingAccount={existingAccount}
              onRecoveryClick={() => setShowRecoveryModal(true)}
            />
          </>
        );

      case 'identity':
        return (
          <IdentityStep
            ref={inputRef}
            formData={formData}
            disabled={isLoading || disabled}
            onFirstNameChange={(value) => updateFormData({ firstName: value })}
            onLastNameChange={(value) => updateFormData({ lastName: value })}
          />
        );

      case 'username':
        return (
          <UsernameStep
            ref={inputRef}
            formData={formData}
            usernameCheckStatus={usernameCheckStatus}
            usernameSuggestions={usernameSuggestions}
            disabled={isLoading || disabled}
            onUsernameChange={(value) => updateFormData({ username: value })}
            onSuggestionClick={(suggestion) => updateFormData({ username: suggestion })}
          />
        );

      case 'security':
        return (
          <SecurityStep
            ref={inputRef}
            formData={formData}
            confirmPassword={confirmPassword}
            showPassword={showPassword}
            disabled={isLoading || disabled}
            onPasswordChange={(value) => updateFormData({ password: value })}
            onConfirmPasswordChange={setConfirmPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
          />
        );

      case 'preferences':
        return (
          <PreferencesStep
            formData={formData}
            acceptTerms={acceptTerms}
            disabled={isLoading || disabled}
            onSystemLanguageChange={(value) => updateFormData({ systemLanguage: value })}
            onRegionalLanguageChange={(value) => updateFormData({ regionalLanguage: value })}
            onAcceptTermsChange={setAcceptTerms}
          />
        );

      default:
        return null;
    }
  };

  // Loading state
  if (isCheckingSession) {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full mb-4"
        />
        <p className="text-sm text-muted-foreground">{t('register.checkingSession')}</p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleFormSubmit} className="w-full max-w-md mx-auto">
        {/* Honeypot */}
        <input {...honeypotProps} />

        {/* Progress indicator */}
        <div className="mb-4">
          <WizardProgress
            steps={activeStepsWithIcons}
            currentStep={currentStep}
            onStepClick={goToStep}
          />
        </div>

        {/* Fun tip */}
        <motion.div
          key={currentStepData?.id}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4 px-4 py-2 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-lg"
        >
          <p className="text-xs text-muted-foreground">
            <span className="mr-1">{currentTip?.emoji}</span>
            {locale === 'fr' ? currentTip?.tipFr : currentTip?.tip}
          </p>
        </motion.div>

        {/* Step content with animation */}
        <div className="relative min-h-[220px] overflow-hidden px-1">
          <AnimatePresence mode="popLayout" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                type: "tween",
                duration: 0.2,
                ease: "easeOut",
              }}
              className="w-full px-1 py-1"
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-3 mt-4">
          {!isFirstStep ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={prevStep}
              disabled={isLoading}
              className="h-9 px-4"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {t('register.wizard.back')}
            </Button>
          ) : (
            <div />
          )}

          {isLastStep ? (
            <Button
              type="submit"
              size="sm"
              disabled={!canProceed() || isLoading || hasExistingAccount}
              className="h-9 px-6"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1" />
                  {t('register.wizard.createAccount')}
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={nextStep}
              disabled={!canProceed() || isLoading || hasExistingAccount}
              className="h-9 px-6"
            >
              {t('register.wizard.continue')}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {/* Keyboard hint */}
        {!hasExistingAccount && canProceed() && (
          <p className="text-center text-xs text-muted-foreground mt-3 opacity-60">
            {t('register.wizard.keyboardHint')}
          </p>
        )}

        {/* Login link */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          <span>{t('register.hasAccount')} </span>
          <a href="/login" className="text-primary hover:underline font-medium">
            {t('register.loginLink')}
          </a>
        </div>
      </form>

      {/* Account Recovery Modal */}
      <AccountRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        existingAccount={existingAccount}
        email={formData.email}
        phone={formData.phoneNumber}
        conflictType={
          emailValidationStatus === 'exists' && phoneValidationStatus === 'exists'
            ? 'both'
            : emailValidationStatus === 'exists'
            ? 'email'
            : phoneValidationStatus === 'exists'
            ? 'phone'
            : null
        }
      />

      {/* Phone Exists Modal */}
      {phoneOwnerInfo && pendingRegistration && (
        <PhoneExistsModal
          isOpen={showPhoneExistsModal}
          onClose={() => setShowPhoneExistsModal(false)}
          phoneOwnerInfo={phoneOwnerInfo}
          pendingRegistration={pendingRegistration}
          onContinueWithoutPhone={() => handleContinueWithoutPhone(formData, pendingRegistration)}
          onPhoneTransferred={(reg, token) => handlePhoneTransferred(formData, getFullPhoneNumber(), reg, token)}
        />
      )}
    </>
  );
}
