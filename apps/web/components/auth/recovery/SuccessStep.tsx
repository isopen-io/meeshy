'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mail, Sparkles } from 'lucide-react';

interface SuccessStepProps {
  onClose: () => void;
  onNavigateToLogin: () => void;
  t: (key: string) => string | undefined;
}

export function SuccessStep({ onClose, onNavigateToLogin, t }: SuccessStepProps) {
  return (
    <motion.div
      key="success"
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -50, opacity: 0 }}
      className="space-y-6 text-center py-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30"
      >
        <Mail className="w-10 h-10 text-white" />
      </motion.div>
      <div>
        <h3 className="text-xl font-bold text-violet-600 dark:text-violet-400">
          {t('magicLink.success.title') || 'Magic Link envoyé !'}
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          {t('magicLink.success.description') || 'Consultez votre boîte email et cliquez sur le lien pour vous connecter instantanément.'}
        </p>
      </div>
      <Button
        onClick={() => {
          onClose();
          onNavigateToLogin();
        }}
        className="bg-gradient-to-r from-violet-500 to-purple-600"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        {t('register.wizard.understood') || "J'ai compris"}
      </Button>
    </motion.div>
  );
}
