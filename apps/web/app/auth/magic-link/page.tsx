'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { LargeLogo } from '@/components/branding';
import { magicLinkService } from '@/services/magic-link.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Sparkles, Mail, CheckCircle, ArrowLeft, Clock, RefreshCw, AlertTriangle, Shield } from 'lucide-react';
import { usePasswordResetStore } from '@/stores/password-reset-store';

// Constants
const MAGIC_LINK_EXPIRY_SECONDS = 60; // 1 minute
const MAX_RETRY_ATTEMPTS = 3;
const STORAGE_KEY_RETRY_COUNT = 'magic_link_retry_count';
const STORAGE_KEY_RETRY_EMAIL = 'magic_link_retry_email';
const STORAGE_KEY_BLOCKED_UNTIL = 'magic_link_blocked_until';
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes block

function MagicLinkPageContent() {
  const { t } = useI18n('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const token = searchParams.get('token');

  // Get stored email from password reset store (set when coming from recovery modal)
  const { email: storedEmail } = usePasswordResetStore();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  // Token validation state
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenValidated, setTokenValidated] = useState(false);

  // Countdown and retry state
  const [countdown, setCountdown] = useState(MAGIC_LINK_EXPIRY_SECONDS);
  const [retryCount, setRetryCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Pre-fill email from store or sessionStorage on mount
  useEffect(() => {
    // Priority: 1. Store email (from recovery modal), 2. SessionStorage (from previous attempt)
    const savedEmail = storedEmail || sessionStorage.getItem(STORAGE_KEY_RETRY_EMAIL);
    if (savedEmail && !email) {
      setEmail(savedEmail);
    }
  }, [storedEmail]);

  // Validate token on mount if present
  useEffect(() => {
    if (token && !isValidatingToken && !tokenValidated && !tokenError) {
      validateToken(token);
    }
  }, [token]);

  const validateToken = async (magicToken: string) => {
    setIsValidatingToken(true);
    setTokenError(null);

    try {
      const result = await magicLinkService.validateMagicLink(magicToken);

      if (result.success && result.data) {
        setTokenValidated(true);

        // Check if 2FA is required
        if (result.data.requires2FA && result.data.twoFactorToken) {
          toast.success(t('magicLink.validate.success.title') || 'Lien validé !');
          router.push(`/auth/verify-2fa?token=${result.data.twoFactorToken}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`);
        } else {
          // Successfully authenticated
          toast.success(t('magicLink.validate.success.title') || 'Connexion réussie !');
          // Use window.location.href to force a full page reload
          // This ensures the auth state is properly loaded before rendering
          window.location.href = returnUrl || '/';
        }
      } else {
        setTokenError(result.error || t('magicLink.validate.error.description') || 'Lien invalide ou expiré');
      }
    } catch (err) {
      console.error('[MagicLink] Token validation error:', err);
      setTokenError(t('magicLink.errors.requestFailed') || 'Erreur de connexion');
    } finally {
      setIsValidatingToken(false);
    }
  };

  // Check if magic link is blocked on mount
  useEffect(() => {
    const blockedUntilStr = sessionStorage.getItem(STORAGE_KEY_BLOCKED_UNTIL);
    if (blockedUntilStr) {
      const blockedDate = new Date(blockedUntilStr);
      if (blockedDate > new Date()) {
        setIsBlocked(true);
        setBlockedUntil(blockedDate);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_BLOCKED_UNTIL);
        sessionStorage.removeItem(STORAGE_KEY_RETRY_COUNT);
        sessionStorage.removeItem(STORAGE_KEY_RETRY_EMAIL);
      }
    }

    const storedEmail = sessionStorage.getItem(STORAGE_KEY_RETRY_EMAIL);
    const storedCount = sessionStorage.getItem(STORAGE_KEY_RETRY_COUNT);
    if (storedEmail && storedCount) {
      setRetryCount(parseInt(storedCount, 10));
    }
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!isEmailSent || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isEmailSent, countdown]);

  const formatCountdown = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError(t('magicLink.errors.emailRequired'));
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError(t('magicLink.errors.invalidEmail'));
      return;
    }

    if (isBlocked) return;

    setIsLoading(true);

    try {
      const response = await magicLinkService.requestMagicLink(trimmedEmail, rememberDevice);
      sessionStorage.setItem(STORAGE_KEY_RETRY_EMAIL, trimmedEmail);

      if (response.success) {
        setIsEmailSent(true);
        setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
        toast.success(t('magicLink.success.emailSent'));
      } else {
        setIsEmailSent(true);
        setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
        toast.success(t('magicLink.success.emailSent'));
      }
    } catch (error) {
      console.error('[MagicLink] Erreur:', error);
      setIsEmailSent(true);
      setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    const currentRetryCount = retryCount + 1;

    if (currentRetryCount >= MAX_RETRY_ATTEMPTS) {
      const blockedUntilDate = new Date(Date.now() + BLOCK_DURATION_MS);
      sessionStorage.setItem(STORAGE_KEY_BLOCKED_UNTIL, blockedUntilDate.toISOString());
      sessionStorage.setItem(STORAGE_KEY_RETRY_COUNT, currentRetryCount.toString());
      setIsBlocked(true);
      setBlockedUntil(blockedUntilDate);
      setRetryCount(currentRetryCount);
      toast.error(t('magicLink.checkEmail.maxRetriesReached'));
      return;
    }

    setIsResending(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      await magicLinkService.requestMagicLink(trimmedEmail, rememberDevice);

      setRetryCount(currentRetryCount);
      sessionStorage.setItem(STORAGE_KEY_RETRY_COUNT, currentRetryCount.toString());
      setCountdown(MAGIC_LINK_EXPIRY_SECONDS);
      toast.success(t('magicLink.checkEmail.resent'));
    } catch (error) {
      console.error('[MagicLink] Erreur de renvoi:', error);
      toast.error(t('magicLink.errors.requestFailed'));
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = () => {
    router.push('/login' + (returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''));
  };

  // Vue: Validation du token en cours
  if (token && (isValidatingToken || tokenValidated)) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

        {/* Animated decorative blobs - purple tones */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400/30 to-violet-500/30 dark:from-purple-600/20 dark:to-violet-700/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-indigo-400/30 to-purple-500/30 dark:from-indigo-600/20 dark:to-purple-700/20 rounded-full blur-3xl"
        />

        {/* Main content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <LargeLogo href="/" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-md"
          >
            <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    >
                      <Sparkles className="h-8 w-8 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                    </motion.div>
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {t('magicLink.validate.validating.title') || 'Vérification du lien magique'}
                </h2>

                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {t('magicLink.validate.validating.description') || 'Veuillez patienter pendant la vérification...'}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Vue: Erreur de validation du token
  if (token && tokenError) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

        {/* Animated decorative blobs - red tones for error */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-red-400/30 to-rose-500/30 dark:from-red-600/20 dark:to-rose-700/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-orange-400/30 to-red-500/30 dark:from-orange-600/20 dark:to-red-700/20 rounded-full blur-3xl"
        />

        {/* Main content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <LargeLogo href="/" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-md"
          >
            <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {t('magicLink.validate.error.title') || 'Lien invalide ou expiré'}
                </h2>

                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {tokenError}
                </p>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('magicLink.validate.error.hint') || 'Les liens magiques expirent après quelques minutes pour des raisons de sécurité.'}
                  </p>
                </div>

                <div className="space-y-3">
                  <Button className="w-full" onClick={() => router.push('/auth/magic-link')}>
                    <Sparkles className="h-4 w-4" />
                    {t('magicLink.validate.requestNewLink') || 'Demander un nouveau lien'}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
                    <ArrowLeft className="h-4 w-4" />
                    {t('magicLink.validate.backToLogin') || 'Retour à la connexion'}
                  </Button>
                </div>
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
      </div>
    );
  }

  // Vue: Magic Link bloqué après trop de tentatives
  if (isBlocked) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

        {/* Animated decorative blobs - red tones for blocked */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-red-400/30 to-rose-500/30 dark:from-red-600/20 dark:to-rose-700/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-orange-400/30 to-red-500/30 dark:from-orange-600/20 dark:to-red-700/20 rounded-full blur-3xl"
        />

        {/* Main content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <LargeLogo href="/" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-md"
          >
            <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {t('magicLink.checkEmail.blocked.title') || 'Trop de tentatives'}
                </h2>

                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {t('magicLink.checkEmail.blocked.description') || 'Vous avez atteint le nombre maximum de tentatives.'}
                </p>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('magicLink.checkEmail.blocked.useAnotherMethod') || 'Utilisez une autre méthode de connexion.'}
                  </p>
                </div>

                <div className="space-y-3">
                  <Button className="w-full" onClick={handleBackToLogin}>
                    {t('magicLink.checkEmail.blocked.loginWithPassword') || 'Se connecter avec mot de passe'}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
                    <ArrowLeft className="h-4 w-4" />
                    {t('featureGate.backToHome') || 'Retour à l\'accueil'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Vue après envoi de l'email
  if (isEmailSent) {
    const isExpired = countdown <= 0;
    const remainingRetries = MAX_RETRY_ATTEMPTS - retryCount;

    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

        {/* Animated decorative blobs - green tones for success */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-emerald-400/30 to-teal-500/30 dark:from-emerald-600/20 dark:to-teal-700/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-emerald-500/30 dark:from-cyan-600/20 dark:to-emerald-700/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.3, 1], x: [0, 20, 0], y: [0, -30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-green-400/30 to-emerald-500/30 dark:from-green-600/20 dark:to-emerald-700/20 rounded-full blur-3xl"
        />

        {/* Main content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <LargeLogo href="/" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-md"
          >
            <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {t('magicLink.checkEmail.title') || 'Vérifiez votre email'}
                </h2>

                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                  {t('magicLink.checkEmail.description') || 'Un lien magique a été envoyé à votre adresse email.'}
                </p>

                <div className="backdrop-blur-sm bg-white/30 dark:bg-gray-800/30 rounded-lg p-4 mb-6 border border-white/20 dark:border-gray-700/30">
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">
                    {t('magicLink.checkEmail.emailSentTo') || 'Email envoyé à'}
                  </p>
                  <p className="text-purple-600 dark:text-purple-400 font-medium">{email}</p>
                </div>

                {/* Instructions */}
                <div className="text-left space-y-3 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400">1</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('magicLink.checkEmail.step1') || 'Ouvrez votre boîte de réception'}
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400">2</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('magicLink.checkEmail.step2') || 'Cliquez sur le lien dans l\'email'}
                    </p>
                  </div>
                </div>

                {/* Countdown Timer */}
                <div className={`flex items-center justify-center gap-2 text-sm mb-4 ${
                  isExpired ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                }`}>
                  <Clock className="h-4 w-4" />
                  {isExpired ? (
                    <span>{t('magicLink.checkEmail.linkExpired') || 'Le lien a expiré'}</span>
                  ) : (
                    <span>
                      {t('magicLink.checkEmail.expiresIn', { time: formatCountdown(countdown) }) || `Expire dans ${formatCountdown(countdown)}`}
                    </span>
                  )}
                </div>

                {/* Resend Button */}
                {isExpired && remainingRetries > 0 && (
                  <div className="mb-4">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={handleResend}
                      disabled={isResending}
                    >
                      {isResending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                          <span>{t('magicLink.checkEmail.resending') || 'Renvoi en cours...'}</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          {t('magicLink.checkEmail.resendButton') || 'Renvoyer le lien'}
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {t('magicLink.checkEmail.retriesRemaining', { count: remainingRetries }) || `${remainingRetries} essais restants`}
                    </p>
                  </div>
                )}

                {/* Spam warning */}
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                  {t('magicLink.checkEmail.spamWarning') || 'Vérifiez vos spams si vous ne trouvez pas l\'email.'}
                </p>
              </div>

              <Button variant="outline" className="w-full" onClick={handleBackToLogin}>
                <ArrowLeft className="h-4 w-4" />
                {t('magicLink.checkEmail.backToLogin') || 'Retour à la connexion'}
              </Button>
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
      </div>
    );
  }

  // Vue de demande de Magic Link
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

      {/* Animated decorative blobs - purple tones */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400/30 to-violet-500/30 dark:from-purple-600/20 dark:to-violet-700/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ scale: [1, 1.1, 1], x: [0, -20, 0], y: [0, 30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-indigo-400/30 to-purple-500/30 dark:from-indigo-600/20 dark:to-purple-700/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ scale: [1, 1.3, 1], x: [0, 20, 0], y: [0, -30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-fuchsia-400/30 to-purple-500/30 dark:from-fuchsia-600/20 dark:to-purple-700/20 rounded-full blur-3xl"
      />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <LargeLogo href="/" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                  <Sparkles className="h-7 w-7 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('magicLink.title') || 'Connexion magique'}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {t('magicLink.description') || 'Recevez un lien de connexion par email'}
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700 dark:text-gray-300">
                  {t('magicLink.emailLabel') || 'Adresse email'}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('magicLink.emailPlaceholder') || 'vous@exemple.com'}
                    disabled={isLoading}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('magicLink.emailHelp') || 'Utilisez l\'email associé à votre compte'}
                </p>
              </div>

              {/* Remember device checkbox */}
              <div className="flex items-center space-x-2 py-1">
                <Checkbox
                  id="remember-device"
                  checked={rememberDevice}
                  onCheckedChange={(checked) => setRememberDevice(checked === true)}
                  disabled={isLoading}
                />
                <Label
                  htmlFor="remember-device"
                  className="text-sm font-medium leading-none cursor-pointer flex items-center gap-1.5 text-gray-700 dark:text-gray-300"
                >
                  <Shield className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  {t('login.rememberDevice') || 'Se souvenir de cet appareil'}
                </Label>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    <span>{t('magicLink.sending') || 'Envoi en cours...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t('magicLink.submitButton') || 'Envoyer le lien magique'}
                  </>
                )}
              </Button>
            </form>

            {/* Back to login */}
            <div className="mt-6 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <Button variant="ghost" onClick={handleBackToLogin} className="w-full">
                <ArrowLeft className="h-4 w-4" />
                {t('magicLink.backToLogin') || 'Retour à la connexion'}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Security note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 max-w-md"
        >
          {t('magicLink.securityNote') || 'Le lien de connexion expire après quelques minutes pour votre sécurité.'}
        </motion.p>

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
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full"
      />
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MagicLinkPageContent />
    </Suspense>
  );
}
