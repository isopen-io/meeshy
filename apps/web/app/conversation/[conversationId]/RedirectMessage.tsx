'use client';

import { useI18n } from '@/hooks/useI18n';

export default function RedirectMessage() {
  const { t } = useI18n('common');

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">
          {t('redirecting')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">{t('redirectingDescription')}</p>
      </div>
    </div>
  );
}
