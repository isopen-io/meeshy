'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/use-auth';
import { LargeLogo } from '@/components/branding';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';

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
  type = 'button',
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors ${className}`}
  >
    {children}
  </button>
);

const SimpleInput = ({ 
  type = 'text', 
  value, 
  onChange, 
  placeholder, 
  disabled = false,
  className = ''
}: {
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500 ${className}`}
  />
);

function QuickLoginPageContent() {
  const { t } = useI18n('auth');
  const { login: authLogin, isAuthenticated, isChecking } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  // Rediriger si déjà authentifié
  useEffect(() => {
    if (!isChecking && isAuthenticated) {
      // CORRECTION MAJEURE: Redirection intelligente selon le type d'utilisateur
      // Pour les utilisateurs anonymes : rediriger vers leur conversation
      // Pour les membres : rediriger vers / ou returnUrl
      const anonymousSession = authManager.getAnonymousSession();
      if (anonymousSession) {
        // Utilisateur anonyme - rediriger vers la conversation du lien utilisé
        const shareLinkId = localStorage.getItem('anonymous_current_share_link') ||
                           localStorage.getItem('anonymous_current_link_id');

        if (shareLinkId) {
          router.replace(`/chat/${shareLinkId}`);
          return;
        }
      }

      // Utilisateur membre authentifié - redirection normale
      const redirectUrl = returnUrl || '/dashboard';
      router.replace(redirectUrl);
    }
  }, [isAuthenticated, isChecking, returnUrl, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Réinitialiser l'erreur précédente
    setError(null);

    // Validation des champs
    if (!formData.username.trim() || !formData.password.trim()) {
      const errorMsg = t('login.validation.required');
      setError(errorMsg);
      console.warn('[LOGIN] Validation échouée: champs requis vides');
      return;
    }

    setIsLoading(true);
    console.log('[LOGIN] Tentative de connexion pour:', formData.username.trim());

    try {
      // Construire l'URL de l'API
      const apiUrl = buildApiUrl('/auth/login');
      console.log('[LOGIN] URL API:', apiUrl);

      // Effectuer la requête de connexion
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password.trim()
        }),
      });

      console.log('[LOGIN] Réponse HTTP:', response.status, response.statusText);

      // Gérer les erreurs HTTP
      if (!response.ok) {
        let errorMessage = t('login.errors.loginFailed');

        if (response.status === 401) {
          errorMessage = t('login.errors.invalidCredentials');
          console.error('[LOGIN] Échec 401: Identifiants invalides');
        } else if (response.status === 500) {
          errorMessage = t('login.errors.serverError');
          console.error('[LOGIN] Échec 500: Erreur serveur');
        } else if (response.status === 400) {
          errorMessage = t('login.errors.loginFailed');
          console.error('[LOGIN] Échec 400: Données invalides');
        } else if (response.status >= 400) {
          errorMessage = t('login.errors.unknownError');
          console.error('[LOGIN] Échec', response.status, ':', response.statusText);
        }

        setError(errorMessage);
        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      // Parser la réponse JSON
      const data = await response.json();
      console.log('[LOGIN] Données reçues:', { success: data.success, hasToken: !!data.data?.token, hasUser: !!data.data?.user });

      // Vérifier le succès de la connexion
      if (data.success && data.data?.token) {
        console.log('[LOGIN] ✅ Connexion réussie pour utilisateur:', data.data.user?.username);

        // Mettre à jour le store d'authentification
        authLogin(data.data.user, data.data.token);

        // Toast de succès
        toast.success(t('login.success.loginSuccess'));

        // Redirection
        const redirectUrl = returnUrl || '/dashboard';
        console.log('[LOGIN] Redirection vers:', redirectUrl);

        // Utiliser router.replace pour éviter les problèmes de timing
        router.replace(redirectUrl);
      } else {
        // Réponse invalide ou erreur métier
        const errorMsg = data.error || t('login.errors.loginFailed');
        console.error('[LOGIN] ❌ Échec de connexion:', errorMsg);
        setError(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
      }
    } catch (error) {
      // Erreur réseau ou autre erreur inattendue
      console.error('[LOGIN] ❌ Erreur réseau ou exception:', error);
      const errorMsg = error instanceof Error
        ? `${t('login.errors.networkError')}: ${error.message}`
        : t('login.errors.networkError');
      setError(errorMsg);
      toast.error(errorMsg);
      setIsLoading(false);
    }
  };

  // État de chargement unifié (h-12 w-12)
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('login.verifyingAuth')}</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400">{t('login.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header minimaliste */}
        <div className="text-center space-y-3">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400">{t('login.subtitle')}</p>
        </div>

        {/* Formulaire simplifié */}
        <SimpleCard className="p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('login.title')}</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{t('login.formDescription')}</p>
          </div>

          {/* Message d'erreur visible */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('login.usernameLabel')}
              </label>
              <SimpleInput
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder={t('login.usernamePlaceholder')}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('login.passwordLabel')}
              </label>
              <SimpleInput
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={t('login.passwordPlaceholder')}
                disabled={isLoading}
              />
            </div>

            <SimpleButton type="submit" disabled={isLoading}>
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{t('login.loggingIn')}</span>
                </div>
              ) : (
                t('login.loginButton')
              )}
            </SimpleButton>

            <div className="text-center pt-4">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {t('login.noAccount')}{' '}
                <button
                  type="button"
                  onClick={() => router.push('/signin' + (returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''))}
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                >
                  {t('login.registerLink')}
                </button>
              </p>
            </div>
          </form>
        </SimpleCard>
      </div>
    </div>
  );
}

function LoadingFallback() {
  const { t } = useI18n('auth');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('login.loading')}</p>
      </div>
    </div>
  );
}

export default function QuickLoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <QuickLoginPageContent />
    </Suspense>
  );
}
