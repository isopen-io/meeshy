'use client';

import { Suspense, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RegisterFormWizard } from '@/components/auth/register-form-wizard';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';

function SignupPageContent() {
  const { t } = useI18n('auth');
  const [isMounted, setIsMounted] = useState(false);

  // Ensure animations only run after hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

      {/* CSS-animated decorative blobs - GPU optimized */}
      {/* Blob 1 - Violet (visible on all devices) */}
      <div
        className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-violet-400/30 to-purple-500/30 dark:from-violet-600/20 dark:to-purple-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-1"
      />
      {/* Blob 2 - Cyan (visible on all devices) */}
      <div
        className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-blue-500/30 dark:from-cyan-600/20 dark:to-blue-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-2"
      />
      {/* Blob 3 - Pink (visible on all devices) */}
      <div
        className="absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-pink-400/30 to-rose-500/30 dark:from-pink-600/20 dark:to-rose-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-3"
      />
      {/* Blob 4 - Amber (hidden on mobile for performance) */}
      <div
        className="hidden sm:block absolute bottom-1/4 -left-20 w-72 h-72 bg-gradient-to-br from-amber-400/30 to-orange-500/30 dark:from-amber-600/20 dark:to-orange-700/20 rounded-full blur-3xl will-change-transform animate-blob-4"
      />
      {/* Blob 5 - Emerald (hidden on mobile for performance) */}
      <div
        className="hidden sm:block absolute top-1/4 left-1/2 w-64 h-64 bg-gradient-to-br from-emerald-400/30 to-teal-500/30 dark:from-emerald-600/20 dark:to-teal-700/20 rounded-full blur-3xl will-change-transform animate-blob-5"
      />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        {/* Logo */}
        <motion.div
          initial={isMounted ? { opacity: 0, y: -20 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <LargeLogo href="/" />
        </motion.div>

        {/* Form card with glass effect - reduced blur on mobile */}
        <motion.div
          initial={isMounted ? { opacity: 0, y: 20, scale: 0.95 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: isMounted ? 0.2 : 0 }}
          className="w-full max-w-md"
        >
          <div className="backdrop-blur-md sm:backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 sm:bg-white/60 sm:dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-4 sm:p-6">
            <RegisterFormWizard />
          </div>
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={isMounted ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: isMounted ? 0.4 : 0 }}
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

      {/* CSS Keyframes for GPU-optimized blob animations */}
      <style jsx>{`
        @keyframes blob-float-1 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(30px, -20px) scale(1.1);
          }
        }
        @keyframes blob-float-2 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-20px, 30px) scale(1.05);
          }
        }
        @keyframes blob-float-3 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(20px, -30px) scale(1.15);
          }
        }
        @keyframes blob-float-4 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-30px, 20px) scale(1.08);
          }
        }
        @keyframes blob-float-5 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(15px, -15px) scale(1.12);
          }
        }
        .animate-blob-1 {
          animation: blob-float-1 12s ease-in-out infinite;
        }
        .animate-blob-2 {
          animation: blob-float-2 14s ease-in-out infinite;
          animation-delay: -2s;
        }
        .animate-blob-3 {
          animation: blob-float-3 16s ease-in-out infinite;
          animation-delay: -4s;
        }
        .animate-blob-4 {
          animation: blob-float-4 13s ease-in-out infinite;
          animation-delay: -1s;
        }
        .animate-blob-5 {
          animation: blob-float-5 15s ease-in-out infinite;
          animation-delay: -3s;
        }

        /* Reduce animation intensity on mobile and respect user preferences */
        @media (max-width: 640px) {
          .animate-blob-1,
          .animate-blob-2,
          .animate-blob-3 {
            animation-duration: 20s;
          }
        }

        /* Respect reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .animate-blob-1,
          .animate-blob-2,
          .animate-blob-3,
          .animate-blob-4,
          .animate-blob-5 {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
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
