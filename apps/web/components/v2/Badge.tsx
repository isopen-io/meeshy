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
          'inline-flex items-center gap-1.5 font-medium rounded-full',
          {
            // Sizes
            'px-2 py-0.5 text-xs': size === 'sm',
            'px-3 py-1 text-sm': size === 'md',
            'px-4 py-1.5 text-base': size === 'lg',
          },
          {
            // Variants
            'bg-[#F5EDE3] text-[#2B2D42]': variant === 'default',
            'bg-[#E76F51]/10 text-[#E76F51]': variant === 'terracotta',
            'bg-[#264653]/10 text-[#264653]': variant === 'teal',
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
