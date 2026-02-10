'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, size = 'md', disabled, className, ...props }, ref) => {
    const sizes = {
      sm: { track: 'w-9 h-5', thumb: 'w-4 h-4', translate: 'translateX(16px)' },
      md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translateX(20px)' },
    };

    const s = sizes[size];

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors duration-300',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--gp-terracotta)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          s.track,
          className
        )}
        style={{
          background: checked ? 'var(--gp-terracotta)' : 'var(--gp-parchment)',
        }}
        {...props}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform duration-200',
            s.thumb
          )}
          style={{
            transform: checked ? s.translate : 'translateX(0)',
          }}
        />
      </button>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };
