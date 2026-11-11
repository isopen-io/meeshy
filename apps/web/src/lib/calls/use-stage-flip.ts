import { useLayoutEffect, useRef, type RefObject } from 'react';

import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { slotFlipKeyframes, type SlotBox } from './call-group-stage';
import { MORPH_MS, STOW_REDUCED_MS } from './call-pill-motion';

/** Une case par identité : l'attribut qui nomme la vignette qui l'occupe. */
const SLOT = 'data-call-slot';

const boxOf = (element: Element): SlotBox => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { x: left, y: top, width, height };
};

const measure = (root: HTMLElement | null): ReadonlyMap<string, SlotBox> => new Map(root === null ? [] : [...root.querySelectorAll(`[${SLOT}]`)].map((slot) => [slot.getAttribute(SLOT) ?? '', boxOf(slot)] as const));

/**
 * **CHAQUE VIGNETTE PASSE DE SA CASE À LA SUIVANTE PAR SON IDENTITÉ** (P14.10, miroir de
 * `GroupCallStageGeometry` d'Android) — grille, à la une et bandeau sont des arbres distincts, mais une
 * personne garde son `data-call-slot` d'un arbre à l'autre : quand `key` change, l'état « First » se relève
 * AU RENDU qui le change (le DOM montre encore l'ancienne scène, un mouvement en cours compris : un
 * mouvement interrompu repart d'où la vignette EST), et au retour de la mise en page chaque case
 * rejoue l'inverse de son déplacement (`slotFlipKeyframes`, `transform` seul, origine en haut à gauche —
 * `origin-top-left` sur la case). « Réduire les animations » : un fondu court, par le même moteur Web
 * Animations. Rien n'est mesuré tant que `key` ne change pas.
 */
export function useStageFlip(root: RefObject<HTMLElement | null>, key: string): void {
  const committed = useRef(key);
  const first = useRef<ReadonlyMap<string, SlotBox> | null>(null);
  if (key !== committed.current && first.current === null) first.current = measure(root.current);

  useLayoutEffect(() => {
    const from = first.current;
    first.current = null;
    committed.current = key;
    const scene = root.current;
    if (from === null || scene === null) return;
    const reducedMotion = prefersReducedMotion();
    for (const slot of scene.querySelectorAll<HTMLElement>(`[${SLOT}]`)) {
      slot.getAnimations?.().forEach((running) => running.cancel());
      const before = from.get(slot.getAttribute(SLOT) ?? '');
      const frames = before === undefined || typeof slot.animate !== 'function' ? null : slotFlipKeyframes({ first: before, last: boxOf(slot), reducedMotion });
      if (frames !== null) slot.animate([...frames], { duration: reducedMotion ? STOW_REDUCED_MS : MORPH_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
    }
  }, [key]);
}
