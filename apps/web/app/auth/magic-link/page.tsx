'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { LargeLogo } from '@/components/branding';
import { magicLinkService } from '@/services/magic-link.service';
import { Sparkles, Mail, CheckCircle, ArrowLeft, Clock } from 'lucide-react';

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
  type = 'button',
  variant = 'primary',
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
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
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const SimpleInput = ({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  icon: Icon
}: {
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <div className="relative">
    {Icon && (
      <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
    )}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2.5 ${Icon ? 'pl-10' : ''} bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500 ${className}`}
    />
  </div>
);

function MagicLinkPageContent() {
  const { t } = useI18n('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailSent, setIsEmailSent] = useState(false);

  // Validation email basique
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

    setIsLoading(true);

    try {
      const response = await magicLinkService.requestMagicLink(trimmedEmail);

      if (response.success) {
        setIsEmailSent(true);
        toast.success(t('magicLink.success.emailSent'));
      } else {
        // Afficher toujours un message de succès pour éviter l'énumération des emails
        setIsEmailSent(true);
        toast.success(t('magicLink.success.emailSent'));
      }
    } catch (error) {
      console.error('[MagicLink] Erreur:', error);
      // Même en cas d'erreur, ne pas révéler si l'email existe
      setIsEmailSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    router.push('/login' + (returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''));
  };

  // Vue après envoi de l'email
  if (isEmailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <LargeLogo href="/" />
          </div>

          {/* Card de confirmation */}
          <SimpleCard className="p-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('magicLink.checkEmail.title')}
              </h2>

              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                {t('magicLink.checkEmail.description')}
              </p>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">
                  {t('magicLink.checkEmail.emailSentTo')}
                </p>
                <p className="text-blue-600 dark:text-blue-400 font-medium">{email}</p>
              </div>

              {/* Instructions */}
              <div className="text-left space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">1</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('magicLink.checkEmail.step1')}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">2</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('magicLink.checkEmail.step2')}
                  </p>
                </div>
              </div>

              {/* Note d'expiration */}
              <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 text-sm mb-6">
                <Clock className="h-4 w-4" />
                <span>{t('magicLink.checkEmail.expiry')}</span>
              </div>

              {/* Spam warning */}
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                {t('magicLink.checkEmail.spamWarning')}
              </p>
            </div>

            {/* Bouton retour */}
            <SimpleButton variant="outline" onClick={handleBackToLogin}>
              <ArrowLeft className="h-4 w-4" />
              {t('magicLink.checkEmail.backToLogin')}
            </SimpleButton>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // Vue de demande de Magic Link
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400">{t('magicLink.subtitle')}</p>
        </div>

        {/* Card principale */}
        <SimpleCard className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('magicLink.title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {t('magicLink.description')}
            </p>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('magicLink.emailLabel')}
              </label>
              <SimpleInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('magicLink.emailPlaceholder')}
                disabled={isLoading}
                icon={Mail}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('magicLink.emailHelp')}
              </p>
            </div>

            <SimpleButton type="submit" disabled={isLoading} variant="primary">
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{t('magicLink.sending')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t('magicLink.submitButton')}
                </>
              )}
            </SimpleButton>
          </form>

          {/* Retour à la connexion */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <SimpleButton variant="ghost" onClick={handleBackToLogin} className="w-full">
              <ArrowLeft className="h-4 w-4" />
              {t('magicLink.backToLogin')}
            </SimpleButton>
          </div>
        </SimpleCard>

        {/* Note de sécurité */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {t('magicLink.securityNote')}
        </p>
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

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MagicLinkPageContent />
    </Suspense>
  );
}
