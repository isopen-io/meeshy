'use client';

import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { WizardFormData } from '@/hooks/use-registration-wizard';

interface SecurityStepProps {
  formData: WizardFormData;
  confirmPassword: string;
  showPassword: boolean;
  disabled?: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
}

const inputBaseClass = "h-10 bg-white/70 dark:bg-gray-800/70 sm:bg-white/50 sm:dark:bg-gray-800/50 sm:backdrop-blur-sm border-2 transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0";

export const SecurityStep = forwardRef<HTMLInputElement, SecurityStepProps>(({
  formData,
  confirmPassword,
  showPassword,
  disabled,
  onPasswordChange,
  onConfirmPasswordChange,
  onTogglePassword,
}, ref) => {
  const { t } = useI18n('auth');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
          {t('register.wizard.securityTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.securitySubtitle')}</p>
      </div>
      <div className="space-y-3">
        {/* Password field */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('register.passwordLabel')}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
            <Input
              ref={ref}
              type={showPassword ? 'text' : 'password'}
              placeholder={t('register.passwordPlaceholder')}
              value={formData.password}
              onChange={(e) => onPasswordChange(e.target.value)}
              disabled={disabled}
              className={cn(inputBaseClass, "pl-10 pr-10 border-gray-200 dark:border-gray-700 focus:border-amber-500")}
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirm password field */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('register.confirmPasswordLabel')}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('register.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              disabled={disabled}
              className={cn(
                inputBaseClass,
                "pl-10 pr-10",
                confirmPassword && formData.password === confirmPassword && "border-green-500 focus:border-green-500",
                confirmPassword && formData.password !== confirmPassword && "border-red-500 focus:border-red-500",
                !confirmPassword && "border-gray-200 dark:border-gray-700 focus:border-amber-500"
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {confirmPassword && formData.password === confirmPassword && <Check className="w-4 h-4 text-green-500" />}
              {confirmPassword && formData.password !== confirmPassword && <X className="w-4 h-4 text-red-500" />}
            </div>
          </div>
          {confirmPassword && formData.password !== confirmPassword && (
            <p className="text-xs text-red-500">{t('register.validation.passwordMismatch')}</p>
          )}
        </div>

        {/* Password strength */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                formData.password.length >= level * 2
                  ? level <= 1 ? "bg-red-500"
                  : level <= 2 ? "bg-orange-500"
                  : level <= 3 ? "bg-yellow-500"
                  : "bg-green-500"
                  : "bg-gray-200 dark:bg-gray-700"
              )}
            />
          ))}
        </div>
        <p className="text-xs text-center text-muted-foreground">
          {formData.password.length < 6
            ? t('register.wizard.passwordWeak')
            : formData.password.length < 8
            ? t('register.wizard.passwordMedium')
            : t('register.wizard.passwordStrong')
          }
        </p>
      </div>
    </div>
  );
});

SecurityStep.displayName = 'SecurityStep';
