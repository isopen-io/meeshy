'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

export function OTPInput({
  value,
  onChange,
  disabled = false,
  id = 'recovery-otp',
}: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const CODE_LENGTH = 6;

  const handleChange = (index: number, inputValue: string) => {
    const digit = inputValue.replace(/\D/g, '').slice(-1);
    const newValue = value.split('');
    newValue[index] = digit;
    const joined = newValue.join('').slice(0, CODE_LENGTH);
    onChange(joined);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChange(pastedData);
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Code de vérification à 6 chiffres">
      {Array.from({ length: CODE_LENGTH }).map((_, index) => (
        <motion.input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          id={`${id}-${index}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Chiffre ${index + 1} sur 6`}
          autoComplete="one-time-code"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: index * 0.05 }}
          className={cn(
            "w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all",
            "bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            value[index]
              ? "border-emerald-500 dark:border-emerald-400 focus:ring-emerald-500"
              : "border-gray-200 dark:border-gray-700 focus:ring-cyan-500 focus:border-cyan-500",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
}
