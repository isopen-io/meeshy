'use client';

export interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className = '' }: TypingIndicatorProps) {
  return (
    <div className={`flex items-center gap-1 transition-colors duration-300 ${className}`}>
      <span
        className="w-1.5 h-1.5 rounded-full animate-bounce"
        style={{
          background: 'var(--gp-text-muted)',
          animationDelay: '0ms',
          animationDuration: '600ms',
        }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full animate-bounce"
        style={{
          background: 'var(--gp-text-muted)',
          animationDelay: '150ms',
          animationDuration: '600ms',
        }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full animate-bounce"
        style={{
          background: 'var(--gp-text-muted)',
          animationDelay: '300ms',
          animationDuration: '600ms',
        }}
      />
    </div>
  );
}
