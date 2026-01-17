'use client';

import { Suspense, useState } from 'react';
import { motion } from 'framer-motion';
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
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

        {/* CSS-animated decorative blobs - GPU optimized */}
        <div
          className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-amber-400/30 to-orange-500/30 dark:from-amber-600/20 dark:to-orange-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-1"
        />
        <div
          className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-rose-400/30 to-pink-500/30 dark:from-rose-600/20 dark:to-pink-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-2"
        />
        <div
          className="hidden sm:block absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-yellow-400/30 to-amber-500/30 dark:from-yellow-600/20 dark:to-amber-700/20 rounded-full blur-3xl will-change-transform animate-blob-3"
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

          {/* Tab buttons - reduced blur on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full max-w-md mb-4"
          >
            <div className="flex backdrop-blur-sm sm:backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 sm:bg-white/50 sm:dark:bg-gray-900/50 rounded-xl p-1 border border-white/20 dark:border-gray-700/30">
              <button
                onClick={() => setActiveMethod('email')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                  activeMethod === 'email'
                    ? "bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                <span>{t('forgotPassword.tabEmail') || 'Par email'}</span>
              </button>
              <button
                onClick={() => setActiveMethod('phone')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                  activeMethod === 'phone'
                    ? "bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                <span>{t('forgotPassword.tabPhone') || 'Par téléphone'}</span>
              </button>
            </div>
          </motion.div>

          {/* Form card with glass effect - reduced blur on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-md"
          >
            {activeMethod === 'email' ? (
              <div className="backdrop-blur-md sm:backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 sm:bg-white/60 sm:dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                      <KeyRound className="h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    </div>
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t('forgotPassword.title') || 'Mot de passe oublié'}
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    {t('forgotPassword.description') || 'Entrez votre email pour recevoir un lien de réinitialisation'}
                  </p>
                </div>

                <ForgotPasswordForm />

                {/* Security Note */}
                <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>{t('forgotPassword.securityNote') || 'Le lien expirera dans 15 minutes.'}</p>
                </div>
              </div>
            ) : (
              <div className="backdrop-blur-md sm:backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 sm:bg-white/60 sm:dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
                <PhoneResetFlow onClose={() => setActiveMethod('email')} />
              </div>
            )}
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
                {t('register.termsOfService') || 'Conditions'}
              </a>
              <span className="hidden sm:inline">•</span>
              <a href="/privacy" className="hover:text-foreground transition-colors">
                {t('register.privacyPolicy') || 'Confidentialité'}
              </a>
              <span className="hidden sm:inline">•</span>
              <a href="/contact" className="hover:text-foreground transition-colors">
                {t('register.contactUs') || 'Contact'}
              </a>
            </div>
          </motion.div>
        </div>

        {/* CSS Keyframes for GPU-optimized blob animations */}
        <style jsx>{`
          @keyframes blob-float-1 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(30px, -20px) scale(1.1); }
          }
          @keyframes blob-float-2 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-20px, 30px) scale(1.05); }
          }
          @keyframes blob-float-3 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(20px, -30px) scale(1.15); }
          }
          .animate-blob-1 { animation: blob-float-1 12s ease-in-out infinite; }
          .animate-blob-2 { animation: blob-float-2 14s ease-in-out infinite; animation-delay: -2s; }
          .animate-blob-3 { animation: blob-float-3 16s ease-in-out infinite; animation-delay: -4s; }
          @media (max-width: 640px) {
            .animate-blob-1, .animate-blob-2 { animation-duration: 20s; }
          }
          @media (prefers-reduced-motion: reduce) {
            .animate-blob-1, .animate-blob-2, .animate-blob-3 { animation: none; }
          }
        `}</style>
      </div>
    </FeatureGate>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
