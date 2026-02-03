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
            'bg-[#E9C46A]/20 text-[#B8860B]': variant === 'gold',
            'bg-[#2A9D8F]/10 text-[#2A9D8F]': variant === 'success',
            'bg-[#F4A261]/20 text-[#D68A3A]': variant === 'warning',
            'bg-[#C1292E]/10 text-[#C1292E]': variant === 'error',
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
