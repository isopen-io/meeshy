'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import type { WizardFormData } from './use-registration-wizard';
import type { User } from '@/types';
import type { JoinConversationResponse } from '@/types/frontend';

export interface PhoneOwnerInfo {
  maskedDisplayName: string;
  maskedUsername: string;
  maskedEmail: string;
  avatarUrl?: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export interface PendingRegistration {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  systemLanguage?: string;
  regionalLanguage?: string;
}

interface UseRegistrationSubmitOptions {
  onSuccess?: (user: User, token: string) => void;
  linkId?: string;
  onJoinSuccess?: (userData: JoinConversationResponse) => void;
}

export function useRegistrationSubmit({
  onSuccess,
  linkId,
  onJoinSuccess,
}: UseRegistrationSubmitOptions) {
  const router = useRouter();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Phone transfer modal state
  const [showPhoneExistsModal, setShowPhoneExistsModal] = useState(false);
  const [phoneOwnerInfo, setPhoneOwnerInfo] = useState<PhoneOwnerInfo | null>(null);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);

  const performRegistration = useCallback(async (
    registrationData: WizardFormData & { phoneNumber: string },
    options?: { phoneTransferToken?: string }
  ): Promise<{
    success: boolean;
    user?: any;
    token?: string;
    error?: string;
    phoneOwnershipConflict?: boolean;
    phoneOwnerInfo?: PhoneOwnerInfo;
    pendingRegistration?: PendingRegistration;
  }> => {
    const affiliateToken = typeof window !== 'undefined'
      ? localStorage.getItem('meeshy_affiliate_token')
      : null;

    const body: any = { ...registrationData };

    if (affiliateToken) body.affiliateToken = affiliateToken;
    if (options?.phoneTransferToken) body.phoneTransferToken = options.phoneTransferToken;

    const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.REGISTER), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Registration failed' };
    }

    // Check for phone ownership conflict
    if (data.success && data.data?.phoneOwnershipConflict) {
      return {
        success: false,
        error: 'phone_ownership_conflict',
        phoneOwnershipConflict: true,
        phoneOwnerInfo: data.data.phoneOwnerInfo,
        pendingRegistration: data.data.pendingRegistration,
      };
    }

    if (data.success && data.data?.user && data.data?.token) {
      return { success: true, user: data.data.user, token: data.data.token };
    }

    return { success: false, error: 'Registration failed' };
  }, []);

  const completeRegistrationAndRedirect = useCallback(async (user: any, token: string) => {
    login(user, token);

    const affiliateToken = typeof window !== 'undefined'
      ? localStorage.getItem('meeshy_affiliate_token')
      : null;

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
      } catch (affiliateError) {
        console.error('[REGISTRATION] Affiliate registration error:', affiliateError);
      }
    }

    toast.success('Registration successful!');

    if (onSuccess) {
      onSuccess(user, token);
    } else if (linkId && onJoinSuccess) {
      onJoinSuccess({ user, token } as any);
    } else {
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 100);
    }
  }, [login, onSuccess, linkId, onJoinSuccess]);

  const handleContinueWithoutPhone = useCallback(async (
    formData: WizardFormData,
    registration: PendingRegistration
  ) => {
    setIsLoading(true);
    setShowPhoneExistsModal(false);

    try {
      const registrationWithoutPhone = {
        ...formData,
        phoneNumber: '',
      };

      const result = await performRegistration(registrationWithoutPhone);

      if (!result.success) {
        toast.error(result.error || 'Registration failed');
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);
    } catch (error) {
      console.error('[REGISTRATION] Error without phone:', error);
      toast.error('Registration failed');
      setIsLoading(false);
    }
  }, [performRegistration, completeRegistrationAndRedirect]);

  const handlePhoneTransferred = useCallback(async (
    formData: WizardFormData,
    fullPhoneNumber: string,
    registration: PendingRegistration,
    phoneTransferToken: string
  ) => {
    setIsLoading(true);
    setShowPhoneExistsModal(false);

    try {
      if (!phoneTransferToken) {
        await handleContinueWithoutPhone(formData, registration);
        return;
      }

      const registrationWithTransfer = {
        ...formData,
        phoneNumber: fullPhoneNumber,
      };

      const result = await performRegistration(registrationWithTransfer, {
        phoneTransferToken,
      });

      if (!result.success) {
        toast.error(result.error || 'Registration failed');
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);
    } catch (error) {
      console.error('[REGISTRATION] Error with phone transfer:', error);
      toast.error('Registration failed');
      setIsLoading(false);
    }
  }, [performRegistration, completeRegistrationAndRedirect, handleContinueWithoutPhone]);

  const handleSubmit = useCallback(async (
    formData: WizardFormData,
    fullPhoneNumber: string,
    options: {
      validatePhoneField: (phone: string) => Promise<boolean>;
      validateSubmission: () => { isHuman: boolean; botError: string };
      confirmPassword: string;
      acceptTerms: boolean;
    }
  ) => {
    const { validatePhoneField, validateSubmission, confirmPassword, acceptTerms } = options;

    const { isHuman, botError } = validateSubmission();
    if (!isHuman) {
      toast.error(botError);
      return;
    }

    if (formData.password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!acceptTerms) {
      toast.error('You must accept the terms and conditions');
      return;
    }

    if (fullPhoneNumber) {
      const phoneOk = await validatePhoneField(fullPhoneNumber);
      if (!phoneOk) return;
    }

    setIsLoading(true);

    try {
      const emailUsername = formData.email.split('@')[0];
      const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9_-]/g, '_');

      const requestBody = linkId ? {
        username: cleanUsername,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phoneNumber: fullPhoneNumber,
        systemLanguage: formData.systemLanguage,
        regionalLanguage: formData.regionalLanguage,
      } : {
        ...formData,
        phoneNumber: fullPhoneNumber,
      };

      const result = await performRegistration(requestBody as any);

      // Handle phone ownership conflict
      if (result.error === 'phone_ownership_conflict' && result.phoneOwnerInfo) {
        setPhoneOwnerInfo(result.phoneOwnerInfo);
        setPendingRegistration(result.pendingRegistration || {
          username: formData.username,
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          password: formData.password,
          systemLanguage: formData.systemLanguage,
          regionalLanguage: formData.regionalLanguage,
        });
        setShowPhoneExistsModal(true);
        setIsLoading(false);
        return;
      }

      if (!result.success) {
        let errorMessage = result.error || 'Registration failed';

        if (result.error) {
          if (result.error.includes('email') || result.error.includes('Email')) {
            errorMessage = 'Email already exists';
          } else if (result.error.includes('username')) {
            errorMessage = 'Username already exists';
          } else if (result.error.includes('phone')) {
            errorMessage = 'Phone number already exists';
          }
        }

        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      await completeRegistrationAndRedirect(result.user!, result.token!);
    } catch (error) {
      toast.error('Network error occurred');
      setIsLoading(false);
    }
  }, [linkId, performRegistration, completeRegistrationAndRedirect]);

  return {
    isLoading,
    showPhoneExistsModal,
    phoneOwnerInfo,
    pendingRegistration,
    setShowPhoneExistsModal,
    handleSubmit,
    handleContinueWithoutPhone,
    handlePhoneTransferred,
  };
}
