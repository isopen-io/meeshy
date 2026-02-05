'use client';

import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Check, AlertCircle, Mail, Phone, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { COUNTRY_CODES } from '@/constants/countries';
import type { WizardFormData } from '@/hooks/use-registration-wizard';
import type { ValidationStatus } from '@/hooks/use-registration-validation';

interface ContactStepProps {
  formData: WizardFormData;
  emailValidationStatus: ValidationStatus;
  emailErrorMessage: string;
  phoneValidationStatus: ValidationStatus;
  phoneErrorMessage: string;
  selectedCountry: typeof COUNTRY_CODES[0];
  disabled?: boolean;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onPhoneBlur?: () => void;
  onCountryChange: (country: typeof COUNTRY_CODES[0]) => void;
}

const inputBaseClass = "h-10 bg-white/70 dark:bg-gray-800/70 sm:bg-white/50 sm:dark:bg-gray-800/50 sm:backdrop-blur-sm border-2 transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0";

export const ContactStep = forwardRef<HTMLInputElement, ContactStepProps>(({
  formData,
  emailValidationStatus,
  emailErrorMessage,
  phoneValidationStatus,
  phoneErrorMessage,
  selectedCountry,
  disabled,
  onEmailChange,
  onPhoneChange,
  onPhoneBlur,
  onCountryChange,
}, ref) => {
  const { t } = useI18n('auth');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
          {t('register.wizard.contactTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.contactSubtitle')}</p>
      </div>

      <div className="space-y-3">
        {/* Email */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            {t('register.emailLabel')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Input
              ref={ref}
              type="email"
              placeholder={t('register.emailPlaceholder')}
              value={formData.email}
              onChange={(e) => onEmailChange(e.target.value)}
              disabled={disabled}
              className={cn(
                inputBaseClass,
                "pr-10",
                emailValidationStatus === 'valid' && "border-green-500 focus:border-green-500",
                emailValidationStatus === 'invalid' && "border-red-500 focus:border-red-500",
                emailValidationStatus === 'exists' && "border-amber-500 focus:border-amber-500",
                emailValidationStatus === 'idle' && "border-gray-200 dark:border-gray-700 focus:border-cyan-500"
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {emailValidationStatus === 'valid' && <Check className="w-4 h-4 text-green-500" />}
              {emailValidationStatus === 'invalid' && <AlertCircle className="w-4 h-4 text-red-500" />}
              {emailValidationStatus === 'exists' && <UserIcon className="w-4 h-4 text-amber-500" />}
            </div>
          </div>
          {emailValidationStatus === 'invalid' && emailErrorMessage && (
            <p className="text-xs text-red-500">{emailErrorMessage}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            {t('register.phoneLabel')}
          </label>
          <div className="flex gap-2">
            {/* Country code selector */}
            <select
              value={selectedCountry.code}
              onChange={(e) => {
                const country = COUNTRY_CODES.find((c) => c.code === e.target.value);
                if (country) onCountryChange(country);
              }}
              disabled={disabled}
              className={cn(
                "w-[90px] px-2 py-2 rounded-md text-sm border-2 bg-white/70 dark:bg-gray-800/70 sm:bg-white/50 sm:dark:bg-gray-800/50 sm:backdrop-blur-sm",
                "text-gray-900 dark:text-gray-100",
                "focus:outline-none focus:ring-0 focus:ring-offset-0",
                "border-gray-200 dark:border-gray-700 focus:border-cyan-500"
              )}
            >
              {COUNTRY_CODES.map((country) => (
                <option
                  key={country.code}
                  value={country.code}
                  className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {country.flag} {country.dial}
                </option>
              ))}
            </select>
            {/* Phone number input */}
            <div className="relative flex-1">
              <Input
                type="tel"
                inputMode="tel"
                placeholder="6 12 34 56 78"
                value={formData.phoneNumber}
                onChange={(e) => onPhoneChange(e.target.value)}
                onBlur={() => onPhoneBlur?.()}
                disabled={disabled}
                className={cn(
                  inputBaseClass,
                  "pr-10",
                  phoneValidationStatus === 'valid' && "border-green-500 focus:border-green-500",
                  phoneValidationStatus === 'invalid' && formData.phoneNumber && "border-red-500 focus:border-red-500",
                  phoneValidationStatus === 'exists' && "border-amber-500 focus:border-amber-500",
                  (phoneValidationStatus === 'idle' || !formData.phoneNumber) && "border-gray-200 dark:border-gray-700 focus:border-cyan-500"
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {phoneValidationStatus === 'valid' && <Check className="w-4 h-4 text-green-500" />}
                {phoneValidationStatus === 'invalid' && formData.phoneNumber && <AlertCircle className="w-4 h-4 text-red-500" />}
                {phoneValidationStatus === 'exists' && <UserIcon className="w-4 h-4 text-amber-500" />}
              </div>
            </div>
          </div>
          {phoneValidationStatus === 'invalid' && phoneErrorMessage && formData.phoneNumber && (
            <p className="text-xs text-red-500">{phoneErrorMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
});

ContactStep.displayName = 'ContactStep';
