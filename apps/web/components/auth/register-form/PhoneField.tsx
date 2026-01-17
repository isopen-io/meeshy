'use client';

import { FormField } from './FormField';
import { useFieldValidation } from '@/hooks/use-field-validation';
import { useAuthFormStore } from '@/stores/auth-form-store';
import type { TFunction } from '@/hooks/useI18n';

interface PhoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  formPrefix: string;
  t: TFunction;
}

export function PhoneField({
  value,
  onChange,
  disabled,
  formPrefix,
  t,
}: PhoneFieldProps) {
  const { setIdentifier } = useAuthFormStore();
  const { status, errorMessage, validate } = useFieldValidation({
    value,
    disabled,
    t,
    type: 'phone',
  });

  const handleChange = async (newValue: string) => {
    const { formatPhoneNumberInput } = await import('@/utils/phone-validator');
    const formatted = formatPhoneNumberInput(newValue);
    onChange(formatted);
    if (/^\+?\d/.test(formatted)) {
      setIdentifier(formatted);
    }
  };

  return (
    <FormField
      id={`${formPrefix}-phoneNumber`}
      label={t('register.phoneLabel')}
      type="tel"
      inputMode="tel"
      value={value}
      onChange={handleChange}
      onBlur={validate}
      placeholder="+33612345678 ou 0033612345678"
      disabled={disabled}
      required
      autoComplete="tel"
      minLength={8}
      maxLength={15}
      validationStatus={status}
      errorMessage={errorMessage}
      successMessage={status === 'valid' ? t('register.validation.phoneValid') : undefined}
      helpText={t('register.validation.phoneHelp')}
    />
  );
}
