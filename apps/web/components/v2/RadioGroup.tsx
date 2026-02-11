'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RadioGroupContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

function RadioGroup({ value, onValueChange, children, className }: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div role="radiogroup" className={cn('space-y-2', className)}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioGroupItemProps {
  value: string;
  label: string;
  description?: string;
  className?: string;
}

function RadioGroupItem({ value, label, description, className }: RadioGroupItemProps) {
  const context = useContext(RadioGroupContext);
  if (!context) throw new Error('RadioGroupItem must be used within a RadioGroup');

  const isSelected = context.value === value;

  const handleClick = useCallback(() => {
    context.onValueChange(value);
  }, [context, value]);

  return (
    <button
      role="radio"
      aria-checked={isSelected}
      onClick={handleClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors duration-300',
        isSelected ? '' : 'hover:bg-[var(--gp-hover)]',
        className
      )}
      style={{
        borderColor: isSelected ? 'var(--gp-terracotta)' : 'var(--gp-border)',
        background: isSelected ? 'var(--gp-terracotta-light)' : 'transparent',
      }}
    >
      <div
        className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-300"
        style={{
          borderColor: isSelected ? 'var(--gp-terracotta)' : 'var(--gp-text-muted)',
        }}
      >
        {isSelected && (
          <div className="w-2 h-2 rounded-full bg-[var(--gp-terracotta)]" />
        )}
      </div>
      <div className="text-left">
        <p className="text-sm font-medium text-[var(--gp-text-primary)] transition-colors duration-300">
          {label}
        </p>
        {description && (
          <p className="text-xs text-[var(--gp-text-muted)] transition-colors duration-300">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}

RadioGroup.displayName = 'RadioGroup';
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
