'use client';

import { Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { SelectableSquareProps } from '../types';

export function SelectableSquare({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false
}: SelectableSquareProps) {
  return (
    <div
      className={`p-4 rounded-lg border-2 transition-[color,background-color,border-color,box-shadow] ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:shadow-md'
      } ${
        checked
          ? 'border-primary bg-primary/5 dark:bg-primary/10 dark:border-primary'
          : 'border-muted-foreground/20 hover:border-muted-foreground/40 dark:border-muted-foreground/30 dark:hover:border-muted-foreground/50 dark:bg-gray-800/50'
      }`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div className="flex items-start space-x-3">
        <div
          className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
            checked
              ? 'border-primary bg-primary text-primary-foreground dark:border-primary dark:bg-primary'
              : 'border-muted-foreground/40 dark:border-muted-foreground/50 dark:bg-gray-700/50'
          }`}
        >
          {checked && <Check className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            {icon && <div className="text-muted-foreground dark:text-muted-foreground">{icon}</div>}
            <Label
              className={`text-sm font-medium dark:text-gray-200 ${
                disabled ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {label}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
