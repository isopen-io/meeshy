'use client';

import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { RegisterFormWizard } from '@/components/auth/register-form-wizard';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';

function SignupPageContent() {
  const { t } = useI18n('auth');

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
        className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-violet-400/30 to-purple-500/30 dark:from-violet-600/20 dark:to-purple-700/20 rounded-full blur-3xl"
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
        className="absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-pink-400/30 to-rose-500/30 dark:from-pink-600/20 dark:to-rose-700/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          x: [0, -30, 0],
          y: [0, 20, 0],
        }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
        className="absolute bottom-1/4 -left-20 w-72 h-72 bg-gradient-to-br from-amber-400/30 to-orange-500/30 dark:from-amber-600/20 dark:to-orange-700/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          x: [0, 15, 0],
          y: [0, -15, 0],
        }}
        transition={{
          duration: 11,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1.5,
        }}
        className="absolute top-1/4 left-1/2 w-64 h-64 bg-gradient-to-br from-emerald-400/30 to-teal-500/30 dark:from-emerald-600/20 dark:to-teal-700/20 rounded-full blur-3xl"
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
          <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-4 sm:p-6">
            <RegisterFormWizard />
          </div>
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 text-center text-sm text-muted-foreground"
        >
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
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
        className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full"
      />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SignupPageContent />
    </Suspense>
  );
}
