'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { LoginForm } from '@/components/auth/login-form';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/use-auth';
import { authManager } from '@/services/auth-manager.service';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

function LoginPageContent() {
  const { t } = useI18n('auth');
  const { isAuthenticated, isChecking } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  // Redirect if already authenticated
  useEffect(() => {
    if (!isChecking && isAuthenticated) {
      const anonymousSession = authManager.getAnonymousSession();
      if (anonymousSession) {
        const shareLinkId = localStorage.getItem('anonymous_current_share_link') ||
                           localStorage.getItem('anonymous_current_link_id');
        if (shareLinkId) {
          router.replace(`/chat/${shareLinkId}`);
          return;
        }
      }
      router.replace(returnUrl || '/dashboard');
    }
  }, [isAuthenticated, isChecking, returnUrl, router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400">{t('login.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

      {/* Animated decorative blobs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 30, 0],
          y: [0, -20, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-blue-400/30 to-indigo-500/30 dark:from-blue-600/20 dark:to-indigo-700/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          x: [0, -20, 0],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-blue-500/30 dark:from-cyan-600/20 dark:to-blue-700/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          x: [0, 20, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-purple-400/30 to-violet-500/30 dark:from-purple-600/20 dark:to-violet-700/20 rounded-full blur-3xl"
      />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <LargeLogo href="/" />
        </motion.div>

        {/* Form card with glass effect */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('login.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {t('login.formDescription')}
              </p>
            </div>

            {/* Login Form */}
            <LoginForm />

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white/70 dark:bg-gray-900/70 text-gray-500 dark:text-gray-400">
                  {t('login.orContinueWith')}
                </span>
              </div>
            </div>

            {/* Magic Link Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/auth/magic-link' + (returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''))}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {t('login.magicLinkButton')}
            </Button>
          </div>
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 text-center space-y-3"
        >
          {/* Forgot password link - more visible */}
          <div>
            <a
              href="/forgot-password"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
            >
              {t('login.forgotPassword')}
            </a>
          </div>

          {/* Other links */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <a href="/terms" className="hover:text-foreground transition-colors">
              {t('register.termsOfService')}
            </a>
            <span className="hidden sm:inline">•</span>
            <a href="/privacy" className="hover:text-foreground transition-colors">
              {t('register.privacyPolicy')}
            </a>
            <span className="hidden sm:inline">•</span>
            <a href="/contact" className="hover:text-foreground transition-colors">
              {t('register.contactUs')}
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full"
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
