'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { LargeLogo } from '@/components/branding';
import { twoFactorService } from '@/services/two-factor.service';
import { SESSION_STORAGE_KEYS } from '@/services/auth-manager.service';
import { ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';

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
    primary: 'w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white',
    secondary: 'w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white',
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

// Composant d'entrée de code OTP
const OTPInput = ({
  value,
  onChange,
  disabled = false,
  length = 6
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  length?: number;
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return; // Seulement des chiffres

    const newValue = value.split('');
    newValue[index] = char;
    const result = newValue.join('').slice(0, length);
    onChange(result);

    // Auto-focus sur le prochain input
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pastedData);

    // Focus sur le dernier champ rempli ou le suivant
    const focusIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className="w-12 h-14 text-center text-xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-800"
        />
      ))}
    </div>
  );
};

function Verify2FAPageContent() {
  const { t } = useI18n('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBackupCode, setShowBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [username, setUsername] = useState<string>('');

  // Récupérer le token temporaire et les infos utilisateur
  useEffect(() => {
    const tempToken = sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
    const storedUsername = sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME);

    if (!tempToken) {
      // Pas de token temporaire, rediriger vers login
      router.replace('/login');
      return;
    }

    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, [router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const codeToVerify = showBackupCode ? backupCode.replace(/[\s-]/g, '') : code;

    if (!codeToVerify || (showBackupCode ? codeToVerify.length < 8 : codeToVerify.length < 6)) {
      setError(t('twoFactor.verify.errors.codeRequired'));
      return;
    }

    const tempToken = sessionStorage.getItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
    if (!tempToken) {
      setError(t('twoFactor.verify.errors.sessionExpired'));
      router.replace('/login');
      return;
    }

    setIsLoading(true);

    try {
      const response = await twoFactorService.verify(tempToken, codeToVerify);

      if (response.success && response.data?.token) {
        // Nettoyer le sessionStorage - utilise les clés centralisées
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID);
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME);

        // Afficher un message si un backup code a été utilisé
        if (response.data.usedBackupCode) {
          toast.warning(t('twoFactor.verify.backupCodeUsed'));
        }

        toast.success(t('login.success.loginSuccess'));

        // Redirection
        const redirectUrl = returnUrl || '/dashboard';
        router.replace(redirectUrl);
      } else {
        setError(response.error || t('twoFactor.verify.errors.invalidCode'));
        setIsLoading(false);
      }
    } catch (error) {
      console.error('[2FA] Erreur de vérification:', error);
      setError(t('login.errors.networkError'));
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    // Nettoyer le sessionStorage - utilise les clés centralisées
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME);
    router.push('/login');
  };

  // Auto-submit quand le code est complet
  useEffect(() => {
    if (!showBackupCode && code.length === 6) {
      handleVerify({ preventDefault: () => {} } as React.FormEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400">{t('twoFactor.verify.subtitle')}</p>
        </div>

        {/* Card principale */}
        <SimpleCard className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('twoFactor.verify.title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {username && (
                <span className="block mb-1">
                  {t('twoFactor.verify.welcomeBack')} <strong>{username}</strong>
                </span>
              )}
              {showBackupCode
                ? t('twoFactor.verify.enterBackupCode')
                : t('twoFactor.verify.enterCode')}
            </p>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            {showBackupCode ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
                  {t('twoFactor.verify.backupCodeLabel')}
                </label>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  disabled={isLoading}
                  className="w-full px-4 py-3 text-center text-lg font-mono tracking-widest bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent uppercase"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 text-center">
                  {t('twoFactor.verify.codeLabel')}
                </label>
                <OTPInput
                  value={code}
                  onChange={setCode}
                  disabled={isLoading}
                />
              </div>
            )}

            <SimpleButton type="submit" disabled={isLoading} variant="primary">
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{t('twoFactor.verify.verifying')}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  {t('twoFactor.verify.verifyButton')}
                </>
              )}
            </SimpleButton>
          </form>

          {/* Toggle backup code */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setShowBackupCode(!showBackupCode);
                setError(null);
                setCode('');
                setBackupCode('');
              }}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 mx-auto"
            >
              <KeyRound className="h-4 w-4" />
              {showBackupCode
                ? t('twoFactor.verify.useAuthenticator')
                : t('twoFactor.verify.useBackupCode')}
            </button>
          </div>

          {/* Retour à la connexion */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <SimpleButton variant="ghost" onClick={handleBackToLogin} className="w-full">
              <ArrowLeft className="h-4 w-4" />
              {t('twoFactor.verify.backToLogin')}
            </SimpleButton>
          </div>
        </SimpleCard>

        {/* Note de sécurité */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {t('twoFactor.verify.securityNote')}
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export default function Verify2FAPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Verify2FAPageContent />
    </Suspense>
  );
}
