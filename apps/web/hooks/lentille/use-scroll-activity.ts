/**
 * `useScrollActivity` — WL-104 (LWS-10 / LWS-0).
 *
 * Peau REACT pure au-dessus de `scrollActivityLaw` (`packages/shared/utils/
 * scroll-activity.ts`, loi gelée, consommée telle quelle — jamais
 * réimplémentée). Ce hook ne connaît AUCUN DOM : il n'attache lui-même
 * aucun écouteur `scroll` — l'appelant (la pilule de la liste aujourd'hui,
 * le futur Focal web demain — workshop amendement A4 : « une loi, deux
 * libellés ») lui transmet chaque événement de défilement via
 * `notifyScrolled()`. C'est ce découplage qui rend le hook réutilisable sur
 * DEUX conteneurs de nature différente (liste vs fil) sans dupliquer la loi.
 *
 * Unités : MILLISECONDES de bout en bout (`Date.now()`, `setTimeout`,
 * `SCROLL_ACTIVITY_LINGER_MS` = 900) — la loi partagée est en ms (leçon des
 * correctifs V3 : ne jamais réintroduire une confusion de secondes).
 *
 * Un seul minuteur, réarmé à chaque `notifyScrolled()` — c'est la loi elle-
 * même (`reduce` + `isVisible`) qui arbitre visible/invisible, jamais une
 * condition dupliquée ici.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  scrollActivityLaw,
  SCROLL_ACTIVITY_LINGER_MS,
  type ScrollActivityState,
} from '@meeshy/shared/utils/scroll-activity';

export interface UseScrollActivityResult {
  readonly visible: boolean;
  /** À appeler par le conteneur consommateur à chaque événement de défilement. */
  readonly notifyScrolled: () => void;
}

export function useScrollActivity(): UseScrollActivityResult {
  const stateRef = useRef<ScrollActivityState>(scrollActivityLaw.initialState());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);

  const recomputeVisible = useCallback((at: number) => {
    setVisible(scrollActivityLaw.isVisible(stateRef.current, at));
  }, []);

  const notifyScrolled = useCallback(() => {
    const at = Date.now();
    stateRef.current = scrollActivityLaw.reduce(stateRef.current, { type: 'scrolled', at });
    recomputeVisible(at);

    if (timerRef.current) clearTimeout(timerRef.current);
    // « tick » au moment exact où la fenêtre de linger expire — c'est la loi
    // (`isVisible`) qui tranche, pas une soustraction dupliquée ici.
    timerRef.current = setTimeout(() => {
      recomputeVisible(Date.now());
    }, SCROLL_ACTIVITY_LINGER_MS);
  }, [recomputeVisible]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { visible, notifyScrolled };
}
