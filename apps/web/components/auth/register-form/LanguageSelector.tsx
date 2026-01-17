'use client';

import { Label } from '@/components/ui/label';
import { LanguageSelector as BaseLanguageSelector } from '@/components/translation/language-selector';
import type { TFunction } from '@/hooks/useI18n';

interface LanguageSelectorFieldProps {
  systemLanguage: string;
  regionalLanguage: string;
  onSystemLanguageChange: (value: string) => void;
  onRegionalLanguageChange: (value: string) => void;
  disabled?: boolean;
  t: TFunction;
}

export function LanguageSelectorField({
  systemLanguage,
  regionalLanguage,
  onSystemLanguageChange,
  onRegionalLanguageChange,
  disabled,
  t,
}: LanguageSelectorFieldProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="systemLanguage">{t('register.systemLanguageLabel')}</Label>
        <BaseLanguageSelector
          value={systemLanguage}
          onValueChange={onSystemLanguageChange}
          disabled={disabled}
          placeholder={t('register.systemLanguageLabel')}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('register.systemLanguageHelp')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="regionalLanguage">{t('register.regionalLanguageLabel')}</Label>
        <BaseLanguageSelector
          value={regionalLanguage}
          onValueChange={onRegionalLanguageChange}
          disabled={disabled}
          placeholder={t('register.regionalLanguageLabel')}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('register.regionalLanguageHelp')}
        </p>
      </div>
    </div>
  );
}
