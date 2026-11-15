import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { slotFlipKeyframes, type SlotBox } from './call-group-motion';
import { MORPH_MS, STOW_REDUCED_MS } from './call-pill-motion';

/**
 * **LE MOTEUR DOM DU MOUVEMENT DES VIGNETTES** (P14.10, lois dans `call-group-motion.ts`) — il mesure et joue ce que
 * la loi décide. Son chunk à lui (`budgets.json` › `call_stage_flip_engine`) : la grille le charge dès qu'elle est
 * montée (`use-stage-flip.ts`), et ne paie pas ses octets dans `call_grid`. Tout se joue en Web Animations, que la
 * règle générale de « Réduire les animations » (qui coupe les transitions CSS) n'éteint pas : c'est ce qui laisse le
 * fondu court exister.
 */

/** Une case par identité : l'attribut qui nomme la vignette qui l'occupe. */
const SLOT = 'data-call-slot';

const boxOf = (element: Element): SlotBox => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { x: left, y: top, width, height };
};

export type SlotBoxes = ReadonlyMap<string, SlotBox>;

/** Où se voit chaque case À CET INSTANT — un mouvement en cours compris : un mouvement interrompu repart d'où la vignette EST. */
export const measureSlots = (root: HTMLElement | null): SlotBoxes => new Map(root === null ? [] : [...root.querySelectorAll(`[${SLOT}]`)].map((slot) => [slot.getAttribute(SLOT) ?? '', boxOf(slot)] as const));

/** Chaque case rejoue l'inverse de son déplacement, de sa case d'avant (`from`) vers la sienne ; le mouvement en cours est annulé avant la mesure. */
export function playSlots(root: HTMLElement, from: SlotBoxes): void {
  const reducedMotion = prefersReducedMotion();
  for (const slot of root.querySelectorAll<HTMLElement>(`[${SLOT}]`)) {
    slot.getAnimations?.().forEach((running) => running.cancel());
    const before = from.get(slot.getAttribute(SLOT) ?? '');
    const frames = before === undefined || typeof slot.animate !== 'function' ? null : slotFlipKeyframes({ first: before, last: boxOf(slot), reducedMotion });
    if (frames !== null) slot.animate([...frames], { duration: reducedMotion ? STOW_REDUCED_MS : MORPH_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
  }
}
