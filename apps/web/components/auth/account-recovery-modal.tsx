'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { usePasswordResetStore } from '@/stores/password-reset-store';
import { useAuthFormStore } from '@/stores/auth-form-store';
import { magicLinkService } from '@/services/magic-link.service';
import { phonePasswordResetService } from '@/services/phone-password-reset.service';
import { useBotProtection } from '@/hooks/use-bot-protection';
import {
  Mail, Phone, User, KeyRound, ArrowLeft, ArrowRight,
  Loader2, CheckCircle, AlertCircle, Shield, Sparkles, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { COUNTRY_CODES } from '@/constants/countries';

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
  /** Type de conflit détecté (basé sur les statuts de validation) - utilisé comme fallback si existingAccount est null */
  conflictType?: 'email' | 'phone' | 'both' | null;
}

type RecoveryMethod = 'choice' | 'email' | 'phone' | 'phone_identity' | 'phone_code' | 'success';

// OTP Input Component with modern styling
const OTPInput = ({
  value,
  onChange,
  disabled = false,
  id = 'recovery-otp',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const CODE_LENGTH = 6;

  const handleChange = (index: number, inputValue: string) => {
    const digit = inputValue.replace(/\D/g, '').slice(-1);
    const newValue = value.split('');
    newValue[index] = digit;
    const joined = newValue.join('').slice(0, CODE_LENGTH);
    onChange(joined);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChange(pastedData);
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Code de vérification à 6 chiffres">
      {Array.from({ length: CODE_LENGTH }).map((_, index) => (
        <motion.input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          id={`${id}-${index}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Chiffre ${index + 1} sur 6`}
          autoComplete="one-time-code"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: index * 0.05 }}
          className={cn(
            "w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all",
            "bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            value[index]
              ? "border-emerald-500 dark:border-emerald-400 focus:ring-emerald-500"
              : "border-gray-200 dark:border-gray-700 focus:ring-cyan-500 focus:border-cyan-500",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
};

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
  const { setIdentifier } = useAuthFormStore();

  const {
    setEmail: setStoredEmail,
    setResetRequested,
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
      // Réinitialiser tous les états à l'ouverture
      setError(null);
      setRecoveryEmail(email);
      setRecoveryPhone(phone);
      setGuessUsername('');
      setGuessEmail('');
      setOtpCode('');
      setTokenId('');
      setResendCooldown(0);

      // Déterminer le type de conflit - utiliser existingAccount si disponible, sinon conflictType
      const accountType = existingAccount?.type || conflictType;

      // Set initial step based on existing account type
      // User still needs to click the button to trigger the action
      if (accountType === 'email') {
        setStep('email');
      } else if (accountType === 'phone') {
        setStep('phone');
      } else if (accountType === 'both') {
        // Si les deux sont en conflit, montrer le choix
        setStep('choice');
      } else {
        setStep('choice');
      }
    } else {
      // Réinitialiser l'état quand la modal se ferme pour éviter les états périmés
      // Utiliser un petit délai pour que l'animation de fermeture se termine
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

  // Handle email recovery via Magic Link
  const handleEmailRecovery = async () => {
    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      setError(botError);
      return;
    }

    if (!recoveryEmail.includes('@')) {
      setError(t('forgotPassword.errors.invalidEmail'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[AccountRecovery] Sending magic link request for:', recoveryEmail.trim());
      const result = await magicLinkService.requestMagicLink(recoveryEmail.trim(), true);
      console.log('[AccountRecovery] Magic link response:', result);

      if (result.success) {
        setStoredEmail(recoveryEmail.trim());
        resetBotProtection();
        toast.success(t('magicLink.success.title') || 'Magic Link envoyé !');
        setStep('success');
      } else {
        console.error('[AccountRecovery] Magic link error:', result.error);
        // Handle rate limiting with translated message
        if (result.error === 'RATE_LIMITED') {
          setError(t('magicLink.errors.rateLimited') || 'Trop de tentatives. Veuillez réessayer dans environ une heure.');
        } else {
          setError(result.error || t('magicLink.errors.requestFailed'));
        }
      }
    } catch (err) {
      console.error('[AccountRecovery] Magic link exception:', err);
      setError(err instanceof Error ? err.message : t('magicLink.errors.requestFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle phone lookup
  const handlePhoneLookup = async () => {
    const fullPhone = recoveryPhone.startsWith('+')
      ? recoveryPhone.replace(/[^\d+]/g, '')
      : selectedCountry.dial + recoveryPhone.replace(/\D/g, '');

    if (fullPhone.replace(/\D/g, '').length < 8) {
      setError(t('phoneReset.errors.invalidPhone'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await phonePasswordResetService.lookupByPhone({
        phoneNumber: fullPhone,
        countryCode: selectedCountry.code,
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

  // Handle identity verification
  const handleVerifyIdentity = async () => {
    if (!guessUsername.trim() || !guessEmail.trim()) {
      setError(t('phoneReset.errors.identityRequired'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await phonePasswordResetService.verifyIdentity({
        tokenId,
        fullUsername: guessUsername.trim(),
        fullEmail: guessEmail.trim(),
      });

      if (result.success && result.codeSent) {
        setStep('phone_code');
        setResendCooldown(60);
        toast.success(t('phoneReset.codeSent'));
      } else {
        // Check if session expired - reset flow
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

  // Handle code verification
  const handleVerifyCode = async () => {
    if (otpCode.length !== 6) {
      setError(t('phoneReset.errors.codeRequired'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await phonePasswordResetService.verifyCode({
        tokenId,
        code: otpCode,
      });

      if (result.success && result.resetToken) {
        toast.success(t('phoneReset.success'));
        router.push(`/reset-password?token=${result.resetToken}`);
        onClose();
      } else {
        // Check if session expired - reset flow
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

  // Handle resend code
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    try {
      const result = await phonePasswordResetService.resendCode({ tokenId });
      if (result.success) {
        setResendCooldown(60);
        setOtpCode('');
        toast.success(t('phoneReset.codeResent'));
      } else {
        // Check if session expired - reset flow
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

  // Animation variants
  const slideVariants = {
    enter: { x: 50, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -50, opacity: 0 },
  };

  // Render step content
  const renderContent = () => {
    switch (step) {
      case 'choice':
        return (
          <motion.div
            key="choice"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-6"
          >
            {/* Header */}
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30"
              >
                <Shield className="w-10 h-10 text-white" />
              </motion.div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('register.wizard.accountFound')}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                {existingAccount?.type === 'email'
                  ? t('register.wizard.emailExistsDesc')
                  : t('register.wizard.phoneExistsDesc')
                }
              </p>
            </div>

            {/* Account preview */}
            {existingAccount && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="p-4 rounded-2xl backdrop-blur-sm bg-gradient-to-r from-violet-50/80 to-purple-50/80 dark:from-violet-900/30 dark:to-purple-900/30 border border-violet-200/50 dark:border-violet-700/50"
              >
                <div className="flex items-center gap-4">
                  {existingAccount.avatarUrl ? (
                    <img src={existingAccount.avatarUrl} alt="" className="w-14 h-14 rounded-full ring-2 ring-violet-500" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                      {existingAccount.maskedDisplayName?.[0] || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {existingAccount.maskedDisplayName && (
                      <p className="font-semibold text-gray-900 dark:text-white truncate">
                        {existingAccount.maskedDisplayName}
                      </p>
                    )}
                    {existingAccount.maskedUsername && (
                      <p className="text-sm text-violet-600 dark:text-violet-400">
                        @{existingAccount.maskedUsername}
                      </p>
                    )}
                    {existingAccount.maskedEmail && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {existingAccount.maskedEmail}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Recovery options */}
            <div className="space-y-3">
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <Button
                  onClick={() => setStep('email')}
                  className="w-full h-14 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/30"
                >
                  <Mail className="w-5 h-5 mr-3" />
                  {t('register.wizard.recoverByEmail')}
                </Button>
              </motion.div>

              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Button
                  onClick={() => setStep('phone')}
                  variant="outline"
                  className="w-full h-14 border-2 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                >
                  <Phone className="w-5 h-5 mr-3 text-emerald-600" />
                  {t('register.wizard.recoverByPhone')}
                </Button>
              </motion.div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-gray-900 px-3 text-gray-500">{t('register.wizard.or')}</span>
                </div>
              </div>

              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  onClick={() => router.push('/login')}
                  variant="ghost"
                  className="w-full"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  {t('register.wizard.goToLogin')}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        );

      case 'email':
        return (
          <motion.div
            key="email"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-6"
          >
            <input {...honeypotProps} />

            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-xl font-bold">{t('magicLink.title') || 'Connexion par Magic Link'}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('magicLink.description') || 'Recevez un lien de connexion instantané par email'}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="recovery-email" className="text-sm font-medium">{t('magicLink.emailLabel') || 'Adresse email'}</label>
              <Input
                id="recovery-email"
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder={t('magicLink.emailPlaceholder') || 'votre@email.com'}
                disabled={isLoading}
                className="h-12 border-2 border-violet-200 dark:border-violet-800 focus:border-violet-500"
                autoComplete="email"
                spellCheck={false}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('choice')}
                disabled={isLoading}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('register.wizard.back')}
              </Button>
              <Button
                onClick={handleEmailRecovery}
                disabled={isLoading || !recoveryEmail.includes('@')}
                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {t('magicLink.sendButton') || 'Envoyer le Magic Link'}
              </Button>
            </div>
          </motion.div>
        );

      case 'phone':
        return (
          <motion.div
            key="phone"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-6"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
              >
                <Phone className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-xl font-bold">{t('phoneReset.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('phoneReset.description')}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="recovery-phone" className="text-sm font-medium">{t('phoneReset.phoneLabel')}</label>
              <div className="flex gap-2">
                <label htmlFor="recovery-country" className="sr-only">Indicatif pays</label>
                <select
                  id="recovery-country"
                  value={selectedCountry.code}
                  onChange={(e) => {
                    const country = COUNTRY_CODES.find((c) => c.code === e.target.value);
                    if (country) setSelectedCountry(country);
                  }}
                  className="w-24 h-12 px-2 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={isLoading}
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.dial}</option>
                  ))}
                </select>
                <Input
                  id="recovery-phone"
                  type="tel"
                  inputMode="tel"
                  value={recoveryPhone}
                  onChange={(e) => setRecoveryPhone(e.target.value)}
                  placeholder="6 12 34 56 78"
                  disabled={isLoading}
                  className="flex-1 h-12 border-2 border-emerald-200 dark:border-emerald-800 focus:border-emerald-500"
                  autoComplete="tel"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('choice')}
                disabled={isLoading}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('register.wizard.back')}
              </Button>
              <Button
                onClick={handlePhoneLookup}
                disabled={isLoading || recoveryPhone.replace(/\D/g, '').length < 6}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                {t('phoneReset.searchButton')}
              </Button>
            </div>
          </motion.div>
        );

      case 'phone_identity':
        return (
          <motion.div
            key="phone_identity"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-6"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30"
              >
                <Shield className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-xl font-bold">{t('phoneReset.identityTitle')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('register.wizard.guessIdentityDesc')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="recovery-guess-username" className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4" aria-hidden="true" />
                  {t('phoneReset.usernameLabel')}
                </label>
                <Input
                  id="recovery-guess-username"
                  value={guessUsername}
                  onChange={(e) => setGuessUsername(e.target.value)}
                  placeholder={t('phoneReset.usernamePlaceholder')}
                  disabled={isLoading}
                  className="h-12 border-2 border-violet-200 dark:border-violet-800 focus:border-violet-500"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="recovery-guess-email" className="text-sm font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  {t('phoneReset.emailLabel')}
                </label>
                <Input
                  id="recovery-guess-email"
                  type="email"
                  value={guessEmail}
                  onChange={(e) => setGuessEmail(e.target.value)}
                  placeholder={t('phoneReset.emailPlaceholder')}
                  disabled={isLoading}
                  className="h-12 border-2 border-violet-200 dark:border-violet-800 focus:border-violet-500"
                  autoComplete="email"
                  spellCheck={false}
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('phone')}
                disabled={isLoading}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('register.wizard.back')}
              </Button>
              <Button
                onClick={handleVerifyIdentity}
                disabled={isLoading || !guessUsername.trim() || !guessEmail.includes('@')}
                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                {t('phoneReset.verifyButton')}
              </Button>
            </div>
          </motion.div>
        );

      case 'phone_code':
        return (
          <motion.div
            key="phone_code"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-6"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30"
              >
                <KeyRound className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-xl font-bold">{t('phoneReset.codeTitle')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('phoneReset.codeDescription')}
              </p>
            </div>

            <OTPInput value={otpCode} onChange={setOtpCode} disabled={isLoading} id="recovery-phone-code" />

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <div className="text-center">
              {resendCooldown > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('phoneReset.resendIn')} {resendCooldown}s
                </p>
              ) : (
                <Button variant="link" onClick={handleResendCode} className="text-amber-600">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t('phoneReset.resendCode')}
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('phone_identity')}
                disabled={isLoading}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('register.wizard.back')}
              </Button>
              <Button
                onClick={handleVerifyCode}
                disabled={isLoading || otpCode.length !== 6}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                {t('phoneReset.verifyCodeButton')}
              </Button>
            </div>
          </motion.div>
        );

      case 'success':
        return (
          <motion.div
            key="success"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-6 text-center py-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30"
            >
              <Mail className="w-10 h-10 text-white" />
            </motion.div>
            <div>
              <h3 className="text-xl font-bold text-violet-600 dark:text-violet-400">
                {t('magicLink.success.title') || 'Magic Link envoyé !'}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                {t('magicLink.success.description') || 'Consultez votre boîte email et cliquez sur le lien pour vous connecter instantanément.'}
              </p>
            </div>
            <Button
              onClick={() => {
                onClose();
                router.push('/login');
              }}
              className="bg-gradient-to-r from-violet-500 to-purple-600"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {t('register.wizard.understood') || "J'ai compris"}
            </Button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        {/* Hidden DialogTitle and DialogDescription for accessibility */}
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
