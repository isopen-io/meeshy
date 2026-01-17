'use client';

import { lazy, Suspense } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useRegisterForm } from '@/hooks/use-register-form';
import type { User } from '@/types';
import type { JoinConversationResponse } from '@/types/frontend';

// Lazy load form steps for better code splitting
const PersonalInfoStep = lazy(() => import('./PersonalInfoStep').then(m => ({ default: m.PersonalInfoStep })));
const UsernameField = lazy(() => import('./UsernameField').then(m => ({ default: m.UsernameField })));
const EmailField = lazy(() => import('./EmailField').then(m => ({ default: m.EmailField })));
const PhoneField = lazy(() => import('./PhoneField').then(m => ({ default: m.PhoneField })));
const PasswordField = lazy(() => import('./PasswordField').then(m => ({ default: m.PasswordField })));
const LanguageSelectorField = lazy(() => import('./LanguageSelector').then(m => ({ default: m.LanguageSelectorField })));
const FormFooter = lazy(() => import('./FormFooter').then(m => ({ default: m.FormFooter })));

interface RegisterFormProps {
  onSuccess?: (user: User, token: string) => void;
  disabled?: boolean;
  linkId?: string;
  onJoinSuccess?: (userData: JoinConversationResponse) => void;
  formPrefix?: string;
}

function LoadingFallback() {
  return <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded" />;
}

export function RegisterForm({
  onSuccess,
  disabled = false,
  linkId,
  onJoinSuccess,
  formPrefix = 'register'
}: RegisterFormProps) {
  const { t } = useI18n('auth');
  const {
    formData,
    updateFormData,
    isLoading,
    honeypotProps,
    handleSubmit,
  } = useRegisterForm({ onSuccess, linkId, onJoinSuccess });

  return (
    <form onSubmit={handleSubmit} className="flex flex-col" autoComplete="off">
      <input {...honeypotProps} />

      <div className="space-y-4 py-4">
        <Suspense fallback={<LoadingFallback />}>
          <PersonalInfoStep
            formData={formData}
            onUpdate={updateFormData}
            disabled={isLoading || disabled}
            formPrefix={formPrefix}
            t={t}
          />
        </Suspense>

        {!linkId && (
          <Suspense fallback={<LoadingFallback />}>
            <UsernameField
              value={formData.username}
              onChange={(value) => updateFormData({ username: value })}
              disabled={isLoading || disabled}
              formPrefix={formPrefix}
              t={t}
            />
          </Suspense>
        )}

        <Suspense fallback={<LoadingFallback />}>
          <EmailField
            value={formData.email}
            onChange={(value) => updateFormData({ email: value })}
            disabled={isLoading || disabled}
            formPrefix={formPrefix}
            t={t}
          />
        </Suspense>

        <Suspense fallback={<LoadingFallback />}>
          <PhoneField
            value={formData.phoneNumber}
            onChange={(value) => updateFormData({ phoneNumber: value })}
            disabled={isLoading || disabled}
            formPrefix={formPrefix}
            t={t}
          />
        </Suspense>

        <Suspense fallback={<LoadingFallback />}>
          <PasswordField
            id={`${formPrefix}-password`}
            label={t('register.passwordLabel')}
            value={formData.password}
            onChange={(value) => updateFormData({ password: value })}
            placeholder={t('register.passwordPlaceholder')}
            disabled={isLoading || disabled}
            required
            showPasswordLabel={t('register.showPassword')}
            hidePasswordLabel={t('register.hidePassword')}
          />
        </Suspense>

        <Suspense fallback={<LoadingFallback />}>
          <LanguageSelectorField
            systemLanguage={formData.systemLanguage}
            regionalLanguage={formData.regionalLanguage}
            onSystemLanguageChange={(value) => updateFormData({ systemLanguage: value })}
            onRegionalLanguageChange={(value) => updateFormData({ regionalLanguage: value })}
            disabled={disabled}
            t={t}
          />
        </Suspense>

        <Suspense fallback={<LoadingFallback />}>
          <FormFooter
            isLoading={isLoading}
            disabled={disabled}
            t={t}
          />
        </Suspense>
      </div>
    </form>
  );
}
