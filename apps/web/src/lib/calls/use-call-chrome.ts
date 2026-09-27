import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { chromeHidden, CHROME_IDLE_MS } from './call-controls';

/**
 * **LE MASQUAGE AUTOMATIQUE DES COMMANDES D'UNE VIDÉO** (#8391) — le branchement
 * DOM de `chromeHidden` : tout geste sur l'écran d'appel (toucher, souris,
 * clavier, focus) remet l'horloge à zéro ; au bout de `CHROME_IDLE_MS` sans
 * geste, pilule, rails et en-tête s'effacent — seulement sur une scène vidéo,
 * jamais avec le focus CLAVIER dans les commandes (`:focus-visible`), jamais
 * sous `prefers-reduced-motion`. Toucher la scène les rend.
 *
 * Un geste n'écrit qu'une référence : bouger la souris ne rend pas l'écran
 * d'appel à chaque pixel. Seul le passage caché ↔ visible est un état.
 */

const GESTURES = ['pointerdown', 'pointermove', 'keydown', 'focusin', 'wheel'] as const;

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const keyboardInside = (controls: HTMLElement | null): boolean => {
  const focused = typeof document === 'undefined' ? null : document.activeElement;
  return controls !== null && focused instanceof HTMLElement && controls.contains(focused) && focused.matches(':focus-visible');
};

type ChromeInput = { readonly videoScene: boolean; readonly root: RefObject<HTMLElement | null>; readonly controls: RefObject<HTMLElement | null> };

export function useCallChrome({ videoScene, root, controls }: ChromeInput): boolean {
  const [hidden, setHidden] = useState(false);
  const lastGesture = useRef(Date.now());
  const wake = useCallback(() => {
    lastGesture.current = Date.now();
    setHidden(false);
  }, []);

  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    GESTURES.forEach((name) => element.addEventListener(name, wake, { passive: true }));
    return () => GESTURES.forEach((name) => element.removeEventListener(name, wake));
  }, [root, wake]);

  useEffect(() => {
    if (!videoScene || hidden || prefersReducedMotion()) return undefined;
    const pending = { handle: setTimeout(() => undefined, 0) };
    const check = (): void => {
      const idleMs = Date.now() - lastGesture.current;
      const hide = chromeHidden({ videoScene, idleMs, keyboardInside: keyboardInside(controls.current), reducedMotion: false });
      if (hide) {
        setHidden(true);
        return;
      }
      pending.handle = setTimeout(check, idleMs >= CHROME_IDLE_MS ? CHROME_IDLE_MS : CHROME_IDLE_MS - idleMs);
    };
    pending.handle = setTimeout(check, Math.max(0, CHROME_IDLE_MS - (Date.now() - lastGesture.current)));
    return () => clearTimeout(pending.handle);
  }, [videoScene, hidden, controls]);

  return videoScene && hidden;
}
