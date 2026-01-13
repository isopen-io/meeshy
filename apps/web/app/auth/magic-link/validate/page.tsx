'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { LargeLogo } from '@/components/branding';
import { magicLinkService } from '@/services/magic-link.service';
import { SESSION_STORAGE_KEYS } from '@/services/auth-manager.service';
import { CheckCircle, XCircle, Loader2, ArrowLeft, ShieldAlert } from 'lucide-react';

// Composants inline légers
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
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
}) => {
  const baseStyles = 'font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2';
  const variantStyles = {
    primary: 'w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white',
    secondary: 'w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white',
    outline: 'w-full bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
    ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

type ValidationState = 'validating' | 'success' | 'error' | 'requires2fa' | 'noToken';

function MagicLinkValidateContent() {
  const { t } = useI18n('auth');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<ValidationState>('validating');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const token = searchParams.get('token');
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setState('noToken');
        return;
      }

      try {
        const response = await magicLinkService.validateMagicLink(token);

        if (response.success && response.data) {
          // Vérifier si 2FA est requis
          if (response.data.requires2FA) {
            // Stocker le token temporaire pour la vérification 2FA - utilise les clés centralisées
            sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN, response.data.twoFactorToken || '');
            sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID, response.data.user?.id || '');
            sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME, response.data.user?.username || '');
            setState('requires2fa');
            return;
          }

          // Connexion réussie sans 2FA
          setState('success');
          toast.success(t('login.success.loginSuccess'));

          // Redirection après un court délai
          setTimeout(() => {
            const redirectUrl = returnUrl || '/dashboard';
            router.replace(redirectUrl);
          }, 1500);
        } else {
          setState('error');
          setErrorMessage(response.error || t('magicLink.validate.errors.invalidToken'));
        }
      } catch (error) {
        console.error('[MagicLink] Erreur de validation:', error);
        setState('error');
        setErrorMessage(t('magicLink.validate.errors.networkError'));
      }
    };

    validateToken();
  }, [token, router, returnUrl, t]);

  const handleGoToLogin = () => {
    router.push('/login');
  };

  const handleGoTo2FA = () => {
    router.push(`/auth/verify-2fa${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`);
  };

  const handleRequestNewLink = () => {
    router.push('/auth/magic-link');
  };

  // État: Pas de token
  if (state === 'noToken') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('magicLink.validate.noToken.title')}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                {t('magicLink.validate.noToken.description')}
              </p>

              <div className="space-y-3">
                <SimpleButton variant="primary" onClick={handleRequestNewLink}>
                  {t('magicLink.validate.requestNewLink')}
                </SimpleButton>
                <SimpleButton variant="outline" onClick={handleGoToLogin}>
                  <ArrowLeft className="h-4 w-4" />
                  {t('magicLink.validate.backToLogin')}
                </SimpleButton>
              </div>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État: Validation en cours
  if (state === 'validating') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-4">
                <Loader2 className="h-8 w-8 text-purple-600 dark:text-purple-400 animate-spin" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('magicLink.validate.validating.title')}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {t('magicLink.validate.validating.description')}
              </p>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État: Succès
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('magicLink.validate.success.title')}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                {t('magicLink.validate.success.description')}
              </p>

              <div className="flex items-center justify-center gap-2 text-purple-600 dark:text-purple-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t('magicLink.validate.success.redirecting')}</span>
              </div>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État: 2FA requis
  if (state === 'requires2fa') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                <ShieldAlert className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('magicLink.validate.requires2fa.title')}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                {t('magicLink.validate.requires2fa.description')}
              </p>

              <SimpleButton variant="primary" onClick={handleGoTo2FA}>
                {t('magicLink.validate.requires2fa.continue')}
              </SimpleButton>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État: Erreur
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <LargeLogo href="/" />
        </div>

        <SimpleCard className="p-6">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>

            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('magicLink.validate.error.title')}
            </h2>

            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
              {t('magicLink.validate.error.description')}
            </p>

            {errorMessage && (
              <p className="text-red-600 dark:text-red-400 text-sm mb-6">
                {errorMessage}
              </p>
            )}

            <p className="text-gray-500 dark:text-gray-400 text-xs mb-6">
              {t('magicLink.validate.error.hint')}
            </p>

            <div className="space-y-3">
              <SimpleButton variant="primary" onClick={handleRequestNewLink}>
                {t('magicLink.validate.requestNewLink')}
              </SimpleButton>
              <SimpleButton variant="outline" onClick={handleGoToLogin}>
                <ArrowLeft className="h-4 w-4" />
                {t('magicLink.validate.backToLogin')}
              </SimpleButton>
            </div>
          </div>
        </SimpleCard>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400 mx-auto"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export default function MagicLinkValidatePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MagicLinkValidateContent />
    </Suspense>
  );
}
