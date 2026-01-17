'use client';

import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { WizardFormData } from '@/hooks/use-registration-wizard';
import type { ValidationStatus } from '@/hooks/use-registration-validation';

interface UsernameStepProps {
  formData: WizardFormData;
  usernameCheckStatus: ValidationStatus;
  usernameSuggestions: string[];
  disabled?: boolean;
  onUsernameChange: (value: string) => void;
  onSuggestionClick: (suggestion: string) => void;
}

const inputBaseClass = "h-10 bg-white/70 dark:bg-gray-800/70 sm:bg-white/50 sm:dark:bg-gray-800/50 sm:backdrop-blur-sm border-2 transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0";

export const UsernameStep = forwardRef<HTMLInputElement, UsernameStepProps>(({
  formData,
  usernameCheckStatus,
  usernameSuggestions,
  disabled,
  onUsernameChange,
  onSuggestionClick,
}, ref) => {
  const { t } = useI18n('auth');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 dark:from-pink-400 dark:to-rose-400 bg-clip-text text-transparent"
        >
          {t('register.wizard.usernameTitle')}
        </motion.h2>
        <p className="text-sm text-muted-foreground mt-1">{t('register.wizard.usernameSubtitle')}</p>
      </div>
      <div className="space-y-1">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500 font-bold">@</span>
          <Input
            ref={ref}
            type="text"
            placeholder={t('register.usernamePlaceholder')}
            value={formData.username}
            onChange={(e) => {
              const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
              onUsernameChange(value);
            }}
            disabled={disabled}
            className={cn(
              inputBaseClass,
              "pl-8 pr-10",
              usernameCheckStatus === 'available' && "border-green-500 focus:border-green-500",
              usernameCheckStatus === 'taken' && "border-red-500 focus:border-red-500",
              usernameCheckStatus === 'idle' && "border-gray-200 dark:border-gray-700 focus:border-pink-500"
            )}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {usernameCheckStatus === 'checking' && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full"
              />
            )}
            {usernameCheckStatus === 'available' && <Check className="w-4 h-4 text-green-500" />}
            {usernameCheckStatus === 'taken' && <X className="w-4 h-4 text-red-500" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">{t('register.usernameHelp')}</p>
        {usernameCheckStatus === 'available' && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-center text-green-600 font-medium">
            ✨ {t('register.wizard.usernameAvailable')}
          </motion.p>
        )}
        {usernameCheckStatus === 'taken' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <p className="text-xs text-center text-red-600 font-medium">
              😅 {t('register.wizard.usernameTaken')}
            </p>
            {/* Username suggestions */}
            {usernameSuggestions.length > 0 && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1.5">{t('register.suggestions')}:</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {usernameSuggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => onSuggestionClick(suggestion)}
                      className="text-xs bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2.5 py-1 rounded-full hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors font-medium"
                    >
                      @{suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
});

UsernameStep.displayName = 'UsernameStep';
