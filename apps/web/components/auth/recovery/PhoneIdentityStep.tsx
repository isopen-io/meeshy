'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, User, Mail, ArrowLeft, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

interface PhoneIdentityStepProps {
  username: string;
  email: string;
  onUsernameChange: (username: string) => void;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
  t: (key: string) => string | undefined;
}

export function PhoneIdentityStep({
  username,
  email,
  onUsernameChange,
  onEmailChange,
  onSubmit,
  onBack,
  isLoading,
  error,
  t,
}: PhoneIdentityStepProps) {
  return (
    <motion.div
      key="phone_identity"
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -50, opacity: 0 }}
      className="space-y-6"
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30"
        >
          <Shield className="w-8 h-8 text-white" />
        </motion.div>
        <h3 className="text-xl font-bold">{t('phoneReset.identityTitle')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('register.wizard.guessIdentityDesc')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="recovery-guess-username" className="text-sm font-medium flex items-center gap-2">
            <User className="w-4 h-4" aria-hidden="true" />
            {t('phoneReset.usernameLabel')}
          </label>
          <Input
            id="recovery-guess-username"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder={t('phoneReset.usernamePlaceholder')}
            disabled={isLoading}
            className="h-12 border-2 border-violet-200 dark:border-violet-800 focus:border-violet-500"
            autoComplete="username"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="recovery-guess-email" className="text-sm font-medium flex items-center gap-2">
            <Mail className="w-4 h-4" aria-hidden="true" />
            {t('phoneReset.emailLabel')}
          </label>
          <Input
            id="recovery-guess-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder={t('phoneReset.emailPlaceholder')}
            disabled={isLoading}
            className="h-12 border-2 border-violet-200 dark:border-violet-800 focus:border-violet-500"
            autoComplete="email"
            spellCheck={false}
          />
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </motion.div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isLoading}
          className="flex-1"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('register.wizard.back')}
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isLoading || !username.trim() || !email.includes('@')}
          className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4 mr-2" />
          )}
          {t('phoneReset.verifyButton')}
        </Button>
      </div>
    </motion.div>
  );
}
