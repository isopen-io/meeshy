'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-300 ease-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',

          // Border radius
          'rounded-full',

          // Size variants
          {
            'px-4 py-2 text-sm': size === 'sm',
            'px-6 py-2.5 text-base': size === 'md',
            'px-8 py-3 text-lg': size === 'lg',
          },

          // Color variants with CSS variables
          {
            // Primary - Terracotta
            'bg-[var(--gp-terracotta)] text-white hover:opacity-90 active:opacity-80 shadow-[var(--gp-shadow-md)] hover:shadow-[var(--gp-shadow-lg)] hover:-translate-y-0.5 focus-visible:ring-[var(--gp-terracotta)]':
              variant === 'primary',

            // Secondary - Deep Teal
            'bg-[var(--gp-deep-teal)] text-white hover:opacity-90 active:opacity-80 shadow-[var(--gp-shadow-md)] hover:shadow-[var(--gp-shadow-lg)] hover:-translate-y-0.5 focus-visible:ring-[var(--gp-deep-teal)]':
              variant === 'secondary',

            // Outline
            'border-2 border-[var(--gp-deep-teal)] text-[var(--gp-deep-teal)] bg-transparent hover:bg-[var(--gp-deep-teal)] hover:text-white focus-visible:ring-[var(--gp-deep-teal)]':
              variant === 'outline',

            // Ghost
            'text-[var(--gp-text-primary)] bg-transparent hover:bg-[var(--gp-hover)] focus-visible:ring-[var(--gp-text-primary)]':
              variant === 'ghost',

            // Destructive
            'bg-[#C1292E] text-white hover:opacity-90 active:opacity-80 shadow-[var(--gp-shadow-md)] focus-visible:ring-[#C1292E]':
              variant === 'destructive',
          },

          className
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
