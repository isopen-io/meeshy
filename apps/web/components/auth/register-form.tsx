'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSelector } from '@/components/translation/language-selector';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { User } from '@/types';
import { JoinConversationResponse } from '@/types/frontend';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';
import { Check, X, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isValidEmail, getEmailValidationError } from '@meeshy/shared/utils/email-validator';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { useAuthFormStore } from '@/stores/auth-form-store';

interface RegisterFormProps {
  onSuccess?: (user: User, token: string) => void; // Optional callback for custom behavior
  disabled?: boolean; // Pour désactiver les inputs quand le modal est fermé
  linkId?: string; // Pour rejoindre une conversation via lien
  onJoinSuccess?: (userData: JoinConversationResponse) => void; // Pour les liens d'invitation
  formPrefix?: string; // Préfixe unique pour les IDs de formulaire
}

export function RegisterForm({
  onSuccess,
  disabled = false,
  linkId,
  onJoinSuccess,
  formPrefix = 'register'
}: RegisterFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n('auth');

  // Get shared identifier from login form
  const { identifier: sharedIdentifier, setIdentifier } = useAuthFormStore();

  // Determine if shared identifier is email or phone
  const getInitialEmail = () => {
    if (sharedIdentifier && sharedIdentifier.includes('@')) return sharedIdentifier;
    return '';
  };
  const getInitialPhone = () => {
    if (sharedIdentifier && !sharedIdentifier.includes('@') && /^\+?\d/.test(sharedIdentifier)) return sharedIdentifier;
    return '';
  };

  const [formData, setFormData] = useState({
    username: linkId ? '' : '', // Pas de username pour les liens, sera généré
    password: '',
    firstName: '',
    lastName: '',
    email: getInitialEmail(),
    phoneNumber: getInitialPhone(),
    systemLanguage: 'fr',
    regionalLanguage: 'en',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Bot protection
  const { honeypotProps, validateSubmission } = useBotProtection({
    minSubmitTime: 3000, // 3 seconds minimum for registration (more fields to fill)
  });

  // Sync email/phone changes to shared store
  const handleEmailChangeWithSync = (value: string) => {
    const cleanValue = value.replace(/\s/g, ''); // Remove spaces
    setFormData(prev => ({ ...prev, email: cleanValue }));
    validateEmailField(cleanValue);
    if (cleanValue.includes('@')) setIdentifier(cleanValue);
  };
  const handlePhoneChangeWithSync = async (value: string) => {
    // Format the phone number in real-time
    const { formatPhoneNumberInput } = await import('@/utils/phone-validator');
    const formatted = formatPhoneNumberInput(value);
    setFormData(prev => ({ ...prev, phoneNumber: formatted }));
    validatePhoneField(formatted);
    if (/^\+?\d/.test(formatted)) setIdentifier(formatted);
  };

  // État pour la validation du username
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  // État pour la validation de l'email
  const [emailValidationStatus, setEmailValidationStatus] = useState<'idle' | 'checking' | 'invalid' | 'valid' | 'taken'>('idle');
  const [emailErrorMessage, setEmailErrorMessage] = useState<string>('');
  const emailCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  // État pour la validation du téléphone
  const [phoneValidationStatus, setPhoneValidationStatus] = useState<'idle' | 'checking' | 'invalid' | 'valid' | 'taken'>('idle');
  const [phoneErrorMessage, setPhoneErrorMessage] = useState<string>('');
  const phoneCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  // Debounce delay for availability checks (2 seconds)
  const AVAILABILITY_CHECK_DEBOUNCE = 2000;

  const validateUsername = (username: string) => {
    // Validation: longueur entre 2 et 16 caractères
    if (username.length < 2 || username.length > 16) {
      return false;
    }
    // Validation: uniquement lettres, chiffres, tirets et underscores
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    return usernameRegex.test(username);
  };

  const validateEmailField = (email: string) => {
    if (!email.trim()) {
      setEmailValidationStatus('idle');
      setEmailErrorMessage('');
      return;
    }

    const errorMessage = getEmailValidationError(email);
    if (errorMessage) {
      setEmailValidationStatus('invalid');
      setEmailErrorMessage(errorMessage);
    } else {
      setEmailValidationStatus('valid');
      setEmailErrorMessage('');
    }
  };

  const validatePhoneField = (phone: string) => {
    if (!phone.trim()) {
      setPhoneValidationStatus('invalid');
      setPhoneErrorMessage(t('register.validation.phoneRequired'));
      return;
    }

    // Import dynamique de la validation
    import('@/utils/phone-validator').then(({ getPhoneValidationError, translatePhoneError }) => {
      const errorKey = getPhoneValidationError(phone);
      if (errorKey) {
        setPhoneValidationStatus('invalid');
        setPhoneErrorMessage(translatePhoneError(errorKey, t));
      } else {
        setPhoneValidationStatus('valid');
        setPhoneErrorMessage('');
      }
    });
  };

  // Vérification de disponibilité du username avec debounce
  useEffect(() => {
    // Ne pas vérifier si on est en mode lien ou si le formulaire est désactivé
    if (linkId || disabled) {
      return;
    }

    // Clear le timeout précédent
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    // Si le username est vide ou invalide, reset le statut
    if (!formData.username.trim() || !validateUsername(formData.username)) {
      setUsernameCheckStatus('idle');
      return;
    }

    // Indiquer qu'on est en train de vérifier
    setUsernameCheckStatus('checking');

    // Debounce: attendre 2 secondes avant de lancer la vérification
    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/auth/check-availability?username=${encodeURIComponent(formData.username.trim())}`)
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setUsernameCheckStatus(result.data?.usernameAvailable ? 'available' : 'taken');
          } else {
            setUsernameCheckStatus('idle');
          }
        } else {
          setUsernameCheckStatus('idle');
        }
      } catch (error) {
        console.error('Erreur vérification username:', error);
        setUsernameCheckStatus('idle');
      }
    }, AVAILABILITY_CHECK_DEBOUNCE);

    // Cleanup
    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, [formData.username, linkId, disabled]);

  // Vérification de disponibilité de l'email avec debounce de 2 secondes
  useEffect(() => {
    if (disabled) return;

    // Clear le timeout précédent
    if (emailCheckTimeout.current) {
      clearTimeout(emailCheckTimeout.current);
    }

    // Si l'email est vide ou invalide (format), reset le statut
    if (!formData.email.trim()) {
      setEmailValidationStatus('idle');
      setEmailErrorMessage('');
      return;
    }

    // Vérifier d'abord le format
    const formatError = getEmailValidationError(formData.email);
    if (formatError) {
      setEmailValidationStatus('invalid');
      setEmailErrorMessage(formatError);
      return;
    }

    // Format valide, indiquer qu'on vérifie la disponibilité
    setEmailValidationStatus('checking');
    setEmailErrorMessage('');

    // Debounce: attendre 2 secondes avant de lancer la vérification
    emailCheckTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/auth/check-availability?email=${encodeURIComponent(formData.email.trim())}`)
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            if (result.data?.emailAvailable) {
              setEmailValidationStatus('valid');
              setEmailErrorMessage('');
            } else {
              setEmailValidationStatus('taken');
              setEmailErrorMessage(t('register.errors.emailExists'));
            }
          } else {
            setEmailValidationStatus('valid');
            setEmailErrorMessage('');
          }
        } else {
          setEmailValidationStatus('valid');
          setEmailErrorMessage('');
        }
      } catch (error) {
        console.error('Erreur vérification email:', error);
        setEmailValidationStatus('valid');
        setEmailErrorMessage('');
      }
    }, AVAILABILITY_CHECK_DEBOUNCE);

    // Cleanup
    return () => {
      if (emailCheckTimeout.current) {
        clearTimeout(emailCheckTimeout.current);
      }
    };
  }, [formData.email, disabled, t]);

  // Vérification de disponibilité du téléphone avec debounce de 2 secondes
  useEffect(() => {
    if (disabled) return;

    // Clear le timeout précédent
    if (phoneCheckTimeout.current) {
      clearTimeout(phoneCheckTimeout.current);
    }

    // Si le téléphone est vide, reset le statut
    if (!formData.phoneNumber.trim()) {
      setPhoneValidationStatus('invalid');
      setPhoneErrorMessage(t('register.validation.phoneRequired'));
      return;
    }

    // Vérifier d'abord le format avec validation asynchrone
    import('@/utils/phone-validator').then(async ({ getPhoneValidationError, translatePhoneError }) => {
      const errorKey = getPhoneValidationError(formData.phoneNumber);
      if (errorKey) {
        setPhoneValidationStatus('invalid');
        setPhoneErrorMessage(translatePhoneError(errorKey, t));
        return;
      }

      // Format valide, indiquer qu'on vérifie la disponibilité
      setPhoneValidationStatus('checking');
      setPhoneErrorMessage('');

      // Debounce: attendre 2 secondes avant de lancer la vérification
      phoneCheckTimeout.current = setTimeout(async () => {
        try {
          const response = await fetch(
            buildApiUrl(`/auth/check-availability?phone=${encodeURIComponent(formData.phoneNumber.trim())}`)
          );

          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              if (result.data?.phoneAvailable) {
                setPhoneValidationStatus('valid');
                setPhoneErrorMessage('');
              } else {
                setPhoneValidationStatus('taken');
                setPhoneErrorMessage(t('register.errors.phoneExists'));
              }
            } else {
              setPhoneValidationStatus('valid');
              setPhoneErrorMessage('');
            }
          } else {
            setPhoneValidationStatus('valid');
            setPhoneErrorMessage('');
          }
        } catch (error) {
          console.error('Erreur vérification téléphone:', error);
          setPhoneValidationStatus('valid');
          setPhoneErrorMessage('');
        }
      }, AVAILABILITY_CHECK_DEBOUNCE);
    });

    // Cleanup
    return () => {
      if (phoneCheckTimeout.current) {
        clearTimeout(phoneCheckTimeout.current);
      }
    };
  }, [formData.phoneNumber, disabled, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Bot protection validation
    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      toast.error(botError);
      return;
    }

    // Validation différente selon le mode
    if (linkId) {
      // Mode lien d'invitation - pas de username requis
      if (!formData.firstName.trim() || !formData.lastName.trim() ||
          !formData.email.trim() || !formData.password.trim()) {
        toast.error(t('register.fillRequiredFields'));
        return;
      }
    } else {
      // Mode inscription normale - username requis
      if (!formData.username.trim() || !formData.password.trim() ||
          !formData.firstName.trim() || !formData.lastName.trim() ||
          !formData.email.trim()) {
        toast.error(t('register.fillRequiredFields'));
        return;
      }

      // Validation du nom d'utilisateur
      if (!validateUsername(formData.username)) {
        toast.error(t('register.validation.usernameInvalid'));
        return;
      }
    }

    // Validation de l'email (pour les deux modes)
    if (!isValidEmail(formData.email)) {
      const errorMessage = getEmailValidationError(formData.email);
      toast.error(errorMessage || 'Format d\'email invalide');
      return;
    }

    // Validation du téléphone (obligatoire)
    if (!formData.phoneNumber.trim()) {
      toast.error(t('register.validation.phoneRequired'));
      return;
    }

    // Validation du format du téléphone
    const { validatePhoneNumber, translatePhoneError } = await import('@/utils/phone-validator');
    const phoneValidation = validatePhoneNumber(formData.phoneNumber);
    if (!phoneValidation.isValid) {
      const errorKey = phoneValidation.error || 'phoneInvalid';
      toast.error(translatePhoneError(errorKey, t));
      return;
    }

    setIsLoading(true);
    console.log('[REGISTER_FORM] Tentative d\'inscription pour:', formData.username || formData.email);

    try {
      // Générer un username sécurisé à partir de l'email en mode lien (uniquement lettres, chiffres, tirets et underscores)
      const emailUsername = formData.email.split('@')[0];
      const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9_-]/g, '_');

      // Récupérer le token d'affiliation depuis localStorage (peut venir de /join ou /signin/affiliate/[token])
      const affiliateToken = typeof window !== 'undefined'
        ? localStorage.getItem('meeshy_affiliate_token')
        : null;

      const requestBody = linkId ? {
        // Mode lien d'invitation
        username: cleanUsername,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phoneNumber: formData.phoneNumber,
        systemLanguage: formData.systemLanguage,
        regionalLanguage: formData.regionalLanguage,
        ...(affiliateToken && { affiliateToken }), // Ajouter le token d'affiliation si présent
      } : {
        // Mode inscription normale
        ...formData,
        ...(affiliateToken && { affiliateToken }), // Ajouter le token d'affiliation si présent
      };

      const apiUrl = buildApiUrl(API_ENDPOINTS.AUTH.REGISTER);
      console.log('[REGISTER_FORM] URL API:', apiUrl);

      // Logs pour débogage de l'affiliation
      if (affiliateToken) {
        console.log('[REGISTER_FORM] ✅ Token d\'affiliation détecté:', affiliateToken.substring(0, 10) + '...');
      } else {
        console.log('[REGISTER_FORM] ⚠️ Aucun token d\'affiliation trouvé dans localStorage');
      }

      console.log('[REGISTER_FORM] Request body (sans password):', {
        ...requestBody,
        password: '[HIDDEN]',
        affiliateToken: requestBody.affiliateToken ? requestBody.affiliateToken.substring(0, 10) + '...' : undefined
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[REGISTER_FORM] Réponse HTTP:', response.status, response.statusText);

      // Gérer les erreurs HTTP avec messages spécifiques
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.error || t('register.errors.registrationError');

        if (response.status === 400) {
          // Erreur de validation ou données existantes
          if (errorData.error) {
            if (errorData.error.includes('email') || errorData.error.includes('Email')) {
              errorMessage = t('register.errors.emailExists');
            } else if (errorData.error.includes('username') || errorData.error.includes('utilisateur')) {
              errorMessage = t('register.errors.usernameExists');
            } else if (errorData.error.includes('phone') || errorData.error.includes('téléphone')) {
              errorMessage = t('register.errors.phoneExists');
            } else {
              errorMessage = t('register.errors.invalidData');
            }
          }
          console.error('[REGISTER_FORM] Échec 400: Données invalides -', errorData.error);
        } else if (response.status === 500) {
          errorMessage = t('register.errors.serverError');
          console.error('[REGISTER_FORM] Échec 500: Erreur serveur');
        } else if (response.status >= 400) {
          errorMessage = t('register.errors.unknownError');
          console.error('[REGISTER_FORM] Échec', response.status, ':', response.statusText, errorData);
        }

        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      console.log('[REGISTER_FORM] Données reçues:', { success: data.success, hasToken: !!data.data?.token, hasUser: !!data.data?.user });

      if (linkId && onJoinSuccess) {
        // Mode lien d'invitation
        console.log('[REGISTER_FORM] ✅ Inscription via lien réussie');
        toast.success(t('register.success.registrationSuccess'));
        onJoinSuccess(data);
      } else {
        // Mode inscription normale
        if (data.success && data.data?.user && data.data?.token) {
          console.log('[REGISTER_FORM] ✅ Inscription réussie pour:', data.data.user.username);
          toast.success(t('register.success.registrationSuccess'));
          login(data.data.user, data.data.token);

          if (onSuccess) {
            onSuccess(data.data.user, data.data.token);
          } else {
            // Comportement par défaut : Recharger la page si on est sur "/" sinon rediriger
            const currentPath = window.location.pathname;

            console.log('[REGISTER_FORM] Redirection après inscription...');
            // Utiliser window.location.href pour forcer un rechargement complet
            // Cela garantit que l'état d'authentification est correctement chargé
            if (currentPath === '/') {
              console.log('[REGISTER_FORM] Rechargement de la page d\'accueil');
              window.location.reload();
            } else {
              console.log('[REGISTER_FORM] Redirection vers dashboard');
              window.location.href = '/dashboard';
            }
          }
        } else {
          const errorMsg = t('register.errors.registrationError');
          console.error('[REGISTER_FORM] ❌ Réponse invalide:', data);
          toast.error(errorMsg);
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error('[REGISTER_FORM] ❌ Erreur réseau ou exception:', error);
      const errorMsg = error instanceof Error
        ? `${t('register.errors.networkError')}: ${error.message}`
        : t('register.errors.networkError');
      toast.error(errorMsg);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col" autoComplete="off">
      {/* Honeypot field - invisible to humans, bots will fill it */}
      <input {...honeypotProps} />

      {/* Contenu des champs */}
      <div className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${formPrefix}-firstName`}>{t('register.firstNameLabel')}</Label>
            <Input
              id={`${formPrefix}-firstName`}
              type="text"
              placeholder={t('register.firstNamePlaceholder')}
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              disabled={isLoading || disabled}
              autoComplete="given-name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formPrefix}-lastName`}>{t('register.lastNameLabel')}</Label>
            <Input
              id={`${formPrefix}-lastName`}
              type="text"
              placeholder={t('register.lastNamePlaceholder')}
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              disabled={isLoading || disabled}
              autoComplete="family-name"
              required
            />
          </div>
        </div>

      {/* Champ username - seulement en mode inscription normale */}
      {!linkId && (
        <div className="space-y-2">
          <Label htmlFor={`${formPrefix}-username`}>{t('register.usernameLabel')}</Label>
          <div className="relative">
            <Input
              id={`${formPrefix}-username`}
              type="text"
              placeholder={t('register.usernamePlaceholder')}
              value={formData.username}
              onChange={(e) => {
                // Filtrer les caractères non autorisés en temps réel
                const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                // Limiter à 16 caractères maximum
                const limitedValue = value.slice(0, 16);
                setFormData({ ...formData, username: limitedValue });
              }}
              className={cn(
                "pr-10",
                usernameCheckStatus === 'available' && "border-green-500 focus-visible:ring-green-500",
                usernameCheckStatus === 'taken' && "border-red-500 focus-visible:ring-red-500"
              )}
              minLength={2}
              maxLength={16}
              disabled={isLoading || disabled}
              required
            />
            {/* Indicateur de statut */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
              {usernameCheckStatus === 'checking' && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              )}
              {usernameCheckStatus === 'available' && (
                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-green-500">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
              {usernameCheckStatus === 'taken' && (
                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500">
                  <X className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('register.usernameHelp')} (2-16 caractères)
          </p>
          {usernameCheckStatus === 'available' && (
            <p className="text-xs text-green-600 flex items-center gap-1" aria-live="polite">
              <Check className="h-3 w-3" aria-hidden="true" />
              Nom d'utilisateur disponible
            </p>
          )}
          {usernameCheckStatus === 'taken' && (
            <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
              <X className="h-3 w-3" aria-hidden="true" />
              Ce nom d'utilisateur est déjà pris
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${formPrefix}-email`}>{t('register.emailLabel')}</Label>
        <div className="relative">
          <Input
            id={`${formPrefix}-email`}
            type="email"
            placeholder={t('register.emailPlaceholder')}
            value={formData.email}
            onChange={(e) => handleEmailChangeWithSync(e.target.value)}
            onBlur={(e) => validateEmailField(e.target.value)}
            className={cn(
              "pr-10",
              emailValidationStatus === 'valid' && "border-green-500 focus-visible:ring-green-500",
              emailValidationStatus === 'invalid' && "border-red-500 focus-visible:ring-red-500"
            )}
            disabled={isLoading || disabled}
            autoComplete="email"
            spellCheck="false"
            required
          />
          {/* Indicateur de statut */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
            {emailValidationStatus === 'valid' && (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-green-500">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            {emailValidationStatus === 'invalid' && (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500">
                <AlertCircle className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        </div>
        {emailValidationStatus === 'valid' && (
          <p className="text-xs text-green-600 flex items-center gap-1" aria-live="polite">
            <Check className="h-3 w-3" aria-hidden="true" />
            Email valide
          </p>
        )}
        {emailValidationStatus === 'invalid' && emailErrorMessage && (
          <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {emailErrorMessage}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formPrefix}-phoneNumber`}>
          {t('register.phoneLabel')} <span className="text-red-500" aria-hidden="true">*</span>
        </Label>
        <div className="relative">
          <Input
            id={`${formPrefix}-phoneNumber`}
            type="tel"
            inputMode="tel"
            placeholder="+33612345678 ou 0033612345678"
            value={formData.phoneNumber}
            onChange={(e) => handlePhoneChangeWithSync(e.target.value)}
            onBlur={(e) => validatePhoneField(e.target.value)}
            className={cn(
              "pr-10",
              phoneValidationStatus === 'valid' && "border-green-500 focus-visible:ring-green-500",
              phoneValidationStatus === 'invalid' && "border-red-500 focus-visible:ring-red-500"
            )}
            minLength={8}
            maxLength={15}
            disabled={isLoading || disabled}
            autoComplete="tel"
            required
          />
          {/* Indicateur de statut */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
            {phoneValidationStatus === 'valid' && (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-green-500">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            {phoneValidationStatus === 'invalid' && (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500">
                <AlertCircle className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('register.validation.phoneHelp')}
        </p>
        {phoneValidationStatus === 'valid' && (
          <p className="text-xs text-green-600 flex items-center gap-1" aria-live="polite">
            <Check className="h-3 w-3" aria-hidden="true" />
            {t('register.validation.phoneValid')}
          </p>
        )}
        {phoneValidationStatus === 'invalid' && phoneErrorMessage && (
          <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {phoneErrorMessage}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formPrefix}-password`}>{t('register.passwordLabel')}</Label>
        <div className="relative">
          <Input
            id={`${formPrefix}-password`}
            type={showPassword ? 'text' : 'password'}
            placeholder={t('register.passwordPlaceholder')}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            disabled={isLoading || disabled}
            autoComplete="new-password"
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={showPassword ? t('register.hidePassword') : t('register.showPassword')}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="systemLanguage">{t('register.systemLanguageLabel')}</Label>
          <LanguageSelector
            value={formData.systemLanguage}
            onValueChange={(value) => setFormData({ ...formData, systemLanguage: value })}
            disabled={disabled}
            placeholder={t('register.systemLanguageLabel')}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('register.systemLanguageHelp')}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="regionalLanguage">{t('register.regionalLanguageLabel')}</Label>
          <LanguageSelector
            value={formData.regionalLanguage}
            onValueChange={(value) => setFormData({ ...formData, regionalLanguage: value })}
            disabled={disabled}
            placeholder={t('register.regionalLanguageLabel')}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('register.regionalLanguageHelp')}
          </p>
        </div>
      </div>

      {/* Bouton submit - avec padding bottom pour qu'il soit toujours visible */}
      <div className="sticky bottom-0 bg-white dark:bg-gray-950 pt-4 pb-6 mt-4 border-t">
        <Button 
          type="submit" 
          className="w-full" 
          disabled={isLoading || disabled}
        >
          {isLoading ? t('register.creating') : t('register.registerButton')}
        </Button>
        
        {/* Liens de navigation */}
        <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          <span>{t('register.hasAccount')} </span>
          <a 
            href="/login" 
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline"
          >
            {t('register.loginLink')}
          </a> -  <a
            href="/signup"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline"
          >
            {t('login.registerLink')}
          </a>
        </div>
      </div>
      </div>
    </form>
  );
}
