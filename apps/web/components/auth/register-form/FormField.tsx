'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ValidationStatus } from '@/hooks/use-field-validation';

interface FormFieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  validationStatus?: ValidationStatus;
  errorMessage?: string;
  helpText?: string;
  successMessage?: string;
  showIcon?: boolean;
  minLength?: number;
  maxLength?: number;
  inputMode?: 'text' | 'tel' | 'email';
  spellCheck?: boolean;
  className?: string;
}

export function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  required,
  autoComplete,
  validationStatus,
  errorMessage,
  helpText,
  successMessage,
  showIcon = true,
  minLength,
  maxLength,
  inputMode,
  spellCheck,
  className,
}: FormFieldProps) {
  const hasValidation = validationStatus && validationStatus !== 'idle';
  const isValid = validationStatus === 'valid' || validationStatus === 'available';
  const isInvalid = validationStatus === 'invalid' || validationStatus === 'taken';
  const isChecking = validationStatus === 'checking';

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </Label>

      <div className="relative">
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onBlur?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          spellCheck={spellCheck}
          className={cn(
            showIcon && hasValidation && 'pr-10',
            isValid && 'border-green-500 focus-visible:ring-green-500',
            isInvalid && 'border-red-500 focus-visible:ring-red-500'
          )}
        />

        {showIcon && hasValidation && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
            {isChecking && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            )}
            {isValid && (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-green-500">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            {isInvalid && (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500">
                <AlertCircle className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        )}
      </div>

      {helpText && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {helpText}
        </p>
      )}

      {isValid && successMessage && (
        <p className="text-xs text-green-600 flex items-center gap-1" aria-live="polite">
          <Check className="h-3 w-3" aria-hidden="true" />
          {successMessage}
        </p>
      )}

      {isInvalid && errorMessage && (
        <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {errorMessage}
        </p>
      )}
    </div>
  );
}
