import { useEffect, useRef, useState, type RefObject } from 'react';

import { nextPullPhase, releasePull, type PullPhase } from './pull-to-refresh';

export type UsePullToRefreshParams = {
  /** Le scrollport touché — le geste ne DÉMARRE que si `root.scrollTop === 0`
   * au `touchstart` (un doigt qui remonte une liste défilée ne tire jamais). */
  readonly root: RefObject<HTMLElement | null>;
  readonly onRefresh: () => Promise<void>;
  readonly threshold: number;
};

export type PullToRefresh = {
  readonly phase: PullPhase;
  /**
   * La distance à traduire en transform — bornée au seuil, `0` sous
   * `prefers-reduced-motion` (Q1 : « couper le MOUVEMENT, garder le geste » —
   * les phases et les annonces restent vivantes, seul le déplacement visuel
   * disparaît, motif `apps/ios/CLAUDE.md` § effets, règle 6). Régit le
   * SCROLLPORT (`pullTransform`) — jamais la marque, voir `reducedMotion`.
   */
  readonly offsetPx: number;
  /**
   * `true` sous `prefers-reduced-motion: reduce` (revue-correction #6195,
   * défaut 4). `PullIndicator` en a besoin EXPLICITEMENT : sous ce régime,
   * `offsetPx` reste à `0` quelle que soit la phase (ci-dessus), donc la
   * marque ne peut plus dériver sa position de repos de `offsetPx` sans se
   * peindre dans l'en-tête — elle doit ancrer sa position AUTREMENT quand ce
   * champ est vrai. Exposé en booléen explicite plutôt que redérivé dans le
   * composant : une seule lecture de `matchMedia`, la même que celle qui
   * pilote déjà `offsetPx` ci-dessus.
   */
  readonly reducedMotion: boolean;
};

const COMPLETING_MS = 400;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * `usePullToRefresh` (#6195) — le tirer-pour-rafraîchir de la Lentille, sur
 * des écouteurs `touch*` natifs plutôt qu'un `.refreshable` que le web n'a
 * pas (§ 1.8 de la spécification). AUCUN équivalent souris/clavier (Q1, comme
 * `.refreshable` iOS) : le focus/reconnexion/socket rafraîchissent déjà —
 * « jamais un bouton de plus ».
 */
export function usePullToRefresh({ root, onRefresh, threshold }: UsePullToRefreshParams): PullToRefresh {
  const [phase, setPhase] = useState<PullPhase>({ kind: 'idle' });
  const startYRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const node = root.current;
    if (node === null) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      if (phaseRef.current.kind === 'refreshing' || phaseRef.current.kind === 'completing') return;
      const touch = event.touches[0];
      if (touch === undefined || node.scrollTop > 0) {
        startYRef.current = null;
        return;
      }
      startYRef.current = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      const startY = startYRef.current;
      if (startY === null) return;
      const touch = event.touches[0];
      if (touch === undefined) return;
      const distance = touch.clientY - startY;
      /**
       * LE DÉFILEMENT NATIF N'EST VOLÉ QUE PAR UN TIRER RÉEL
       * (revue-correction #6195, défaut BLOQUANT). `nextPullPhase` est
       * désormais le miroir EXACT d'iOS, y compris sur ce point : `distance
       * <= 0 ⇒ idle` (`MeeshyPullPhaseLaw.next`, `guard pullDistance > 0`,
       * `MeeshyRefreshableScroll.swift:206-209`) — la loi elle-même refuse le
       * geste sous ce rang, l'hôte n'a plus besoin d'être seul à le garder
       * (revue-correction #6195, défaut 7). Ici, l'hôte abandonne quand même
       * `distance < 0` AVANT d'appeler la loi : le doigt REMONTE, la suite du
       * même glissement doit rester un défilement natif jusqu'au `touchend`,
       * sans même le détour par `nextPullPhase`. `distance === 0` reste
       * indécidable (le premier échantillon d'un glissement lent le vaut
       * souvent) : on ne prend NI le geste NI le défilement, et le suivant
       * tranchera.
       */
      if (distance <= 0) {
        if (distance < 0) {
          startYRef.current = null;
          const kind = phaseRef.current.kind;
          if (kind === 'pulling' || kind === 'armed') setPhase({ kind: 'idle' });
        }
        return;
      }
      const next = nextPullPhase(phaseRef.current, distance, threshold);
      if (next === null) return;
      event.preventDefault();
      setPhase(next);
    };

    const onTouchEnd = () => {
      const startY = startYRef.current;
      startYRef.current = null;
      if (startY === null) return;
      const released = releasePull(phaseRef.current);
      setPhase(released);
      if (released.kind !== 'refreshing') return;
      onRefreshRef
        .current()
        .then(() => {
          setPhase({ kind: 'completing', outcome: 'ok' });
        })
        .catch(() => {
          setPhase({ kind: 'completing', outcome: 'failed' });
        })
        .finally(() => {
          setTimeout(() => setPhase({ kind: 'idle' }), COMPLETING_MS);
        });
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd, { passive: true });
    node.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [root, threshold]);

  const reducedMotion = prefersReducedMotion();
  const offsetPx =
    phase.kind === 'pulling'
      ? reducedMotion
        ? 0
        : phase.progress * threshold
      : phase.kind === 'armed' || phase.kind === 'refreshing'
        ? reducedMotion
          ? 0
          : threshold
        : 0;

  return { phase, offsetPx, reducedMotion };
}
