/**
 * Feature Gate Component
 *
 * Protects routes/components that should only be accessible when a feature is enabled
 * Redirects to home page if feature is disabled
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';

interface FeatureGateProps {
  feature: 'passwordReset'; // Add more features as needed
  children: React.ReactNode;
  redirectTo?: string;
  showMessage?: boolean;
}

/**
 * Feature Gate Component
 *
 * Usage:
 * <FeatureGate feature="passwordReset">
 *   <ForgotPasswordForm />
 * </FeatureGate>
 *
 * If feature is disabled:
 * - Option 1 (default): Redirects to home page automatically
 * - Option 2 (showMessage=true): Shows a message explaining feature is disabled
 */
export function FeatureGate({
  feature,
  children,
  redirectTo = '/',
  showMessage = false
}: FeatureGateProps) {
  const router = useRouter();
  const { isPasswordResetConfigured } = useFeatureFlags();
  const { t } = useI18n('common');

  // Check if feature is enabled
  const isEnabled = feature === 'passwordReset' ? isPasswordResetConfigured() : false;

  useEffect(() => {
    // If feature is disabled and we should redirect (not show message)
    if (!isEnabled && !showMessage) {
      console.warn(`[FeatureGate] Feature "${feature}" is disabled. Redirecting to ${redirectTo}`);
      router.push(redirectTo);
    }
  }, [isEnabled, showMessage, feature, redirectTo, router]);

  // If feature is disabled
  if (!isEnabled) {
    if (showMessage) {
      // Show user-friendly message
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="mx-auto w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <CardTitle className="text-2xl">
                {t('featureGate.title') || 'Feature Temporarily Unavailable'}
              </CardTitle>
              <CardDescription className="text-base">
                {feature === 'passwordReset' && (
                  t('featureGate.passwordResetDisabled') ||
                  'Password reset is temporarily unavailable. Please contact support if you need assistance accessing your account.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium">
                  {t('featureGate.alternativeOptions') || 'Alternative Options:'}
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>{t('featureGate.contactSupport') || 'Contact our support team'}</li>
                  <li>{t('featureGate.tryAgainLater') || 'Try again later'}</li>
                  <li>{t('featureGate.checkAnnouncements') || 'Check our announcements for updates'}</li>
                </ul>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  onClick={() => router.push('/')}
                  className="w-full"
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('featureGate.backToHome') || 'Back to Home'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Show loading state while redirecting
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {t('common.redirecting') || 'Redirecting...'}
          </p>
        </div>
      </div>
    );
  }

  // Feature is enabled, render children
  return <>{children}</>;
}
