'use client';

import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'terracotta' | 'teal' | 'gold' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 font-medium rounded-full transition-colors duration-300',
          {
            // Sizes
            'px-2 py-0.5 text-xs': size === 'sm',
            'px-3 py-1 text-sm': size === 'md',
            'px-4 py-1.5 text-base': size === 'lg',
          },
          {
            // Variants with CSS variables
            'bg-[var(--gp-hover)] text-[var(--gp-text-primary)]': variant === 'default',
            'bg-[var(--gp-terracotta-light)] text-[var(--gp-terracotta)]': variant === 'terracotta',
            'bg-[var(--gp-deep-teal)]/10 text-[var(--gp-deep-teal)]': variant === 'teal',
            'bg-[var(--gp-gold-accent)]/20 text-[var(--gp-gold-accent)]': variant === 'gold',
            'bg-[var(--gp-success)]/10 text-[var(--gp-success)]': variant === 'success',
            'bg-[var(--gp-warning)]/20 text-[var(--gp-warning)]': variant === 'warning',
            'bg-[var(--gp-error)]/10 text-[var(--gp-error)]': variant === 'error',
          },
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
