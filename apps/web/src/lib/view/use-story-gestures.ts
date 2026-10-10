import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import type { ViewerSwipeBinding } from '@/components/viewer-chrome-gestures';
import { HOLD_THRESHOLD_MS, classifyTapZone, decideTouchDown, decideTouchUp, isDoubleTap, isDrag } from '@/lib/stories/gesture';
import { screenGestureYields } from '@/lib/view/shortcut-scope';

/**
 * **LES GESTES DU LECTEUR DE STORY** (§ 5.0 de la spécification #7114) —
 * EXTRAITS de `routes/story.tsx` (1 000 lignes, « on extrait d'abord, on
 * ajoute ensuite », CLAUDE.md § budget). EXTRACTION PURE : le comportement
 * des trois bandes de geste (appui posé = pause, relâchement ne reprend pas,
 * tap suivant reprend sans naviguer) est INCHANGÉ, prouvé par les gates
 * navigateur déjà verts (`check-story-scene.mjs` § appui long, tap latéral,
 * double-tap) ; le BALAYAGE commun des plein écrans (#8879,
 * `viewer-chrome-gestures.ts`) est relayé exactement aux points où l'hôte
 * l'appelait — après la cession du doigt, jamais avant.
 */
type GestureState = {
  startX: number;
  startY: number;
  startTime: number;
  holdTimer: number | null;
  holdFired: boolean;
  resumedThisGesture: boolean;
  /** Le geste a été AVALÉ par `dismissLayer` (#7114) — ni pause, ni
   * navigation, ni balayage ne doit en sortir au relâchement. */
  dismissedThisGesture: boolean;
};

type PointerHandler = (e: ReactPointerEvent<HTMLDivElement>) => void;

export type StoryGestureHandlers = {
  readonly onPointerDown: PointerHandler;
  readonly onPointerUp: PointerHandler;
  readonly onPointerMove: PointerHandler;
  readonly onPointerCancel: PointerHandler;
  readonly onPointerLeave: () => void;
};

export function useStoryGestures(params: {
  readonly paused: boolean;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly advance: (direction: 'previous' | 'next') => void;
  readonly setChromeHidden: (hidden: boolean) => void;
  /** La cession du doigt (`screenGestureYields`) — une couche de SAISIE
   * ouverte (le fil de commentaires) réclame TOUT le geste, où qu'il tombe. */
  readonly layerOpen: boolean;
  /** Le balayage commun (glisser vers le bas ferme, à l'horizontale change de
   * story) — `useViewerSwipe`, relayé ici pour que la scène n'ait qu'UN jeu
   * de gestionnaires. */
  readonly swipe: ViewerSwipeBinding['handlers'];
  /**
   * **« UN TOUCHER N'IMPORTE OÙ LES REFERME »** (`StoryViewerView.swift:1582-1592`,
   * miroir `dismissActiveReaderFeature()`) — appelé AVANT toute
   * classification de zone. Rend `true` ⇒ le geste est AVALÉ (ni pause, ni
   * navigation, aucun minuteur d'appui long, aucun balayage) : c'est le cas
   * de la barre rapide des langues (#7114), qui n'est pas une couche de
   * SAISIE (`layerOpen` ne la couvre pas) mais doit tout de même absorber le
   * tap qui la ferme.
   */
  readonly dismissLayer: () => boolean;
}): StoryGestureHandlers {
  const { paused, pause, resume, advance, setChromeHidden, layerOpen, swipe, dismissLayer } = params;

  const gestureRef = useRef<GestureState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    holdTimer: null,
    holdFired: false,
    resumedThisGesture: false,
    dismissedThisGesture: false,
  });
  const lastCenterTapRef = useRef(-Infinity);

  /* LA FEUILLE RÉCLAME LE GESTE COMME ELLE RÉCLAME LA TOUCHE (#7112, D-91) :
     la loi vit à UN seul endroit, avec sa jumelle du clavier
     (`lib/view/shortcut-scope.ts`). */
  const yields = (e: ReactPointerEvent<HTMLDivElement>): boolean => screenGestureYields({ target: e.target, layerOpen });

  const clearHoldTimer = () => {
    const g = gestureRef.current;
    if (g.holdTimer !== null) {
      clearTimeout(g.holdTimer);
      g.holdTimer = null;
    }
  };

  const onPointerDown: PointerHandler = (e) => {
    if (yields(e)) return;
    const g = gestureRef.current;
    if (dismissLayer()) {
      g.dismissedThisGesture = true;
      return;
    }
    g.dismissedThisGesture = false;
    swipe.onPointerDown(e);
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = classifyTapZone((e.clientX - rect.left) / rect.width);
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.startTime = performance.now();
    g.holdFired = false;
    g.resumedThisGesture = decideTouchDown({ zone, isPaused: paused }) === 'resume';
    if (g.resumedThisGesture) resume();
    g.holdTimer = window.setTimeout(() => {
      g.holdFired = true;
      pause();
      setChromeHidden(true);
    }, HOLD_THRESHOLD_MS);
  };

  const onPointerUp: PointerHandler = (e) => {
    const g = gestureRef.current;
    clearHoldTimer();
    if (yields(e)) return;
    if (g.dismissedThisGesture) {
      g.dismissedThisGesture = false;
      return;
    }
    swipe.onPointerUp(e);
    if (g.holdFired || g.resumedThisGesture) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const zone = classifyTapZone((e.clientX - rect.left) / rect.width);
    const moved = isDrag(Math.hypot(e.clientX - g.startX, e.clientY - g.startY));
    const elapsedMs = performance.now() - g.startTime;
    const action = decideTouchUp({ zone, holdActive: false, moved, elapsedMs });

    if (action === 'previous') return advance('previous');
    if (action === 'next') return advance('next');
    if (zone === 'center' && !moved) {
      const now = performance.now();
      if (isDoubleTap(now - lastCenterTapRef.current)) {
        lastCenterTapRef.current = -Infinity;
        if (paused) resume();
        else pause();
      } else {
        lastCenterTapRef.current = now;
      }
    }
  };

  const onPointerMove: PointerHandler = (e) => {
    swipe.onPointerMove(e);
  };

  const onPointerCancel: PointerHandler = (e) => {
    clearHoldTimer();
    swipe.onPointerCancel(e);
  };

  return { onPointerDown, onPointerUp, onPointerMove, onPointerCancel, onPointerLeave: clearHoldTimer };
}
