import { useLayoutEffect, useRef, type RefObject } from 'react';

import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { STOW_REDUCED_MS, SWAP_MS, swapMs } from './call-pill-motion';
import { useRailPresence } from './use-rail-presence';

/**
 * **LE JOURNAL S'OUVRE ET SE FERME EN FONDU GLISSÉ** (#17878, A1.4 ; `BubbleCallJournalUnderCard.swift` :
 * `.opacity` combiné à `.move(edge: .top)`, un fondu de 0,15 s sous « Réduire les animations ») — monté dès
 * qu'il est demandé et jusqu'à la fin de son départ, qui est l'inverse de son arrivée. Joué par le moteur
 * Web Animations — la feuille de l'application coupe les transitions CSS sous « Réduire les animations » —,
 * transformation et opacité seules (`check-animated-properties.mjs`), interruptible : un mouvement repris en
 * route part de l'opacité affichée à cet instant.
 *
 * `instant` : la rangée vient d'être remontée par le fil virtualisé avec son journal déjà déplié
 * (`call-journal-memory.ts`) — rien à rejouer, il est là.
 */
const GLIDE_PX = 8;

const EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

const keyframes = (entering: boolean, reduced: boolean): readonly Keyframe[] => {
  const shown: Keyframe = reduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0)' };
  const gone: Keyframe = reduced ? { opacity: 0 } : { opacity: 0, transform: `translateY(-${GLIDE_PX}px)` };
  return entering ? [gone, shown] : [shown, gone];
};

export function useJournalFold<E extends HTMLElement>(open: boolean, instant: boolean): { readonly mounted: boolean; readonly ref: RefObject<E | null> } {
  const { mounted } = useRailPresence(open, { exitMs: SWAP_MS, reducedExitMs: STOW_REDUCED_MS });
  const ref = useRef<E | null>(null);
  const running = useRef<Animation | null>(null);
  const settled = useRef(instant);
  useLayoutEffect(() => {
    const element = ref.current;
    const skip = settled.current && open;
    settled.current = false;
    if (skip || element === null || typeof element.animate !== 'function') return;
    const reduced = prefersReducedMotion();
    const [from = {}, to = {}] = keyframes(open, reduced);
    const resumed = (running.current?.effect as KeyframeEffect | null | undefined)?.target === element;
    running.current?.cancel();
    running.current = element.animate([resumed ? { ...from, opacity: getComputedStyle(element).opacity } : from, to], { duration: swapMs(reduced), easing: EASING, fill: open ? 'none' : 'forwards' });
    running.current.finished?.catch(() => undefined);
  }, [open]);
  return { mounted, ref };
}
