'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useI18n } from '@/hooks/useI18n';
import { usePasswordResetStore, type MaskedUserInfo, type PhoneResetStep } from '@/stores/password-reset-store';
import { phonePasswordResetService } from '@/services/phone-password-reset.service';
import {
  Phone,
  ArrowLeft,
  User,
  Mail,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  RefreshCw,
  Clock,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';

// Country codes for phone input
const COUNTRY_CODES = [
  { code: 'FR', dial: '+33', flag: '\ud83c\uddeb\ud83c\uddf7', name: 'France' },
  { code: 'US', dial: '+1', flag: '\ud83c\uddfa\ud83c\uddf8', name: '\u00c9tats-Unis' },
  { code: 'GB', dial: '+44', flag: '\ud83c\uddec\ud83c\udde7', name: 'Royaume-Uni' },
  { code: 'DE', dial: '+49', flag: '\ud83c\udde9\ud83c\uddea', name: 'Allemagne' },
  { code: 'ES', dial: '+34', flag: '\ud83c\uddea\ud83c\uddf8', name: 'Espagne' },
  { code: 'IT', dial: '+39', flag: '\ud83c\uddee\ud83c\uddf9', name: 'Italie' },
  { code: 'PT', dial: '+351', flag: '\ud83c\uddf5\ud83c\uddf9', name: 'Portugal' },
  { code: 'BE', dial: '+32', flag: '\ud83c\udde7\ud83c\uddea', name: 'Belgique' },
  { code: 'CH', dial: '+41', flag: '\ud83c\udde8\ud83c\udded', name: 'Suisse' },
  { code: 'CA', dial: '+1', flag: '\ud83c\udde8\ud83c\udde6', name: 'Canada' },
];

// OTP Input Component
const OTPInput = ({
  value,
  onChange,
  disabled = false,
  id = 'otp-input',
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
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChange(pastedData);
    const nextIndex = Math.min(pastedData.length, CODE_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Code de vérification à 6 chiffres">
      {Array.from({ length: CODE_LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
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
          className="w-12 h-14 text-center text-2xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />
      ))}
    </div>
  );
};

// Helper to render masked text with visible chars in bold and masked chars in red
const MaskedText = ({ text, prefix = '' }: { text: string; prefix?: string }) => {
  const parts: React.ReactNode[] = [];
  let currentText = '';
  let isMasked = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isCurrentMasked = char === '*' || (char === '.' && text[i - 1] === '.');

    if (isCurrentMasked !== isMasked && currentText) {
      parts.push(
        isMasked ? (
          <span key={i} className="text-red-500 dark:text-red-400">{currentText}</span>
        ) : (
          <span key={i} className="font-bold text-gray-900 dark:text-white">{currentText}</span>
        )
      );
      currentText = '';
    }

    isMasked = isCurrentMasked;
    currentText += char;
  }

  // Push remaining text
  if (currentText) {
    parts.push(
      isMasked ? (
        <span key="last" className="text-red-500 dark:text-red-400">{currentText}</span>
      ) : (
        <span key="last" className="font-bold text-gray-900 dark:text-white">{currentText}</span>
      )
    );
  }

  return (
    <span className="text-sm">
      {prefix && <span className="font-bold text-gray-900 dark:text-white">{prefix}</span>}
      {parts}
    </span>
  );
};

// Identity Verification Card
const IdentityCard = ({ maskedUserInfo }: { maskedUserInfo: MaskedUserInfo }) => {
  return (
    <div className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-white/30 dark:border-gray-600/50 rounded-xl p-4 text-center">
      {/* Avatar */}
      <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3 overflow-hidden">
        {maskedUserInfo.avatarUrl ? (
          <img
            src={maskedUserInfo.avatarUrl}
            alt="Avatar"
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        )}
      </div>
      {/* Display name (full, not masked) */}
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{maskedUserInfo.displayName}</p>
      {/* Username with masked chars in red */}
      <p className="mb-1">
        <MaskedText text={maskedUserInfo.username} prefix="@" />
      </p>
      {/* Email with masked chars in red */}
      <p>
        <MaskedText text={maskedUserInfo.email} />
      </p>
    </div>
  );
};

interface PhoneResetFlowProps {
  onClose?: () => void;
}

export function PhoneResetFlow({ onClose }: PhoneResetFlowProps) {
  const router = useRouter();
  const { t } = useI18n('auth');

  const {
    phoneResetStep,
    phoneNumber,
    phoneCountryCode,
    phoneResetTokenId,
    maskedUserInfo,
    isPhoneLookupLoading,
    isIdentityVerifying,
    isCodeVerifying,
    identityAttemptsRemaining,
    error,
    setPhoneResetStep,
    setPhoneNumber,
    setPhoneCountryCode,
    setPhoneResetTokenId,
    setMaskedUserInfo,
    setIsPhoneLookupLoading,
    setIsIdentityVerifying,
    setIsCodeVerifying,
    setIdentityAttemptsRemaining,
    setError,
    setToken,
    resetPhoneFlow,
  } = usePasswordResetStore();

  // Local state
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [localPhoneNumber, setLocalPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Validate phone number format
  const validatePhoneNumber = (phone: string): boolean => {
    const cleanPhone = phone.replace(/\D/g, '');
    // Minimum 6 digits, maximum 15 (E.164 standard)
    return cleanPhone.length >= 6 && cleanPhone.length <= 15;
  };

  // Validate email format
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Validate username format (2-30 chars, alphanumeric + underscore/dash)
  const validateUsername = (username: string): boolean => {
    const trimmed = username.trim();
    return trimmed.length >= 2 && trimmed.length <= 30;
  };

  // Check if error requires session reset
  const isSessionExpiredError = (errorCode: string): boolean => {
    return ['invalid_token', 'token_expired', 'invalid_step'].includes(errorCode);
  };

  // Handle session expired - reset flow completely
  const handleSessionExpired = () => {
    setMaskedUserInfo(null);
    setPhoneResetTokenId('');
    setPhoneResetStep('phone_input');
    setUsername('');
    setEmail('');
    setCode('');
    setLocalPhoneNumber('');
  };

  // Translate error code using i18n with French fallbacks
  const translateErrorCode = (errorCode: string): string => {
    const errorMap: Record<string, string> = {
      rate_limited: t('phoneReset.errors.rateLimited') || 'Trop de tentatives. Veuillez réessayer plus tard.',
      invalid_phone: t('phoneReset.errors.invalidPhone') || 'Numéro de téléphone invalide.',
      user_not_found: t('phoneReset.errors.userNotFound') || 'Aucun compte trouvé avec ce numéro.',
      phone_not_verified: t('phoneReset.errors.phoneNotVerified') || 'Le numéro de téléphone n\'est pas vérifié.',
      invalid_token: t('phoneReset.errors.invalidToken') || 'Session expirée. Veuillez recommencer.',
      token_expired: t('phoneReset.errors.tokenExpired') || 'Session expirée. Veuillez recommencer.',
      invalid_step: t('phoneReset.errors.invalidStep') || 'Action invalide. Veuillez recommencer.',
      max_attempts_exceeded: t('phoneReset.errors.maxAttemptsExceeded') || 'Trop de tentatives échouées. Veuillez réessayer plus tard.',
      identity_mismatch: t('phoneReset.errors.identityMismatch') || 'L\'identifiant ou l\'email ne correspond pas.',
      sms_send_failed: t('phoneReset.errors.smsSendFailed') || 'Impossible d\'envoyer le SMS. Veuillez réessayer.',
      code_expired: t('phoneReset.errors.codeExpired') || 'Le code a expiré. Veuillez en demander un nouveau.',
      invalid_code: t('phoneReset.errors.invalidCode') || 'Code invalide. Vérifiez et réessayez.',
      validation_error: t('phoneReset.errors.validationError') || 'Données invalides.',
      internal_error: t('phoneReset.errors.internalError') || 'Une erreur est survenue. Veuillez réessayer.',
    };
    return errorMap[errorCode] || errorMap['internal_error'];
  };

  // Handle phone lookup
  const handlePhoneLookup = async () => {
    const trimmedPhone = localPhoneNumber.trim();
    // If phone already starts with +, use it as-is (already has country code)
    const fullPhone = trimmedPhone.startsWith('+')
      ? trimmedPhone.replace(/[^\d+]/g, '') // Keep only digits and +
      : selectedCountry.dial + trimmedPhone.replace(/\D/g, ''); // Add country code

    if (!localPhoneNumber.trim()) {
      setError(t('phoneReset.errors.phoneRequired') || 'Veuillez entrer votre numéro de téléphone');
      return;
    }

    // Extract digits only for validation (excluding + and country code if present)
    const digitsOnly = trimmedPhone.startsWith('+')
      ? trimmedPhone.replace(/^\+\d{1,3}/, '').replace(/\D/g, '') // Remove country code prefix for validation
      : trimmedPhone.replace(/\D/g, '');

    if (!validatePhoneNumber(digitsOnly)) {
      setError(t('phoneReset.errors.phoneInvalid') || 'Format de numéro de téléphone invalide (6-15 chiffres)');
      return;
    }

    setError(null);
    setIsPhoneLookupLoading(true);

    try {
      const result = await phonePasswordResetService.lookupByPhone({
        phoneNumber: fullPhone,
        countryCode: selectedCountry.code,
      });

      if (result.success && result.tokenId && result.maskedUserInfo) {
        setPhoneNumber(fullPhone);
        setPhoneCountryCode(selectedCountry.code);
        setPhoneResetTokenId(result.tokenId);
        setMaskedUserInfo(result.maskedUserInfo);
        setPhoneResetStep('identity_verification');
      } else {
        // Translate error code from service
        setError(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.lookupFailed') || 'Recherche échouée');
      }
    } catch (err) {
      setError(t('phoneReset.errors.networkError') || 'Erreur de connexion');
    } finally {
      setIsPhoneLookupLoading(false);
    }
  };

  // Handle identity verification
  const handleVerifyIdentity = async () => {
    if (!username.trim() || !email.trim()) {
      setError(t('phoneReset.errors.identityRequired') || 'Veuillez remplir tous les champs');
      return;
    }

    if (!validateUsername(username)) {
      setError(t('phoneReset.errors.usernameInvalid') || 'Le nom d\'utilisateur doit contenir entre 2 et 30 caractères');
      return;
    }

    if (!validateEmail(email)) {
      setError(t('phoneReset.errors.emailInvalid') || 'Format d\'email invalide');
      return;
    }

    setError(null);
    setIsIdentityVerifying(true);

    try {
      const result = await phonePasswordResetService.verifyIdentity({
        tokenId: phoneResetTokenId,
        fullUsername: username,
        fullEmail: email,
      });

      if (result.success && result.codeSent) {
        setPhoneResetStep('code_entry');
        setResendCooldown(60);
        toast.success(t('phoneReset.codeSent') || 'Code SMS envoyé !');
      } else {
        // Check if session expired - reset flow
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          toast.error(translateErrorCode(result.error));
          return;
        }
        // Translate error code from service
        setError(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.identityFailed') || 'Vérification échouée');
        if (result.attemptsRemaining !== undefined) {
          setIdentityAttemptsRemaining(result.attemptsRemaining);
        }
      }
    } catch (err) {
      setError(t('phoneReset.errors.networkError') || 'Erreur de connexion');
    } finally {
      setIsIdentityVerifying(false);
    }
  };

  // Handle code verification
  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError(t('phoneReset.errors.codeRequired') || 'Veuillez entrer le code \u00e0 6 chiffres');
      return;
    }

    setError(null);
    setIsCodeVerifying(true);

    try {
      const result = await phonePasswordResetService.verifyCode({
        tokenId: phoneResetTokenId,
        code,
      });

      if (result.success && result.resetToken) {
        // Store the token and redirect to reset password page
        setToken(result.resetToken);
        toast.success(t('phoneReset.success') || 'Vérification réussie !');
        router.push(`/reset-password?token=${result.resetToken}`);
      } else {
        // Check if session expired - reset flow
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          toast.error(translateErrorCode(result.error));
          return;
        }
        // Translate error code from service
        setError(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.codeFailed') || 'Code invalide');
        setCode('');
      }
    } catch (err) {
      setError(t('phoneReset.errors.networkError') || 'Erreur de connexion');
    } finally {
      setIsCodeVerifying(false);
    }
  };

  // Handle resend code
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    try {
      const result = await phonePasswordResetService.resendCode({
        tokenId: phoneResetTokenId,
      });

      if (result.success) {
        setResendCooldown(60);
        toast.success(t('phoneReset.codeResent') || 'Nouveau code envoyé !');
        setCode('');
      } else {
        // Check if session expired - reset flow
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          toast.error(translateErrorCode(result.error));
          return;
        }
        // Translate error code from service
        toast.error(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.resendFailed') || 'Impossible de renvoyer');
      }
    } catch (err) {
      toast.error(t('phoneReset.errors.networkError') || 'Erreur de connexion');
    }
  };

  // Go back
  const handleBack = () => {
    switch (phoneResetStep) {
      case 'identity_verification':
        setPhoneResetStep('phone_input');
        setMaskedUserInfo(null);
        setPhoneResetTokenId('');
        break;
      case 'code_entry':
        setPhoneResetStep('identity_verification');
        setCode('');
        break;
      default:
        onClose?.();
    }
    setError(null);
  };

  // Render based on step
  const renderStep = () => {
    switch (phoneResetStep) {
      case 'phone_input':
        return (
          <>
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Phone className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <CardTitle className="text-xl">
                {t('phoneReset.title') || 'R\u00e9initialiser par t\u00e9l\u00e9phone'}
              </CardTitle>
              <CardDescription>
                {t('phoneReset.description') || 'Entrez votre num\u00e9ro de t\u00e9l\u00e9phone associ\u00e9 \u00e0 votre compte'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone-reset-number">{t('phoneReset.phoneLabel') || 'Numéro de téléphone'}</Label>
                <div className="flex gap-2">
                  <label htmlFor="phone-reset-country" className="sr-only">Indicatif pays</label>
                  <select
                    id="phone-reset-country"
                    value={selectedCountry.code}
                    onChange={(e) => {
                      const country = COUNTRY_CODES.find((c) => c.code === e.target.value);
                      if (country) setSelectedCountry(country);
                    }}
                    className="w-24 px-2 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {COUNTRY_CODES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.dial}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="phone-reset-number"
                    type="tel"
                    inputMode="tel"
                    value={localPhoneNumber}
                    onChange={(e) => setLocalPhoneNumber(e.target.value)}
                    placeholder="6 12 34 56 78"
                    className="flex-1"
                    disabled={isPhoneLookupLoading}
                    autoComplete="tel"
                  />
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handlePhoneLookup}
                disabled={isPhoneLookupLoading || !localPhoneNumber.trim()}
                className="w-full"
              >
                {isPhoneLookupLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('phoneReset.searching') || 'Recherche...'}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {t('phoneReset.searchButton') || 'Rechercher mon compte'}
                  </>
                )}
              </Button>

              <Button variant="ghost" onClick={onClose} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('phoneReset.back') || 'Retour'}
              </Button>
            </CardContent>
          </>
        );

      case 'identity_verification':
        return (
          <>
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <CardTitle className="text-xl">
                {t('phoneReset.identityTitle') || 'V\u00e9rifiez votre identit\u00e9'}
              </CardTitle>
              <CardDescription className="space-y-1">
                <span>{t('phoneReset.identityDescription') || 'Confirmez votre identité pour recevoir un code SMS'}</span>
                <br />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('phoneReset.identityHint') || 'en complétant les caractères manquants (remplacez les * et ...)'}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {maskedUserInfo && <IdentityCard maskedUserInfo={maskedUserInfo} />}

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="phone-reset-username">{t('phoneReset.usernameLabel') || 'Nom d\'utilisateur complet'}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
                    <Input
                      id="phone-reset-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('phoneReset.usernamePlaceholder') || 'Entrez votre pseudo complet'}
                      className="pl-10"
                      disabled={isIdentityVerifying}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone-reset-email">{t('phoneReset.emailLabel') || 'Adresse email complète'}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
                    <Input
                      id="phone-reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('phoneReset.emailPlaceholder') || 'Entrez votre email complet'}
                      className="pl-10"
                      disabled={isIdentityVerifying}
                      autoComplete="email"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>

              {identityAttemptsRemaining !== null && identityAttemptsRemaining <= 2 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('phoneReset.attemptsRemaining') || 'Tentatives restantes'}: {identityAttemptsRemaining}
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleVerifyIdentity}
                disabled={isIdentityVerifying || !username.trim() || !email.trim()}
                className="w-full"
              >
                {isIdentityVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('phoneReset.verifying') || 'V\u00e9rification...'}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('phoneReset.verifyButton') || 'V\u00e9rifier et envoyer le code'}
                  </>
                )}
              </Button>

              <Button variant="ghost" onClick={handleBack} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('phoneReset.cancel') || 'Annuler'}
              </Button>
            </CardContent>
          </>
        );

      case 'code_entry':
        return (
          <>
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Phone className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <CardTitle className="text-xl">
                {t('phoneReset.codeTitle') || 'Entrez le code SMS'}
              </CardTitle>
              <CardDescription>
                {t('phoneReset.codeDescription') || 'Un code \u00e0 6 chiffres a \u00e9t\u00e9 envoy\u00e9 au'}
                <br />
                <span className="font-semibold text-blue-600 dark:text-blue-400">{phoneNumber}</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <OTPInput value={code} onChange={setCode} disabled={isCodeVerifying} id="phone-reset-code" />

              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                <span>{t('phoneReset.expiresIn') || 'Expire dans 10 minutes'}</span>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleVerifyCode}
                disabled={isCodeVerifying || code.length !== 6}
                className="w-full"
              >
                {isCodeVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('phoneReset.verifyingCode') || 'V\u00e9rification...'}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('phoneReset.verifyCodeButton') || 'V\u00e9rifier le code'}
                  </>
                )}
              </Button>

              {/* Resend */}
              <div className="text-center">
                {resendCooldown > 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('phoneReset.resendIn') || 'Renvoyer dans'} {resendCooldown}s
                  </p>
                ) : (
                  <button
                    onClick={handleResendCode}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center justify-center gap-1 mx-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t('phoneReset.resendCode') || 'Renvoyer le code'}
                  </button>
                )}
              </div>

              <Button variant="ghost" onClick={handleBack} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('phoneReset.back') || 'Retour'}
              </Button>
            </CardContent>
          </>
        );

      default:
        return null;
    }
  };

  return <>{renderStep()}</>;
}
