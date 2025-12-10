'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { passwordResetService } from '@/services/password-reset.service';
import { usePasswordResetStore } from '@/stores/password-reset-store';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ForgotPasswordFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function ForgotPasswordForm({ className, onSuccess }: ForgotPasswordFormProps) {
  const router = useRouter();
  const { t } = useI18n('auth');

  const {
    email: storedEmail,
    setEmail: setStoredEmail,
    setResetRequested,
    setError: setStoreError,
    setSuccessMessage,
    setIsRequestingReset,
  } = usePasswordResetStore();

  const [email, setEmail] = useState(storedEmail || '');
  const [captchaToken, setCaptchaToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [captchaLoaded, setCaptchaLoaded] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  // Load hCaptcha script
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if hCaptcha script is already loaded
    if (window.hcaptcha) {
      setCaptchaLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => setCaptchaLoaded(true);
    script.onerror = () => {
      setCaptchaError(t('forgotPassword.errors.captchaLoadFailed') || 'Failed to load CAPTCHA');
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup: remove script on unmount
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [t]);

  // Initialize hCaptcha widget when loaded
  useEffect(() => {
    if (!captchaLoaded || !window.hcaptcha) return;

    try {
      // Render hCaptcha widget
      const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
      if (!siteKey) {
        console.error('[ForgotPasswordForm] Missing NEXT_PUBLIC_HCAPTCHA_SITE_KEY');
        setCaptchaError(t('forgotPassword.errors.captchaNotConfigured') || 'CAPTCHA not configured');
        return;
      }

      const widgetId = window.hcaptcha.render('hcaptcha-container', {
        sitekey: siteKey,
        callback: (token: string) => {
          setCaptchaToken(token);
          setCaptchaError(null);
        },
        'error-callback': () => {
          setCaptchaError(t('forgotPassword.errors.captchaFailed') || 'CAPTCHA verification failed');
        },
        'expired-callback': () => {
          setCaptchaToken('');
          toast.warning(t('forgotPassword.captchaExpired') || 'CAPTCHA expired, please verify again');
        },
      });

      return () => {
        if (window.hcaptcha && widgetId) {
          try {
            window.hcaptcha.remove(widgetId);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      };
    } catch (error) {
      console.error('[ForgotPasswordForm] Error initializing hCaptcha:', error);
      setCaptchaError(t('forgotPassword.errors.captchaInitFailed') || 'Failed to initialize CAPTCHA');
    }
  }, [captchaLoaded, t]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Validation
    if (!email.trim()) {
      setLocalError(t('forgotPassword.errors.emailRequired') || 'Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setLocalError(t('forgotPassword.errors.invalidEmail') || 'Please enter a valid email address');
      return;
    }

    if (!captchaToken) {
      setLocalError(t('forgotPassword.errors.captchaRequired') || 'Please complete the CAPTCHA verification');
      return;
    }

    // Submit request
    setIsLoading(true);
    setIsRequestingReset(true);

    try {
      const response = await passwordResetService.requestReset({
        email: email.trim(),
        captchaToken,
      });

      // Store email and set reset requested
      setStoredEmail(email.trim());
      setResetRequested(true);
      setSuccessMessage(response.message);

      // Show success toast
      toast.success(t('forgotPassword.success.emailSent') || 'Password reset link sent');

      // Redirect to check email page or call onSuccess callback
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/forgot-password/check-email');
      }
    } catch (error) {
      console.error('[ForgotPasswordForm] Error requesting reset:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('forgotPassword.errors.requestFailed') || 'Failed to request password reset';
      setLocalError(errorMessage);
      setStoreError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      setIsRequestingReset(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Email Input */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{t('forgotPassword.emailLabel') || 'Email Address'}</span>
          </div>
        </Label>
        <Input
          id="email"
          type="email"
          placeholder={t('forgotPassword.emailPlaceholder') || 'your.email@example.com'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          required
          autoComplete="email"
          autoFocus
          className="h-11"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('forgotPassword.emailHelp') || 'Enter the email address associated with your account'}
        </p>
      </div>

      {/* hCaptcha Widget */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {t('forgotPassword.captchaLabel') || 'Verification'}
        </Label>
        <div id="hcaptcha-container" className="flex justify-center" />
        {captchaError && (
          <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {captchaError}
          </p>
        )}
        {!captchaLoaded && !captchaError && (
          <div className="flex items-center justify-center p-4 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t('forgotPassword.loadingCaptcha') || 'Loading verification...'}
          </div>
        )}
      </div>

      {/* Error Alert */}
      {localError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-11 font-semibold"
        disabled={isLoading || !captchaToken || !email.trim()}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('forgotPassword.sending') || 'Sending...'}
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            {t('forgotPassword.submitButton') || 'Send Reset Link'}
          </>
        )}
      </Button>

      {/* Back to Login Link */}
      <div className="text-center">
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline transition-colors"
        >
          {t('forgotPassword.backToLogin') || 'Back to Login'}
        </button>
      </div>
    </form>
  );
}

// TypeScript declarations for hCaptcha
declare global {
  interface Window {
    hcaptcha?: {
      render: (container: string | HTMLElement, options: any) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
      execute: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string;
    };
  }
}
