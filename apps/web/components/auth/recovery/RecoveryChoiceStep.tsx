'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mail, Phone, KeyRound, Shield } from 'lucide-react';

interface ExistingAccountInfo {
  type: 'email' | 'phone';
  maskedDisplayName?: string;
  maskedUsername?: string;
  maskedEmail?: string;
  maskedPhone?: string;
  avatarUrl?: string;
}

interface RecoveryChoiceStepProps {
  existingAccount: ExistingAccountInfo | null;
  onEmailChoice: () => void;
  onPhoneChoice: () => void;
  onLogin: () => void;
  t: (key: string) => string | undefined;
}

export function RecoveryChoiceStep({
  existingAccount,
  onEmailChoice,
  onPhoneChoice,
  onLogin,
  t,
}: RecoveryChoiceStepProps) {
  return (
    <motion.div
      key="choice"
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -50, opacity: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30"
        >
          <Shield className="w-10 h-10 text-white" />
        </motion.div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('register.wizard.accountFound')}
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          {existingAccount?.type === 'email'
            ? t('register.wizard.emailExistsDesc')
            : t('register.wizard.phoneExistsDesc')
          }
        </p>
      </div>

      {/* Account preview */}
      {existingAccount && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-4 rounded-2xl backdrop-blur-sm bg-gradient-to-r from-violet-50/80 to-purple-50/80 dark:from-violet-900/30 dark:to-purple-900/30 border border-violet-200/50 dark:border-violet-700/50"
        >
          <div className="flex items-center gap-4">
            {existingAccount.avatarUrl ? (
              <img src={existingAccount.avatarUrl} alt="" className="w-14 h-14 rounded-full ring-2 ring-violet-500" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                {existingAccount.maskedDisplayName?.[0] || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {existingAccount.maskedDisplayName && (
                <p className="font-semibold text-gray-900 dark:text-white truncate">
                  {existingAccount.maskedDisplayName}
                </p>
              )}
              {existingAccount.maskedUsername && (
                <p className="text-sm text-violet-600 dark:text-violet-400">
                  @{existingAccount.maskedUsername}
                </p>
              )}
              {existingAccount.maskedEmail && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {existingAccount.maskedEmail}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Recovery options */}
      <div className="space-y-3">
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            onClick={onEmailChoice}
            className="w-full h-14 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/30"
          >
            <Mail className="w-5 h-5 mr-3" />
            {t('register.wizard.recoverByEmail')}
          </Button>
        </motion.div>

        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            onClick={onPhoneChoice}
            variant="outline"
            className="w-full h-14 border-2 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <Phone className="w-5 h-5 mr-3 text-emerald-600" />
            {t('register.wizard.recoverByPhone')}
          </Button>
        </motion.div>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-gray-900 px-3 text-gray-500">{t('register.wizard.or')}</span>
          </div>
        </div>

        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Button
            onClick={onLogin}
            variant="ghost"
            className="w-full"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            {t('register.wizard.goToLogin')}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
