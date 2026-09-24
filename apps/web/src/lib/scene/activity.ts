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

/** D'où vient le geste ouvert — le DOIGT (`touch`) ou un périphérique indirect (molette, clavier). */
export type GestureOrigin = 'touch' | 'indirect';

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
  /**
   * LE DOIGT EST POSÉ SUR LE VERRE (#5774, travail 3/3) — `touchstart` a eu
   * lieu, `touchend`/`touchcancel` pas encore. NE SUFFIT PAS à dire que la
   * liste est TIRÉE : un simple appui (ouvrir le menu d'un message, poser
   * une réaction) pose ce fait et ne fait défiler RIEN.
   */
  readonly touching: boolean;
  /**
   * LA LISTE EST TIRÉE (#5774, travail 3/3) — miroir EXACT d'`isDragging`
   * (`MessageListViewController.swift:585-592`), qui côté UIKit ne devient
   * vrai qu'à `scrollViewWillBeginDragging`, c'est-à-dire quand le doigt a
   * franchi le seuil de panoramique — JAMAIS au simple contact.
   *
   * Le web n'a pas cet événement : son équivalent mesuré est « le doigt est
   * posé ET la liste a bougé depuis ». Sans cette seconde moitié, un TAP
   * escamotait tout le chrome le temps de l'appui puis le ramenait — mesuré
   * au navigateur pendant la revue de ce lot : `touchstart` seul suffisait à
   * poser `data-chrome-header="entire"` et à faire tomber l'en-tête à
   * `opacity: 0` en 250 ms, sur chaque tape d'une bulle.
   */
  readonly held: boolean;
  /** D'où vient le geste ACTUELLEMENT ouvert (`grab`/`intent`) — `null` avant tout geste. */
  readonly origin: GestureOrigin | null;
};

export type SceneEvent =
  | { readonly type: 'intent'; readonly at: number; readonly origin?: GestureOrigin }
  | { readonly type: 'scrolled'; readonly at: number; readonly y: number }
  | { readonly type: 'tick'; readonly at: number }
  | { readonly type: 'programmatic' }
  | { readonly type: 'flatten' }
  /** Le doigt se POSE (`touchstart`) — miroir `isDragging = true`. */
  | { readonly type: 'grab'; readonly at: number }
  /** Le doigt se LÈVE (`touchend`/`touchcancel`) — miroir `isDragging = false`. */
  | { readonly type: 'release'; readonly at: number };

export const initialState = (): SceneActivityState => ({
  reveal: scrollActivityLaw.initialState(),
  intent: false,
  scrollStartedAt: null,
  lastY: null,
  lastAt: null,
  armed: false,
  touching: false,
  held: false,
  origin: null,
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
  /**
   * Élargi à `'bubbles' | 'summary'` (#5774, travail 3/3) : le CHROME du
   * fil (`view/use-thread-chrome.ts`) consomme cette loi dans TOUS les
   * modes, y compris ceux où l'ÉLECTION (`armed`) ne joue aucun rôle —
   * `armed` reste `false` pour ces modes (`mode === 'focal'` seul arme),
   * `SceneMode` continue de nommer les DEUX modes armables.
   */
  { mode }: { readonly mode: SceneMode | 'bubbles' | 'summary' },
): SceneActivityState => {
  switch (event.type) {
    case 'intent':
      return { ...state, intent: true, origin: event.origin ?? state.origin ?? 'indirect' };

    case 'grab':
      // Le doigt se pose : un geste TOUCH s'ouvre, comme un `intent`. `held`
      // reste FAUX — il faut encore que la liste BOUGE (`scrolled` ci-dessous)
      // pour que ce contact devienne un TIRAGE, seul état qu'`isDragging`
      // nomme côté iOS (:585-592).
      return { ...state, intent: true, origin: 'touch', touching: true, held: false };

    case 'release':
      // « Le doigt est un FAIT » (#5774) — `release` referme le contact ET le
      // tirage, jamais `intent` : la fenêtre de révélé partagée continue de
      // fermer l'intention à l'heure (`tick`), exactement comme avant ce geste.
      return { ...state, touching: false, held: false };

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

      // LA SECONDE MOITIÉ D'`isDragging` : la liste a bougé pendant que le
      // doigt est posé — ce contact est un TIRAGE, plus un appui.
      return { ...state, reveal, scrollStartedAt, armed, held: state.touching, lastY: event.y, lastAt: event.at };
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
 * LE GESTE EST TENU (#5774, travail 3/3) — le signal que le chrome du fil
 * escamote/révèle (`view/thread-chrome.ts::chromeHiding`). Un geste TOUCH
 * (`origin: 'touch'`) est un FAIT binaire (`held`) : vrai depuis le premier
 * `scrolled` d'un contact jusqu'à sa levée, faux immédiatement après — même
 * si un `scrolled` de décélération arrive ensuite (« la liste file, le
 * chrome est revenu », `MessageListViewController.swift:589-592`), et faux
 * pendant un simple APPUI, qui ne tire rien. Un geste INDIRECT (molette,
 * clavier) n'a pas de « levée » : il suit la fenêtre de révélé PARTAGÉE
 * (900 ms, D-22) — même dispositif que `isRevealed`, jamais une seconde
 * horloge.
 */
export const isGestureHeld = (state: SceneActivityState, at: number): boolean =>
  state.origin === 'touch' ? state.held : isRevealed(state, at);

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
  isGestureHeld,
};
