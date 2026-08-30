'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { User } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';
import { Eye, EyeOff, User as UserIcon, Lock, Shield } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { useAuthFormStore } from '@/stores/auth-form-store';
import { requestBrowserGeolocation, getGeolocationHeaders } from '@/lib/geolocation';
import { useAuth } from '@/hooks/use-auth';
import { SESSION_STORAGE_KEYS } from '@/services/auth-manager.service';
import { safeInternalPath } from '@/utils/safe-redirect';

interface LoginFormProps {
  onSuccess?: (user: User, token: string) => void; // Optional callback for custom behavior
}

/**
 * Where to send an account whose login response carried `requires2FA`
 * (services/gateway/src/routes/auth/login.ts:121-135 — no `token` is ever
 * granted on that branch). Kept a pure function of the current query string
 * so the returnUrl-forwarding + safe-path clamping is unit-testable without
 * depending on window.location, which jsdom 26+ makes non-observable in this
 * repo's test environment (see login-form.test.tsx).
 */
export function buildVerifyTwoFactorUrl(search: string): string {
  const returnUrl = new URLSearchParams(search).get('returnUrl');
  return returnUrl
    ? `/auth/verify-2fa?returnUrl=${encodeURIComponent(safeInternalPath(returnUrl, '/'))}`
    : '/auth/verify-2fa';
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { t } = useI18n('auth');
  const { login } = useAuth();
  const router = useRouter();
  const { identifier, setIdentifier } = useAuthFormStore();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberDevice: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Request browser geolocation on mount (non-blocking)
  const geoRequested = useRef(false);
  useEffect(() => {
    if (!geoRequested.current) {
      geoRequested.current = true;
      requestBrowserGeolocation();
    }
  }, []);

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

      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = buildApiUrl(API_ENDPOINTS.auth.login);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getGeolocationHeaders(),
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password.trim(),
          rememberDevice: formData.rememberDevice,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.error || t('login.errors.loginFailed');

        if (response.status === 401) {
          errorMessage = t('login.errors.invalidCredentials');
        } else if (response.status === 500) {
          errorMessage = t('login.errors.serverError');
        } else if (response.status === 400) {
          errorMessage = t('login.errors.loginFailed');
        } else if (response.status >= 400) {
          errorMessage = t('login.errors.unknownError');
        }

        setError(errorMessage);
        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      const result = await response.json();

      // The gateway serves this branch — { success: true, data: { requires2FA:
      // true, twoFactorToken, user, ... } } — with NO `token`: every branch
      // below expects one, so a 2FA account used to fall through to the
      // generic "unknown error" message instead of reaching the second
      // factor (#4458). Must be tested before the token cascade.
      if (result.success && result.data?.requires2FA) {
        const twoFactorData = result.data;

        // Keys aligned with what /auth/verify-2fa reads (sessionStorage) and
        // with what /auth/magic-link/validate already writes for the same
        // screen — SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN / _USER_ID /
        // _USERNAME. Do not invent new keys here.
        sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN, twoFactorData.twoFactorToken || '');
        sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID, twoFactorData.user?.id || '');
        sessionStorage.setItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME, twoFactorData.user?.username || '');

        setIsLoading(false);
        router.push(buildVerifyTwoFactorUrl(window.location.search));
        return;
      }

      let userData, token, sessionToken, expiresIn;

      // The only contract the gateway still serves on a full login success
      // (services/gateway/src/routes/auth/login.ts:188-194) — always wrapped
      // in `{ success, data }` via sendSuccess(). The former `access_token`
      // and unwrapped-`token` fallbacks below this point matched a shape the
      // gateway has zero occurrences of anywhere in its source; measured and
      // retired together with the #4458 fix (see PR description).
      if (result.success && result.data?.user && result.data?.token) {
        userData = result.data.user;
        token = result.data.token;
        sessionToken = result.data.sessionToken;
        expiresIn = result.data.expiresIn;
      } else {
        const errorMsg = t('login.errors.unknownError');
        setError(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
        return;
      }

      if (userData && token) {
        toast.success(t('login.success.loginSuccess'));
        login(userData, token, sessionToken, expiresIn);

        if (onSuccess) {
          onSuccess(userData, token);
        } else {
          const currentPath = window.location.pathname;
          const urlParams = new URLSearchParams(window.location.search);
          const returnUrl = urlParams.get('returnUrl');

          setTimeout(() => {
            if (currentPath === '/') {
              window.location.reload();
            } else if (returnUrl) {
              window.location.href = returnUrl;
            } else {
              window.location.href = '/dashboard';
            }
          }, 100);
        }
      } else {
        const errorMsg = t('login.errors.unknownError');
        setError(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
      }
    } catch (error) {
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
        <div role="alert" aria-live="polite" className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
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
            name="username"
            placeholder={t('login.usernamePlaceholder')}
            value={formData.username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="username"
            spellCheck={false}
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
            name="password"
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
