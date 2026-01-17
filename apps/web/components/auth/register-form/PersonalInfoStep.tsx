'use client';

import { FormField } from './FormField';
import type { RegisterFormData } from '@/hooks/use-register-form';
import type { TFunction } from '@/hooks/useI18n';

interface PersonalInfoStepProps {
  formData: RegisterFormData;
  onUpdate: (updates: Partial<RegisterFormData>) => void;
  disabled?: boolean;
  formPrefix: string;
  t: TFunction;
}

export function PersonalInfoStep({
  formData,
  onUpdate,
  disabled,
  formPrefix,
  t,
}: PersonalInfoStepProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField
        id={`${formPrefix}-firstName`}
        label={t('register.firstNameLabel')}
        type="text"
        value={formData.firstName}
        onChange={(value) => onUpdate({ firstName: value })}
        placeholder={t('register.firstNamePlaceholder')}
        disabled={disabled}
        required
        autoComplete="given-name"
        showIcon={false}
      />

      <FormField
        id={`${formPrefix}-lastName`}
        label={t('register.lastNameLabel')}
        type="text"
        value={formData.lastName}
        onChange={(value) => onUpdate({ lastName: value })}
        placeholder={t('register.lastNamePlaceholder')}
        disabled={disabled}
        required
        autoComplete="family-name"
        showIcon={false}
      />
    </div>
  );
}
