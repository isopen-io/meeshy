'use client';

import { theme } from './theme';

export interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className = '' }: TypingIndicatorProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span
        className="w-1.5 h-1.5 rounded-full animate-bounce"
        style={{
          background: theme.colors.textMuted,
          animationDelay: '0ms',
          animationDuration: '600ms',
        }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full animate-bounce"
        style={{
          background: theme.colors.textMuted,
          animationDelay: '150ms',
          animationDuration: '600ms',
        }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full animate-bounce"
        style={{
          background: theme.colors.textMuted,
          animationDelay: '300ms',
          animationDuration: '600ms',
        }}
      />
    </div>
  );
}
