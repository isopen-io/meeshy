'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useI18n } from '@/hooks/useI18n';
import { usePasswordResetStore, type MaskedUserInfo, type _PhoneResetStep } from '@/stores/password-reset-store';
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
import { COUNTRY_CODES } from '@/constants/countries';

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
  const { t } = useI18n('auth');
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
    <div className="flex justify-center gap-2" role="group" aria-label={t('otp.groupLabel', { length: CODE_LENGTH })}>
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
          aria-label={t('otp.digitLabel', { index: index + 1, total: CODE_LENGTH })}
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
        {maskedUserInfo.avatar ? (
          <img
            src={maskedUserInfo.avatar}
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
    _phoneCountryCode,
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
    _resetPhoneFlow,
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

  // Translate error code using i18n (native English fallbacks for anti-flash)
  const translateErrorCode = (errorCode: string): string => {
    const errorMap: Record<string, string> = {
      rate_limited: t('phoneReset.errors.rateLimited', 'Too many attempts. Please try again later.'),
      invalid_phone: t('phoneReset.errors.invalidPhone', 'Invalid phone number'),
      user_not_found: t('phoneReset.errors.userNotFound', 'No account found with this number'),
      phone_not_verified: t('phoneReset.errors.phoneNotVerified', 'This number is not verified on your account'),
      invalid_token: t('phoneReset.errors.invalidToken', 'Session expired. Please start over.'),
      token_expired: t('phoneReset.errors.tokenExpired', 'Session expired. Please start over.'),
      invalid_step: t('phoneReset.errors.invalidStep', 'Invalid action. Please start over.'),
      max_attempts_exceeded: t('phoneReset.errors.maxAttemptsExceeded', 'Too many failed attempts. Please try again later.'),
      identity_mismatch: t('phoneReset.errors.identityMismatch', 'Username or email does not match'),
      sms_send_failed: t('phoneReset.errors.smsSendFailed', 'Failed to send SMS. Please try again.'),
      code_expired: t('phoneReset.errors.codeExpired', 'The code has expired. Please request a new one.'),
      invalid_code: t('phoneReset.errors.invalidCode', 'Invalid code. Please check and try again.'),
      validation_error: t('phoneReset.errors.validationError', 'Invalid data.'),
      internal_error: t('phoneReset.errors.internalError', 'An error occurred. Please try again.'),
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
      setError(t('phoneReset.errors.phoneRequired', 'Please enter your phone number'));
      return;
    }

    // Extract digits only for validation (excluding + and country code if present)
    const digitsOnly = trimmedPhone.startsWith('+')
      ? trimmedPhone.replace(/^\+\d{1,3}/, '').replace(/\D/g, '') // Remove country code prefix for validation
      : trimmedPhone.replace(/\D/g, '');

    if (!validatePhoneNumber(digitsOnly)) {
      setError(t('phoneReset.errors.phoneInvalid', 'Invalid phone number format'));
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
        setError(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.lookupFailed', 'Lookup failed. Please try again.'));
      }
    } catch (_err) {
      setError(t('phoneReset.errors.networkError', 'Connection error'));
    } finally {
      setIsPhoneLookupLoading(false);
    }
  };

  // Handle identity verification
  const handleVerifyIdentity = async () => {
    if (!username.trim() || !email.trim()) {
      setError(t('phoneReset.errors.identityRequired', 'Please fill in all fields'));
      return;
    }

    if (!validateUsername(username)) {
      setError(t('phoneReset.errors.usernameInvalid', 'Username must be between 2 and 30 characters'));
      return;
    }

    if (!validateEmail(email)) {
      setError(t('phoneReset.errors.emailInvalid', 'Invalid email format'));
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
        toast.success(t('phoneReset.codeSent', 'SMS code sent!'));
      } else {
        // Check if session expired - reset flow
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          toast.error(translateErrorCode(result.error));
          return;
        }
        // Translate error code from service
        setError(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.identityFailed', 'Verification failed'));
        if (result.attemptsRemaining !== undefined) {
          setIdentityAttemptsRemaining(result.attemptsRemaining);
        }
      }
    } catch (_err) {
      setError(t('phoneReset.errors.networkError', 'Connection error'));
    } finally {
      setIsIdentityVerifying(false);
    }
  };

  // Handle code verification
  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError(t('phoneReset.errors.codeRequired', 'Please enter the 6-digit code'));
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
        toast.success(t('phoneReset.success', 'Verification successful!'));
        router.push(`/reset-password?token=${result.resetToken}`);
      } else {
        // Check if session expired - reset flow
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          toast.error(translateErrorCode(result.error));
          return;
        }
        // Translate error code from service
        setError(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.codeFailed', 'Invalid code'));
        setCode('');
      }
    } catch (_err) {
      setError(t('phoneReset.errors.networkError', 'Connection error'));
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
        toast.success(t('phoneReset.codeResent', 'New code sent!'));
        setCode('');
      } else {
        // Check if session expired - reset flow
        if (result.error && isSessionExpiredError(result.error)) {
          handleSessionExpired();
          toast.error(translateErrorCode(result.error));
          return;
        }
        // Translate error code from service
        toast.error(result.error ? translateErrorCode(result.error) : t('phoneReset.errors.resendFailed', 'Failed to resend code'));
      }
    } catch (_err) {
      toast.error(t('phoneReset.errors.networkError', 'Connection error'));
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
                {t('phoneReset.title', 'Reset by Phone')}
              </CardTitle>
              <CardDescription>
                {t('phoneReset.description', 'Enter your phone number associated with your account')}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone-reset-number">{t('phoneReset.phoneLabel', 'Phone Number')}</Label>
                <div className="flex gap-2">
                  <label htmlFor="phone-reset-country" className="sr-only">{t('phoneReset.selectCountry', 'Select country')}</label>
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
                    {t('phoneReset.searching', 'Searching...')}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {t('phoneReset.searchButton', 'Find my account')}
                  </>
                )}
              </Button>

              <Button variant="ghost" onClick={onClose} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('phoneReset.back', 'Back')}
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
                {t('phoneReset.identityTitle', 'Verify Your Identity')}
              </CardTitle>
              <CardDescription className="space-y-1">
                <span>{t('phoneReset.identityDescription', 'Confirm your identity to receive an SMS code')}</span>
                <br />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('phoneReset.identityHint', 'by filling in the missing characters (replace the * and ...)')}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {maskedUserInfo && <IdentityCard maskedUserInfo={maskedUserInfo} />}

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="phone-reset-username">{t('phoneReset.usernameLabel', 'Full Username')}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
                    <Input
                      id="phone-reset-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('phoneReset.usernamePlaceholder', 'Enter your full username')}
                      className="pl-10"
                      disabled={isIdentityVerifying}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone-reset-email">{t('phoneReset.emailLabel', 'Full Email Address')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
                    <Input
                      id="phone-reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('phoneReset.emailPlaceholder', 'Enter your full email address')}
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
                    {t('phoneReset.attemptsRemaining', 'Attempts remaining')}: {identityAttemptsRemaining}
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
                    {t('phoneReset.verifying', 'Verifying...')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('phoneReset.verifyButton', 'Verify and send code')}
                  </>
                )}
              </Button>

              <Button variant="ghost" onClick={handleBack} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('phoneReset.cancel', 'Cancel')}
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
                {t('phoneReset.codeTitle', 'Enter SMS Code')}
              </CardTitle>
              <CardDescription>
                {t('phoneReset.codeDescription', 'A 6-digit code was sent to')}
                <br />
                <span className="font-semibold text-blue-600 dark:text-blue-400">{phoneNumber}</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <OTPInput value={code} onChange={setCode} disabled={isCodeVerifying} id="phone-reset-code" />

              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                <span>{t('phoneReset.expiresIn', 'Expires in 10 minutes')}</span>
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
                    {t('phoneReset.verifyingCode', 'Verifying code...')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('phoneReset.verifyCodeButton', 'Verify Code')}
                  </>
                )}
              </Button>

              {/* Resend */}
              <div className="text-center">
                {resendCooldown > 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('phoneReset.resendIn', 'Resend in')} {resendCooldown}s
                  </p>
                ) : (
                  <button
                    onClick={handleResendCode}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center justify-center gap-1 mx-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t('phoneReset.resendCode', 'Resend Code')}
                  </button>
                )}
              </div>

              <Button variant="ghost" onClick={handleBack} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('phoneReset.back', 'Back')}
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
