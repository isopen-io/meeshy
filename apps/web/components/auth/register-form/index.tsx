'use client';

import { useI18n } from '@/hooks/useI18n';
import { useRegisterForm } from '@/hooks/use-register-form';
import type { User } from '@/types';
import type { JoinConversationResponse } from '@/types/frontend';

// Import directs au lieu de lazy loading pour éviter la boucle infinie
import { PersonalInfoStep } from './PersonalInfoStep';
import { UsernameField } from './UsernameField';
import { EmailField } from './EmailField';
import { PhoneField } from './PhoneField';
import { PasswordField } from './PasswordField';
import { LanguageSelectorField } from './LanguageSelector';
import { FormFooter } from './FormFooter';

interface RegisterFormProps {
  onSuccess?: (user: User, token: string) => void;
  disabled?: boolean;
  linkId?: string;
  onJoinSuccess?: (userData: JoinConversationResponse) => void;
  formPrefix?: string;
}

export function RegisterForm({
  onSuccess,
  disabled = false,
  linkId,
  onJoinSuccess,
  formPrefix = 'register'
}: RegisterFormProps) {
  console.log('[RegisterForm] Component render', { linkId, formPrefix });
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
        <PersonalInfoStep
          formData={formData}
          onUpdate={updateFormData}
          disabled={isLoading || disabled}
          formPrefix={formPrefix}
          t={t}
        />

        {!linkId && (
          <UsernameField
            value={formData.username}
            onChange={(value) => updateFormData({ username: value })}
            disabled={isLoading || disabled}
            formPrefix={formPrefix}
            t={t}
          />
        )}

        <EmailField
          value={formData.email}
          onChange={(value) => updateFormData({ email: value })}
          disabled={isLoading || disabled}
          formPrefix={formPrefix}
          t={t}
        />

        <PhoneField
          value={formData.phoneNumber}
          onChange={(value) => updateFormData({ phoneNumber: value })}
          disabled={isLoading || disabled}
          formPrefix={formPrefix}
          t={t}
        />

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

        <LanguageSelectorField
          systemLanguage={formData.systemLanguage}
          regionalLanguage={formData.regionalLanguage}
          onSystemLanguageChange={(value) => updateFormData({ systemLanguage: value })}
          onRegionalLanguageChange={(value) => updateFormData({ regionalLanguage: value })}
          disabled={disabled}
          t={t}
        />

        <FormFooter
          isLoading={isLoading}
          disabled={disabled}
          t={t}
        />
      </div>
    </form>
  );
}
