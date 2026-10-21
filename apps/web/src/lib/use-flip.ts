import { useLayoutEffect, useRef, type RefObject } from 'react';

import { flipKeyframes, type FlipPoint } from '@/lib/view/flip';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

const pointOf = (element: HTMLElement | null): FlipPoint | null => {
  if (element === null) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
};

/**
 * **`useFlip` JOUE LE DÉPLACEMENT D'UN ÉLÉMENT QUAND SA CLÉ CHANGE** (#11314).
 *
 * L'état « First » se relève AU RENDU qui change la clé, quand le DOM montre
 * encore l'état d'avant (mouvement en cours compris) — jamais au rendu
 * précédent : la page a pu défiler entre les deux, et ce défilement n'est pas
 * un déplacement. Rien n'est mesuré tant que la clé ne change pas, et un rendu
 * qui la garde n'interrompt pas le mouvement en cours. `key: null` désarme le
 * crochet. `held` dit que l'état d'arrivée est TENU par le doigt : rien ne s'y
 * joue (le mouvement en cours s'interrompt, le doigt a la main), et le lâcher,
 * qui change la clé, repart de là où le doigt l'a laissé. Le mouvement est la
 * loi pure `flipKeyframes` — `transform` et `opacity`, rien d'autre — et
 * « réduire le mouvement » rend la bascule sèche.
 */
export function useFlip(
  ref: RefObject<HTMLElement | null>,
  {
    key,
    duration,
    easing,
    fadeFrom,
    held = false,
  }: { readonly key: string | null; readonly duration: number; readonly easing: string; readonly fadeFrom?: number; readonly held?: boolean },
): void {
  const committed = useRef<string | null>(null);
  const first = useRef<FlipPoint | null>(null);
  const running = useRef<Animation | null>(null);

  if (key !== committed.current) first.current = key === null || committed.current === null ? null : pointOf(ref.current);

  useLayoutEffect(() => {
    const before = committed.current;
    const from = first.current;
    committed.current = key;
    first.current = null;
    const element = ref.current;
    if (element === null || key === null || before === null || before === key || from === null) return;
    running.current?.cancel();
    running.current = null;
    if (held || typeof element.animate !== 'function') return;
    const last = pointOf(element);
    if (last === null) return;
    const frames = flipKeyframes({ first: from, last, reducedMotion: prefersReducedMotion(), ...(fadeFrom === undefined ? {} : { fadeFrom }) });
    if (frames === null) return;
    running.current = element.animate([...frames], { duration, easing });
  }, [key]);
}
