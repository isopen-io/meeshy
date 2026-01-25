'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { User } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';
import { Eye, EyeOff, User as UserIcon, Lock, Shield } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { useAuthFormStore } from '@/stores/auth-form-store';

interface LoginFormProps {
  onSuccess?: (user: User, token: string) => void; // Optional callback for custom behavior
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n('auth');
  const { identifier, setIdentifier } = useAuthFormStore();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberDevice: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Initialize username from shared store
  useEffect(() => {
    if (identifier && !formData.username) {
      setFormData(prev => ({ ...prev, username: identifier }));
    }
  }, [identifier]);

  // Save username to store when it changes
  const handleUsernameChange = (value: string) => {
    setFormData({ ...formData, username: value });
    setIdentifier(value);
  };

  // Bot protection
  const { honeypotProps, validateSubmission } = useBotProtection({
    minSubmitTime: 1500, // 1.5 seconds minimum for login
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Réinitialiser l'erreur précédente
    setError(null);

    // Bot protection validation
    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      setError(botError);
      toast.error(botError);
      return;
    }

    // Validation des champs
    if (!formData.username.trim() || !formData.password.trim()) {
      const errorMsg = t('login.validation.required');
      setError(errorMsg);
      toast.error(errorMsg);
      console.warn('[LOGIN_FORM] Validation échouée: champs requis vides');
      return;
    }

    setIsLoading(true);
    console.log('[LOGIN_FORM] Tentative de connexion pour:', formData.username.trim());

    try {
      const apiUrl = buildApiUrl(API_ENDPOINTS.AUTH.LOGIN);
      console.log('[LOGIN_FORM] URL API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password.trim(),
          rememberDevice: formData.rememberDevice,
        }),
      });

      console.log('[LOGIN_FORM] Réponse HTTP:', response.status, response.statusText);

      // Gérer les erreurs HTTP avec messages spécifiques
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.error || t('login.errors.loginFailed');

        if (response.status === 401) {
          errorMessage = t('login.errors.invalidCredentials');
          console.error('[LOGIN_FORM] Échec 401: Identifiants invalides');
        } else if (response.status === 500) {
          errorMessage = t('login.errors.serverError');
          console.error('[LOGIN_FORM] Échec 500: Erreur serveur');
        } else if (response.status === 400) {
          errorMessage = t('login.errors.loginFailed');
          console.error('[LOGIN_FORM] Échec 400: Données invalides');
        } else if (response.status >= 400) {
          errorMessage = t('login.errors.unknownError');
          console.error('[LOGIN_FORM] Échec', response.status, ':', response.statusText, errorData);
        }

        setError(errorMessage);
        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      const result = await response.json();
      console.log('[LOGIN_FORM] Données reçues:', {
        success: result.success,
        hasToken: !!(result.data?.token || result.token || result.access_token),
        hasUser: !!(result.data?.user || result.user)
      });

      // Gérer les différents formats de réponse
      let userData, token;

      if (result.success && result.data?.user && result.data?.token) {
        // Format standardisé: { success: true, data: { user: {...}, token: "..." } }
        userData = result.data.user;
        token = result.data.token;
      } else if (result.user && result.access_token) {
        // Format alternatif: { user: {...}, access_token: "..." }
        userData = result.user;
        token = result.access_token;
      } else if (result.user && result.token) {
        // Format alternatif: { user: {...}, token: "..." }
        userData = result.user;
        token = result.token;
      } else {
        console.error('[LOGIN_FORM] ❌ Format de réponse inattendu:', result);
        console.error('[LOGIN_FORM] URL appelée:', buildApiUrl(API_ENDPOINTS.AUTH.LOGIN));
        const errorMsg = 'Format de réponse invalide - vérifiez la configuration du serveur';
        setError(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
        return;
      }

      if (userData && token) {
        console.log('[LOGIN_FORM] ✅ Connexion réussie pour utilisateur:', userData.username);
        toast.success(t('login.success.loginSuccess'));

        // Mettre à jour le store d'authentification
        login(userData, token);

        // Appeler le callback de succès si fourni
        if (onSuccess) {
          onSuccess(userData, token);
        } else {
          // Comportement par défaut : redirection
          const currentPath = window.location.pathname;
          const urlParams = new URLSearchParams(window.location.search);
          const returnUrl = urlParams.get('returnUrl');

          console.log('[LOGIN_FORM] Redirection après connexion...');
          // Petit délai pour permettre à l'état d'être mis à jour
          setTimeout(() => {
            if (currentPath === '/') {
              console.log('[LOGIN_FORM] Rechargement de la page d\'accueil');
              window.location.reload();
            } else if (returnUrl) {
              console.log('[LOGIN_FORM] Redirection vers:', returnUrl);
              window.location.href = returnUrl;
            } else {
              console.log('[LOGIN_FORM] Redirection vers dashboard');
              window.location.href = '/dashboard';
            }
          }, 100);
        }
      } else {
        const errorMsg = 'Données utilisateur ou token manquantes';
        console.error('[LOGIN_FORM] ❌', errorMsg);
        setError(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('[LOGIN_FORM] ❌ Erreur réseau ou exception:', error);
      const errorMsg = error instanceof Error
        ? `${t('login.errors.networkError')}: ${error.message}`
        : t('login.errors.networkError');
      setError(errorMsg);
      toast.error(errorMsg);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Honeypot field - invisible to humans, bots will fill it */}
      <input {...honeypotProps} />

      {/* Message d'erreur visible */}
      {error && (
        <div role="alert" className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      )}

      {/* Nom d'utilisateur avec icône intégrée */}
      <div className="space-y-1">
        <Label htmlFor="login-form-username" className="sr-only">
          {t('login.usernameLabel')}
        </Label>
        <div className="relative">
          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            id="login-form-username"
            type="text"
            placeholder={t('login.usernamePlaceholder')}
            value={formData.username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="username"
            className="pl-10 h-11"
          />
        </div>
      </div>

      {/* Password with icon and toggle */}
      <div className="space-y-1">
        <Label htmlFor="login-form-password" className="sr-only">
          {t('login.passwordLabel')}
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            id="login-form-password"
            type={showPassword ? 'text' : 'password'}
            placeholder={t('login.passwordPlaceholder')}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            disabled={isLoading}
            required
            autoComplete="current-password"
            className="pl-10 pr-10 h-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {/* Forgot password link - always visible */}
        <div className="text-right mt-1.5">
          <a
            href="/forgot-password"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium hover:underline transition-colors"
          >
            {t('login.forgotPassword')}
          </a>
        </div>
      </div>

      {/* Remember device checkbox */}
      <div className="flex items-center space-x-2 py-1">
        <Checkbox
          id="remember-device"
          checked={formData.rememberDevice}
          onCheckedChange={(checked) =>
            setFormData({ ...formData, rememberDevice: checked === true })
          }
          disabled={isLoading}
        />
        <Label
          htmlFor="remember-device"
          className="text-sm font-medium leading-none cursor-pointer flex items-center gap-1.5 text-gray-700 dark:text-gray-300"
        >
          <Shield className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-hidden="true" />
          {t('login.rememberDevice')}
        </Label>
      </div>

      <Button
        type="submit"
        className="w-full h-11 font-semibold"
        disabled={isLoading}
      >
        {isLoading ? t('login.loggingIn') : t('login.loginButton')}
      </Button>

      {/* Liens de navigation compacts */}
      <div className="pt-2 text-center text-sm text-gray-600 dark:text-gray-400">
        <span>{t('login.noAccount')} </span>
        <a
          href="/signup"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline"
        >
          {t('login.registerLink')}
        </a>
      </div>
    </form>
  );
}
