'use client';

import { forwardRef, LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'block text-sm font-medium text-[var(--gp-text-muted)] transition-colors duration-300',
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="ml-1 text-[#C1292E]" aria-hidden="true">*</span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';

export { Label };
