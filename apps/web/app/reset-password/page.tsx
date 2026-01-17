'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { FeatureGate } from '@/components/auth/FeatureGate';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n('auth');
  const token = searchParams.get('token');

  // Show error if no token in URL
  if (!token) {
    return (
      <FeatureGate feature="passwordReset" showMessage={true}>
        <div className="min-h-screen relative overflow-hidden">
          {/* Animated gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

          {/* CSS-animated decorative blobs - red tones for error */}
          <div
            className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-red-400/30 to-rose-500/30 dark:from-red-600/20 dark:to-rose-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-1"
          />
          <div
            className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-orange-400/30 to-red-500/30 dark:from-orange-600/20 dark:to-red-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-2"
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

            {/* Error card */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="w-full max-w-md"
            >
              <div className="backdrop-blur-md sm:backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 sm:bg-white/60 sm:dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
                    </div>
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t('resetPassword.errors.invalidLink') || 'Lien invalide'}
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    {t('resetPassword.errors.invalidLinkDescription') || 'Le lien de réinitialisation est invalide ou manquant'}
                  </p>
                </div>

                {/* Error message */}
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {t('resetPassword.errors.noToken') || 'Aucun token trouvé dans l\'URL. Utilisez le lien de votre email.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    {t('resetPassword.errors.noTokenHelp') || 'Cliquez sur le lien dans l\'email ou demandez un nouveau lien.'}
                  </p>
                  <Button asChild className="w-full">
                    <Link href="/forgot-password">
                      {t('resetPassword.requestNewLink') || 'Demander un nouveau lien'}
                    </Link>
                  </Button>
                </div>
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
            .animate-blob-1 { animation: blob-float-1 12s ease-in-out infinite; }
            .animate-blob-2 { animation: blob-float-2 14s ease-in-out infinite; animation-delay: -2s; }
            @media (max-width: 640px) {
              .animate-blob-1, .animate-blob-2 { animation-duration: 20s; }
            }
            @media (prefers-reduced-motion: reduce) {
              .animate-blob-1, .animate-blob-2 { animation: none; }
            }
          `}</style>
        </div>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate feature="passwordReset" showMessage={true}>
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

        {/* CSS-animated decorative blobs - green tones for success/security */}
        <div
          className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-emerald-400/30 to-teal-500/30 dark:from-emerald-600/20 dark:to-teal-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-1"
        />
        <div
          className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-emerald-500/30 dark:from-cyan-600/20 dark:to-emerald-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-2"
        />
        <div
          className="hidden sm:block absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-green-400/30 to-emerald-500/30 dark:from-green-600/20 dark:to-emerald-700/20 rounded-full blur-3xl will-change-transform animate-blob-3"
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

          {/* Form card with glass effect - reduced blur on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-md"
          >
            <div className="backdrop-blur-md sm:backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 sm:bg-white/60 sm:dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                    <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {t('resetPassword.title') || 'Nouveau mot de passe'}
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  {t('resetPassword.description') || 'Choisissez un nouveau mot de passe sécurisé'}
                </p>
              </div>

              <ResetPasswordForm token={token} />

              {/* Security Tips */}
              <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>{t('resetPassword.securityTip1') || 'Utilisez un mot de passe unique'}</p>
                <p>{t('resetPassword.securityTip2') || 'Nous recommandons un gestionnaire de mots de passe'}</p>
              </div>
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
      <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
