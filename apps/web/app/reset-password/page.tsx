'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { FeatureGate } from '@/components/auth/FeatureGate';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n('auth');

  const token = searchParams.get('token');

  // Show error if no token in URL
  if (!token) {
    return (
      <FeatureGate feature="passwordReset" showMessage={true}>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Header */}
          <div className="text-center">
            <LargeLogo href="/" />
          </div>

          {/* Error Card */}
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <CardTitle className="text-2xl">
                {t('resetPassword.errors.invalidLink') || 'Invalid Reset Link'}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {t('resetPassword.errors.invalidLinkDescription') ||
                  'The password reset link is invalid or missing'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('resetPassword.errors.noToken') ||
                    'No reset token found in the URL. Please use the link from your email.'}
                </AlertDescription>
              </Alert>

              <div className="text-center space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('resetPassword.errors.noTokenHelp') ||
                    'Please click the reset link from the email we sent you, or request a new password reset.'}
                </p>
                <a
                  href="/forgot-password"
                  className="inline-block w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors"
                >
                  {t('resetPassword.requestNewLink') || 'Request New Reset Link'}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate feature="passwordReset" showMessage={true}>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400 text-lg mt-2">
            {t('resetPassword.subtitle') || 'Create a new secure password'}
          </p>
        </div>

        {/* Reset Password Card */}
        <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <CardTitle className="flex items-center justify-center space-x-2 text-2xl">
              <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <span>{t('resetPassword.title') || 'Reset Password'}</span>
            </CardTitle>
            <CardDescription className="text-base">
              {t('resetPassword.description') ||
                'Enter your new password below. Make sure it is strong and secure.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm token={token} />
          </CardContent>
        </Card>

        {/* Security Tips */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>
            {t('resetPassword.securityTip1') ||
              'Use a unique password that you have not used before'}
          </p>
          <p>
            {t('resetPassword.securityTip2') ||
              'We recommend using a password manager to generate and store secure passwords'}
          </p>
        </div>
      </div>
    </div>
    </FeatureGate>
  );
}

export default function ResetPasswordPage() {
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
      <ResetPasswordContent />
    </Suspense>
  );
}
