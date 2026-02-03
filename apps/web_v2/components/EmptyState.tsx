'use client';

import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button, ButtonProps } from './Button';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Icon (ReactNode, e.g., emoji or SVG) */
  icon?: ReactNode;
  /** Title text */
  title: string;
  /** Description text */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps['variant'];
  };
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
      {...props}
    >
      {/* Icon */}
      {icon && (
        <div className="mb-4 text-6xl opacity-75">
          {icon}
        </div>
      )}

      {/* Title */}
      <h2 className="text-xl font-semibold transition-colors duration-300" style={{ color: 'var(--gp-text-primary)' }}>
        {title}
      </h2>

      {/* Description */}
      {description && (
        <p className="mt-2 max-w-md text-sm transition-colors duration-300" style={{ color: 'var(--gp-text-secondary)' }}>
          {description}
        </p>
      )}

      {/* Action Button */}
      {action && (
        <div className="mt-6">
          <Button
            variant={action.variant || 'primary'}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
