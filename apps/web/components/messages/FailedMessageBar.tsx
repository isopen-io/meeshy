'use client';

import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface FailedMessageBarProps {
  tempId: string;
  content: string;
  originalLanguage: string;
  replyToId?: string;
  onRetry: (tempId: string, content: string, language: string, replyToId?: string) => void;
  onCancel: (tempId: string) => void;
  t: (key: string) => string;
}

export const FailedMessageBar = memo(function FailedMessageBar({
  tempId,
  content,
  originalLanguage,
  replyToId,
  onRetry,
  onCancel,
  t,
}: FailedMessageBarProps) {
  return (
    <div className="flex items-center justify-end gap-1.5 px-4 py-1 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
      <span className="text-red-500 font-medium">
        {t('bubbleStream.delivery.failed')}
      </span>
      <span className="text-[var(--gp-text-muted)]">&middot;</span>
      <button
        type="button"
        onClick={() => onRetry(tempId, content, originalLanguage, replyToId)}
        className="text-[var(--gp-accent)] hover:underline font-medium cursor-pointer"
      >
        {t('bubbleStream.delivery.retry')}
      </button>
      <button
        type="button"
        onClick={() => onCancel(tempId)}
        className="text-[var(--gp-text-muted)] hover:text-red-500 hover:underline cursor-pointer"
      >
        {t('bubbleStream.delivery.cancel')}
      </button>
    </div>
  );
});
