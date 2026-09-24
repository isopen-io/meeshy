import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * UNE PISTE À DÉFILEMENT ACCROCHÉ, PILOTÉE PAR LE DOIGT, LES FLÈCHES ET LE
 * CLAVIER — le mécanisme, une fois (#6898, extrait par #7845).
 *
 * Né dans `FeedSceneCarousel`, qui avait payé le défaut qu'il corrige ; le
 * carrousel d'images d'une fiche d'administration l'a réécrit sans lui et l'a
 * rejoué à l'identique : « suivante » posait la page 1, lançait un défilement
 * `smooth`, et le PREMIER `scroll` de cette animation arrivait avec un
 * `scrollLeft` à 10 % de la largeur — `Math.round` rendait 0, et l'effet
 * ramenait la piste à la première diapositive. Les flèches et le clavier
 * étaient INERTES au navigateur, verts sous happy-dom, qui ne défile pas.
 * Deux copies d'un tel mécanisme divergent au premier correctif : il vit ici.
 *
 * - **Un défilement que l'application fait n'est pas un geste.** Pendant
 *   `PROGRAMMATIC_GRACE_MS` après une flèche ou une touche, aucun événement de
 *   défilement ne recalcule la page.
 * - **La page se recalcule au REPOS**, jamais à chaque trame : sur
 *   `scrollend` là où il existe, sinon après `SCROLL_SETTLE_MS` sans `scroll`
 *   (Safari, dont la WebView iOS de la coque).
 * - **`prefers-reduced-motion`** : le défilement est instantané, et la grâce
 *   nulle — il n'y a pas d'animation à ignorer.
 * - **RTL** : `scrollLeft` y est NÉGATIF ; la page se lit sur sa valeur
 *   absolue, la cible se pose avec le signe de la direction.
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function directionSign(element: Element): 1 | -1 {
  return typeof window !== 'undefined' && window.getComputedStyle(element).direction === 'rtl' ? -1 : 1;
}

const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

const SCROLL_SETTLE_MS = 120;

const PROGRAMMATIC_GRACE_MS = 500;

export type SnapTrackHandlers = { readonly onScrollEnd: () => void } | { readonly onScroll: () => void };

export type SnapCarousel<T extends HTMLElement> = {
  /** La page COURANTE, bornée au nombre de pages. */
  readonly current: number;
  readonly trackRef: RefObject<T | null>;
  /** Amène la page `index` (bornée) à l'écran, et la pose. */
  readonly scrollTo: (index: number) => void;
  /** Un pas VISUEL : `1` = vers la droite de l'écran, retourné sous RTL. */
  readonly step: (toward: 1 | -1, reference: Element) => void;
  /** À répandre sur la piste. */
  readonly trackHandlers: SnapTrackHandlers;
};

export function useSnapCarousel<T extends HTMLElement>(count: number): SnapCarousel<T> {
  const [page, setPage] = useState(0);
  const trackRef = useRef<T | null>(null);
  const current = Math.min(page, Math.max(0, count - 1));
  const programmaticUntil = useRef(0);

  const scrollTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const target = Math.min(Math.max(index, 0), Math.max(0, count - 1));
      if (track !== null && track.clientWidth > 0 && typeof track.scrollTo === 'function') {
        const reduced = prefersReducedMotion();
        programmaticUntil.current = performance.now() + (reduced ? 0 : PROGRAMMATIC_GRACE_MS);
        track.scrollTo({ left: directionSign(track) * target * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
      }
      setPage(target);
    },
    [count],
  );

  const settle = useCallback(() => {
    if (performance.now() < programmaticUntil.current) return;
    const track = trackRef.current;
    if (track === null || track.clientWidth === 0) return;
    setPage(Math.min(Math.max(Math.round(Math.abs(track.scrollLeft) / track.clientWidth), 0), Math.max(0, count - 1)));
  }, [count]);

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScrollWithoutScrollEnd = useCallback(() => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      settle();
    }, SCROLL_SETTLE_MS);
  }, [settle]);
  useEffect(
    () => () => {
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    },
    [],
  );

  const step = useCallback((toward: 1 | -1, reference: Element) => scrollTo(current + toward * directionSign(reference)), [current, scrollTo]);

  return {
    current,
    trackRef,
    scrollTo,
    step,
    trackHandlers: supportsScrollEnd ? { onScrollEnd: settle } : { onScroll: onScrollWithoutScrollEnd },
  };
}
