'use client';

import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'gradient';
  hover?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', hover = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl transition-colors duration-300',
          {
            // Default
            'bg-[var(--gp-surface)] shadow-[var(--gp-shadow-sm)]': variant === 'default',

            // Elevated
            'bg-[var(--gp-surface-elevated)] shadow-[var(--gp-shadow-lg)]': variant === 'elevated',

            // Outlined
            'bg-[var(--gp-surface)] border border-[var(--gp-border)]': variant === 'outlined',

            // Gradient
            'bg-gradient-to-br from-[var(--gp-surface)] to-[var(--gp-hover)]': variant === 'gradient',
          },
          hover && 'hover:-translate-y-1 hover:shadow-[var(--gp-shadow-lg)]',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6 pb-4', className)}
      {...props}
    />
  )
);

CardHeader.displayName = 'CardHeader';

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6 pt-0', className)}
      {...props}
    />
  )
);

CardContent.displayName = 'CardContent';

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-xl font-semibold text-[var(--gp-text-primary)] transition-colors duration-300',
        'font-[Playfair_Display,Georgia,serif]',
        className
      )}
      {...props}
    />
  )
);

CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-[var(--gp-text-secondary)] text-sm mt-2 transition-colors duration-300', className)}
      {...props}
    />
  )
);

CardDescription.displayName = 'CardDescription';

export { Card, CardHeader, CardContent, CardTitle, CardDescription };
