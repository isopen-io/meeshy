'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';
import { usePasswordResetStore } from '@/stores/password-reset-store';
import { passwordResetService } from '@/services/password-reset.service';
import { Mail, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Clock, Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { PhoneResetFlow } from '@/components/auth/PhoneResetFlow';

function CheckEmailContent() {
  const router = useRouter();
  const { t } = useI18n('auth');

  const { email, resetRequested } = usePasswordResetStore();

  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [showPhoneReset, setShowPhoneReset] = useState(false);

  // Redirect if no reset was requested
  useEffect(() => {
    if (!resetRequested || !email) {
      toast.error(t('checkEmail.errors.noRequest') || 'No password reset request found');
      router.push('/forgot-password');
    }
  }, [resetRequested, email, router, t]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Initialize hCaptcha for resend
  useEffect(() => {
    if (!showCaptcha || typeof window === 'undefined') return;

    // Load hCaptcha script if not already loaded
    if (!window.hcaptcha) {
      const script = document.createElement('script');
      script.src = 'https://js.hcaptcha.com/1/api.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);

      script.onload = () => {
        renderCaptcha();
      };

      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    } else {
      renderCaptcha();
    }
  }, [showCaptcha]);

  const renderCaptcha = () => {
    const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
    if (!siteKey || !window.hcaptcha) return;

    try {
      window.hcaptcha.render('resend-hcaptcha-container', {
        sitekey: siteKey,
        callback: (token: string) => {
          setCaptchaToken(token);
        },
        'error-callback': () => {
          toast.error(t('checkEmail.errors.captchaFailed') || 'CAPTCHA verification failed');
        },
        'expired-callback': () => {
          setCaptchaToken('');
        },
      });
    } catch (error) {
      console.error('[CheckEmailPage] Error rendering CAPTCHA:', error);
    }
  };

  const handleResendEmail = async () => {
    if (!email) {
      toast.error(t('checkEmail.errors.noEmail') || 'Email address not found');
      return;
    }

    if (resendCooldown > 0) {
      toast.warning(
        t('checkEmail.errors.cooldown') ||
          `Please wait ${resendCooldown} seconds before resending`
      );
      return;
    }

    // Show CAPTCHA if not already shown
    if (!showCaptcha) {
      setShowCaptcha(true);
      return;
    }

    if (!captchaToken) {
      toast.error(t('checkEmail.errors.captchaRequired') || 'Please complete the CAPTCHA');
      return;
    }

    setIsResending(true);

    try {
      const response = await passwordResetService.requestReset({
        email,
        captchaToken,
      });

      if (response.success) {
        toast.success(t('checkEmail.success.resent') || 'Password reset email sent again');
        setResendCooldown(60); // 60 second cooldown
        setShowCaptcha(false);
        setCaptchaToken('');
      }
    } catch (error) {
      console.error('[CheckEmailPage] Error resending email:', error);
      toast.error(
        t('checkEmail.errors.resendFailed') || 'Failed to resend email. Please try again.'
      );
    } finally {
      setIsResending(false);
    }
  };

  if (!resetRequested || !email) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <LargeLogo href="/" />
        </div>

        {/* Content - Phone Reset OR Email Check */}
        {showPhoneReset ? (
          /* Phone Reset Flow - replaces entire card */
          <PhoneResetFlow onClose={() => setShowPhoneReset(false)} />
        ) : (
          /* Email Check Card */
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <CardTitle className="text-2xl">
                {t('checkEmail.title') || 'Check Your Email'}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {t('checkEmail.description') ||
                  'We have sent a password reset link to your email address'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Email Address Display */}
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="ml-2">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {t('checkEmail.emailSentTo') || 'Email sent to'}:{' '}
                    <span className="font-semibold">{email}</span>
                  </p>
                </AlertDescription>
              </Alert>

              {/* Instructions */}
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span>{t('checkEmail.step1') || 'Check your inbox for an email from Meeshy'}</span>
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span>
                    {t('checkEmail.step2') || 'Click the password reset link in the email'}
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span>{t('checkEmail.step3') || 'Create a new secure password'}</span>
                </p>
                <p className="flex items-start gap-2">
                  <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                  <span>
                    {t('checkEmail.expiry') ||
                      'The reset link will expire in 15 minutes for security'}
                  </span>
                </p>
              </div>

              {/* Spam Warning */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-sm">
                  {t('checkEmail.spamWarning') ||
                    "Can't find the email? Check your spam or junk folder"}
                </AlertDescription>
              </Alert>

              {/* Back to Login | Resend Email */}
              {showCaptcha ? (
                <div className="space-y-4">
                  <div id="resend-hcaptcha-container" className="flex justify-center" />
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowCaptcha(false)}
                      className="flex-1"
                    >
                      {t('checkEmail.cancel') || 'Annuler'}
                    </Button>
                    <Button
                      onClick={handleResendEmail}
                      disabled={isResending || !captchaToken}
                      className="flex-1"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('checkEmail.resending') || 'Sending...'}
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          {t('checkEmail.confirmResend') || 'Send Email'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => router.push('/login')}
                    className="flex-1"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t('checkEmail.backToLogin') || 'Back to Login'}
                  </Button>
                  <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
                  <Button
                    variant="outline"
                    onClick={handleResendEmail}
                    disabled={isResending || resendCooldown > 0}
                    className="flex-1"
                  >
                    {resendCooldown > 0 ? (
                      <>
                        <Clock className="mr-2 h-4 w-4" />
                        {t('checkEmail.resendWait') || `Resend in ${resendCooldown}s`}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('checkEmail.resendButton') || 'Resend Email'}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Phone Reset Option */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-gray-800 px-2 text-gray-500">
                    {t('checkEmail.orUse') || 'ou utilisez'}
                  </span>
                </div>
              </div>

              <Button
                variant="secondary"
                onClick={() => setShowPhoneReset(true)}
                className="w-full"
              >
                <Phone className="mr-2 h-4 w-4" />
                {t('checkEmail.resetByPhone') || 'Réinitialiser par téléphone'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Support Link */}
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            {t('checkEmail.needHelp') || 'Need help?'}{' '}
            <a
              href="/contact"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline"
            >
              {t('checkEmail.contactSupport') || 'Contact Support'}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
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
      <CheckEmailContent />
    </Suspense>
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
