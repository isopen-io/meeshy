'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { ExistingAccountInfo } from '@/hooks/use-registration-validation';
import type { ValidationStatus } from '@/hooks/use-registration-validation';

interface ExistingAccountAlertProps {
  hasExistingAccount: boolean;
  emailValidationStatus: ValidationStatus;
  phoneValidationStatus: ValidationStatus;
  existingAccount: ExistingAccountInfo | null;
  onRecoveryClick: () => void;
}

export function ExistingAccountAlert({
  hasExistingAccount,
  emailValidationStatus,
  phoneValidationStatus,
  onRecoveryClick,
}: ExistingAccountAlertProps) {
  const { t } = useI18n('auth');
  const router = useRouter();

  if (!hasExistingAccount) return null;

  const isEmailConflict = emailValidationStatus === 'exists';
  const isPhoneConflict = phoneValidationStatus === 'exists';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-amber-900 dark:text-amber-100">
            {t('register.wizard.accountExists')}
          </h4>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            {isEmailConflict && isPhoneConflict
              ? t('register.wizard.bothExist')
              : isEmailConflict
              ? t('register.wizard.emailExists')
              : t('register.wizard.phoneExists')
            }
          </p>

          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onRecoveryClick}
              className="flex-1 h-8 text-xs"
            >
              <KeyRound className="w-3 h-3 mr-1" />
              {t('register.wizard.recoverAccount')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/login')}
              className="flex-1 h-8 text-xs"
            >
              {t('register.wizard.goToLogin')}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
