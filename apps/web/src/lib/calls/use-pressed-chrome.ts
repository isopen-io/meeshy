import { useRef } from 'react';

/**
 * **LES COMMANDES ÉTAIENT-ELLES RANGÉES QUAND LE DOIGT S'EST POSÉ ?** (G1.9, #17548) — un toucher
 * sur une vignette qui range ou rend les commandes se décide à la DESCENTE du pointeur : sous
 * Chromium (navigateur, coque Android) le focus que le doigt donne au `<button>` de la vignette
 * rend les commandes (`focusin`) AVANT le clic, qui les lirait alors visibles et mettrait la
 * vignette à la une au lieu de seulement les rendre. Le duo (ma vignette) et la grille s'en servent.
 * Le clavier n'a pas de descente : `clear` rend la main à l'état courant.
 */
export function usePressedChrome(chromeVisible: boolean): { readonly press: () => void; readonly release: () => boolean; readonly clear: () => void } {
  const pressedHidden = useRef<boolean | null>(null);
  return {
    press: () => {
      pressedHidden.current = !chromeVisible;
    },
    /** Les commandes étaient rangées au toucher : le clic les rend. */
    release: () => {
      const hidden = pressedHidden.current ?? !chromeVisible;
      pressedHidden.current = null;
      return hidden;
    },
    clear: () => {
      pressedHidden.current = null;
    },
  };
}
