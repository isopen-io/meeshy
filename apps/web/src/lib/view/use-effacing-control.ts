import { useCallback, useEffect, useRef, useState } from 'react';

/** Le délai du lecteur plein écran : la pause s'efface une seconde après le début de la lecture (#9577). */
export const EFFACE_AFTER_MS = 1_000;

/**
 * UN CONTRÔLE QUI S'EFFACE PENDANT LA LECTURE (#9577) — affiché tant que rien
 * ne joue ; la lecture partie, il s'efface après `delayMs`. `reveal` le ramène
 * et réarme le délai. L'hôte décide de ce qu'« effacé » veut dire à l'écran :
 * ce hook ne retire rien du document.
 */
export function useEffacingControl(active: boolean, delayMs: number = EFFACE_AFTER_MS): { readonly effaced: boolean; readonly reveal: () => void } {
  const [effaced, setEffaced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const disarm = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const reveal = useCallback((): void => {
    disarm();
    setEffaced(false);
    if (activeRef.current) timer.current = setTimeout(() => setEffaced(true), delayMs);
  }, [delayMs, disarm]);

  useEffect(() => {
    reveal();
    return disarm;
  }, [active, reveal, disarm]);

  return { effaced: active && effaced, reveal };
}
