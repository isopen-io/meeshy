'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { passwordResetService } from '@/services/password-reset.service';
import { usePasswordResetStore } from '@/stores/password-reset-store';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { PasswordRequirementsChecklist } from './PasswordRequirementsChecklist';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ResetPasswordFormProps {
  token: string;
  className?: string;
  onSuccess?: () => void;
}

export function ResetPasswordForm({ token, className, onSuccess }: ResetPasswordFormProps) {
  const router = useRouter();
  const { t } = useI18n('auth');

  const {
    requires2FA,
    setRequires2FA,
    setPasswordReset,
    setError: setStoreError,
    setSuccessMessage,
    setIsResettingPassword,
  } = usePasswordResetStore();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(false);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setLocalError(t('resetPassword.errors.tokenMissing') || 'Reset token is missing');
        setIsVerifying(false);
        return;
      }

      setIsVerifying(true);

      try {
        const response = await passwordResetService.verifyToken({ token });

        if (response.success && response.valid) {
          setTokenValid(true);
          if (response.requires2FA) {
            setRequires2FA(true);
          }
        } else {
          setTokenValid(false);
          setLocalError(
            response.error ||
              t('resetPassword.errors.tokenInvalid') ||
              'Invalid or expired reset token'
          );
        }
      } catch (error) {
        console.error('[ResetPasswordForm] Error verifying token:', error);
        setTokenValid(false);
        setLocalError(
          t('resetPassword.errors.verificationFailed') || 'Failed to verify reset token'
        );
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token, setRequires2FA, t]);

  const validateForm = (): boolean => {
    // Check password filled
    if (!newPassword.trim()) {
      setLocalError(t('resetPassword.errors.passwordRequired') || 'Password is required');
      return false;
    }

    // Check password strength
    const validation = passwordResetService.validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      setLocalError(validation.errors.join('. '));
      return false;
    }

    // Check passwords match
    if (newPassword !== confirmPassword) {
      setLocalError(
        t('resetPassword.errors.passwordMismatch') || 'Passwords do not match'
      );
      return false;
    }

    // Check 2FA code if required
    if (requires2FA && !twoFactorCode.trim()) {
      setLocalError(
        t('resetPassword.errors.twoFactorRequired') || '2FA code is required'
      );
      return false;
    }

    if (requires2FA && twoFactorCode.trim().length !== 6) {
      setLocalError(
        t('resetPassword.errors.twoFactorInvalid') || '2FA code must be 6 digits'
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setIsResettingPassword(true);

    try {
      const response = await passwordResetService.resetPassword({
        token,
        newPassword,
        confirmPassword,
        twoFactorCode: requires2FA ? twoFactorCode : undefined,
      });

      if (response.success) {
        setPasswordReset(true);
        setSuccessMessage(
          response.message ||
            t('resetPassword.success.passwordReset') ||
            'Password reset successfully'
        );

        toast.success(
          t('resetPassword.success.passwordReset') || 'Password reset successfully!'
        );

        // Redirect to login or call onSuccess callback
        if (onSuccess) {
          onSuccess();
        } else {
          setTimeout(() => {
            router.push('/login?passwordReset=true');
          }, 2000);
        }
      } else {
        const errorMessage =
          response.error ||
          t('resetPassword.errors.resetFailed') ||
          'Failed to reset password';
        setLocalError(errorMessage);
        setStoreError(errorMessage);
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('[ResetPasswordForm] Error resetting password:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('resetPassword.errors.resetFailed') || 'Failed to reset password';
      setLocalError(errorMessage);
      setStoreError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      setIsResettingPassword(false);
    }
  };

  // Show loading state while verifying token
  if (isVerifying) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 space-y-4', className)}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('resetPassword.verifyingToken') || 'Verifying reset link...'}
        </p>
      </div>
    );
  }

  // Show error if token is invalid
  if (!tokenValid) {
    return (
      <div className={cn('space-y-6', className)}>
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertDescription className="ml-2">
            {localError || t('resetPassword.errors.tokenInvalid') || 'Invalid or expired reset token'}
          </AlertDescription>
        </Alert>

        <div className="text-center space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('resetPassword.tokenExpiredHelp') ||
              'Your reset link may have expired. Please request a new one.'}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push('/forgot-password')}
            className="w-full"
          >
            {t('resetPassword.requestNewLink') || 'Request New Reset Link'}
          </Button>
        </div>
      </div>
    );
  }

  // Show reset password form
  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Success banner (token verified) */}
      <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertDescription className="ml-2 text-green-700 dark:text-green-300">
          {t('resetPassword.tokenVerified') || 'Reset link verified. Please enter your new password.'}
        </AlertDescription>
      </Alert>

      {/* New Password */}
      <div className="space-y-2">
        <Label htmlFor="newPassword" className="text-sm font-medium">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{t('resetPassword.newPasswordLabel') || 'New Password'}</span>
          </div>
        </Label>
        <div className="relative">
          <Input
            id="newPassword"
            type={showNewPassword ? 'text' : 'password'}
            placeholder={t('resetPassword.newPasswordPlaceholder') || 'Enter new password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="new-password"
            autoFocus
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowNewPassword(!showNewPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label={showNewPassword ? 'Hide password' : 'Show password'}
          >
            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Password Strength Meter */}
        {newPassword && <PasswordStrengthMeter password={newPassword} />}
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-sm font-medium">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{t('resetPassword.confirmPasswordLabel') || 'Confirm Password'}</span>
          </div>
        </Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder={t('resetPassword.confirmPasswordPlaceholder') || 'Re-enter new password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="new-password"
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Password match indicator */}
        {confirmPassword && (
          <div
            className={cn(
              'text-xs flex items-center gap-1',
              newPassword === confirmPassword
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {newPassword === confirmPassword ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                {t('resetPassword.passwordsMatch') || 'Passwords match'}
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3" />
                {t('resetPassword.passwordsDontMatch') || 'Passwords do not match'}
              </>
            )}
          </div>
        )}
      </div>

      {/* Password Requirements Checklist */}
      <PasswordRequirementsChecklist password={newPassword} />

      {/* 2FA Code (if required) */}
      {requires2FA && (
        <div className="space-y-2">
          <Label htmlFor="twoFactorCode" className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{t('resetPassword.twoFactorLabel') || '2FA Code'}</span>
            </div>
          </Label>
          <Input
            id="twoFactorCode"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder={t('resetPassword.twoFactorPlaceholder') || '000000'}
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
            disabled={isLoading}
            required
            autoComplete="one-time-code"
            className="h-11 text-center text-lg tracking-widest font-mono"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('resetPassword.twoFactorHelp') ||
              'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>
      )}

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
        disabled={isLoading || !newPassword || !confirmPassword || (requires2FA && !twoFactorCode)}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('resetPassword.resetting') || 'Resetting Password...'}
          </>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" />
            {t('resetPassword.submitButton') || 'Reset Password'}
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
          {t('resetPassword.backToLogin') || 'Back to Login'}
        </button>
      </div>
    </form>
  );
}
