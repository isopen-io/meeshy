import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import type { SlotBoxes } from './stage-flip-engine';

type Engine = typeof import('./stage-flip-engine');

let loaded: Engine | null = null;

/** Le moteur, chargé UNE fois (l'import dynamique se retient lui-même) : la grille le demande à son montage, bien avant le premier toucher. */
export const loadStageFlip = (): Promise<Engine> => import('./stage-flip-engine').then((module) => (loaded = module));

/**
 * **CHAQUE VIGNETTE PASSE DE SA CASE À LA SUIVANTE PAR SON IDENTITÉ** (P14.10, miroir de
 * `GroupCallStageGeometry` d'Android) — grille, à la une et bandeau sont des arbres distincts, mais une
 * personne garde son `data-call-slot` d'un arbre à l'autre : quand `key` change, l'état « First » se relève
 * AU RENDU qui le change (le DOM montre encore l'ancienne scène, un mouvement en cours compris), et au retour
 * de la mise en page chaque case rejoue l'inverse de son déplacement (`call-group-motion.ts`, `transform` seul,
 * origine en haut à gauche — `origin-top-left` sur la case). « Réduire les animations » : un fondu court.
 * Rien n'est mesuré tant que `key` ne change pas, ni tant que le moteur (son chunk) n'est pas là.
 */
export function useStageFlip(root: RefObject<HTMLElement | null>, key: string): void {
  const committed = useRef(key);
  const first = useRef<SlotBoxes | null>(null);
  useEffect(() => void loadStageFlip().catch(() => undefined), []);
  if (key !== committed.current && first.current === null && loaded !== null) first.current = loaded.measureSlots(root.current);

  useLayoutEffect(() => {
    const from = first.current;
    first.current = null;
    committed.current = key;
    if (from !== null && root.current !== null) loaded?.playSlots(root.current, from);
  }, [key]);
}
