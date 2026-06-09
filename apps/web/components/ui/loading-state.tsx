'use client';

import { MessageSquare } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingState({ message, fullScreen = false }: LoadingStateProps) {
  const { t } = useI18n('common');
  const displayMessage = message ?? t('loading');

  const content = (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 bg-gradient-to-r from-[var(--gp-terracotta)] to-[var(--gp-royal-indigo)] rounded-lg flex items-center justify-center">
          <MessageSquare className="h-6 w-6 text-white" />
        </div>
      </div>
      <h1
        className="text-3xl font-bold"
        style={{ color: 'var(--gp-text-primary)' }}
      >
        Meeshy
      </h1>
      <p style={{ color: 'var(--gp-text-secondary)' }}>{displayMessage}</p>
      <div className="flex justify-center mt-4">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: 'var(--gp-terracotta)' }}
        />
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'var(--gp-background)' }}
      >
        <div className="w-full max-w-md space-y-6">{content}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">{content}</div>
  );
}
