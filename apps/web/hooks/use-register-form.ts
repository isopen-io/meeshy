'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/hooks/useI18n';
import { useBotProtection } from '@/hooks/use-bot-protection';
import { useAuthFormStore } from '@/stores/auth-form-store';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { isValidEmail, getEmailValidationError } from '@meeshy/shared/utils/email-validator';
import type { User } from '@/types';
import type { JoinConversationResponse } from '@/types/frontend';

export interface RegisterFormData {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  systemLanguage: string;
  regionalLanguage: string;
}

interface UseRegisterFormProps {
  onSuccess?: (user: User, token: string) => void;
  linkId?: string;
  onJoinSuccess?: (userData: JoinConversationResponse) => void;
}

export function useRegisterForm({ onSuccess, linkId, onJoinSuccess }: UseRegisterFormProps = {}) {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n('auth');
  const { identifier: sharedIdentifier } = useAuthFormStore();

  // Initialize form data with shared identifier
  const getInitialEmail = () => {
    if (sharedIdentifier && sharedIdentifier.includes('@')) return sharedIdentifier;
    return '';
  };

  const getInitialPhone = () => {
    if (sharedIdentifier && !sharedIdentifier.includes('@') && /^\+?\d/.test(sharedIdentifier)) {
      return sharedIdentifier;
    }
    return '';
  };

  const [formData, setFormData] = useState<RegisterFormData>({
    username: '',
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

  const { honeypotProps, validateSubmission } = useBotProtection({
    minSubmitTime: 3000,
  });

  const updateFormData = useCallback((updates: Partial<RegisterFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  const validateForm = useCallback(async () => {
    // Bot protection
    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      toast.error(botError);
      return false;
    }

    // Required fields validation
    if (linkId) {
      if (!formData.firstName.trim() || !formData.lastName.trim() ||
          !formData.email.trim() || !formData.password.trim()) {
        toast.error(t('register.fillRequiredFields'));
        return false;
      }
    } else {
      if (!formData.username.trim() || !formData.password.trim() ||
          !formData.firstName.trim() || !formData.lastName.trim() ||
          !formData.email.trim()) {
        toast.error(t('register.fillRequiredFields'));
        return false;
      }

      // Username validation
      if (!validateUsername(formData.username)) {
        toast.error(t('register.validation.usernameInvalid'));
        return false;
      }
    }

    // Email validation
    if (!isValidEmail(formData.email)) {
      const errorMessage = getEmailValidationError(formData.email);
      toast.error(errorMessage || 'Format d\'email invalide');
      return false;
    }

    // Phone validation
    if (!formData.phoneNumber.trim()) {
      toast.error(t('register.validation.phoneRequired'));
      return false;
    }

    const { validatePhoneNumber, translatePhoneError } = await import('@/utils/phone-validator');
    const phoneValidation = validatePhoneNumber(formData.phoneNumber);
    if (!phoneValidation.isValid) {
      const errorKey = phoneValidation.error || 'phoneInvalid';
      toast.error(translatePhoneError(errorKey, t));
      return false;
    }

    return true;
  }, [formData, linkId, t, validateSubmission]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!await validateForm()) {
      return;
    }

    setIsLoading(true);
    console.log('[REGISTER_FORM] Tentative d\'inscription pour:', formData.username || formData.email);

    try {
      const emailUsername = formData.email.split('@')[0];
      const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9_-]/g, '_');

      const affiliateToken = typeof window !== 'undefined'
        ? localStorage.getItem('meeshy_affiliate_token')
        : null;

      const requestBody = linkId ? {
        username: cleanUsername,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phoneNumber: formData.phoneNumber,
        systemLanguage: formData.systemLanguage,
        regionalLanguage: formData.regionalLanguage,
        ...(affiliateToken && { affiliateToken }),
      } : {
        ...formData,
        ...(affiliateToken && { affiliateToken }),
      };

      const apiUrl = buildApiUrl(API_ENDPOINTS.AUTH.REGISTER);
      console.log('[REGISTER_FORM] URL API:', apiUrl);

      if (affiliateToken) {
        console.log('[REGISTER_FORM] ✅ Token d\'affiliation détecté:', affiliateToken.substring(0, 10) + '...');
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log('[REGISTER_FORM] Réponse HTTP:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.error || t('register.errors.registrationError');

        if (response.status === 400) {
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
        console.log('[REGISTER_FORM] ✅ Inscription via lien réussie');
        toast.success(t('register.success.registrationSuccess'));
        onJoinSuccess(data);
      } else {
        if (data.success && data.data?.user && data.data?.token) {
          console.log('[REGISTER_FORM] ✅ Inscription réussie pour:', data.data.user.username);
          toast.success(t('register.success.registrationSuccess'));
          login(data.data.user, data.data.token);

          if (onSuccess) {
            onSuccess(data.data.user, data.data.token);
          } else {
            const currentPath = window.location.pathname;
            console.log('[REGISTER_FORM] Redirection après inscription...');

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
  }, [formData, linkId, validateForm, login, onSuccess, onJoinSuccess, t]);

  return {
    formData,
    updateFormData,
    isLoading,
    showPassword,
    togglePasswordVisibility,
    honeypotProps,
    handleSubmit,
  };
}

export function validateUsername(username: string): boolean {
  if (username.length < 2 || username.length > 16) {
    return false;
  }
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  return usernameRegex.test(username);
}
