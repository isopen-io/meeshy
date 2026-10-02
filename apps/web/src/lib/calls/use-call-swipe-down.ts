import { useEffect, useRef, useState, type RefObject } from 'react';

import { swipeDownOffset, swipeDownOutcome, swipeDownStarted, type SwipeDownOutcome } from './call-swipe-down';
import { tapTogglesChrome } from './use-call-chrome';

/**
 * **LE GLISSÉ VERS LE BAS, BRANCHÉ** (#9096) — le DOM de `call-swipe-down.ts`
 * sur l'écran d'appel, au doigt comme à la souris (Pointer Events) :
 *
 * - il part de la scène, jamais d'un bouton, d'une rangée ou d'une feuille
 *   (le même partage que `tapTogglesChrome`) ;
 * - l'écran suit le doigt (`offset`), puis le relâcher conclut ou revient ;
 * - un glissé n'est jamais un toucher : le clic que la souris émet en fin de
 *   glissé est AVALÉ par `useCallChrome` (`swallowTap`), qui ne range donc
 *   pas les commandes. Le toucher suivant repart de zéro.
 */

type Input = {
  readonly root: RefObject<HTMLElement | null>;
  readonly allowed: boolean;
  readonly canPip: boolean;
  readonly reducedMotion: boolean;
  readonly onOutcome: (outcome: Exclude<SwipeDownOutcome, 'none'>) => void;
};

export type CallSwipeDown = {
  /** Le geste existe ici et maintenant — l'écran lui réserve le doigt (`touch-action: none`). */
  readonly allowed: boolean;
  /** Le décalage vertical que suit l'écran, en px. */
  readonly offset: number;
  readonly dragging: boolean;
  /** Vrai une fois, pour le clic qui suit un glissé : ce clic n'est pas un toucher. */
  readonly swallowTap: () => boolean;
};

/** Un doigt immobile plus longtemps que ça avant d'être levé n'a plus d'élan. */
const HELD_MS = 100;

type Gesture = { readonly id: number; readonly x: number; readonly y: number; started: boolean; lastY: number; lastAt: number; velocity: number };

export function useCallSwipeDown({ root, allowed, canPip, reducedMotion, onOutcome }: Input): CallSwipeDown {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const swiped = useRef(false);
  const latest = useRef({ allowed, canPip, reducedMotion, onOutcome });
  latest.current = { allowed, canPip, reducedMotion, onOutcome };

  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    const page = element.ownerDocument;
    const state: { gesture: Gesture | null } = { gesture: null };
    const travel = (event: PointerEvent, gesture: Gesture) => ({ dx: event.clientX - gesture.x, dy: event.clientY - gesture.y });
    const end = () => {
      state.gesture = null;
      setOffset(0);
      setDragging(false);
    };
    const move = (event: PointerEvent) => {
      const gesture = state.gesture;
      if (gesture === null || event.pointerId !== gesture.id) return;
      const { dx, dy } = travel(event, gesture);
      const now = event.timeStamp;
      if (now > gesture.lastAt) gesture.velocity = (event.clientY - gesture.lastY) / (now - gesture.lastAt);
      gesture.lastY = event.clientY;
      gesture.lastAt = now;
      if (!gesture.started && !swipeDownStarted({ dx, dy })) return;
      if (!gesture.started) {
        gesture.started = true;
        swiped.current = true;
        setDragging(true);
      }
      setOffset(swipeDownOffset({ dy, allowed: latest.current.allowed, reducedMotion: latest.current.reducedMotion }));
    };
    const up = (event: PointerEvent) => {
      const gesture = state.gesture;
      if (gesture === null || event.pointerId !== gesture.id) return;
      const { dy } = travel(event, gesture);
      end();
      if (!gesture.started) return;
      const velocity = event.timeStamp - gesture.lastAt > HELD_MS ? 0 : gesture.velocity;
      const outcome = swipeDownOutcome({ dy, velocity, allowed: latest.current.allowed, canPip: latest.current.canPip });
      if (outcome !== 'none') latest.current.onOutcome(outcome);
    };
    const cancel = (event: PointerEvent) => {
      if (state.gesture !== null && event.pointerId === state.gesture.id) end();
    };
    const down = (event: PointerEvent) => {
      swiped.current = false;
      if (!latest.current.allowed || !event.isPrimary || event.button !== 0 || !tapTogglesChrome(event)) return;
      state.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, started: false, lastY: event.clientY, lastAt: event.timeStamp, velocity: 0 };
    };
    element.addEventListener('pointerdown', down);
    page.addEventListener('pointermove', move);
    page.addEventListener('pointerup', up);
    page.addEventListener('pointercancel', cancel);
    return () => {
      element.removeEventListener('pointerdown', down);
      page.removeEventListener('pointermove', move);
      page.removeEventListener('pointerup', up);
      page.removeEventListener('pointercancel', cancel);
    };
  }, [root]);

  const swallowTap = useRef(() => {
    const was = swiped.current;
    swiped.current = false;
    return was;
  }).current;

  return { allowed, offset: allowed ? offset : 0, dragging: allowed && dragging, swallowTap };
}
