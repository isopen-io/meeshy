'use client';

import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error, icon, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gp-text-muted)]">
            {icon}
          </div>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'w-full rounded-xl border bg-[var(--gp-surface)] px-4 py-3 text-base text-[var(--gp-text-primary)] transition-colors duration-300',
            'placeholder:text-[var(--gp-text-muted)]',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            icon && 'pl-10',
            error
              ? 'border-[#C1292E] focus:border-[#C1292E] focus:ring-[#C1292E]/20'
              : 'border-[var(--gp-border)] focus:border-[var(--gp-deep-teal)] focus:ring-[var(--gp-deep-teal)]/20',
            'disabled:bg-[var(--gp-hover)] disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
