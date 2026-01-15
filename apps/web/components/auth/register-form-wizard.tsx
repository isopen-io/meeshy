'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LanguageSelector } from '@/components/translation/language-selector';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { User } from '@/types';
import { JoinConversationResponse } from '@/types/frontend';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';
import {
  Check, X, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft,
  User as UserIcon, Mail, Phone, Lock, Globe, Sparkles,
  KeyRound, RefreshCw, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isValidEmail, getEmailValidationError } from '@meeshy/shared/utils/email-validator';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { useAuthFormStore } from '@/stores/auth-form-store';
import { AccountRecoveryModal } from './account-recovery-modal';

interface RegisterFormWizardProps {
  onSuccess?: (user: User, token: string) => void;
  disabled?: boolean;
  linkId?: string;
  onJoinSuccess?: (userData: JoinConversationResponse) => void;
  formPrefix?: string;
}

// Step configuration - Contact FIRST
const STEPS = [
  { id: 'contact', icon: Mail, color: 'from-cyan-500 to-blue-600' },
  { id: 'identity', icon: UserIcon, color: 'from-violet-500 to-purple-600' },
  { id: 'username', icon: Sparkles, color: 'from-pink-500 to-rose-600' },
  { id: 'security', icon: Lock, color: 'from-amber-500 to-orange-600' },
  { id: 'preferences', icon: Globe, color: 'from-emerald-500 to-teal-600' },
];

interface ExistingAccountInfo {
  type: 'email' | 'phone';
  maskedDisplayName?: string;
  maskedUsername?: string;
  maskedEmail?: string;
  maskedPhone?: string;
  avatarUrl?: string;
}

export function RegisterFormWizard({
  onSuccess,
  disabled = false,
  linkId,
  onJoinSuccess,
  formPrefix = 'register-wizard'
}: RegisterFormWizardProps) {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n('auth');

  const { identifier: sharedIdentifier, setIdentifier } = useAuthFormStore();

  // Current step
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);

  // Form data
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    email: sharedIdentifier?.includes('@') ? sharedIdentifier : '',
    phoneNumber: sharedIdentifier && !sharedIdentifier.includes('@') && /^\+?\d/.test(sharedIdentifier) ? sharedIdentifier : '',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Validation states
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [emailValidationStatus, setEmailValidationStatus] = useState<'idle' | 'invalid' | 'valid' | 'exists'>('idle');
  const [phoneValidationStatus, setPhoneValidationStatus] = useState<'idle' | 'invalid' | 'valid' | 'exists'>('idle');
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [phoneErrorMessage, setPhoneErrorMessage] = useState('');

  // Existing account detection
  const [existingAccount, setExistingAccount] = useState<ExistingAccountInfo | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const emailCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const phoneCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bot protection
  const { honeypotProps, validateSubmission } = useBotProtection({
    minSubmitTime: 3000,
  });

  // Skip username step if linkId is present
  const activeSteps = linkId ? STEPS.filter(s => s.id !== 'username') : STEPS;
  const totalSteps = activeSteps.length;

  // Focus input on step change
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // Username validation
  const validateUsername = useCallback((username: string) => {
    if (username.length < 2 || username.length > 16) return false;
    return /^[a-zA-Z0-9_-]+$/.test(username);
  }, []);

  // Check email availability with account detection
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
          // Store existing account info if returned
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
          if (existingAccount?.type === 'email') {
            setExistingAccount(null);
          }
        }
      }
    } catch {
      // Silent fail
    }
  }, [existingAccount]);

  // Check phone availability with account detection
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
          // Store existing account info if returned
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
          if (existingAccount?.type === 'phone') {
            setExistingAccount(null);
          }
        }
      }
    } catch {
      // Silent fail
    }
  }, [existingAccount]);

  // Email validation effect
  useEffect(() => {
    if (!formData.email) {
      setEmailValidationStatus('idle');
      return;
    }

    const error = getEmailValidationError(formData.email);
    if (error) {
      setEmailValidationStatus('invalid');
      setEmailErrorMessage(error);
      return;
    }

    setEmailErrorMessage('');
    if (emailCheckTimeout.current) clearTimeout(emailCheckTimeout.current);

    emailCheckTimeout.current = setTimeout(() => {
      checkEmailAvailability(formData.email);
    }, 500);

    return () => {
      if (emailCheckTimeout.current) clearTimeout(emailCheckTimeout.current);
    };
  }, [formData.email, checkEmailAvailability]);

  // Phone validation effect
  useEffect(() => {
    if (!formData.phoneNumber) {
      setPhoneValidationStatus('idle');
      return;
    }

    if (formData.phoneNumber.length < 8) {
      setPhoneValidationStatus('invalid');
      setPhoneErrorMessage(t('register.validation.phoneTooShort'));
      return;
    }

    setPhoneErrorMessage('');
    if (phoneCheckTimeout.current) clearTimeout(phoneCheckTimeout.current);

    phoneCheckTimeout.current = setTimeout(() => {
      checkPhoneAvailability(formData.phoneNumber);
    }, 500);

    return () => {
      if (phoneCheckTimeout.current) clearTimeout(phoneCheckTimeout.current);
    };
  }, [formData.phoneNumber, checkPhoneAvailability, t]);

  // Username availability check
  useEffect(() => {
    if (linkId || disabled || activeSteps[currentStep]?.id !== 'username') return;

    if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current);

    if (!formData.username.trim() || !validateUsername(formData.username)) {
      setUsernameCheckStatus('idle');
      return;
    }

    setUsernameCheckStatus('checking');

    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/users/check-username/${encodeURIComponent(formData.username.trim())}`)
        );
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setUsernameCheckStatus(result.available ? 'available' : 'taken');
          }
        }
      } catch {
        setUsernameCheckStatus('idle');
      }
    }, 500);

    return () => {
      if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current);
    };
  }, [formData.username, linkId, disabled, currentStep, activeSteps, validateUsername]);

  // Phone validation
  const validatePhoneField = useCallback(async (phone: string) => {
    if (!phone.trim()) {
      setPhoneValidationStatus('invalid');
      setPhoneErrorMessage(t('register.validation.phoneRequired'));
      return false;
    }
    const { getPhoneValidationError, translatePhoneError } = await import('@/utils/phone-validator');
    const errorKey = getPhoneValidationError(phone);
    if (errorKey) {
      setPhoneValidationStatus('invalid');
      setPhoneErrorMessage(translatePhoneError(errorKey, t));
      return false;
    }
    return true;
  }, [t]);

  // Phone formatting
  const handlePhoneChange = useCallback(async (value: string) => {
    const { formatPhoneNumberInput } = await import('@/utils/phone-validator');
    const formatted = formatPhoneNumberInput(value);
    setFormData(prev => ({ ...prev, phoneNumber: formatted }));
    if (/^\+?\d/.test(formatted)) setIdentifier(formatted);
  }, [setIdentifier]);

  // Email change handler
  const handleEmailChange = useCallback((value: string) => {
    const cleanValue = value.replace(/\s/g, '');
    setFormData(prev => ({ ...prev, email: cleanValue }));
    if (cleanValue.includes('@')) setIdentifier(cleanValue);
  }, [setIdentifier]);

  // Step validation
  const canProceed = useCallback(() => {
    const step = activeSteps[currentStep];
    if (!step) return false;

    switch (step.id) {
      case 'contact':
        // At least email must be valid AND not existing
        const emailOk = emailValidationStatus === 'valid';
        const phoneOk = !formData.phoneNumber || phoneValidationStatus === 'valid' || phoneValidationStatus === 'idle';
        return emailOk && phoneOk;
      case 'identity':
        return formData.firstName.trim().length >= 2 && formData.lastName.trim().length >= 2;
      case 'username':
        return validateUsername(formData.username) && usernameCheckStatus === 'available';
      case 'security':
        return formData.password.length >= 6;
      case 'preferences':
        return true;
      default:
        return true;
    }
  }, [currentStep, activeSteps, formData, validateUsername, usernameCheckStatus, emailValidationStatus, phoneValidationStatus]);

  // Check if account exists and should show recovery
  const hasExistingAccount = emailValidationStatus === 'exists' || phoneValidationStatus === 'exists';

  // Navigation
  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1 && canProceed()) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps, canProceed]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && canProceed() && !hasExistingAccount) {
        e.preventDefault();
        if (currentStep === totalSteps - 1) {
          handleSubmit(e as unknown as React.FormEvent);
        } else {
          nextStep();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canProceed, currentStep, totalSteps, nextStep, hasExistingAccount]);

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      toast.error(botError);
      return;
    }

    // Final phone validation
    if (formData.phoneNumber) {
      const phoneOk = await validatePhoneField(formData.phoneNumber);
      if (!phoneOk) return;
    }

    setIsLoading(true);

    try {
      const emailUsername = formData.email.split('@')[0];
      const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9_-]/g, '_');

      const affiliateToken = typeof window !== 'undefined'
        ? localStorage.getItem('meeshy_affiliate_token')
        : null;

      const requestBody = linkId ? {
        username: cleanUsername,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phoneNumber: formData.phoneNumber,
        systemLanguage: formData.systemLanguage,
        regionalLanguage: formData.regionalLanguage,
        ...(affiliateToken && { affiliateToken }),
      } : {
        ...formData,
        ...(affiliateToken && { affiliateToken }),
      };

      const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.REGISTER), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = t('register.errors.registrationError');

        if (response.status === 400 && errorData.error) {
          if (errorData.error.includes('email') || errorData.error.includes('Email')) {
            errorMessage = t('register.errors.emailExists');
          } else if (errorData.error.includes('username')) {
            errorMessage = t('register.errors.usernameExists');
          } else if (errorData.error.includes('phone')) {
            errorMessage = t('register.errors.phoneExists');
          }
        }

        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      const data = await response.json();

      if (linkId && onJoinSuccess) {
        toast.success(t('register.success.registrationSuccess'));
        onJoinSuccess(data);
      } else if (data.success && data.data?.user && data.data?.token) {
        toast.success(t('register.success.registrationSuccess'));
        login(data.data.user, data.data.token);

        if (onSuccess) {
          onSuccess(data.data.user, data.data.token);
        } else {
          setTimeout(() => {
            if (window.location.pathname === '/') {
              window.location.reload();
            } else {
              router.push('/dashboard');
            }
          }, 100);
        }
      } else {
        toast.error(t('register.errors.registrationError'));
        setIsLoading(false);
      }
    } catch (error) {
      toast.error(t('register.errors.networkError'));
      setIsLoading(false);
    }
  };

  // Animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
  };

  const currentStepData = activeSteps[currentStep];

  // Render existing account alert
  const renderExistingAccountAlert = () => {
    if (!hasExistingAccount) return null;

    const isEmailConflict = emailValidationStatus === 'exists';
    const isPhoneConflict = phoneValidationStatus === 'exists';

    return (
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-amber-900 dark:text-amber-100">
              {t('register.wizard.accountExists')}
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {isEmailConflict && isPhoneConflict
                ? t('register.wizard.bothExist')
                : isEmailConflict
                ? t('register.wizard.emailExists')
                : t('register.wizard.phoneExists')
              }
            </p>

            {existingAccount && (
              <div className="mt-3 p-3 rounded-xl bg-white/60 dark:bg-gray-900/40 flex items-center gap-3">
                {existingAccount.avatarUrl ? (
                  <img
                    src={existingAccount.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {existingAccount.maskedDisplayName?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {existingAccount.maskedDisplayName && (
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {existingAccount.maskedDisplayName}
                    </p>
                  )}
                  {existingAccount.maskedUsername && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      @{existingAccount.maskedUsername}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                onClick={() => setShowRecoveryModal(true)}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                {t('register.wizard.recoverAccount')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/login')}
                className="flex-1"
              >
                {t('register.wizard.goToLogin')}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  // Step content renderer
  const renderStepContent = () => {
    const step = activeSteps[currentStep];
    if (!step) return null;

    switch (step.id) {
      case 'contact':
        return (
          <div className="space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-3xl font-bold text-center bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent"
            >
              {t('register.wizard.contactTitle')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center text-muted-foreground"
            >
              {t('register.wizard.contactSubtitle')}
            </motion.p>

            <div className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="wizard-email" className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  {t('register.emailLabel')} <span className="text-red-500" aria-hidden="true">*</span>
                  <span className="sr-only">(obligatoire)</span>
                </label>
                <div className="relative">
                  <Input
                    id="wizard-email"
                    ref={inputRef}
                    type="email"
                    placeholder={t('register.emailPlaceholder')}
                    value={formData.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    disabled={isLoading || disabled}
                    className={cn(
                      "h-12 text-lg bg-white/50 dark:bg-gray-800/50 border-2 transition-all pr-12",
                      emailValidationStatus === 'valid' && "border-green-500 dark:border-green-400",
                      emailValidationStatus === 'invalid' && "border-red-500 dark:border-red-400",
                      emailValidationStatus === 'exists' && "border-amber-500 dark:border-amber-400",
                      emailValidationStatus === 'idle' && "border-cyan-200 dark:border-cyan-800 focus:border-cyan-500 dark:focus:border-cyan-400"
                    )}
                    autoComplete="email"
                    spellCheck={false}
                    aria-invalid={emailValidationStatus === 'invalid'}
                    aria-describedby={emailValidationStatus === 'invalid' ? 'wizard-email-error' : undefined}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {emailValidationStatus === 'valid' && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                    {emailValidationStatus === 'invalid' && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                    {emailValidationStatus === 'exists' && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                  </div>
                </div>
                {emailValidationStatus === 'invalid' && emailErrorMessage && (
                  <motion.p id="wizard-email-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-500" role="alert">{emailErrorMessage}</motion.p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <label htmlFor="wizard-phone" className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4" aria-hidden="true" />
                  {t('register.phoneLabel')}
                  <span className="text-xs text-muted-foreground">({t('register.wizard.optional')})</span>
                </label>
                <div className="relative">
                  <Input
                    id="wizard-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="+33 6 12 34 56 78"
                    value={formData.phoneNumber}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    disabled={isLoading || disabled}
                    className={cn(
                      "h-12 text-lg bg-white/50 dark:bg-gray-800/50 border-2 transition-all pr-12",
                      phoneValidationStatus === 'valid' && "border-green-500 dark:border-green-400",
                      phoneValidationStatus === 'invalid' && formData.phoneNumber && "border-red-500 dark:border-red-400",
                      phoneValidationStatus === 'exists' && "border-amber-500 dark:border-amber-400",
                      (phoneValidationStatus === 'idle' || !formData.phoneNumber) && "border-cyan-200 dark:border-cyan-800 focus:border-cyan-500 dark:focus:border-cyan-400"
                    )}
                    autoComplete="tel"
                    aria-invalid={phoneValidationStatus === 'invalid' && !!formData.phoneNumber}
                    aria-describedby={phoneValidationStatus === 'invalid' && formData.phoneNumber ? 'wizard-phone-error' : undefined}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {phoneValidationStatus === 'valid' && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                    {phoneValidationStatus === 'invalid' && formData.phoneNumber && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                    {phoneValidationStatus === 'exists' && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                  </div>
                </div>
                {phoneValidationStatus === 'invalid' && phoneErrorMessage && formData.phoneNumber && (
                  <motion.p id="wizard-phone-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-500" role="alert">{phoneErrorMessage}</motion.p>
                )}
              </div>
            </div>

            {/* Existing account alert */}
            {renderExistingAccountAlert()}
          </div>
        );

      case 'identity':
        return (
          <div className="space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-3xl font-bold text-center bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400 bg-clip-text text-transparent"
            >
              {t('register.wizard.welcomeTitle')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center text-muted-foreground"
            >
              {t('register.wizard.welcomeSubtitle')}
            </motion.p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="wizard-firstName" className="text-sm font-medium text-muted-foreground">
                  {t('register.firstNameLabel')}
                </label>
                <Input
                  id="wizard-firstName"
                  ref={inputRef}
                  type="text"
                  placeholder={t('register.firstNamePlaceholder')}
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  disabled={isLoading || disabled}
                  className="h-12 text-lg bg-white/50 dark:bg-gray-800/50 border-2 border-violet-200 dark:border-violet-800 focus:border-violet-500 dark:focus:border-violet-400 transition-all"
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="wizard-lastName" className="text-sm font-medium text-muted-foreground">
                  {t('register.lastNameLabel')}
                </label>
                <Input
                  id="wizard-lastName"
                  type="text"
                  placeholder={t('register.lastNamePlaceholder')}
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  disabled={isLoading || disabled}
                  className="h-12 text-lg bg-white/50 dark:bg-gray-800/50 border-2 border-violet-200 dark:border-violet-800 focus:border-violet-500 dark:focus:border-violet-400 transition-all"
                  autoComplete="family-name"
                />
              </div>
            </div>
          </div>
        );

      case 'username':
        return (
          <div className="space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-3xl font-bold text-center bg-gradient-to-r from-pink-600 to-rose-600 dark:from-pink-400 dark:to-rose-400 bg-clip-text text-transparent"
            >
              {t('register.wizard.usernameTitle')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center text-muted-foreground"
            >
              {t('register.wizard.usernameSubtitle')}
            </motion.p>
            <div className="space-y-2">
              <label htmlFor="wizard-username" className="sr-only">{t('register.usernameLabel')}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-pink-500 dark:text-pink-400 font-bold text-lg" aria-hidden="true">@</span>
                <Input
                  id="wizard-username"
                  ref={inputRef}
                  type="text"
                  placeholder={t('register.usernamePlaceholder')}
                  value={formData.username}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
                    setFormData(prev => ({ ...prev, username: value }));
                  }}
                  disabled={isLoading || disabled}
                  autoComplete="username"
                  aria-invalid={usernameCheckStatus === 'taken'}
                  className={cn(
                    "h-14 text-lg pl-10 bg-white/50 dark:bg-gray-800/50 border-2 transition-all",
                    usernameCheckStatus === 'available' && "border-green-500 dark:border-green-400",
                    usernameCheckStatus === 'taken' && "border-red-500 dark:border-red-400",
                    usernameCheckStatus === 'idle' && "border-pink-200 dark:border-pink-800 focus:border-pink-500 dark:focus:border-pink-400"
                  )}
                  minLength={2}
                  maxLength={16}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  {usernameCheckStatus === 'checking' && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full"
                    />
                  )}
                  {usernameCheckStatus === 'available' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
                    >
                      <Check className="w-4 h-4 text-white" />
                    </motion.div>
                  )}
                  {usernameCheckStatus === 'taken' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white" />
                    </motion.div>
                  )}
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {t('register.usernameHelp')} (2-16 caractères)
              </p>
              {usernameCheckStatus === 'available' && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-center text-green-600 dark:text-green-400 font-medium"
                >
                  {t('register.wizard.usernameAvailable')}
                </motion.p>
              )}
              {usernameCheckStatus === 'taken' && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-center text-red-600 dark:text-red-400 font-medium"
                >
                  {t('register.wizard.usernameTaken')}
                </motion.p>
              )}
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-3xl font-bold text-center bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent"
            >
              {t('register.wizard.securityTitle')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center text-muted-foreground"
            >
              {t('register.wizard.securitySubtitle')}
            </motion.p>
            <div className="space-y-2">
              <label htmlFor="wizard-password" className="sr-only">{t('register.passwordLabel')}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
                <Input
                  id="wizard-password"
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('register.passwordPlaceholder')}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  disabled={isLoading || disabled}
                  className="h-14 text-lg pl-12 pr-12 bg-white/50 dark:bg-gray-800/50 border-2 border-amber-200 dark:border-amber-800 focus:border-amber-500 dark:focus:border-amber-400 transition-all"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                  aria-label={showPassword ? t('register.hidePassword') : t('register.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              {/* Password strength indicator */}
              <div className="flex gap-1 mt-2">
                {[1, 2, 3, 4].map((level) => (
                  <motion.div
                    key={level}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: formData.password.length >= level * 2 ? 1 : 0 }}
                    className={cn(
                      "h-1 flex-1 rounded-full origin-left transition-all",
                      formData.password.length >= level * 2
                        ? level <= 1 ? "bg-red-500"
                        : level <= 2 ? "bg-orange-500"
                        : level <= 3 ? "bg-yellow-500"
                        : "bg-green-500"
                        : "bg-gray-200 dark:bg-gray-700"
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-center text-muted-foreground mt-2">
                {formData.password.length < 6
                  ? t('register.wizard.passwordWeak')
                  : formData.password.length < 8
                  ? t('register.wizard.passwordMedium')
                  : t('register.wizard.passwordStrong')
                }
              </p>
            </div>
          </div>
        );

      case 'preferences':
        return (
          <div className="space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-3xl font-bold text-center bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent"
            >
              {t('register.wizard.preferencesTitle')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center text-muted-foreground"
            >
              {t('register.wizard.preferencesSubtitle')}
            </motion.p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4" aria-hidden="true" />
                  {t('register.systemLanguageLabel')}
                </span>
                <LanguageSelector
                  value={formData.systemLanguage}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, systemLanguage: value }))}
                  disabled={disabled}
                  placeholder={t('register.systemLanguageLabel')}
                  className="h-12 w-full border-2 border-emerald-200 dark:border-emerald-800"
                />
                <p className="text-xs text-muted-foreground">{t('register.systemLanguageHelp')}</p>
              </div>
              <div className="space-y-3">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4" aria-hidden="true" />
                  {t('register.regionalLanguageLabel')}
                </span>
                <LanguageSelector
                  value={formData.regionalLanguage}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, regionalLanguage: value }))}
                  disabled={disabled}
                  placeholder={t('register.regionalLanguageLabel')}
                  className="h-12 w-full border-2 border-emerald-200 dark:border-emerald-800"
                />
                <p className="text-xs text-muted-foreground">{t('register.regionalLanguageHelp')}</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full max-w-lg mx-auto" autoComplete="off">
        {/* Honeypot */}
        <input {...honeypotProps} />

        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            {activeSteps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;

              return (
                <div key={step.id} className="flex items-center">
                  <motion.button
                    type="button"
                    onClick={() => {
                      if (index < currentStep) {
                        setDirection(-1);
                        setCurrentStep(index);
                      }
                    }}
                    disabled={index > currentStep}
                    aria-label={`${t('register.wizard.step')} ${index + 1}: ${step.id}`}
                    aria-current={isActive ? 'step' : undefined}
                    className={cn(
                      "relative w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-300",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary",
                      isActive && `bg-gradient-to-br ${step.color} text-white shadow-lg`,
                      isCompleted && "bg-green-500 text-white",
                      !isActive && !isCompleted && "bg-gray-100 dark:bg-gray-800 text-muted-foreground"
                    )}
                    whileHover={index <= currentStep ? { scale: 1.1 } : {}}
                    whileTap={index <= currentStep ? { scale: 0.95 } : {}}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    )}
                    {isActive && (
                      <motion.div
                        layoutId="activeRing"
                        className="absolute inset-0 rounded-full border-2 border-current"
                        initial={false}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </motion.button>
                  {index < activeSteps.length - 1 && (
                    <div className={cn(
                      "w-6 md:w-10 h-1 mx-1 rounded-full transition-all duration-500",
                      index < currentStep ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {t('register.wizard.step')} {currentStep + 1} / {totalSteps}
          </p>
        </div>

        {/* Step content with animation */}
        <div className="relative min-h-[350px] md:min-h-[400px] overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
              className="w-full px-4"
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-4 mt-8 px-4">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0 || isLoading}
            className={cn(
              "h-12 px-6 transition-all duration-300",
              currentStep === 0 && "opacity-0 pointer-events-none"
            )}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('register.wizard.back')}
          </Button>

          {currentStep === totalSteps - 1 ? (
            <Button
              type="submit"
              disabled={!canProceed() || isLoading || hasExistingAccount}
              className={cn(
                "h-12 px-8 bg-gradient-to-r",
                currentStepData?.color,
                "text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
              )}
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {t('register.wizard.createAccount')}
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={nextStep}
              disabled={!canProceed() || isLoading || hasExistingAccount}
              className={cn(
                "h-12 px-8 bg-gradient-to-r",
                currentStepData?.color,
                "text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
              )}
            >
              {t('register.wizard.continue')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>

        {/* Keyboard hint */}
        {!hasExistingAccount && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center text-xs text-muted-foreground mt-6"
          >
            {t('register.wizard.keyboardHint')}
          </motion.p>
        )}

        {/* Login link */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <span>{t('register.hasAccount')} </span>
          <a
            href="/login"
            className="text-primary hover:underline font-medium"
          >
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
      />
    </>
  );
}
