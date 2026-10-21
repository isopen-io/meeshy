import { useLayoutEffect, useRef, type RefObject } from 'react';

import { flipKeyframes, type FlipPoint } from '@/lib/view/flip';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **`useFlip` JOUE LE DÉPLACEMENT D'UN ÉLÉMENT QUAND SA CLÉ CHANGE** (#11314).
 *
 * Il mesure la position de l'élément à CHAQUE rendu (le dernier relevé est
 * l'état « First » du changement suivant, glissé en cours compris) et ne joue
 * que lorsque `key` change : un geste qui redessine à chaque image ne se
 * rejoue pas en retard. `key: null` désarme le crochet. Le mouvement est la
 * loi pure `flipKeyframes` — `transform` et `opacity`, rien d'autre — et
 * « réduire le mouvement » rend la bascule sèche.
 */
export function useFlip(
  ref: RefObject<HTMLElement | null>,
  { key, duration, easing, fadeFrom }: { readonly key: string | null; readonly duration: number; readonly easing: string; readonly fadeFrom?: number },
): void {
  const previous = useRef<{ readonly key: string | null; readonly at: FlipPoint } | null>(null);
  const running = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || key === null) {
      previous.current = null;
      return;
    }
    running.current?.cancel();
    running.current = null;
    const rect = element.getBoundingClientRect();
    const last = { x: rect.left, y: rect.top };
    const before = previous.current;
    previous.current = { key, at: last };
    if (before === null || before.key === key || typeof element.animate !== 'function') return;
    const frames = flipKeyframes({ first: before.at, last, reducedMotion: prefersReducedMotion(), ...(fadeFrom === undefined ? {} : { fadeFrom }) });
    if (frames === null) return;
    running.current = element.animate([...frames], { duration, easing });
  });
}
