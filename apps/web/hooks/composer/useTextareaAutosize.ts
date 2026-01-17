/**
 * Hook de gestion de l'auto-resize du textarea
 * Gère: hauteur automatique, scroll, reset
 *
 * @module hooks/composer/useTextareaAutosize
 */

'use client';

import { useCallback, useRef, useEffect } from 'react';

interface UseTextareaAutosizeOptions {
  /** Hauteur minimale en pixels */
  minHeight?: number;
  /** Hauteur maximale en pixels */
  maxHeight?: number;
  /** Est-on sur mobile */
  isMobile?: boolean;
}

interface UseTextareaAutosizeReturn {
  /** Ref à attacher au textarea */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Handler pour le changement de valeur (déclenche l'auto-resize) */
  handleTextareaChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Réinitialiser la taille du textarea */
  resetTextareaSize: () => void;
  /** Focus sur le textarea */
  focus: () => void;
  /** Blur le textarea */
  blur: () => void;
}

// Constantes par défaut
const DEFAULT_MIN_HEIGHT = 80;
const DEFAULT_MAX_HEIGHT = 160;

/**
 * Hook pour gérer l'auto-resize d'un textarea
 */
export function useTextareaAutosize({
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  isMobile = false,
}: UseTextareaAutosizeOptions = {}): UseTextareaAutosizeReturn {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialiser la hauteur au montage
  useEffect(() => {
    if (textareaRef.current && textareaRef.current.style) {
      try {
        textareaRef.current.style.height = `${minHeight}px`;
      } catch (error) {
        console.warn('Error initializing textarea:', error);
      }
    }
  }, [minHeight]);

  // Gérer le focus sur mobile
  useEffect(() => {
    if (!isMobile || !textareaRef.current) return;

    const textarea = textareaRef.current;

    const handleFocus = () => {
      // Petit délai pour laisser le clavier s'ouvrir
      setTimeout(() => {
        // Scroller le textarea dans la vue
        textarea.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });

        // Sur iOS, forcer un scroll supplémentaire
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
          setTimeout(() => {
            window.scrollTo({
              top: window.scrollY + 50,
              behavior: 'smooth',
            });
          }, 300);
        }
      }, 300);
    };

    textarea.addEventListener('focus', handleFocus);
    return () => textarea.removeEventListener('focus', handleFocus);
  }, [isMobile]);

  // Handler pour le changement de texte
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    if (!textarea.style) return;

    try {
      // Reset la hauteur pour calculer le scrollHeight réel
      textarea.style.height = 'auto';

      // Calculer la nouvelle hauteur
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

      textarea.style.height = `${newHeight}px`;

      // Activer le scroll si le contenu dépasse
      if (scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto';
      } else {
        textarea.style.overflowY = 'hidden';
      }

      // Auto-scroll vers la fin pendant la frappe
      textarea.scrollTop = textarea.scrollHeight;
    } catch (error) {
      console.warn('Error resizing textarea:', error);
    }
  }, [minHeight, maxHeight]);

  // Réinitialiser la taille
  const resetTextareaSize = useCallback(() => {
    if (textareaRef.current && textareaRef.current.style) {
      try {
        textareaRef.current.style.height = `${minHeight}px`;
        textareaRef.current.style.overflowY = 'hidden';
      } catch (error) {
        console.warn('Error resetting textarea:', error);
      }
    }

    // Sur mobile, faire le blur pour fermer le clavier
    if (isMobile && textareaRef.current) {
      textareaRef.current.blur();
      // Petit délai pour que le clavier se ferme avant le scroll
      setTimeout(() => {
        window.scrollTo(0, window.scrollY);
      }, 100);
    }
  }, [minHeight, isMobile]);

  // Focus sur le textarea
  const focus = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  // Blur le textarea
  const blur = useCallback(() => {
    textareaRef.current?.blur();
  }, []);

  return {
    textareaRef,
    handleTextareaChange,
    resetTextareaSize,
    focus,
    blur,
  };
}
