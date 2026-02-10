'use client';

import { forwardRef, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-xl border bg-[var(--gp-surface)] px-4 py-3 text-base text-[var(--gp-text-primary)] transition-colors duration-300',
          'placeholder:text-[var(--gp-text-muted)]',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          'resize-none',
          error
            ? 'border-[#C1292E] focus:border-[#C1292E] focus:ring-[#C1292E]/20'
            : 'border-[var(--gp-border)] focus:border-[var(--gp-deep-teal)] focus:ring-[var(--gp-deep-teal)]/20',
          'disabled:bg-[var(--gp-hover)] disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
