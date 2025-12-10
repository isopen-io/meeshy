/**
 * Hook pour gérer le clavier virtuel sur mobile
 * Détecte l'ouverture/fermeture du clavier et ajuste le layout en conséquence
 */

import { useEffect, useState } from 'react';

interface VirtualKeyboardState {
  isOpen: boolean;
  keyboardHeight: number;
  viewportHeight: number;
}

export function useVirtualKeyboard() {
  const [keyboardState, setKeyboardState] = useState<VirtualKeyboardState>({
    isOpen: false,
    keyboardHeight: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    // Vérifier si visualViewport est supporté
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const handleResize = () => {
      const visualViewport = window.visualViewport!;
      const windowHeight = window.innerHeight;
      const viewportHeight = visualViewport.height;

      // Le clavier est ouvert si la hauteur du visualViewport est significativement
      // inférieure à la hauteur de la fenêtre (différence > 150px = clavier ouvert)
      const keyboardHeight = windowHeight - viewportHeight;
      const isKeyboardOpen = keyboardHeight > 150;

      setKeyboardState({
        isOpen: isKeyboardOpen,
        keyboardHeight: isKeyboardOpen ? keyboardHeight : 0,
        viewportHeight,
      });
    };

    // Écouter les changements de taille du viewport
    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);

    // Initialiser l'état
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  return keyboardState;
}
