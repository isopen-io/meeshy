'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { LanguageSelect } from '@/components/ui/language-select';
import { UserPlus, Mail, Phone, Globe, User, Lock } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { SUPPORTED_LANGUAGES } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { LargeLogo } from '@/components/branding';
import { authManager } from '@/services/auth-manager.service';
import { PhoneExistsModal } from '@/components/auth/PhoneExistsModal';

// Types for the phone ownership conflict response
interface PhoneOwnerInfo {
  maskedDisplayName: string;
  maskedUsername: string;
  maskedEmail: string;
  avatarUrl?: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

interface PendingRegistration {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  systemLanguage?: string;
  regionalLanguage?: string;
}

function SigninPageContent({ affiliateToken: propAffiliateToken }: { affiliateToken?: string } = {}) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [affiliateData, setAffiliateData] = useState<{
    isValid: boolean;
    token: any;
    affiliateUser: any;
  } | null>(null);
  const [isValidatingAffiliate, setIsValidatingAffiliate] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  // Phone ownership conflict modal state (account NOT created yet)
  const [showPhoneExistsModal, setShowPhoneExistsModal] = useState(false);
  const [phoneOwnerInfo, setPhoneOwnerInfo] = useState<PhoneOwnerInfo | null>(null);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n('auth');

  const returnUrl = searchParams.get('returnUrl');
  const urlAffiliateToken = searchParams.get('affiliate');
  const [affiliateToken, setAffiliateToken] = useState<string | null>(null);

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        setIsCheckingSession(true);
        const authToken = authManager.getAuthToken();
        const anonymousSession = authManager.getAnonymousSession();

        if (authToken || (anonymousSession && anonymousSession.token)) {
          const response = await fetch(buildApiUrl('/auth/me'), {
            headers: {
              'Authorization': `Bearer ${authToken || anonymousSession?.token}`
            }
          });

          if (response.ok) {
            if (anonymousSession) {
              const shareLinkId = localStorage.getItem('anonymous_current_share_link') ||
                                 localStorage.getItem('anonymous_current_link_id');
              if (shareLinkId) {
                window.location.href = `/chat/${shareLinkId}`;
                return;
              }
            }
            window.location.href = returnUrl || '/dashboard';
            return;
          } else {
            authManager.clearAllSessions();
          }
        }
      } catch (error) {
        console.error('[SIGNIN_PAGE] Erreur vérification session:', error);
        authManager.clearAllSessions();
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, []);

  useEffect(() => {
    if (urlAffiliateToken) {
      localStorage.setItem('meeshy_affiliate_token', urlAffiliateToken);
      document.cookie = `meeshy_affiliate_token=${urlAffiliateToken}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax`;
      setAffiliateToken(urlAffiliateToken);
      validateAffiliateToken(urlAffiliateToken);
      return;
    }

    const storedToken = localStorage.getItem('meeshy_affiliate_token');
    if (storedToken) {
      setAffiliateToken(storedToken);
      validateAffiliateToken(storedToken);
    }
  }, [urlAffiliateToken]);

  const validateAffiliateToken = async (token: string) => {
    try {
      setIsValidatingAffiliate(true);
      const response = await fetch(buildApiUrl(`/affiliate/validate/${token}`));

      if (response.ok) {
        const data = await response.json();
        setAffiliateData(data.data);
      } else {
        setAffiliateData({ isValid: false, token: null, affiliateUser: null });
      }
    } catch (error) {
      setAffiliateData({ isValid: false, token: null, affiliateUser: null });
    } finally {
      setIsValidatingAffiliate(false);
    }
  };

  const validateUsername = (username: string) => {
    if (username.length < 4) return false;
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    return usernameRegex.test(username);
  };

  const checkUsernameAvailability = async (username: string) => {
    if (!username || username.length < 4) {
      setUsernameAvailable(null);
      return;
    }

    setIsCheckingUsername(true);
    try {
      const response = await fetch(buildApiUrl(`/auth/check-availability?username=${encodeURIComponent(username)}`));
      if (response.ok) {
        const data = await response.json();
        setUsernameAvailable(data.data.usernameAvailable);
      } else {
        setUsernameAvailable(null);
      }
    } catch (error) {
      setUsernameAvailable(null);
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const checkEmailAvailability = async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailAvailable(null);
      return;
    }

    setIsCheckingEmail(true);
    try {
      const response = await fetch(buildApiUrl(`/auth/check-availability?email=${encodeURIComponent(email)}`));
      if (response.ok) {
        const data = await response.json();
        setEmailAvailable(data.data.emailAvailable);
      } else {
        setEmailAvailable(null);
      }
    } catch (error) {
      setEmailAvailable(null);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  useEffect(() => {
    if (!formData.username || formData.username.length < 4) {
      setUsernameAvailable(null);
      return;
    }

    if (!validateUsername(formData.username)) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(() => {
      checkUsernameAvailability(formData.username);
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.username]);

  useEffect(() => {
    if (!formData.email || !formData.email.includes('@')) {
      setEmailAvailable(null);
      return;
    }

    const timer = setTimeout(() => {
      checkEmailAvailability(formData.email);
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.email]);

  /**
   * Perform the actual registration API call
   * @param registrationData - The registration data to send
   * @param options - Optional: phoneTransferToken if transferring phone
   */
  const performRegistration = async (
    registrationData: typeof formData,
    options?: { phoneTransferToken?: string }
  ): Promise<{ success: boolean; user?: any; token?: string; error?: string }> => {
    const apiUrl = buildApiUrl(API_ENDPOINTS.AUTH.REGISTER);
    const body: any = { ...registrationData };

    // If we have a transfer token, include it
    if (options?.phoneTransferToken) {
      body.phoneTransferToken = options.phoneTransferToken;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Erreur lors de l\'inscription' };
    }

    // Check for phone ownership conflict (account NOT created)
    if (data.success && data.data?.phoneOwnershipConflict) {
      return {
        success: false,
        error: 'phone_ownership_conflict',
        ...data.data, // includes phoneOwnerInfo and pendingRegistration
      };
    }

    if (data.success && data.data?.user && data.data?.token) {
      return { success: true, user: data.data.user, token: data.data.token };
    }

    return { success: false, error: 'Erreur lors de l\'inscription' };
  };

  /**
   * Complete registration and redirect to dashboard
   */
  const completeRegistrationAndRedirect = async (user: any, token: string) => {
    authManager.setCredentials(user, token);

    if (affiliateToken) {
      try {
        await fetch(buildApiUrl('/affiliate/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: affiliateToken,
            referredUserId: user.id
          })
        });

        localStorage.removeItem('meeshy_affiliate_token');
        document.cookie = 'meeshy_affiliate_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      } catch (affiliateError) {
        console.error('[SIGNIN_PAGE] Erreur enregistrement affiliation:', affiliateError);
      }
    }

    toast.success(t('register.success.registrationSuccess'));
    const redirectUrl = returnUrl || '/dashboard';
    window.location.href = redirectUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username.trim() || !formData.email.trim() || !formData.password.trim() ||
        !confirmPassword.trim() || !formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error(t('register.fillRequiredFields'));
      return;
    }

    if (!validateUsername(formData.username)) {
      toast.error(t('register.validation.usernameInvalid'));
      return;
    }

    if (usernameAvailable === false) {
      toast.error(t('register.errors.usernameExists'));
      return;
    }

    if (emailAvailable === false) {
      toast.error(t('register.errors.emailExists'));
      return;
    }

    if (formData.password !== confirmPassword) {
      toast.error(t('register.validation.passwordMismatch'));
      return;
    }

    if (!acceptTerms) {
      toast.error(t('register.errors.acceptTermsRequired'));
      return;
    }

    setIsLoading(true);

    try {
      const result = await performRegistration(formData) as any;

      if (result.error === 'phone_ownership_conflict') {
        // Phone belongs to another account - show modal
        // Account was NOT created
        setPhoneOwnerInfo(result.phoneOwnerInfo);
        setPendingRegistration(result.pendingRegistration);
        setShowPhoneExistsModal(true);
        setIsLoading(false);
        return;
      }

      if (!result.success) {
        let errorMessage = result.error || t('register.errors.registrationError');

        if (result.error) {
          if (result.error.includes('email') || result.error.includes('Email')) {
            errorMessage = t('register.errors.emailExists');
          } else if (result.error.includes('username') || result.error.includes('utilisateur')) {
            errorMessage = t('register.errors.usernameExists');
          } else if (result.error.includes('phone') || result.error.includes('téléphone')) {
            errorMessage = t('register.errors.phoneExists');
          }
        }

        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      // Success - complete registration
      await completeRegistrationAndRedirect(result.user, result.token);

    } catch (error) {
      console.error('[SIGNIN_PAGE] Erreur:', error);
      const errorMsg = error instanceof Error
        ? `${t('register.errors.networkError')}: ${error.message}`
        : t('register.errors.networkError');
      toast.error(errorMsg);
      setIsLoading(false);
    }
  };

  /**
   * Handle "Continue without phone" from modal
   * Re-register without the phone number
   */
  const handleContinueWithoutPhone = async (registration: PendingRegistration) => {
    setIsLoading(true);
    setShowPhoneExistsModal(false);

    try {
      // Re-register WITHOUT the phone number
      const registrationWithoutPhone = {
        username: registration.username,
        password: registration.password,
        firstName: registration.firstName,
        lastName: registration.lastName,
        email: registration.email,
        phoneNumber: '', // Empty phone number
        systemLanguage: registration.systemLanguage || 'fr',
        regionalLanguage: registration.regionalLanguage || 'en',
      };

      const result = await performRegistration(registrationWithoutPhone);

      if (!result.success) {
        toast.error(result.error || t('register.errors.registrationError'));
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);

    } catch (error) {
      console.error('[SIGNIN_PAGE] Erreur lors de l\'inscription sans téléphone:', error);
      toast.error(t('register.errors.registrationError'));
      setIsLoading(false);
    }
  };

  /**
   * Handle "Phone transferred" from modal
   * Re-register WITH the phone transfer token
   */
  const handlePhoneTransferred = async (registration: PendingRegistration, phoneTransferToken: string) => {
    setIsLoading(true);
    setShowPhoneExistsModal(false);

    try {
      if (!phoneTransferToken) {
        // If no transfer token, register without phone
        console.warn('[SIGNIN_PAGE] No transfer token available, registering without phone');
        await handleContinueWithoutPhone(registration);
        return;
      }

      console.log('[SIGNIN_PAGE] Re-registering with phone transfer token');

      // Re-register WITH the phone transfer token
      const registrationWithTransfer = {
        username: registration.username,
        password: registration.password,
        firstName: registration.firstName,
        lastName: registration.lastName,
        email: registration.email,
        phoneNumber: phoneOwnerInfo?.phoneNumber || '',
        systemLanguage: registration.systemLanguage || 'fr',
        regionalLanguage: registration.regionalLanguage || 'en',
      };

      const result = await performRegistration(registrationWithTransfer, {
        phoneTransferToken,
      });

      if (!result.success) {
        toast.error(result.error || t('register.errors.registrationError'));
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);

    } catch (error) {
      console.error('[SIGNIN_PAGE] Erreur lors de l\'inscription avec transfert:', error);
      toast.error(t('register.errors.registrationError'));
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('register.checkingSession') || 'Vérification de session...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-4">
        {/* Header */}
        <div className="text-center">
          <LargeLogo href="/" />
          <p className="text-gray-600 dark:text-gray-400">{t('register.description')}</p>
        </div>

        {/* Formulaire d'inscription compact */}
        <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center justify-center space-x-2 text-xl">
              <UserPlus className="h-5 w-5 text-blue-600" />
              <span>{t('register.title')}</span>
            </CardTitle>
            <CardDescription className="text-sm">
              {t('register.formDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">

              {/* Nom d'utilisateur avec icône intégrée */}
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                    setFormData({ ...formData, username: value });
                  }}
                  placeholder="Pseudonyme (min. 4 caractères, lettres/chiffres/_/-)"
                  disabled={isLoading}
                  required
                  className="pl-10 h-11"
                />
                {isCheckingUsername && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">⏳</span>
                )}
                {usernameAvailable === false && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">❌</span>
                )}
                {usernameAvailable === true && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">✓</span>
                )}
              </div>

              {/* Mot de passe et confirmation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Mot de passe (min. 8 caractères)"
                    disabled={isLoading}
                    required
                    className="pl-10 h-11"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmer le mot de passe"
                    disabled={isLoading}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>

              {/* Nom et Prénom */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="Prénom"
                    disabled={isLoading}
                    required
                    className="pl-10 h-11"
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Nom"
                    disabled={isLoading}
                    required
                    className="pl-10 h-11"
                  />
                </div>
              </div>

              {/* Email et Téléphone - CÔTE À CÔTE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Email (nom@exemple.com)"
                    disabled={isLoading}
                    required
                    className="pl-10 h-11"
                  />
                  {isCheckingEmail && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">⏳</span>
                  )}
                  {emailAvailable === false && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">❌</span>
                  )}
                  {emailAvailable === true && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">✓</span>
                  )}
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="phoneNumber"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="Téléphone (ex: +33612345678)"
                    disabled={isLoading}
                    className="pl-10 h-11"
                  />
                </div>
              </div>

              {/* Langues système et régionale */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Globe className="h-4 w-4 text-gray-400" />
                    <span>Langue système</span>
                  </label>
                  <LanguageSelect
                    languages={SUPPORTED_LANGUAGES}
                    value={formData.systemLanguage}
                    onValueChange={(value) => setFormData({ ...formData, systemLanguage: value })}
                    placeholder="Sélectionner..."
                    disabled={isLoading}
                    className="pl-3"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Globe className="h-4 w-4 text-gray-400" />
                    <span>Langue régionale</span>
                  </label>
                  <LanguageSelect
                    languages={SUPPORTED_LANGUAGES}
                    value={formData.regionalLanguage}
                    onValueChange={(value) => setFormData({ ...formData, regionalLanguage: value })}
                    placeholder="Sélectionner..."
                    disabled={isLoading}
                    className="pl-3"
                  />
                </div>
              </div>

              {/* Acceptation des conditions - version compacte */}
              <div className="flex items-start space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Checkbox
                  id="acceptTerms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                  disabled={isLoading}
                  className="mt-0.5"
                />
                <label htmlFor="acceptTerms" className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer leading-tight">
                  J'accepte les{' '}
                  <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
                    conditions
                  </a>
                  {' et la '}
                  <a href="/privacy" target="_blank" className="text-blue-600 hover:underline">
                    politique de confidentialité
                  </a>
                </label>
              </div>

              {/* Bouton de soumission */}
              <Button
                type="submit"
                className="w-full h-11 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
                disabled={isLoading || !acceptTerms}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Création en cours...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <UserPlus className="h-5 w-5" />
                    <span>{t('register.registerButton')}</span>
                  </div>
                )}
              </Button>

              {/* Lien vers la connexion */}
              <div className="text-center pt-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('register.hasAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/login' + (returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''))}
                    className="text-blue-600 hover:text-blue-700 font-medium underline"
                  >
                    {t('register.loginLink')}
                  </button>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Phone Exists Modal - Account NOT yet created */}
      {phoneOwnerInfo && pendingRegistration && (
        <PhoneExistsModal
          isOpen={showPhoneExistsModal}
          onClose={() => setShowPhoneExistsModal(false)}
          phoneOwnerInfo={phoneOwnerInfo}
          pendingRegistration={pendingRegistration}
          onContinueWithoutPhone={handleContinueWithoutPhone}
          onPhoneTransferred={handlePhoneTransferred}
        />
      )}
    </div>
  );
}

export default function SigninPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Chargement...</p>
        </div>
      </div>
    }>
      <SigninPageContent />
    </Suspense>
  );
}
