import { useEffect, useState } from 'react';

export const IDLE_CHROME_DELAY_MS = 4000;

/**
 * LE CHROME QUI S'EFFACE PENDANT L'ÉCOUTE — miroir d'`AudioFullscreenView`
 * iOS : tant qu'un vocal joue et que l'utilisateur ne touche à rien, barres
 * haute et basse cèdent la place au lecteur. Le moindre geste (pointeur,
 * toucher, clavier) les rend, la pause aussi. Rend `true` quand le chrome doit
 * être masqué.
 */
export function useIdleChrome({ active, delayMs = IDLE_CHROME_DELAY_MS }: { readonly active: boolean; readonly delayMs?: number }): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!active) {
      setIdle(false);
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), delayMs);
    };
    const wake = (): void => {
      setIdle(false);
      arm();
    };
    arm();
    const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const name of events) window.addEventListener(name, wake, { passive: true });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake);
    };
  }, [active, delayMs]);

  return active && idle;
}
