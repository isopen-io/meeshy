'use client';

import { FormField } from './FormField';
import { useFieldValidation } from '@/hooks/use-field-validation';
import { useAuthFormStore } from '@/stores/auth-form-store';
import type { TFunction } from '@/hooks/useI18n';

interface UsernameFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  formPrefix: string;
  t: TFunction;
}

export function UsernameField({
  value,
  onChange,
  disabled,
  formPrefix,
  t,
}: UsernameFieldProps) {
  const { status, errorMessage } = useFieldValidation({
    value,
    disabled,
    t,
    type: 'username',
  });

  const handleChange = (newValue: string) => {
    const filtered = newValue.replace(/[^a-zA-Z0-9_-]/g, '');
    const limited = filtered.slice(0, 16);
    onChange(limited);
  };

  return (
    <FormField
      id={`${formPrefix}-username`}
      label={t('register.usernameLabel')}
      type="text"
      value={value}
      onChange={handleChange}
      placeholder={t('register.usernamePlaceholder')}
      disabled={disabled}
      required
      minLength={2}
      maxLength={16}
      validationStatus={status}
      errorMessage={status === 'taken' ? 'Ce nom d\'utilisateur est déjà pris' : undefined}
      successMessage={status === 'available' ? 'Nom d\'utilisateur disponible' : undefined}
      helpText={`${t('register.usernameHelp')} (2-16 caractères)`}
    />
  );
}
