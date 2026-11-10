import { useEffect, useState } from 'react';

import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **UN RAIL ENTRE PAR SON BORD ET EN SORT PAR LUI** (#17327) — la présence
 * d'un rail du duo, en deux moitiés qui ne se connaissent pas :
 *
 * - `mounted` : le rail est dans le DOM — dès qu'il est demandé, et jusqu'à la
 *   fin de sa sortie. Un rail fermé ne laisse rien derrière lui ;
 * - `shown` : le rail est à sa place. Un rail qui s'ouvre se monte d'abord
 *   HORS de l'écran, puis une image plus tard glisse à sa place (sinon la
 *   transition n'aurait rien à parcourir) ; qui se ferme repart vers son
 *   bord, et ne se démonte qu'une fois parti.
 *
 * Seules la transformation et l'opacité bougent (`check-animated-properties.mjs`) ;
 * la transition CSS est interruptible, un bouton touché pendant le mouvement
 * répond. « Réduire les animations » la remplace par un fondu court : la
 * sortie y attend {@link REDUCED_EXIT_MS}, pas {@link EXIT_MS}.
 */

export const EXIT_MS = 300;

export const REDUCED_EXIT_MS = 150;

export type RailPresence = { readonly mounted: boolean; readonly shown: boolean };

export function useRailPresence(open: boolean): RailPresence {
  const [shown, setShown] = useState(open);
  const [exited, setExited] = useState(!open);
  useEffect(() => {
    if (open) {
      setExited(false);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setExited(true), prefersReducedMotion() ? REDUCED_EXIT_MS : EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return { mounted: open || !exited, shown: open && shown };
}
