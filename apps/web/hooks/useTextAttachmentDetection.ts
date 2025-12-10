/**
 * Hook pour détecter le paste de texte long (> 300 caractères)
 * et proposer de créer un attachment
 */

import { useCallback, useEffect, RefObject } from 'react';

interface UseTextAttachmentDetectionOptions {
  enabled?: boolean;
  threshold?: number; // Nombre de caractères minimum pour déclencher la détection
  onTextDetected: (text: string) => void;
}

export function useTextAttachmentDetection(
  textareaRef: RefObject<HTMLTextAreaElement>,
  options: UseTextAttachmentDetectionOptions
) {
  const { enabled = true, threshold = 300, onTextDetected } = options;

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!enabled) return;

      const text = e.clipboardData?.getData('text');
      
      if (text && text.length > threshold) {
        // Ne pas empêcher le paste par défaut, juste notifier
        // L'utilisateur peut choisir de créer un attachment ou non
        onTextDetected(text);
      }
    },
    [enabled, threshold, onTextDetected]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !enabled) return;

    textarea.addEventListener('paste', handlePaste as any);

    return () => {
      textarea.removeEventListener('paste', handlePaste as any);
    };
  }, [textareaRef, handlePaste, enabled]);

  return {
    threshold,
  };
}

