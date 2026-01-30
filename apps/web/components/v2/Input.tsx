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
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
            {icon}
          </div>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-3 text-base transition-all duration-200',
            'placeholder:text-[#9CA3AF]',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            icon && 'pl-10',
            error
              ? 'border-[#C1292E] focus:border-[#C1292E] focus:ring-[#C1292E]/20'
              : 'border-[#E5E5E5] focus:border-[#264653] focus:ring-[#264653]/20',
            'disabled:bg-[#F5EDE3] disabled:cursor-not-allowed',
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
