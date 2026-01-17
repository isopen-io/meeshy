'use client';

import { FormField } from './FormField';
import { useFieldValidation } from '@/hooks/use-field-validation';
import { useAuthFormStore } from '@/stores/auth-form-store';
import type { TFunction } from '@/hooks/useI18n';

interface EmailFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  formPrefix: string;
  t: TFunction;
}

export function EmailField({
  value,
  onChange,
  disabled,
  formPrefix,
  t,
}: EmailFieldProps) {
  const { setIdentifier } = useAuthFormStore();
  const { status, errorMessage, validate } = useFieldValidation({
    value,
    disabled,
    t,
    type: 'email',
  });

  const handleChange = (newValue: string) => {
    const cleanValue = newValue.replace(/\s/g, '');
    onChange(cleanValue);
    if (cleanValue.includes('@')) {
      setIdentifier(cleanValue);
    }
  };

  return (
    <FormField
      id={`${formPrefix}-email`}
      label={t('register.emailLabel')}
      type="email"
      inputMode="email"
      value={value}
      onChange={handleChange}
      onBlur={validate}
      placeholder={t('register.emailPlaceholder')}
      disabled={disabled}
      required
      autoComplete="email"
      spellCheck={false}
      validationStatus={status}
      errorMessage={errorMessage}
      successMessage={status === 'valid' ? 'Email valide' : undefined}
    />
  );
}
