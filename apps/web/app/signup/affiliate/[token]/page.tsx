'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Zap, Globe, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LargeLogo } from '@/components/branding';
import { useI18n } from '@/hooks/useI18n';
import { buildApiUrl } from '@/lib/config';

interface InviterInfo {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  username: string;
  avatar: string | null;
}

interface AffiliateSignupPageProps {
  params: Promise<{ token: string }>;
}

export default function AffiliateSignupPage({ params }: AffiliateSignupPageProps) {
  const router = useRouter();
  const { t } = useI18n('affiliate');
  const [isMounted, setIsMounted] = useState(false);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);

  useEffect(() => {
    setIsMounted(true);

    params.then(({ token }) => {
      if (token) {
        localStorage.setItem('meeshy_affiliate_token', token);
        document.cookie = `meeshy_affiliate_token=${token}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax`;

        // Fetch inviter details
        fetch(buildApiUrl(`/affiliate/validate/${token}`))
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const user = data?.data?.affiliateUser;
            if (user) {
              setInviter({
                firstName: user.firstName,
                lastName: user.lastName,
                displayName: user.displayName,
                username: user.username,
                avatar: user.avatar
              });
            }
          })
          .catch(() => {});
      }
    });
  }, [params]);

  // Get display name for inviter
  const getInviterDisplayName = () => {
    if (!inviter) return null;
    if (inviter.displayName) return inviter.displayName;
    if (inviter.firstName) return `${inviter.firstName} ${inviter.lastName || ''}`.trim();
    return inviter.username;
  };

  // Get initials for avatar fallback
  const getInitials = () => {
    if (!inviter) return '';
    if (inviter.firstName) {
      return `${inviter.firstName[0]}${inviter.lastName?.[0] || ''}`.toUpperCase();
    }
    return inviter.username.substring(0, 2).toUpperCase();
  };

  const features = [
    { icon: Zap, label: t('landing.feature1') },
    { icon: Globe, label: t('landing.feature2') },
    { icon: Sparkles, label: t('landing.feature3') },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

      {/* Animated blobs */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-violet-400/30 to-purple-500/30 dark:from-violet-600/20 dark:to-purple-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-1" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-blue-500/30 dark:from-cyan-600/20 dark:to-blue-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-2" />
      <div className="absolute -bottom-20 left-1/3 w-80 h-80 bg-gradient-to-br from-pink-400/30 to-rose-500/30 dark:from-pink-600/20 dark:to-rose-700/20 rounded-full blur-2xl md:blur-3xl will-change-transform animate-blob-3" />
      <div className="hidden sm:block absolute bottom-1/4 -left-20 w-72 h-72 bg-gradient-to-br from-amber-400/30 to-orange-500/30 dark:from-amber-600/20 dark:to-orange-700/20 rounded-full blur-3xl will-change-transform animate-blob-4" />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6">
        {/* Logo */}
        <motion.div
          initial={isMounted ? { opacity: 0, y: -20 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <LargeLogo href="/" />
        </motion.div>

        {/* Hero card */}
        <motion.div
          initial={isMounted ? { opacity: 0, y: 20, scale: 0.95 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: isMounted ? 0.15 : 0 }}
          className="w-full max-w-lg"
        >
          <div className="backdrop-blur-md sm:backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 sm:bg-white/60 sm:dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 sm:p-10 text-center">
            {/* Inviter badge with avatar */}
            {inviter && (
              <motion.div
                initial={isMounted ? { opacity: 0, scale: 0.9 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: isMounted ? 0.3 : 0 }}
                className="flex flex-col items-center gap-3 mb-6"
              >
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="h-16 w-16 ring-4 ring-violet-200 dark:ring-violet-800">
                    <AvatarImage src={inviter.avatar || undefined} alt={getInviterDisplayName() || ''} />
                    <AvatarFallback className="bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-lg font-semibold">
                      {getInitials() || <User className="h-6 w-6" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                </div>

                {/* Invitation text */}
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('landing.invitedBy', 'Invité(e) par')}
                  </p>
                  <p className="font-semibold text-violet-700 dark:text-violet-300">
                    {getInviterDisplayName()}
                  </p>
                  {inviter.username && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      @{inviter.username}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Headline */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
              {t('landing.headline')}
            </h1>

            {/* Subheadline */}
            <p className="mt-3 text-base sm:text-lg text-gray-500 dark:text-gray-400">
              {t('landing.subheadline')}
            </p>

            {/* Feature pills */}
            <motion.div
              initial={isMounted ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: isMounted ? 0.35 : 0 }}
              className="flex flex-wrap justify-center gap-3 mt-6"
            >
              {features.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
              ))}
            </motion.div>

            {/* CTA buttons */}
            <motion.div
              initial={isMounted ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: isMounted ? 0.45 : 0 }}
              className="mt-8 flex flex-col gap-3"
            >
              <Button
                size="lg"
                className="w-full text-base font-semibold h-12"
                onClick={() => router.push('/signup')}
              >
                {t('landing.cta')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => router.push('/login')}
              >
                {t('landing.ctaLogin')}
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={isMounted ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: isMounted ? 0.6 : 0 }}
          className="mt-8 text-center text-sm text-muted-foreground"
        >
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <a href="/terms" className="hover:text-foreground transition-colors">
              {t('landing.terms')}
            </a>
            <span className="hidden sm:inline">·</span>
            <a href="/privacy" className="hover:text-foreground transition-colors">
              {t('landing.privacy')}
            </a>
          </div>
        </motion.div>
      </div>

      {/* Blob keyframes */}
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
        @keyframes blob-float-4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 20px) scale(1.08); }
        }
        .animate-blob-1 { animation: blob-float-1 12s ease-in-out infinite; }
        .animate-blob-2 { animation: blob-float-2 14s ease-in-out infinite; animation-delay: -2s; }
        .animate-blob-3 { animation: blob-float-3 16s ease-in-out infinite; animation-delay: -4s; }
        .animate-blob-4 { animation: blob-float-4 13s ease-in-out infinite; animation-delay: -1s; }
        @media (max-width: 640px) {
          .animate-blob-1, .animate-blob-2, .animate-blob-3 { animation-duration: 20s; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-blob-1, .animate-blob-2, .animate-blob-3, .animate-blob-4 { animation: none; }
        }
      `}</style>
    </div>
  );
}
