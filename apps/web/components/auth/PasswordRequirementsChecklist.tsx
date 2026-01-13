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
}

export function PasswordRequirementsChecklist({
  password,
  className,
}: PasswordRequirementsChecklistProps) {
  const { t } = useI18n('auth');

  const requirements = useMemo<Requirement[]>(() => {
    const reqs = [
      {
        id: 'minLength',
        label: t('resetPassword.requirements.minLength') || 'At least 12 characters',
        test: (pwd: string) => pwd.length >= 12,
        met: password.length >= 12,
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
      {
        id: 'special',
        label: t('resetPassword.requirements.special') || 'One special character',
        test: (pwd: string) => /[^a-zA-Z0-9]/.test(pwd),
        met: /[^a-zA-Z0-9]/.test(password),
      },
    ];

    return reqs;
  }, [password, t]);

  const allRequirementsMet = useMemo(() => {
    return requirements.every((req) => req.met);
  }, [requirements]);

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('resetPassword.requirements.title') || 'Password must contain'}:
      </p>

      <ul className="space-y-2">
        {requirements.map((requirement) => (
          <li
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
                'flex items-center justify-center w-5 h-5 rounded-full transition-all duration-200',
                requirement.met
                  ? 'bg-green-500 dark:bg-green-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              )}
            >
              {requirement.met ? (
                <Check className="w-3 h-3 text-white" />
              ) : (
                <X className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              )}
            </div>
            <span className={cn(requirement.met && 'font-medium')}>
              {requirement.label}
            </span>
          </li>
        ))}
      </ul>

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
