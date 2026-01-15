'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, AlertCircle, Loader2 } from 'lucide-react';
import { passwordResetService } from '@/services/password-reset.service';
import { usePasswordResetStore } from '@/stores/password-reset-store';
import { useAuthFormStore } from '@/stores/auth-form-store';
import { useI18n } from '@/hooks/useI18n';
import { useBotProtection } from '@/hooks/use-bot-protection';
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

  // Get shared identifier from login/register forms
  const { identifier: sharedIdentifier, setIdentifier } = useAuthFormStore();

  // Initialize email from stored email or shared identifier (if it looks like an email)
  const getInitialEmail = () => {
    if (storedEmail) return storedEmail;
    if (sharedIdentifier && sharedIdentifier.includes('@')) return sharedIdentifier;
    return '';
  };

  const [email, setEmail] = useState(getInitialEmail());
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync email changes to shared store
  const handleEmailChange = (value: string) => {
    setEmail(value);
    setIdentifier(value);
  };

  // Bot protection (replaces hCaptcha)
  const { honeypotProps, validateSubmission, reset: resetBotProtection } = useBotProtection({
    minSubmitTime: 2000, // 2 seconds minimum before submit
  });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Bot protection validation
    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      setLocalError(botError);
      toast.error(botError);
      return;
    }

    // Email validation
    if (!email.trim()) {
      setLocalError(t('forgotPassword.errors.emailRequired') || 'Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setLocalError(t('forgotPassword.errors.invalidEmail') || 'Please enter a valid email address');
      return;
    }

    // Submit request
    setIsLoading(true);
    setIsRequestingReset(true);

    try {
      const response = await passwordResetService.requestReset({
        email: email.trim(),
        // No captcha token needed anymore
      });

      // Store email and set reset requested
      setStoredEmail(email.trim());
      setResetRequested(true);
      setSuccessMessage(response.message);

      // Reset bot protection for next attempt
      resetBotProtection();

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
      {/* Honeypot field - invisible to humans, bots will fill it */}
      <input {...honeypotProps} />

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
          onChange={(e) => handleEmailChange(e.target.value)}
          disabled={isLoading}
          required
          autoComplete="email"
          spellCheck={false}
          className="h-11"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('forgotPassword.emailHelp') || 'Enter the email address associated with your account'}
        </p>
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
        disabled={isLoading || !email.trim()}
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
        <Link
          href="/login"
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
        >
          {t('forgotPassword.backToLogin') || 'Back to Login'}
        </Link>
      </div>
    </form>
  );
}
