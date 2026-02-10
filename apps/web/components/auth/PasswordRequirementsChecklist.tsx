'use client';

import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordRequirementsChecklistProps {
  password: string;
  className?: string;
}

interface Requirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
  met: boolean;
  optional?: boolean;
}

export function PasswordRequirementsChecklist({
  password,
  className,
}: PasswordRequirementsChecklistProps) {
  const { t } = useI18n('auth');

  // Required requirements (4 core requirements)
  const requirements = useMemo<Requirement[]>(() => {
    return [
      {
        id: 'minLength',
        label: t('resetPassword.requirements.minLength') || 'At least 8 characters',
        test: (pwd: string) => pwd.length >= 8,
        met: password.length >= 8,
      },
      {
        id: 'uppercase',
        label: t('resetPassword.requirements.uppercase') || 'One uppercase letter',
        test: (pwd: string) => /[A-Z]/.test(pwd),
        met: /[A-Z]/.test(password),
      },
      {
        id: 'lowercase',
        label: t('resetPassword.requirements.lowercase') || 'One lowercase letter',
        test: (pwd: string) => /[a-z]/.test(pwd),
        met: /[a-z]/.test(password),
      },
      {
        id: 'number',
        label: t('resetPassword.requirements.number') || 'One number',
        test: (pwd: string) => /[0-9]/.test(pwd),
        met: /[0-9]/.test(password),
      },
    ];
  }, [password, t]);

  // Optional special character bonus
  const hasSpecialChar = useMemo(() => /[^a-zA-Z0-9]/.test(password), [password]);
  const specialCharMessage = useMemo(() => {
    if (hasSpecialChar) {
      return t('resetPassword.requirements.specialMet') || '🎉 Mot de passe béton avec ce caractère spécial !';
    }
    return t('resetPassword.requirements.special') || '💡 Un caractère spécial pour un mot de passe béton ?';
  }, [hasSpecialChar, t]);

  const allRequirementsMet = useMemo(() => {
    return requirements.every((req) => req.met);
  }, [requirements]);

  // Group requirements 2 by 2
  const groupedRequirements = useMemo(() => {
    const groups: Requirement[][] = [];
    for (let i = 0; i < requirements.length; i += 2) {
      groups.push(requirements.slice(i, i + 2));
    }
    return groups;
  }, [requirements]);

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('resetPassword.requirements.title') || 'Password must contain'}:
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
          {t('resetPassword.requirements.creativeTip') || 'Sois créatif, pour ne pas pleurer le piratage demain !'}
        </p>
      </div>

      <div className="space-y-2">
        {groupedRequirements.map((group, groupIndex) => (
          <div key={groupIndex} className="grid grid-cols-2 gap-x-4 gap-y-2">
            {group.map((requirement) => (
              <div
                key={requirement.id}
                className={cn(
                  'flex items-center gap-2 text-sm transition-colors duration-200',
                  requirement.met
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-4 h-4 rounded-full transition-colors duration-200 flex-shrink-0',
                    requirement.met
                      ? 'bg-green-500 dark:bg-green-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                  )}
                >
                  {requirement.met ? (
                    <Check className="w-2.5 h-2.5 text-white" />
                  ) : (
                    <X className="w-2.5 h-2.5 text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                <span className={cn('text-xs', requirement.met && 'font-medium')}>
                  {requirement.label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Special character bonus (optional) */}
      <div
        className={cn(
          'flex items-center gap-2 text-xs italic transition-colors duration-200 mt-2',
          hasSpecialChar
            ? 'text-green-600 dark:text-green-400 font-medium'
            : 'text-gray-400 dark:text-gray-500'
        )}
      >
        <span>{specialCharMessage}</span>
      </div>

      {password && allRequirementsMet && (
        <div className="flex items-center gap-2 p-3 mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            {t('resetPassword.requirements.allMet') ||
              'All requirements met! Your password is secure.'}
          </p>
        </div>
      )}
    </div>
  );
}
