import { useEffect } from 'react';

import { SCROLL_ACTIVITY_LINGER_MS } from '@meeshy/shared/utils/scroll-activity';

import * as sceneActivity from '@/lib/scene/activity';
import type { SceneActivityState, SceneEvent } from '@/lib/scene/activity';

/**
 * LA PILULE DE JOUR NE RECOUVRE RIEN AU REPOS (#6101) — décision tranchée le
 * 2026-09-13, écrite dans `decisions.md` § « La pilule de jour s'efface au
 * repos ».
 *
 * La pilule est un overlay posé sous la bande de l'en-tête ; au repos, elle
 * tombait sur la première rangée lisible et en masquait le nom d'auteur. Elle
 * se RÉVÈLE donc pendant le seul geste où elle sert — l'utilisateur fait
 * défiler le fil et cherche OÙ il est — et s'efface une fenêtre après son
 * dernier défilement. La fenêtre est celle de la pilule jour·heure d'iOS
 * (`ScrollTimePillState.swift`, `lingerMs = 900`), c'est-à-dire la loi
 * PARTAGÉE du révélé (`SCROLL_ACTIVITY_LINGER_MS`) : aucune seconde horloge.
 *
 * Un défilement du CODE — l'ancrage en bas à l'ouverture, « revenir en bas »,
 * le saut vers une citation — ne la révèle jamais : `sceneActivity.reduce`
 * ignore un `scrolled` sans intention ouverte. Un fil qui s'ouvre est donc au
 * repos dès sa première image, sans éclair de pilule.
 */
export const dayPillRevealed = (state: SceneActivityState, at: number): boolean =>
  (state.origin === 'touch' && state.held) || sceneActivity.isRevealed(state, at);

export type DayPillRevealListener = (revealed: boolean) => void;
export type DayPillRevealSubscriber = (listener: DayPillRevealListener) => () => void;

export type DayPillRevealClock = {
  readonly now: () => number;
  readonly setTimer: (run: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
};

const BROWSER_CLOCK: DayPillRevealClock = {
  now: () => performance.now(),
  setTimer: (run, ms) => window.setTimeout(run, ms),
  clearTimer: (id) => window.clearTimeout(id),
};

/**
 * Les événements du défileur, réduits par la loi PARTAGÉE `scene/activity.ts`
 * — une instance de réducteur propre à la pilule, comme celle du chrome
 * (`use-thread-chrome.ts`) : deux consommateurs de la même loi, jamais deux
 * lois. L'écouteur n'est appelé qu'aux TRANSITIONS ; la fermeture de la
 * fenêtre est portée par UN minuteur armé sur son échéance, jamais par un
 * intervalle qui tournerait pendant la lecture.
 */
export function createDayPillRevealSubscriber(
  scroller: { readonly current: HTMLElement | null },
  clock: DayPillRevealClock = BROWSER_CLOCK,
): DayPillRevealSubscriber {
  return (listener) => {
    const element = scroller.current;
    if (element === null) return () => {};

    const cursor: { state: SceneActivityState; shown: boolean; timer: number | null } = {
      state: sceneActivity.initialState(),
      shown: false,
      timer: null,
    };

    const cancelTimer = () => {
      if (cursor.timer === null) return;
      clock.clearTimer(cursor.timer);
      cursor.timer = null;
    };

    const project = () => {
      const at = clock.now();
      const revealed = dayPillRevealed(cursor.state, at);
      if (revealed !== cursor.shown) {
        cursor.shown = revealed;
        listener(revealed);
      }
      cancelTimer();
      const lastScrolledAt = cursor.state.reveal.lastScrolledAt;
      const fingerHolds = cursor.state.origin === 'touch' && cursor.state.held;
      if (!revealed || fingerHolds || lastScrolledAt === null) return;
      cursor.timer = clock.setTimer(
        () => {
          cursor.timer = null;
          dispatch({ type: 'tick', at: clock.now() });
        },
        Math.max(0, lastScrolledAt + SCROLL_ACTIVITY_LINGER_MS - at),
      );
    };

    const dispatch = (event: SceneEvent) => {
      cursor.state = sceneActivity.reduce(cursor.state, event, { mode: 'bubbles' });
      project();
    };

    const onGrab = () => dispatch({ type: 'grab', at: clock.now() });
    const onRelease = () => dispatch({ type: 'release', at: clock.now() });
    const onIndirectIntent = () => dispatch({ type: 'intent', at: clock.now(), origin: 'indirect' });
    const onScroll = () => dispatch({ type: 'scrolled', at: clock.now(), y: element.scrollTop });

    element.addEventListener('touchstart', onGrab, { passive: true });
    element.addEventListener('touchend', onRelease, { passive: true });
    element.addEventListener('touchcancel', onRelease, { passive: true });
    element.addEventListener('wheel', onIndirectIntent, { passive: true });
    element.addEventListener('keydown', onIndirectIntent, { passive: true });
    element.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      element.removeEventListener('touchstart', onGrab);
      element.removeEventListener('touchend', onRelease);
      element.removeEventListener('touchcancel', onRelease);
      element.removeEventListener('wheel', onIndirectIntent);
      element.removeEventListener('keydown', onIndirectIntent);
      element.removeEventListener('scroll', onScroll);
      cancelTimer();
    };
  };
}

/**
 * Projette le verdict sur `data-day-pill="revealed"` de l'HÔTE commun du fil,
 * HORS React — même discipline que `data-chrome-header` : le défilement ne
 * re-rend jamais l'écran. L'ABSENCE de l'attribut est l'état de repos, donc
 * le premier rendu (avant tout abonnement) est déjà juste : `thread-scene.css`
 * n'affiche la pilule que sous l'attribut.
 */
export function useDayPillReveal(
  host: { readonly current: HTMLElement | null },
  { subscribe, ready }: { readonly subscribe: DayPillRevealSubscriber; readonly ready: boolean },
): void {
  useEffect(() => {
    if (!ready) return undefined;
    const unsubscribe = subscribe((revealed) => {
      const element = host.current;
      if (element === null) return;
      if (revealed) element.dataset.dayPill = 'revealed';
      else delete element.dataset.dayPill;
    });
    return () => {
      unsubscribe();
      const element = host.current;
      if (element !== null) delete element.dataset.dayPill;
    };
  }, [host, subscribe, ready]);
}
