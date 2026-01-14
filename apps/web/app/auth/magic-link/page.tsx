'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { LargeLogo } from '@/components/branding';
import { magicLinkService } from '@/services/magic-link.service';
import { Sparkles, Mail, CheckCircle, ArrowLeft, Clock, RefreshCw, AlertTriangle, Shield } from 'lucide-react';

// Constants
const MAGIC_LINK_EXPIRY_SECONDS = 60; // 1 minute
const MAX_RETRY_ATTEMPTS = 3;
const STORAGE_KEY_RETRY_COUNT = 'magic_link_retry_count';
const STORAGE_KEY_RETRY_EMAIL = 'magic_link_retry_email';
const STORAGE_KEY_BLOCKED_UNTIL = 'magic_link_blocked_until';
// rememberDevice is now stored server-side for security (no more sessionStorage)
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes block

// Composants inline légers
const SimpleCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 ${className}`}>
    {children}
  </div>
);

const SimpleButton = ({
  children,
  onClick,
  disabled = false,
  type = 'button',
  variant = 'primary',
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
}) => {
  const baseStyles = 'font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2';
  const variantStyles = {
    primary: 'w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white',
    secondary: 'w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white',
    outline: 'w-full bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
    ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const SimpleInput = ({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  icon: Icon
}: {
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <div className="relative">
    {Icon && (
      <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
    )}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2.5 ${Icon ? 'pl-10' : ''} bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500 ${className}`}
    />
  </div>
);

const SimpleCheckbox = ({
  id,
  checked,
  onChange,
  disabled = false,
  children
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex items-center space-x-2">
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
    />
    <label
      htmlFor={id}
      className="text-sm font-medium leading-none cursor-pointer flex items-center gap-1.5 text-gray-700 dark:text-gray-300"
    >
      {children}
    </label>
  </div>
);

function MagicLinkPageContent() {
  const { t } = useI18n('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  // Countdown and retry state
  const [countdown, setCountdown] = useState(MAGIC_LINK_EXPIRY_SECONDS);
  const [retryCount, setRetryCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Check if magic link is blocked on mount
  useEffect(() => {
    const blockedUntilStr = sessionStorage.getItem(STORAGE_KEY_BLOCKED_UNTIL);
    if (blockedUntilStr) {
      const blockedDate = new Date(blockedUntilStr);
      if (blockedDate > new Date()) {
        setIsBlocked(true);
        setBlockedUntil(blockedDate);
      } else {
        // Block expired, clear storage
        sessionStorage.removeItem(STORAGE_KEY_BLOCKED_UNTIL);
        sessionStorage.removeItem(STORAGE_KEY_RETRY_COUNT);
        sessionStorage.removeItem(STORAGE_KEY_RETRY_EMAIL);
      }
    }

    // Load retry count for current email
    const storedEmail = sessionStorage.getItem(STORAGE_KEY_RETRY_EMAIL);
    const storedCount = sessionStorage.getItem(STORAGE_KEY_RETRY_COUNT);
    if (storedEmail && storedCount) {
      setRetryCount(parseInt(storedCount, 10));
    }
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!isEmailSent || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isEmailSent, countdown]);

  // Format countdown as MM:SS
  const formatCountdown = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Validation email basique
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError(t('magicLink.errors.emailRequired'));
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError(t('magicLink.errors.invalidEmail'));
      return;
    }

    // Check if blocked
    if (isBlocked) {
      return;
    }

    setIsLoading(true);

    try {
      // Send rememberDevice with request - stored server-side for security
      const response = await magicLinkService.requestMagicLink(trimmedEmail, rememberDevice);

      // Store the email for retry tracking (only for UI purposes)
      sessionStorage.setItem(STORAGE_KEY_RETRY_EMAIL, trimmedEmail);
      // Note: rememberDevice is stored server-side with the token for security

      if (response.success) {
        setIsEmailSent(true);
        setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
        toast.success(t('magicLink.success.emailSent'));
      } else {
        // Always show success to prevent email enumeration
        setIsEmailSent(true);
        setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
        toast.success(t('magicLink.success.emailSent'));
      }
    } catch (error) {
      console.error('[MagicLink] Erreur:', error);
      // Same behavior to prevent email enumeration
      setIsEmailSent(true);
      setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    const currentRetryCount = retryCount + 1;

    // Check if max retries reached
    if (currentRetryCount >= MAX_RETRY_ATTEMPTS) {
      const blockedUntilDate = new Date(Date.now() + BLOCK_DURATION_MS);
      sessionStorage.setItem(STORAGE_KEY_BLOCKED_UNTIL, blockedUntilDate.toISOString());
      sessionStorage.setItem(STORAGE_KEY_RETRY_COUNT, currentRetryCount.toString());
      setIsBlocked(true);
      setBlockedUntil(blockedUntilDate);
      setRetryCount(currentRetryCount);
      toast.error(t('magicLink.checkEmail.maxRetriesReached'));
      return;
    }

    setIsResending(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      // Resend with same rememberDevice preference
      await magicLinkService.requestMagicLink(trimmedEmail, rememberDevice);

      // Update retry count
      setRetryCount(currentRetryCount);
      sessionStorage.setItem(STORAGE_KEY_RETRY_COUNT, currentRetryCount.toString());

      // Reset countdown
      setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
      toast.success(t('magicLink.checkEmail.resent'));
    } catch (error) {
      console.error('[MagicLink] Erreur de renvoi:', error);
      toast.error(t('magicLink.errors.requestFailed'));
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = () => {
    router.push('/login' + (returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''));
  };

  // Vue: Magic Link bloqué après trop de tentatives
  if (isBlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('magicLink.checkEmail.blocked.title')}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                {t('magicLink.checkEmail.blocked.description')}
              </p>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {t('magicLink.checkEmail.blocked.useAnotherMethod')}
                </p>
              </div>

              <div className="space-y-3">
                <SimpleButton variant="primary" onClick={handleBackToLogin}>
                  {t('magicLink.checkEmail.blocked.loginWithPassword')}
                </SimpleButton>
                <SimpleButton variant="outline" onClick={() => router.push('/')}>
                  <ArrowLeft className="h-4 w-4" />
                  {t('featureGate.backToHome')}
                </SimpleButton>
              </div>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // Vue après envoi de l'email
  if (isEmailSent) {
    const isExpired = countdown <= 0;
    const remainingRetries = MAX_RETRY_ATTEMPTS - retryCount;

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <LargeLogo href="/" />
          </div>

          {/* Card de confirmation */}
          <SimpleCard className="p-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('magicLink.checkEmail.title')}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                {t('magicLink.checkEmail.description')}
              </p>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">
                  {t('magicLink.checkEmail.emailSentTo')}
                </p>
                <p className="text-blue-600 dark:text-blue-400 font-medium">{email}</p>
              </div>

              {/* Instructions */}
              <div className="text-left space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">1</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('magicLink.checkEmail.step1')}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">2</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('magicLink.checkEmail.step2')}
                  </p>
                </div>
              </div>

              {/* Countdown Timer */}
              <div className={`flex items-center justify-center gap-2 text-sm mb-4 ${
                isExpired
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                <Clock className="h-4 w-4" />
                {isExpired ? (
                  <span>{t('magicLink.checkEmail.linkExpired')}</span>
                ) : (
                  <span>
                    {t('magicLink.checkEmail.expiresIn', { time: formatCountdown(countdown) })}
                  </span>
                )}
              </div>

              {/* Resend Button - Only show when countdown reaches 0 */}
              {isExpired && remainingRetries > 0 && (
                <div className="mb-4">
                  <SimpleButton
                    variant="secondary"
                    onClick={handleResend}
                    disabled={isResending}
                  >
                    {isResending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>{t('magicLink.checkEmail.resending')}</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        {t('magicLink.checkEmail.resendButton')}
                      </>
                    )}
                  </SimpleButton>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {t('magicLink.checkEmail.retriesRemaining', { count: remainingRetries })}
                  </p>
                </div>
              )}

              {/* Spam warning */}
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                {t('magicLink.checkEmail.spamWarning')}
              </p>
            </div>

            {/* Bouton retour */}
            <SimpleButton variant="outline" onClick={handleBackToLogin}>
              <ArrowLeft className="h-4 w-4" />
              {t('magicLink.checkEmail.backToLogin')}
            </SimpleButton>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // Vue de demande de Magic Link
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400">{t('magicLink.subtitle')}</p>
        </div>

        {/* Card principale */}
        <SimpleCard className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('magicLink.title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {t('magicLink.description')}
            </p>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('magicLink.emailLabel')}
              </label>
              <SimpleInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('magicLink.emailPlaceholder')}
                disabled={isLoading}
                icon={Mail}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('magicLink.emailHelp')}
              </p>
            </div>

            {/* Remember device checkbox */}
            <div className="py-1">
              <SimpleCheckbox
                id="remember-device"
                checked={rememberDevice}
                onChange={setRememberDevice}
                disabled={isLoading}
              >
                <Shield className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                {t('login.rememberDevice')}
              </SimpleCheckbox>
            </div>

            <SimpleButton type="submit" disabled={isLoading} variant="primary">
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{t('magicLink.sending')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t('magicLink.submitButton')}
                </>
              )}
            </SimpleButton>
          </form>

          {/* Retour à la connexion */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <SimpleButton variant="ghost" onClick={handleBackToLogin} className="w-full">
              <ArrowLeft className="h-4 w-4" />
              {t('magicLink.backToLogin')}
            </SimpleButton>
          </div>
        </SimpleCard>

        {/* Note de sécurité */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {t('magicLink.securityNote')}
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400 mx-auto"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MagicLinkPageContent />
    </Suspense>
  );
}
