import { useLayoutEffect, useRef, type RefObject } from 'react';

import { flipKeyframes, type FlipBox, type FlipPoint } from '@/lib/view/flip';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

const pointOf = (element: HTMLElement | null): FlipBox | null => {
  if (element === null) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

/** Le centre horizontal vu d'un élément, un mouvement en cours compris. */
const centerXOf = (element: HTMLElement | null | undefined): number | null => {
  const rect = element?.getBoundingClientRect();
  return rect === undefined ? null : rect.left + rect.width / 2;
};

/** La propriété `scale` de l'élément (ma vignette rangée, G1.11) : la transformation jouée se compose sous elle. */
const carriedOf = (element: HTMLElement): FlipPoint | undefined => {
  const values = getComputedStyle(element).scale.trim().split(/\s+/).map((value) => (value.endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value)));
  const [x, y = x] = values;
  return x === undefined || !Number.isFinite(x) || y === undefined || !Number.isFinite(y) ? undefined : { x, y };
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
 * « réduire le mouvement » rend la bascule sèche, ou, pour un changement de
 * taille, un fondu de `reducedDuration`.
 */
export function useFlip(
  ref: RefObject<HTMLElement | null>,
  {
    key,
    duration,
    easing,
    fadeFrom,
    held = false,
    origin,
    reducedDuration = duration,
    carrier,
  }: {
    readonly key: string | null;
    readonly duration: number;
    readonly easing: string;
    readonly fadeFrom?: number;
    readonly held?: boolean;
    /** Déclarée, la boîte joue aussi son changement de taille, en échelle autour de cette ancre (fractions de sa taille). */
    readonly origin?: FlipPoint;
    /** La durée du fondu qui remplace le mouvement sous « réduire les animations ». Défaut : `duration`. */
    readonly reducedDuration?: number;
    /**
     * L'ancêtre qui, dans le MÊME rendu, rejoint son nouveau centre horizontal en glissant (`useFollowInline`) : il
     * porte l'élément d'une part du chemin, l'élément ne joue que le reste — sans lui, les deux glissés s'ajoutent
     * et l'élément part d'à côté de sa place. À ne déclarer que pour le rendu où l'ancêtre glisse vraiment.
     */
    readonly carrier?: (() => HTMLElement | null) | undefined;
  },
): void {
  const committed = useRef<string | null>(null);
  const first = useRef<FlipBox | null>(null);
  const carrierCenter = useRef<number | null>(null);
  const running = useRef<Animation | null>(null);

  if (key !== committed.current) {
    first.current = key === null || committed.current === null ? null : pointOf(ref.current);
    carrierCenter.current = centerXOf(carrier?.());
  }

  useLayoutEffect(() => {
    const before = committed.current;
    const from = first.current;
    const carrierFrom = carrierCenter.current;
    committed.current = key;
    first.current = null;
    carrierCenter.current = null;
    const element = ref.current;
    if (element === null || key === null || before === null || before === key || from === null) return;
    running.current?.cancel();
    running.current = null;
    if (held || typeof element.animate !== 'function') return;
    const seen = pointOf(element);
    if (seen === null) return;
    const reducedMotion = prefersReducedMotion();
    const carrierTo = carrierFrom === null || reducedMotion ? null : centerXOf(carrier?.());
    const last = carrierFrom === null || carrierTo === null ? seen : { ...seen, x: seen.x + carrierFrom - carrierTo };
    const carried = carriedOf(element);
    const frames = flipKeyframes({ first: from, last, reducedMotion, ...(fadeFrom === undefined ? {} : { fadeFrom }), ...(origin === undefined ? {} : { origin }), ...(carried === undefined ? {} : { carried }) });
    if (frames === null) return;
    running.current = element.animate([...frames], { duration: reducedMotion ? reducedDuration : duration, easing });
  }, [key]);
}
