import { useEffect } from 'react';

import { SCROLL_ACTIVITY_LINGER_MS } from '@meeshy/shared/utils/scroll-activity';

import type { DayPillRevealSubscriber } from './day-pill-reveal';

/**
 * L'HEURE ET LES POINTS D'UNE RANGÉE NE PARAISSENT QU'AU DÉFILEMENT (#9570,
 * directive porteur 2026-10-07 : « les points de conversation ne doivent
 * s'afficher que pendant le défilement ; après cela le point et la date du
 * dernier message disparaissent, comme dans une conversation »).
 *
 * Au repos, la rangée ne montre que le nom, l'aperçu et le badge de non-lus.
 * La liste RÉUTILISE la loi de la pilule de jour du fil
 * (`createDayPillRevealSubscriber`) : révélée pendant un défilement de
 * l'UTILISATEUR (jamais un défilement du code), effacée
 * `SCROLL_ACTIVITY_LINGER_MS` après le dernier — même délai, même courbe.
 * L'ouverture de la liste compte comme un défilement : les deux se montrent
 * une fois, une fenêtre, puis s'effacent — on apprend qu'ils existent.
 *
 * Le verdict est projeté sur `data-row-meta="revealed"` du DÉFILEUR, hors
 * React : aucune rangée ne se re-rend au défilement, et `lens-row-meta.css`
 * est seule à lire l'attribut. L'absence d'attribut est l'état de repos.
 *
 * `ready` attend la première page : un squelette n'a rien à annoncer.
 */
export type LensMetaTimers = {
  readonly setTimer: (run: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
};

const BROWSER_TIMERS: LensMetaTimers = {
  setTimer: (run, ms) => window.setTimeout(run, ms),
  clearTimer: (id) => window.clearTimeout(id),
};

export function useLensMetaReveal(
  frame: { readonly current: HTMLElement | null },
  {
    subscribe,
    ready,
    timers = BROWSER_TIMERS,
  }: { readonly subscribe: DayPillRevealSubscriber; readonly ready: boolean; readonly timers?: LensMetaTimers },
): void {
  useEffect(() => {
    if (!ready) return undefined;
    const element = frame.current;
    if (element === null) return undefined;

    const shown = { opening: true, scrolling: false };
    const project = (): void => {
      if (shown.opening || shown.scrolling) element.dataset.rowMeta = 'revealed';
      else delete element.dataset.rowMeta;
    };

    project();
    const opening = timers.setTimer(() => {
      shown.opening = false;
      project();
    }, SCROLL_ACTIVITY_LINGER_MS);
    const unsubscribe = subscribe((revealed) => {
      shown.scrolling = revealed;
      project();
    });

    return () => {
      timers.clearTimer(opening);
      unsubscribe();
      delete element.dataset.rowMeta;
    };
  }, [frame, subscribe, ready, timers]);
}
