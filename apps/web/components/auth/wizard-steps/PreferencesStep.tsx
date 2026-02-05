'use client';

import { forwardRef } from 'react';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { LanguageSelector } from '@/components/translation/language-selector';
import { Checkbox } from '@/components/ui/checkbox';
import type { WizardFormData } from '@/hooks/use-registration-wizard';

interface PreferencesStepProps {
  formData: WizardFormData;
  acceptTerms: boolean;
  disabled?: boolean;
  onSystemLanguageChange: (value: string) => void;
  onRegionalLanguageChange: (value: string) => void;
  onAcceptTermsChange: (checked: boolean) => void;
}

export const PreferencesStep = forwardRef<HTMLDivElement, PreferencesStepProps>(({
  formData,
  acceptTerms,
  disabled,
  onSystemLanguageChange,
  onRegionalLanguageChange,
  onAcceptTermsChange,
}, ref) => {
  const { t } = useI18n('auth');

  return (
    <div className="space-y-4" ref={ref}>
      <div className="text-center">
        <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
          {t('register.wizard.preferencesTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.preferencesSubtitle')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {t('register.systemLanguageLabel')}
          </label>
          <LanguageSelector
            value={formData.systemLanguage}
            onValueChange={onSystemLanguageChange}
            disabled={disabled}
            placeholder={t('register.systemLanguageLabel')}
            className="h-10 w-full border-2 border-gray-200 dark:border-gray-700"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {t('register.regionalLanguageLabel')}
          </label>
          <LanguageSelector
            value={formData.regionalLanguage}
            onValueChange={onRegionalLanguageChange}
            disabled={disabled}
            placeholder={t('register.regionalLanguageLabel')}
            className="h-10 w-full border-2 border-gray-200 dark:border-gray-700"
          />
        </div>
      </div>

      {/* Terms and conditions checkbox - Required */}
      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="acceptTerms"
            checked={acceptTerms}
            onCheckedChange={(checked) => onAcceptTermsChange(checked as boolean)}
            disabled={disabled}
            className={cn(
              "mt-0.5",
              !acceptTerms && "border-amber-400"
            )}
          />
          <label htmlFor="acceptTerms" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
            {t('register.acceptTerms')}{' '}
            <a href="/terms" target="_blank" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
              {t('register.termsOfService')}
            </a>
            {' '}{t('register.and')}{' '}
            <a href="/privacy" target="_blank" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
              {t('register.privacyPolicy')}
            </a>
            <span className="text-red-500 ml-1">*</span>
          </label>
        </div>
        {!acceptTerms && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 ml-7">
            {t('register.wizard.acceptTermsRequired')}
          </p>
        )}
      </div>
    </div>
  );
});

PreferencesStep.displayName = 'PreferencesStep';
