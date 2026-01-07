'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';
import { LargeLogo } from '@/components/branding';
import { buildApiUrl } from '@/lib/config';
import { toast } from 'sonner';

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
    className={`w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500 ${className}`}
  />
);

// Icônes inline
const PhoneIcon = () => (
  <svg className="h-8 w-8 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
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
    <div className={`animate-spin rounded-full border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto ${sizeClasses[size]}`}></div>
  );
};

// Composant pour les inputs de code OTP
const OTPInput = ({
  value,
  onChange,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const CODE_LENGTH = 6;

  const handleChange = (index: number, inputValue: string) => {
    // Seulement les chiffres
    const digit = inputValue.replace(/\D/g, '').slice(-1);

    const newValue = value.split('');
    newValue[index] = digit;
    const joined = newValue.join('').slice(0, CODE_LENGTH);
    onChange(joined);

    // Auto-focus le prochain input
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace : effacer et revenir en arrière
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    // Flèches
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChange(pastedData);
    // Focus le dernier input rempli ou le prochain vide
    const nextIndex = Math.min(pastedData.length, CODE_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: CODE_LENGTH }).map((_, index) => (
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
          className="w-12 h-14 text-center text-2xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
        />
      ))}
    </div>
  );
};

function VerifyPhoneContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n('auth');

  const phoneFromUrl = searchParams.get('phone');

  const [step, setStep] = useState<'input' | 'verify' | 'success'>('input');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Countdown pour le renvoi
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Si le numéro est dans l'URL, envoyer automatiquement le code
  useEffect(() => {
    if (phoneFromUrl && step === 'input') {
      handleSendCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      setError(t('verifyPhone.errors.phoneRequired') || 'Veuillez entrer votre numéro de téléphone.');
      return;
    }

    setError(null);
    setIsSending(true);

    try {
      const apiUrl = buildApiUrl('/auth/send-phone-code');
      console.log('[VERIFY_PHONE] Envoi du code à:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('[VERIFY_PHONE] ✅ Code envoyé');
        toast.success(t('verifyPhone.codeSent') || 'Code envoyé par SMS !');
        setStep('verify');
        setCountdown(60); // 60 secondes avant renvoi
      } else {
        console.error('[VERIFY_PHONE] ❌ Échec:', data.error);
        setError(data.error || t('verifyPhone.errors.sendFailed') || 'Impossible d\'envoyer le code.');
      }
    } catch (err) {
      console.error('[VERIFY_PHONE] Erreur réseau:', err);
      setError(t('verifyPhone.errors.networkError') || 'Erreur de connexion.');
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError(t('verifyPhone.errors.codeRequired') || 'Veuillez entrer le code à 6 chiffres.');
      return;
    }

    setError(null);
    setIsVerifying(true);

    try {
      const apiUrl = buildApiUrl('/auth/verify-phone');
      console.log('[VERIFY_PHONE] Vérification du code');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim(), code }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('[VERIFY_PHONE] ✅ Téléphone vérifié');
        toast.success(t('verifyPhone.success') || 'Numéro vérifié avec succès !');
        setStep('success');
      } else {
        console.error('[VERIFY_PHONE] ❌ Code invalide:', data.error);
        setError(data.error || t('verifyPhone.errors.invalidCode') || 'Code invalide ou expiré.');
        setCode(''); // Reset le code
      }
    } catch (err) {
      console.error('[VERIFY_PHONE] Erreur réseau:', err);
      setError(t('verifyPhone.errors.networkError') || 'Erreur de connexion.');
    } finally {
      setIsVerifying(false);
    }
  };

  // État de succès
  if (step === 'success') {
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
                  {t('verifyPhone.successTitle') || 'Numéro vérifié !'}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  {t('verifyPhone.successDescription') || 'Votre numéro de téléphone a été vérifié avec succès.'}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <SimpleButton onClick={() => router.push('/dashboard')}>
                  {t('verifyPhone.continue') || 'Continuer'}
                </SimpleButton>
              </div>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État de vérification du code
  if (step === 'verify') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <LargeLogo href="/" />
          </div>

          <SimpleCard className="p-8">
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PhoneIcon />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('verifyPhone.enterCode') || 'Entrez le code'}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  {t('verifyPhone.codeSentTo') || 'Un code à 6 chiffres a été envoyé au'}
                </p>
                <p className="font-medium text-indigo-600 dark:text-indigo-400">{phoneNumber}</p>
              </div>

              {/* Input OTP */}
              <OTPInput
                value={code}
                onChange={setCode}
                disabled={isVerifying}
              />

              {/* Message d'erreur */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
                </div>
              )}

              {/* Bouton vérifier */}
              <SimpleButton
                onClick={handleVerifyCode}
                disabled={isVerifying || code.length !== 6}
              >
                {isVerifying ? (
                  <span className="flex items-center justify-center space-x-2">
                    <LoadingSpinner size="sm" />
                    <span>{t('verifyPhone.verifying') || 'Vérification...'}</span>
                  </span>
                ) : (
                  t('verifyPhone.verifyButton') || 'Vérifier le code'
                )}
              </SimpleButton>

              {/* Renvoi du code */}
              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('verifyPhone.resendIn') || 'Renvoyer dans'} {countdown}s
                  </p>
                ) : (
                  <button
                    onClick={handleSendCode}
                    disabled={isSending}
                    className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                  >
                    {isSending ? (t('verifyPhone.sending') || 'Envoi...') : (t('verifyPhone.resendCode') || 'Renvoyer le code')}
                  </button>
                )}
              </div>

              {/* Changer de numéro */}
              <SimpleButton
                variant="ghost"
                onClick={() => {
                  setStep('input');
                  setCode('');
                  setError(null);
                }}
              >
                {t('verifyPhone.changeNumber') || 'Changer de numéro'}
              </SimpleButton>
            </div>
          </SimpleCard>
        </div>
      </div>
    );
  }

  // État initial - saisie du numéro
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400 text-lg mt-2">
            {t('verifyPhone.subtitle') || 'Vérifiez votre numéro de téléphone'}
          </p>
        </div>

        <SimpleCard className="p-8">
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <PhoneIcon />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('verifyPhone.title') || 'Vérification téléphone'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {t('verifyPhone.description') || 'Entrez votre numéro pour recevoir un code de vérification par SMS.'}
              </p>
            </div>

            {/* Input numéro */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('verifyPhone.phoneLabel') || 'Numéro de téléphone'}
              </label>
              <SimpleInput
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('verifyPhone.phonePlaceholder') || '+33 6 12 34 56 78'}
                disabled={isSending}
              />
            </div>

            {/* Message d'erreur */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Bouton envoyer */}
            <SimpleButton
              onClick={handleSendCode}
              disabled={isSending || !phoneNumber.trim()}
            >
              {isSending ? (
                <span className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span>{t('verifyPhone.sending') || 'Envoi...'}</span>
                </span>
              ) : (
                t('verifyPhone.sendCode') || 'Envoyer le code'
              )}
            </SimpleButton>

            <SimpleButton variant="ghost" onClick={() => router.push('/login')}>
              {t('verifyPhone.backToLogin') || 'Retour à la connexion'}
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

export default function VerifyPhonePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyPhoneContent />
    </Suspense>
  );
}
