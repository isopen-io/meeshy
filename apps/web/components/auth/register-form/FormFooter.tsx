'use client';

import { Button } from '@/components/ui/button';
import type { TFunction } from '@/hooks/useI18n';

interface FormFooterProps {
  isLoading: boolean;
  disabled?: boolean;
  t: TFunction;
}

export function FormFooter({ isLoading, disabled, t }: FormFooterProps) {
  return (
    <div className="sticky bottom-0 bg-white dark:bg-gray-950 pt-4 pb-6 mt-4 border-t">
      <Button
        type="submit"
        className="w-full"
        disabled={isLoading || disabled}
      >
        {isLoading ? t('register.creating') : t('register.registerButton')}
      </Button>

      <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
        <span>{t('register.hasAccount')} </span>
        <a
          href="/login"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline"
        >
          {t('register.loginLink')}
        </a> - <a
          href="/signup"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline"
        >
          {t('login.registerLink')}
        </a>
      </div>
    </div>
  );
}
