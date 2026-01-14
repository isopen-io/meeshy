'use client';

import { Suspense, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { PhoneResetFlow } from '@/components/auth/PhoneResetFlow';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';
import { KeyRound, Mail, Phone } from 'lucide-react';
import { FeatureGate } from '@/components/auth/FeatureGate';
import { cn } from '@/lib/utils';

type ResetMethod = 'email' | 'phone';

function ForgotPasswordContent() {
  const { t } = useI18n('auth');
  const [activeMethod, setActiveMethod] = useState<ResetMethod>('email');

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

        {/* Tab buttons */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveMethod('email')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200",
              activeMethod === 'email'
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            )}
          >
            <Mail className="h-4 w-4" />
            <span>{t('forgotPassword.tabEmail') || 'By email'}</span>
          </button>
          <button
            onClick={() => setActiveMethod('phone')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200",
              activeMethod === 'phone'
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            )}
          >
            <Phone className="h-4 w-4" />
            <span>{t('forgotPassword.tabPhone') || 'By phone'}</span>
          </button>
        </div>

        {/* Content based on active method */}
        {activeMethod === 'email' ? (
          <>
            {/* Forgot Password Card - Email */}
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
          </>
        ) : (
          /* Phone Reset Flow */
          <PhoneResetFlow onClose={() => setActiveMethod('email')} />
        )}
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
