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
  KeyRound, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isValidEmail, getEmailValidationError } from '@meeshy/shared/utils/email-validator';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { useAuthFormStore } from '@/stores/auth-form-store';
import { AccountRecoveryModal } from './account-recovery-modal';
import { PhoneExistsModal } from './PhoneExistsModal';
import { COUNTRY_CODES } from '@/constants/countries';
import { authManager } from '@/services/auth-manager.service';
import { Checkbox } from '@/components/ui/checkbox';

const FORM_STORAGE_KEY = 'meeshy_signup_wizard_temp_data';

// Types for phone ownership conflict
interface PhoneOwnerInfo {
  maskedDisplayName: string;
  maskedUsername: string;
  maskedEmail: string;
  avatarUrl?: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

interface PendingRegistration {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  systemLanguage?: string;
  regionalLanguage?: string;
}

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

// Fun tips for each step - Cameroonian humor style 🇨🇲
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
  const { t, locale } = useI18n('auth');

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
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);

  // Validation states
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [emailValidationStatus, setEmailValidationStatus] = useState<'idle' | 'invalid' | 'valid' | 'exists'>('idle');
  const [phoneValidationStatus, setPhoneValidationStatus] = useState<'idle' | 'invalid' | 'valid' | 'exists'>('idle');
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [phoneErrorMessage, setPhoneErrorMessage] = useState('');

  // Existing account detection
  const [existingAccount, setExistingAccount] = useState<ExistingAccountInfo | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Session verification
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Additional form fields
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Phone transfer modal state
  const [showPhoneExistsModal, setShowPhoneExistsModal] = useState(false);
  const [phoneOwnerInfo, setPhoneOwnerInfo] = useState<PhoneOwnerInfo | null>(null);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);

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

  // Check existing session on mount - redirect if already logged in
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        setIsCheckingSession(true);
        const authToken = authManager.getAuthToken();
        const anonymousSession = authManager.getAnonymousSession();

        if (authToken || (anonymousSession && anonymousSession.token)) {
          const response = await fetch(buildApiUrl('/auth/me'), {
            headers: {
              'Authorization': `Bearer ${authToken || anonymousSession?.token}`
            }
          });

          if (response.ok) {
            // User is already logged in - redirect appropriately
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
            // Token invalid, clear it
            authManager.clearAllSessions();
          }
        }
      } catch (error) {
        console.error('[SIGNUP_WIZARD] Erreur vérification session:', error);
        authManager.clearAllSessions();
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, []);

  // Restore form data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(FORM_STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        // Exclude password from restoration for security
        setFormData(prev => ({
          ...prev,
          ...parsed,
          password: '', // Require re-entry for security
        }));
        setConfirmPassword(''); // Also clear confirm password

        // Restore selected country if saved
        if (parsed.selectedCountryCode) {
          const country = COUNTRY_CODES.find(c => c.code === parsed.selectedCountryCode);
          if (country) setSelectedCountry(country);
        }
      } catch (e) {
        localStorage.removeItem(FORM_STORAGE_KEY);
      }
    }
  }, []);

  // Save form data to localStorage on change (excluding password)
  useEffect(() => {
    if (isCheckingSession) return; // Don't save while checking session

    const { password, ...safeData } = formData;
    const dataToSave = {
      ...safeData,
      selectedCountryCode: selectedCountry.code,
    };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(dataToSave));
  }, [formData, selectedCountry, isCheckingSession]);

  // Focus input on step change
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // Username validation
  const validateUsername = useCallback((username: string) => {
    if (username.length < 2 || username.length > 16) return false;
    return /^[a-zA-Z0-9_-]+$/.test(username);
  }, []);

  // Check username availability - CORRECTED API with suggestions
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

        // Store suggestions if username is taken
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

  // Username check effect
  useEffect(() => {
    if (linkId || disabled || activeSteps[currentStep]?.id !== 'username') return;

    if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current);

    if (!formData.username.trim() || !validateUsername(formData.username)) {
      setUsernameCheckStatus('idle');
      return;
    }

    usernameCheckTimeout.current = setTimeout(() => {
      checkUsernameAvailability(formData.username);
    }, 400);

    return () => {
      if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current);
    };
  }, [formData.username, linkId, disabled, currentStep, activeSteps, validateUsername, checkUsernameAvailability]);

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
    }, 2000);

    return () => {
      if (emailCheckTimeout.current) clearTimeout(emailCheckTimeout.current);
    };
  }, [formData.email, checkEmailAvailability]);

  // Phone validation effect
  useEffect(() => {
    if (!formData.phoneNumber) {
      setPhoneValidationStatus('idle');
      setPhoneErrorMessage('');
      return;
    }

    const cleanNumber = formData.phoneNumber.replace(/\s/g, '');
    if (cleanNumber.length < 6) {
      setPhoneValidationStatus('invalid');
      setPhoneErrorMessage(t('register.validation.phoneTooShort'));
      return;
    }

    setPhoneErrorMessage('');
    setPhoneValidationStatus('idle');

    if (phoneCheckTimeout.current) clearTimeout(phoneCheckTimeout.current);

    phoneCheckTimeout.current = setTimeout(() => {
      const fullPhone = `${selectedCountry.dial}${cleanNumber}`;
      checkPhoneAvailability(fullPhone);
    }, 2000);

    return () => {
      if (phoneCheckTimeout.current) clearTimeout(phoneCheckTimeout.current);
    };
  }, [formData.phoneNumber, selectedCountry.dial, checkPhoneAvailability, t]);

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

  // Phone formatting - store only local number without country code
  const handlePhoneChange = useCallback((value: string) => {
    // Remove any leading zeros and non-digit chars except spaces
    const cleaned = value.replace(/^0+/, '').replace(/[^\d\s]/g, '');
    setFormData(prev => ({ ...prev, phoneNumber: cleaned }));
  }, []);

  // Build full phone number with country code
  const getFullPhoneNumber = useCallback(() => {
    if (!formData.phoneNumber.trim()) return '';
    const cleanNumber = formData.phoneNumber.replace(/\s/g, '').replace(/^0+/, '');
    return `${selectedCountry.dial}${cleanNumber}`;
  }, [formData.phoneNumber, selectedCountry.dial]);

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
        const emailOk = emailValidationStatus === 'valid';
        // Phone is optional: OK if empty, or if filled and validated as 'valid'
        const phoneOk = !formData.phoneNumber.trim() || phoneValidationStatus === 'valid';
        return emailOk && phoneOk;
      case 'identity':
        return formData.firstName.trim().length >= 2 && formData.lastName.trim().length >= 2;
      case 'username':
        return validateUsername(formData.username) && usernameCheckStatus === 'available';
      case 'security':
        // Password must be at least 6 chars and must match confirmation
        return formData.password.length >= 6 && formData.password === confirmPassword;
      case 'preferences':
        // Must accept terms to proceed
        return acceptTerms;
      default:
        return true;
    }
  }, [currentStep, activeSteps, formData, validateUsername, usernameCheckStatus, emailValidationStatus, phoneValidationStatus, confirmPassword, acceptTerms]);

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

  // Perform registration API call
  const performRegistration = async (
    registrationData: typeof formData & { phoneNumber: string },
    options?: { phoneTransferToken?: string }
  ): Promise<{ success: boolean; user?: any; token?: string; error?: string; phoneOwnershipConflict?: boolean; phoneOwnerInfo?: PhoneOwnerInfo; pendingRegistration?: PendingRegistration }> => {
    const affiliateToken = typeof window !== 'undefined'
      ? localStorage.getItem('meeshy_affiliate_token')
      : null;

    const body: any = { ...registrationData };

    if (affiliateToken) body.affiliateToken = affiliateToken;
    if (options?.phoneTransferToken) body.phoneTransferToken = options.phoneTransferToken;

    const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.REGISTER), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || t('register.errors.registrationError') };
    }

    // Check for phone ownership conflict
    if (data.success && data.data?.phoneOwnershipConflict) {
      return {
        success: false,
        error: 'phone_ownership_conflict',
        phoneOwnershipConflict: true,
        phoneOwnerInfo: data.data.phoneOwnerInfo,
        pendingRegistration: data.data.pendingRegistration,
      };
    }

    if (data.success && data.data?.user && data.data?.token) {
      return { success: true, user: data.data.user, token: data.data.token };
    }

    return { success: false, error: t('register.errors.registrationError') };
  };

  // Complete registration and redirect
  const completeRegistrationAndRedirect = async (user: any, token: string) => {
    login(user, token);

    const affiliateToken = typeof window !== 'undefined'
      ? localStorage.getItem('meeshy_affiliate_token')
      : null;

    if (affiliateToken) {
      try {
        await fetch(buildApiUrl('/affiliate/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: affiliateToken,
            referredUserId: user.id
          })
        });
        localStorage.removeItem('meeshy_affiliate_token');
      } catch (affiliateError) {
        console.error('[SIGNUP_WIZARD] Erreur enregistrement affiliation:', affiliateError);
      }
    }

    // Clear saved form data on success
    localStorage.removeItem(FORM_STORAGE_KEY);

    toast.success(t('register.success.registrationSuccess'));

    if (onSuccess) {
      onSuccess(user, token);
    } else if (linkId && onJoinSuccess) {
      onJoinSuccess({ user, token } as any);
    } else {
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 100);
    }
  };

  // Handle continue without phone from modal
  const handleContinueWithoutPhone = async (registration: PendingRegistration) => {
    setIsLoading(true);
    setShowPhoneExistsModal(false);

    try {
      const registrationWithoutPhone = {
        ...formData,
        phoneNumber: '',
      };

      const result = await performRegistration(registrationWithoutPhone);

      if (!result.success) {
        toast.error(result.error || t('register.errors.registrationError'));
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);
    } catch (error) {
      console.error('[SIGNUP_WIZARD] Erreur inscription sans téléphone:', error);
      toast.error(t('register.errors.registrationError'));
      setIsLoading(false);
    }
  };

  // Handle phone transferred from modal
  const handlePhoneTransferred = async (registration: PendingRegistration, phoneTransferToken: string) => {
    setIsLoading(true);
    setShowPhoneExistsModal(false);

    try {
      if (!phoneTransferToken) {
        await handleContinueWithoutPhone(registration);
        return;
      }

      const fullPhoneNumber = getFullPhoneNumber();
      const registrationWithTransfer = {
        ...formData,
        phoneNumber: fullPhoneNumber,
      };

      const result = await performRegistration(registrationWithTransfer, {
        phoneTransferToken,
      });

      if (!result.success) {
        toast.error(result.error || t('register.errors.registrationError'));
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);
    } catch (error) {
      console.error('[SIGNUP_WIZARD] Erreur inscription avec transfert:', error);
      toast.error(t('register.errors.registrationError'));
      setIsLoading(false);
    }
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      toast.error(botError);
      return;
    }

    // Validate password confirmation
    if (formData.password !== confirmPassword) {
      toast.error(t('register.validation.passwordMismatch'));
      return;
    }

    // Validate terms acceptance
    if (!acceptTerms) {
      toast.error(t('register.errors.acceptTermsRequired'));
      return;
    }

    // Build full phone number with country code
    const fullPhoneNumber = getFullPhoneNumber();

    if (fullPhoneNumber) {
      const phoneOk = await validatePhoneField(fullPhoneNumber);
      if (!phoneOk) return;
    }

    setIsLoading(true);

    try {
      const emailUsername = formData.email.split('@')[0];
      const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9_-]/g, '_');

      const requestBody = linkId ? {
        username: cleanUsername,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phoneNumber: fullPhoneNumber,
        systemLanguage: formData.systemLanguage,
        regionalLanguage: formData.regionalLanguage,
      } : {
        ...formData,
        phoneNumber: fullPhoneNumber,
      };

      const result = await performRegistration(requestBody as any);

      // Handle phone ownership conflict
      if (result.error === 'phone_ownership_conflict' && result.phoneOwnerInfo) {
        setPhoneOwnerInfo(result.phoneOwnerInfo);
        setPendingRegistration(result.pendingRegistration || {
          username: formData.username,
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          password: formData.password,
          systemLanguage: formData.systemLanguage,
          regionalLanguage: formData.regionalLanguage,
        });
        setShowPhoneExistsModal(true);
        setIsLoading(false);
        return;
      }

      if (!result.success) {
        let errorMessage = result.error || t('register.errors.registrationError');

        if (result.error) {
          if (result.error.includes('email') || result.error.includes('Email')) {
            errorMessage = t('register.errors.emailExists');
          } else if (result.error.includes('username')) {
            errorMessage = t('register.errors.usernameExists');
          } else if (result.error.includes('phone')) {
            errorMessage = t('register.errors.phoneExists');
          }
        }

        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);
    } catch (error) {
      toast.error(t('register.errors.networkError'));
      setIsLoading(false);
    }
  };

  // Animation variants - synchronized for smooth transition
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

  // Common input classes without blur effect
  const inputBaseClass = "h-10 bg-white/50 dark:bg-gray-800/50 border-2 transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0";

  const currentStepData = activeSteps[currentStep];
  const currentTip = STEP_TIPS[currentStepData?.id || 'contact'];

  // Render existing account alert
  const renderExistingAccountAlert = () => {
    if (!hasExistingAccount) return null;

    const isEmailConflict = emailValidationStatus === 'exists';
    const isPhoneConflict = phoneValidationStatus === 'exists';

    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm text-amber-900 dark:text-amber-100">
              {t('register.wizard.accountExists')}
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {isEmailConflict && isPhoneConflict
                ? t('register.wizard.bothExist')
                : isEmailConflict
                ? t('register.wizard.emailExists')
                : t('register.wizard.phoneExists')
              }
            </p>

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setShowRecoveryModal(true)}
                className="flex-1 h-8 text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                <KeyRound className="w-3 h-3 mr-1" />
                {t('register.wizard.recoverAccount')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/login')}
                className="flex-1 h-8 text-xs"
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
          <div className="space-y-4">
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent"
              >
                {t('register.wizard.contactTitle')}
              </motion.h2>
              <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.contactSubtitle')}</p>
            </div>

            <div className="space-y-3">
              {/* Email */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {t('register.emailLabel')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Input
                    ref={inputRef}
                    type="email"
                    placeholder={t('register.emailPlaceholder')}
                    value={formData.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    disabled={isLoading || disabled}
                    className={cn(
                      inputBaseClass,
                      "pr-10",
                      emailValidationStatus === 'valid' && "border-green-500 focus:border-green-500",
                      emailValidationStatus === 'invalid' && "border-red-500 focus:border-red-500",
                      emailValidationStatus === 'exists' && "border-amber-500 focus:border-amber-500",
                      emailValidationStatus === 'idle' && "border-gray-200 dark:border-gray-700 focus:border-cyan-500"
                    )}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {emailValidationStatus === 'valid' && <Check className="w-4 h-4 text-green-500" />}
                    {emailValidationStatus === 'invalid' && <AlertCircle className="w-4 h-4 text-red-500" />}
                    {emailValidationStatus === 'exists' && <UserIcon className="w-4 h-4 text-amber-500" />}
                  </div>
                </div>
                {emailValidationStatus === 'invalid' && emailErrorMessage && (
                  <p className="text-xs text-red-500">{emailErrorMessage}</p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  {t('register.phoneLabel')}
                </label>
                <div className="flex gap-2">
                  {/* Country code selector */}
                  <select
                    value={selectedCountry.code}
                    onChange={(e) => {
                      const country = COUNTRY_CODES.find((c) => c.code === e.target.value);
                      if (country) setSelectedCountry(country);
                    }}
                    disabled={isLoading || disabled}
                    className={cn(
                      "w-[90px] px-2 py-2 rounded-md text-sm border-2 bg-white/50 dark:bg-gray-800/50",
                      "focus:outline-none focus:ring-0 focus:ring-offset-0",
                      "border-gray-200 dark:border-gray-700 focus:border-cyan-500"
                    )}
                  >
                    {COUNTRY_CODES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.dial}
                      </option>
                    ))}
                  </select>
                  {/* Phone number input */}
                  <div className="relative flex-1">
                    <Input
                      type="tel"
                      inputMode="tel"
                      placeholder="6 12 34 56 78"
                      value={formData.phoneNumber}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      disabled={isLoading || disabled}
                      className={cn(
                        inputBaseClass,
                        "pr-10",
                        phoneValidationStatus === 'valid' && "border-green-500 focus:border-green-500",
                        phoneValidationStatus === 'invalid' && formData.phoneNumber && "border-red-500 focus:border-red-500",
                        phoneValidationStatus === 'exists' && "border-amber-500 focus:border-amber-500",
                        (phoneValidationStatus === 'idle' || !formData.phoneNumber) && "border-gray-200 dark:border-gray-700 focus:border-cyan-500"
                      )}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {phoneValidationStatus === 'valid' && <Check className="w-4 h-4 text-green-500" />}
                      {phoneValidationStatus === 'invalid' && formData.phoneNumber && <AlertCircle className="w-4 h-4 text-red-500" />}
                      {phoneValidationStatus === 'exists' && <UserIcon className="w-4 h-4 text-amber-500" />}
                    </div>
                  </div>
                </div>
                {phoneValidationStatus === 'invalid' && phoneErrorMessage && formData.phoneNumber && (
                  <p className="text-xs text-red-500">{phoneErrorMessage}</p>
                )}
              </div>
            </div>

            {renderExistingAccountAlert()}
          </div>
        );

      case 'identity':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400 bg-clip-text text-transparent"
              >
                {t('register.wizard.identityTitle')}
              </motion.h2>
              <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.identitySubtitle')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('register.firstNameLabel')}</label>
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={t('register.firstNamePlaceholder')}
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  disabled={isLoading || disabled}
                  className={cn(inputBaseClass, "border-gray-200 dark:border-gray-700 focus:border-violet-500")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('register.lastNameLabel')}</label>
                <Input
                  type="text"
                  placeholder={t('register.lastNamePlaceholder')}
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  disabled={isLoading || disabled}
                  className={cn(inputBaseClass, "border-gray-200 dark:border-gray-700 focus:border-violet-500")}
                />
              </div>
            </div>
          </div>
        );

      case 'username':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 dark:from-pink-400 dark:to-rose-400 bg-clip-text text-transparent"
              >
                {t('register.wizard.usernameTitle')}
              </motion.h2>
              <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.usernameSubtitle')}</p>
            </div>
            <div className="space-y-1">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500 font-bold">@</span>
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={t('register.usernamePlaceholder')}
                  value={formData.username}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
                    setFormData(prev => ({ ...prev, username: value }));
                  }}
                  disabled={isLoading || disabled}
                  className={cn(
                    inputBaseClass,
                    "pl-8 pr-10",
                    usernameCheckStatus === 'available' && "border-green-500 focus:border-green-500",
                    usernameCheckStatus === 'taken' && "border-red-500 focus:border-red-500",
                    usernameCheckStatus === 'idle' && "border-gray-200 dark:border-gray-700 focus:border-pink-500"
                  )}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameCheckStatus === 'checking' && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full"
                    />
                  )}
                  {usernameCheckStatus === 'available' && <Check className="w-4 h-4 text-green-500" />}
                  {usernameCheckStatus === 'taken' && <X className="w-4 h-4 text-red-500" />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">{t('register.usernameHelp')}</p>
              {usernameCheckStatus === 'available' && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-center text-green-600 font-medium">
                  ✨ {t('register.wizard.usernameAvailable')}
                </motion.p>
              )}
              {usernameCheckStatus === 'taken' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  <p className="text-xs text-center text-red-600 font-medium">
                    😅 {t('register.wizard.usernameTaken')}
                  </p>
                  {/* Username suggestions */}
                  {usernameSuggestions.length > 0 && (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1.5">{t('register.suggestions')}:</p>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {usernameSuggestions.map(suggestion => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, username: suggestion }))}
                            className="text-xs bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2.5 py-1 rounded-full hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors font-medium"
                          >
                            @{suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent"
              >
                {t('register.wizard.securityTitle')}
              </motion.h2>
              <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.securitySubtitle')}</p>
            </div>
            <div className="space-y-3">
              {/* Password field */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('register.passwordLabel')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                  <Input
                    ref={inputRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('register.passwordPlaceholder')}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    disabled={isLoading || disabled}
                    className={cn(inputBaseClass, "pl-10 pr-10 border-gray-200 dark:border-gray-700 focus:border-amber-500")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password field */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('register.confirmPasswordLabel')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('register.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading || disabled}
                    className={cn(
                      inputBaseClass,
                      "pl-10 pr-10",
                      confirmPassword && formData.password === confirmPassword && "border-green-500 focus:border-green-500",
                      confirmPassword && formData.password !== confirmPassword && "border-red-500 focus:border-red-500",
                      !confirmPassword && "border-gray-200 dark:border-gray-700 focus:border-amber-500"
                    )}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {confirmPassword && formData.password === confirmPassword && <Check className="w-4 h-4 text-green-500" />}
                    {confirmPassword && formData.password !== confirmPassword && <X className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
                {confirmPassword && formData.password !== confirmPassword && (
                  <p className="text-xs text-red-500">{t('register.validation.passwordMismatch')}</p>
                )}
              </div>

              {/* Password strength */}
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-all",
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
              <p className="text-xs text-center text-muted-foreground">
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
          <div className="space-y-4">
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent"
              >
                {t('register.wizard.preferencesTitle')}
              </motion.h2>
              <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.preferencesSubtitle')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {t('register.systemLanguageLabel')}
                </label>
                <LanguageSelector
                  value={formData.systemLanguage}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, systemLanguage: value }))}
                  disabled={disabled}
                  placeholder={t('register.systemLanguageLabel')}
                  className="h-10 w-full border-2 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {t('register.regionalLanguageLabel')}
                </label>
                <LanguageSelector
                  value={formData.regionalLanguage}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, regionalLanguage: value }))}
                  disabled={disabled}
                  placeholder={t('register.regionalLanguageLabel')}
                  className="h-10 w-full border-2 border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>

            {/* Terms and conditions checkbox - Required */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="acceptTerms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                  disabled={isLoading || disabled}
                  className={cn(
                    "mt-0.5",
                    !acceptTerms && "border-amber-400"
                  )}
                />
                <label htmlFor="acceptTerms" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
                  {t('register.acceptTerms')}{' '}
                  <a href="/terms" target="_blank" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                    {t('register.termsOfService')}
                  </a>
                  {' '}{t('register.and')}{' '}
                  <a href="/privacy" target="_blank" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                    {t('register.privacyPolicy')}
                  </a>
                  <span className="text-red-500 ml-1">*</span>
                </label>
              </div>
              {!acceptTerms && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 ml-7">
                  {t('register.wizard.acceptTermsRequired')}
                </p>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Show loading while checking existing session
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
      <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
        {/* Honeypot */}
        <input {...honeypotProps} />

        {/* Progress indicator - compact */}
        <div className="mb-4">
          <div className="flex items-center justify-center gap-1.5 mb-2">
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
                    className={cn(
                      "relative w-8 h-8 rounded-full flex items-center justify-center transition-all",
                      isActive && `bg-gradient-to-br ${step.color} text-white shadow-md`,
                      isCompleted && "bg-green-500 text-white",
                      !isActive && !isCompleted && "bg-gray-100 dark:bg-gray-800 text-muted-foreground"
                    )}
                    whileHover={index <= currentStep ? { scale: 1.1 } : {}}
                    whileTap={index <= currentStep ? { scale: 0.95 } : {}}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </motion.button>
                  {index < activeSteps.length - 1 && (
                    <div className={cn(
                      "w-4 h-0.5 mx-0.5 rounded-full transition-all",
                      index < currentStep ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Fun tip - iOS style */}
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

        {/* Step content with animation - synchronized */}
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
          {/* Back button - only show after first step */}
          {currentStep > 0 ? (
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
            <div /> // Empty div to maintain flex layout
          )}

          {currentStep === totalSteps - 1 ? (
            <Button
              type="submit"
              size="sm"
              disabled={!canProceed() || isLoading || hasExistingAccount}
              className={cn(
                "h-9 px-6 bg-gradient-to-r",
                currentStepData?.color,
                "text-white font-medium"
              )}
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
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
              className={cn(
                "h-9 px-6 bg-gradient-to-r",
                currentStepData?.color,
                "text-white font-medium"
              )}
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
      />

      {/* Phone Exists Modal - Phone ownership conflict during registration */}
      {phoneOwnerInfo && pendingRegistration && (
        <PhoneExistsModal
          isOpen={showPhoneExistsModal}
          onClose={() => setShowPhoneExistsModal(false)}
          phoneOwnerInfo={phoneOwnerInfo}
          pendingRegistration={pendingRegistration}
          onContinueWithoutPhone={handleContinueWithoutPhone}
          onPhoneTransferred={handlePhoneTransferred}
        />
      )}
    </>
  );
}
