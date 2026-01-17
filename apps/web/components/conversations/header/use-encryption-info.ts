import { useCallback } from 'react';
import { Lock, LockOpen, Key } from 'lucide-react';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';
import type { EncryptionInfo } from './types';

export function useEncryptionInfo(encryptionMode: EncryptionMode | undefined, t: (key: string) => string) {
  const getEncryptionIcon = useCallback((): EncryptionInfo | null => {
    if (!encryptionMode) return null;

    switch (encryptionMode) {
      case 'e2ee':
        return {
          icon: Lock,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-100 dark:bg-green-900/30',
          label: t('conversationHeader.encryptionE2EE') || 'Chiffrement de bout en bout'
        };
      case 'hybrid':
        return {
          icon: LockOpen,
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
          label: t('conversationHeader.encryptionHybrid') || 'Chiffrement hybride'
        };
      case 'server':
        return {
          icon: Key,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/30',
          label: t('conversationHeader.encryptionServer') || 'Chiffrement serveur'
        };
      default:
        return null;
    }
  }, [encryptionMode, t]);

  return {
    encryptionInfo: getEncryptionIcon(),
  };
}
