'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { theme } from './theme';

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
          'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-300 ease-out',
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

          // Color variants
          {
            // Primary - Terracotta
            'bg-[#E76F51] text-white hover:bg-[#D65A3E] active:bg-[#C54A2E] shadow-[0_4px_14px_rgba(231,111,81,0.4)] hover:shadow-[0_6px_20px_rgba(231,111,81,0.5)] hover:-translate-y-0.5 focus-visible:ring-[#E76F51]':
              variant === 'primary',

            // Secondary - Deep Teal
            'bg-[#264653] text-white hover:bg-[#1D3640] active:bg-[#152A32] shadow-[0_4px_14px_rgba(38,70,83,0.3)] hover:shadow-[0_6px_20px_rgba(38,70,83,0.4)] hover:-translate-y-0.5 focus-visible:ring-[#264653]':
              variant === 'secondary',

            // Outline
            'border-2 border-[#264653] text-[#264653] bg-transparent hover:bg-[#264653] hover:text-white focus-visible:ring-[#264653]':
              variant === 'outline',

            // Ghost
            'text-[#2B2D42] bg-transparent hover:bg-[#F5EDE3] focus-visible:ring-[#2B2D42]':
              variant === 'ghost',

            // Destructive
            'bg-[#C1292E] text-white hover:bg-[#A82328] active:bg-[#8F1E22] shadow-[0_4px_14px_rgba(193,41,46,0.4)] focus-visible:ring-[#C1292E]':
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
