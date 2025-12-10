'use client';

import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';
import { KeyRound } from 'lucide-react';
import { FeatureGate } from '@/components/auth/FeatureGate';

function ForgotPasswordContent() {
  const { t } = useI18n('auth');

  return (
    <FeatureGate feature="passwordReset" showMessage={true}>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400 text-lg mt-2">
            {t('forgotPassword.subtitle') || 'Reset your password securely'}
          </p>
        </div>

        {/* Forgot Password Card */}
        <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <CardTitle className="flex items-center justify-center space-x-2 text-2xl">
              <KeyRound className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <span>{t('forgotPassword.title') || 'Forgot Password'}</span>
            </CardTitle>
            <CardDescription className="text-base">
              {t('forgotPassword.description') ||
                'Enter your email address and we will send you a link to reset your password'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm />
          </CardContent>
        </Card>

        {/* Security Note */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>
            {t('forgotPassword.securityNote') ||
              'For security reasons, we will send a password reset link to your email address. The link will expire in 15 minutes.'}
          </p>
          <p>
            {t('forgotPassword.privacyNote') ||
              'We will never ask for your password via email or phone.'}
          </p>
        </div>
      </div>
    </div>
    </FeatureGate>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
