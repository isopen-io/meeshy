'use client';

import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { WizardFormData } from '@/hooks/use-registration-wizard';

interface IdentityStepProps {
  formData: WizardFormData;
  disabled?: boolean;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
}

const inputBaseClass = "h-10 bg-white/70 dark:bg-gray-800/70 sm:bg-white/50 sm:dark:bg-gray-800/50 sm:backdrop-blur-sm border-2 transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0";

export const IdentityStep = forwardRef<HTMLInputElement, IdentityStepProps>(({
  formData,
  disabled,
  onFirstNameChange,
  onLastNameChange,
}, ref) => {
  const { t } = useI18n('auth');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400 bg-clip-text text-transparent">
          {t('register.wizard.identityTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.identitySubtitle')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('register.firstNameLabel')}</label>
          <Input
            ref={ref}
            type="text"
            placeholder={t('register.firstNamePlaceholder')}
            value={formData.firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            disabled={disabled}
            className={cn(inputBaseClass, "border-gray-200 dark:border-gray-700 focus:border-violet-500")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('register.lastNameLabel')}</label>
          <Input
            type="text"
            placeholder={t('register.lastNamePlaceholder')}
            value={formData.lastName}
            onChange={(e) => onLastNameChange(e.target.value)}
            disabled={disabled}
            className={cn(inputBaseClass, "border-gray-200 dark:border-gray-700 focus:border-violet-500")}
          />
        </div>
      </div>
    </div>
  );
});

IdentityStep.displayName = 'IdentityStep';
