'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';
import { LargeLogo } from '@/components/branding';
import { buildApiUrl } from '@/lib/config';
import { toast } from 'sonner';

// Composants inline légers pour éviter les imports lourds
const SimpleCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 ${className}`}>
    {children}
  </div>
);

const SimpleButton = ({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) => {
  const baseClasses = 'w-full font-medium py-2 px-4 rounded-md transition-colors';
  const variantClasses = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white',
    secondary: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// Icônes inline
const MailIcon = () => (
  <svg className="h-8 w-8 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertIcon = () => (
  <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LoadingSpinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-12 w-12' };
  return (
    <div className={`animate-spin rounded-full border-b-2 border-indigo-600 dark:border-indigo-400 ${sizeClasses[size]}`}></div>
  );
};

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n('auth');

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [isVerifying, setIsVerifying] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Vérifier l'email au montage
  useEffect(() => {
    const verifyEmail = async () => {
      if (!token || !email) {
        setError(t('verifyEmail.errors.invalidLink') || 'Lien de vérification invalide ou incomplet.');
        setIsVerifying(false);
        return;
      }

      try {
        const apiUrl = buildApiUrl('/auth/verify-email');
        console.log('[VERIFY_EMAIL] Appel API:', apiUrl);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, email }),
        });

        console.log('[VERIFY_EMAIL] Réponse HTTP:', response.status);

        const data = await response.json();

        if (response.ok && data.success) {
          console.log('[VERIFY_EMAIL] ✅ Email vérifié avec succès');
          setIsVerified(true);
          toast.success(t('verifyEmail.success') || 'Email vérifié avec succès !');
        } else {
          console.error('[VERIFY_EMAIL] ❌ Échec:', data.error);
          setError(data.error || t('verifyEmail.errors.verificationFailed') || 'La vérification a échoué.');
        }
      } catch (err) {
        console.error('[VERIFY_EMAIL] Erreur réseau:', err);
        setError(t('verifyEmail.errors.networkError') || 'Erreur de connexion. Veuillez réessayer.');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyEmail();
  }, [token, email, t]);

  // Renvoyer l'email de vérification
  const handleResend = async () => {
    if (!email) return;

    setIsResending(true);
    try {
      const apiUrl = buildApiUrl('/auth/resend-verification');
      console.log('[VERIFY_EMAIL] Renvoi à:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('verifyEmail.resendSuccess') || 'Un nouvel email de vérification a été envoyé.');
      } else {
        toast.error(data.error || t('verifyEmail.errors.resendFailed') || 'Impossible d\'envoyer l\'email.');
      }
    } catch (err) {
      console.error('[VERIFY_EMAIL] Erreur renvoi:', err);
      toast.error(t('verifyEmail.errors.networkError') || 'Erreur de connexion.');
    } finally {
      setIsResending(false);
    }
  };

  // État de chargement
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-8">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto">
                <MailIcon />
              </div>
              <div className="space-y-2">
                <LoadingSpinner />
                <p className="text-gray-600 dark:text-gray-400">
                  {t('verifyEmail.verifying') || 'Vérification en cours...'}
                </p>
              </div>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État de succès
  if (isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-8">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                <CheckIcon />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-green-700 dark:text-green-400">
                  {t('verifyEmail.successTitle') || 'Email vérifié !'}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  {t('verifyEmail.successDescription') || 'Votre adresse email a été vérifiée avec succès.'}
                </p>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-sm text-green-700 dark:text-green-300">
                  {t('verifyEmail.welcomeMessage') || 'Bienvenue dans la communauté Meeshy ! Vous pouvez maintenant discuter avec le monde entier.'}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <SimpleButton onClick={() => router.push('/dashboard')}>
                  {t('verifyEmail.goToChat') || 'Commencer à discuter'}
                </SimpleButton>
                <SimpleButton variant="secondary" onClick={() => router.push('/login')}>
                  {t('verifyEmail.goToLogin') || 'Se connecter'}
                </SimpleButton>
              </div>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État d'erreur
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <LargeLogo href="/" />
        </div>

        <SimpleCard className="p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <AlertIcon />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {t('verifyEmail.errorTitle') || 'Vérification échouée'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {t('verifyEmail.errorDescription') || 'Nous n\'avons pas pu vérifier votre adresse email.'}
              </p>
            </div>

            {/* Message d'erreur */}
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>

            {email && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('verifyEmail.resendHint') || 'Le lien a peut-être expiré. Vous pouvez demander un nouveau lien.'}
                </p>

                <SimpleButton
                  variant="secondary"
                  onClick={handleResend}
                  disabled={isResending}
                >
                  {isResending ? (
                    <span className="flex items-center justify-center space-x-2">
                      <LoadingSpinner size="sm" />
                      <span>{t('verifyEmail.sending') || 'Envoi en cours...'}</span>
                    </span>
                  ) : (
                    t('verifyEmail.resendButton') || 'Renvoyer l\'email de vérification'
                  )}
                </SimpleButton>
              </div>
            )}

            <SimpleButton variant="ghost" onClick={() => router.push('/login')}>
              {t('verifyEmail.backToLogin') || 'Retour à la connexion'}
            </SimpleButton>
          </div>
        </SimpleCard>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Chargement...</p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
