'use client';

import { useMemo } from 'react';
import { passwordResetService } from '@/services/password-reset.service';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  const { t } = useI18n('auth');

  const strengthData = useMemo(() => {
    if (!password) {
      return {
        score: 0,
        label: '',
        color: 'bg-gray-200 dark:bg-gray-700',
        widthPercentage: 0,
      };
    }

    const score = passwordResetService.calculatePasswordStrength(password);
    const label = passwordResetService.getPasswordStrengthLabel(score);
    const color = passwordResetService.getPasswordStrengthColor(score);
    const widthPercentage = (score / 4) * 100;

    return {
      score,
      label,
      color,
      widthPercentage,
    };
  }, [password]);

  // Translation keys for strength levels
  const getTranslatedLabel = (label: string): string => {
    const labelMap: { [key: string]: string } = {
      'Weak': t('resetPassword.strength.weak') || 'Weak',
      'Fair': t('resetPassword.strength.fair') || 'Fair',
      'Strong': t('resetPassword.strength.strong') || 'Strong',
      'Very Strong': t('resetPassword.strength.veryStrong') || 'Very Strong',
    };
    return labelMap[label] || label;
  };

  if (!password) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">
          {t('resetPassword.strength.title') || 'Password Strength'}:
        </span>
        <span
          className={cn(
            'font-medium',
            strengthData.score <= 1 && 'text-red-600 dark:text-red-400',
            strengthData.score === 2 && 'text-yellow-600 dark:text-yellow-400',
            strengthData.score === 3 && 'text-blue-600 dark:text-blue-400',
            strengthData.score === 4 && 'text-green-600 dark:text-green-400'
          )}
        >
          {getTranslatedLabel(strengthData.label)}
        </span>
      </div>

      {/* Strength bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-[width] duration-300 ease-in-out rounded-full',
            strengthData.color
          )}
          style={{ width: `${strengthData.widthPercentage}%` }}
        />
      </div>

      {/* Strength segments (visual indicator) */}
      <div className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <div
            key={segment}
            className={cn(
              'h-1 rounded-full transition-colors duration-300',
              segment <= strengthData.score
                ? strengthData.color
                : 'bg-gray-200 dark:bg-gray-700'
            )}
          />
        ))}
      </div>
    </div>
  );
}
