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

/** Combien de temps une sortie attend avant de démonter, en mouvement et sous « Réduire les animations ». */
export type ExitTiming = { readonly exitMs: number; readonly reducedExitMs: number };

export const RAIL_EXIT: ExitTiming = { exitMs: EXIT_MS, reducedExitMs: REDUCED_EXIT_MS };

/** Un rail par défaut ; tout ce qui entre et repart à sa place (le texte de la pilule, #17406) passe sa propre durée. */
export function useRailPresence(open: boolean, { exitMs, reducedExitMs }: ExitTiming = RAIL_EXIT): RailPresence {
  const [shown, setShown] = useState(open);
  const [exited, setExited] = useState(!open);
  useEffect(() => {
    if (open) {
      setExited(false);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setExited(true), prefersReducedMotion() ? reducedExitMs : exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs, reducedExitMs]);
  return { mounted: open || !exited, shown: open && shown };
}
