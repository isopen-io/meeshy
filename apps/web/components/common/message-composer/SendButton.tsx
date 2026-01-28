// apps/web/components/common/message-composer/SendButton.tsx
'use client';

import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimationConfig } from '@/constants/animations';
import { PerformanceProfile } from '@/hooks/usePerformanceProfile';
import styles from './SendButton.module.css';

interface SendButtonProps {
  isVisible: boolean;
  canSend: boolean;
  onClick: () => void;
  isCompressing?: boolean;
  isRecording?: boolean;
  isUploading?: boolean;
  performanceProfile: PerformanceProfile;
  animConfig: AnimationConfig;
}

export const SendButton = ({
  isVisible,
  canSend,
  onClick,
  isCompressing,
  isRecording,
  isUploading,
  performanceProfile,
  animConfig,
}: SendButtonProps) => {
  if (!isVisible) return null;

  const isProcessing = isCompressing || isRecording || isUploading;

  const getAriaLabel = () => {
    if (isCompressing) return 'Compression en cours';
    if (isRecording) return "Arrêtez l'enregistrement avant d'envoyer";
    if (isUploading) return 'Upload en cours';
    return 'Envoyer le message';
  };

  return (
    <Button
      onClick={onClick}
      disabled={!canSend}
      size="sm"
      className={`
        ${styles.sendButton}
        ${animConfig.enableGradient ? styles.withGradient : styles.solidColor}
        ${animConfig.enableRotation ? styles.withRotation : styles.simpleScale}
        text-white relative
        h-6 w-6 sm:h-9 sm:w-9 p-0 rounded-full
        shadow-lg hover:shadow-xl transition-all duration-200
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      `}
      style={{
        animationDuration: `${animConfig.sendButtonDuration}ms`,
      }}
      aria-label={getAriaLabel()}
      aria-keyshortcuts="Enter"
    >
      <Send className="h-3 w-3 sm:h-5 sm:w-5" aria-hidden="true" />
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-600/50 rounded-full">
          <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" aria-hidden="true" />
        </div>
      )}
    </Button>
  );
};
