'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { KeyRound, ArrowLeft, CheckCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { OTPInput } from './OTPInput';

interface PhoneCodeStepProps {
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onResend: () => void;
  isLoading: boolean;
  error: string | null;
  resendCooldown: number;
  t: (key: string) => string | undefined;
}

export function PhoneCodeStep({
  code,
  onCodeChange,
  onSubmit,
  onBack,
  onResend,
  isLoading,
  error,
  resendCooldown,
  t,
}: PhoneCodeStepProps) {
  return (
    <motion.div
      key="phone_code"
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -50, opacity: 0 }}
      className="space-y-6"
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30"
        >
          <KeyRound className="w-8 h-8 text-white" />
        </motion.div>
        <h3 className="text-xl font-bold">{t('phoneReset.codeTitle')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('phoneReset.codeDescription')}
        </p>
      </div>

      <OTPInput value={code} onChange={onCodeChange} disabled={isLoading} id="recovery-phone-code" />

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

      <div className="text-center">
        {resendCooldown > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('phoneReset.resendIn')} {resendCooldown}s
          </p>
        ) : (
          <Button variant="link" onClick={onResend} className="text-amber-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('phoneReset.resendCode')}
          </Button>
        )}
      </div>

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
          disabled={isLoading || code.length !== 6}
          className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4 mr-2" />
          )}
          {t('phoneReset.verifyCodeButton')}
        </Button>
      </div>
    </motion.div>
  );
}
