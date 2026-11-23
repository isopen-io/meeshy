import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * **LA MÉCANIQUE D'UNE PISTE `scroll-snap` PAGE PAR PAGE** — extraite du
 * carrousel de scènes du fil (`FeedSceneCarousel`, #6898) pour que la carte
 * d'un contenu partagé (#20234) fasse glisser ses pages par la MÊME loi :
 * le doigt fait défiler la piste nativement (un glissement ne produit aucun
 * clic, donc n'ouvre rien), les flèches et le clavier la font avancer, et la
 * page courante se relit à l'arrêt du geste, jamais par trame.
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `scrollLeft` est NÉGATIF sous `dir="rtl"` (Chromium, WebKit, Gecko
 * aujourd'hui) : la page se lit sur sa valeur absolue et la cible se pose
 * avec le signe de la direction — sinon, en arabe, `scrollTo({ left: +n })`
 * se borne à 0 et les flèches deviennent INERTES. */
function directionSign(element: Element): 1 | -1 {
  return typeof window !== 'undefined' && window.getComputedStyle(element).direction === 'rtl' ? -1 : 1;
}

const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

/** Le délai sans `scroll` après lequel un navigateur SANS `scrollend`
 * (Safari, dont la WebView iOS de la coque) considère le geste terminé. */
const SCROLL_SETTLE_MS = 120;

/** Tant que ce délai court après un défilement PROGRAMMATIQUE (flèche,
 * clavier), les `scroll`/`scrollend` intermédiaires d'une animation `smooth`
 * ne recalculent RIEN : un `Math.round` sur un `scrollLeft` encore PARTIEL
 * retomberait sur la page de départ, écrasant le `setPage(target)` déjà posé. */
const PROGRAMMATIC_GRACE_MS = 500;

export type SnapPagerTrackHandlers = {
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onScrollEnd?: () => void;
  readonly onScroll?: () => void;
};

export type SnapPager = {
  readonly trackRef: { current: HTMLDivElement | null };
  readonly current: number;
  readonly scrollTo: (index: number) => void;
  readonly trackHandlers: SnapPagerTrackHandlers;
};

export function useSnapPager(count: number): SnapPager {
  const [page, setPage] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const current = Math.min(page, Math.max(0, count - 1));
  const programmaticUntil = useRef(0);

  const scrollTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const target = Math.min(Math.max(index, 0), count - 1);
      if (track !== null && track.clientWidth > 0) {
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
    setPage(Math.min(Math.max(Math.round(Math.abs(track.scrollLeft) / track.clientWidth), 0), count - 1));
  }, [count]);

  // Repli SEULEMENT là où `scrollend` n'existe pas : un délai relancé à
  // chaque `scroll`, qui ne tire qu'une fois le geste arrêté — jamais un
  // calcul par trame pendant le glissement.
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

  // `backward`/`forward` gardent leur nom ; sous `dir="rtl"`, ← avance.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const toward = event.key === 'ArrowRight' ? 1 : -1;
      scrollTo(current + toward * directionSign(event.currentTarget));
    },
    [current, scrollTo],
  );

  return {
    trackRef,
    current,
    scrollTo,
    trackHandlers: supportsScrollEnd ? { onKeyDown, onScrollEnd: settle } : { onKeyDown, onScroll: onScrollWithoutScrollEnd },
  };
}
