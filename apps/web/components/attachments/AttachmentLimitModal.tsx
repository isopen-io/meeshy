'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';

interface AttachmentLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount: number;
  maxCount: number;
  remainingSlots: number;
}

export function AttachmentLimitModal({
  isOpen,
  onClose,
  currentCount,
  maxCount,
  remainingSlots,
}: AttachmentLimitModalProps) {
  const { t } = useI18n('conversations');
  const { t: tCommon } = useI18n('common');

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-lg animate-in fade-in duration-200 flex">
      {/* Contenu défilable à gauche - 70% */}
      <div className="w-[70%] overflow-y-auto p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
              {remainingSlots > 0
                ? t('attachmentLimit.partialMessage', { current: currentCount, max: maxCount, remaining: remainingSlots })
                : t('attachmentLimit.fullMessage', { max: maxCount })
              }
            </p>
            <p className="text-xs text-orange-800 dark:text-orange-300">
              {t('attachmentLimit.suggestion')}
            </p>
          </div>
        </div>
      </div>

      {/* Panneau de droite - 30% */}
      <div className="w-[30%] flex flex-col">
        {/* Compteur en haut */}
        <div className="flex-1 flex items-center justify-center p-3">
          <div className="text-2xl font-bold whitespace-nowrap text-center">
            <span className={currentCount >= maxCount ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}>
              {currentCount}
            </span>
            <span className="text-base text-gray-400 dark:text-gray-500"> / {maxCount}</span>
          </div>
        </div>

        {/* Bouton en bas */}
        <div className="flex-shrink-0 flex items-center justify-center p-2">
          <Button
            onClick={onClose}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs whitespace-nowrap"
          >
            {tCommon('understood')}
          </Button>
        </div>
      </div>
    </div>
  );
}
