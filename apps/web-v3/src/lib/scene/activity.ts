import { scrollActivityLaw, type ScrollActivityState } from '@meeshy/shared/utils/scroll-activity';

import { armingLaw, velocityOf } from '@/lib/reading-mode/election';
import { SCENE_REST_DELAY_MS } from '@/lib/reading-mode/metrics';

/**
 * LA SOURCE D'ACTIVITÉ DU FIL (#5648) — UN état, DEUX consommateurs : le
 * révélé (heure, coches, Focal ET Script) et l'armement de l'élection
 * (Focal seul). Miroir de `noteScrollTimePillActivity`
 * (`MessageListViewController.swift:848-876`) : « UN horodatage `now`
 * partagé » entre les deux lois.
 *
 * Réducteur PUR — aucune horloge lue ici, l'appelant (`reading-mode/scene.ts`)
 * injecte `performance.now()`. Conçu pour la Lentille aussi (#5694) :
 * `mode` est le SEUL paramètre propre au Focal, le reste du réducteur ignore
 * quelle peau l'utilise.
 */

export type SceneMode = 'focal' | 'script';

export type SceneActivityState = {
  /** La loi PARTAGÉE du révélé (`@meeshy/shared/utils/scroll-activity`) — jamais recopiée. */
  readonly reveal: ScrollActivityState;
  /** Un geste UTILISATEUR est ouvert (`wheel`/`touchstart`/`keydown` sans fermeture depuis). */
  readonly intent: boolean;
  /** Début de la session de défilement COMPTÉE (nulle hors intention, ou fenêtre de révélé fermée). */
  readonly scrollStartedAt: number | null;
  readonly lastY: number | null;
  readonly lastAt: number | null;
  /** L'armement de l'élection (Focal seul) — SURVIT à la fermeture de la fenêtre de révélé. */
  readonly armed: boolean;
};

export type SceneEvent =
  | { readonly type: 'intent'; readonly at: number }
  | { readonly type: 'scrolled'; readonly at: number; readonly y: number }
  | { readonly type: 'tick'; readonly at: number }
  | { readonly type: 'programmatic' }
  | { readonly type: 'flatten' };

export const initialState = (): SceneActivityState => ({
  reveal: scrollActivityLaw.initialState(),
  intent: false,
  scrollStartedAt: null,
  lastY: null,
  lastAt: null,
  armed: false,
});

/**
 * L'APLATISSEMENT — miroir `flattenFocalScene` (:3239-3243) : l'armement
 * retombe à zéro, la session se referme. Exposée séparément de `reduce`
 * (elle ne dépend d'aucun `mode`) et utilisée par la branche `'flatten'`
 * ci-dessous — un seul corps, deux points d'entrée.
 */
export const flatten = (state: SceneActivityState): SceneActivityState => ({
  ...state,
  armed: false,
  scrollStartedAt: null,
});

export const reduce = (
  state: SceneActivityState,
  event: SceneEvent,
  { mode }: { readonly mode: SceneMode },
): SceneActivityState => {
  switch (event.type) {
    case 'intent':
      return { ...state, intent: true };

    case 'programmatic':
      return { ...state, intent: false };

    case 'scrolled': {
      // Un défilement PROGRAMMÉ (sans intention ouverte) laisse l'état
      // inchangé — miroir `noteFocalScrollTick`, gardé `isDragging ||
      // isDecelerating` (:3211) : jamais sur un `scrollTo` du code.
      if (!state.intent) return state;

      const reveal = scrollActivityLaw.reduce(state.reveal, { type: 'scrolled', at: event.at });
      const scrollStartedAt = state.scrollStartedAt ?? event.at;
      const velocity =
        state.lastY === null || state.lastAt === null
          ? 0
          : velocityOf({ previousY: state.lastY, previousAt: state.lastAt, y: event.y, at: event.at });
      const armed =
        mode === 'focal' &&
        armingLaw.isArmed({ alreadyArmed: state.armed, scrollStartedAt, now: event.at, velocity });

      return { ...state, reveal, scrollStartedAt, armed, lastY: event.y, lastAt: event.at };
    }

    case 'tick': {
      // La fenêtre de révélé s'est refermée (900 ms sans `scrolled`) : LA
      // session se referme (« fin de geste ≡ fin de fenêtre », D-22) —
      // `armed` SURVIT, comme `scrollViewDidEndDecelerating` (:2951) laisse
      // l'armement intact.
      //
      // L'INTENTION se referme AVEC elle (correction de revue #5648) : la
      // laisser ouverte faisait durer un geste utilisateur jusqu'à la fin de
      // la session React, et le PREMIER défilement programmé non annoncé
      // d'après (ancrage du navigateur, `scrollIntoView` d'un focus, une
      // remontée de liste) comptait alors comme un geste — exactement ce que
      // `isDragging || isDecelerating` (:3211) interdit côté iOS.
      if (scrollActivityLaw.isVisible(state.reveal, event.at)) return state;
      if (!state.intent && state.scrollStartedAt === null && state.lastY === null && state.lastAt === null) {
        return state;
      }
      return { ...state, intent: false, scrollStartedAt: null, lastY: null, lastAt: null };
    }

    case 'flatten':
      return flatten(state);
  }
};

/** L'heure et les coches sont révélées — Focal ET Script (D-22). */
export const isRevealed = (state: SceneActivityState, at: number): boolean =>
  scrollActivityLaw.isVisible(state.reveal, at);

export const isArmed = (state: SceneActivityState): boolean => state.armed;

/**
 * La scène est ACTIVE : armée, et le dernier `scrolled` compté remonte à
 * moins de `SCENE_REST_DELAY_MS` (4,5 s, miroir `FocalMetrics.Scene.restDelay`).
 */
export const isSceneActive = (state: SceneActivityState, at: number): boolean =>
  state.armed && state.reveal.lastScrolledAt !== null && at - state.reveal.lastScrolledAt < SCENE_REST_DELAY_MS;

export const sceneActivity = {
  initialState,
  reduce,
  flatten,
  isRevealed,
  isArmed,
  isSceneActive,
};
