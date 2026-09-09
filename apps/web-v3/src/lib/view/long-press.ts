import { useCallback, useMemo, useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * LE GESTE D'OUVERTURE DU MENU DU MESSAGE (#5814) — miroir
 * `MessageListView.swift:348` (`LongPressGesture(minimumDuration: 0.35,
 * maximumDistance: 6)`), DURÉE adaptée à 500 ms (le critère de fin de #5814,
 * « pointerdown ≥ 500 ms »), `maximumDistance` repris tel quel.
 *
 * `pressReducer` est une machine PURE, testable sans DOM ni minuteur réel —
 * le hook plus bas ne fait qu'y BRANCHER un `setTimeout`, jamais l'inverse.
 */

export const LONG_PRESS_MS = 500;
export const LONG_PRESS_MAX_DISTANCE_PX = 6;

export type PressState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'pressing'; readonly x: number; readonly y: number; readonly at: number }
  | { readonly phase: 'open' }
  | { readonly phase: 'cancelled' };

export type PressEvent =
  | { readonly type: 'down'; readonly x: number; readonly y: number; readonly at: number }
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'tick'; readonly elapsedMs: number }
  | { readonly type: 'up' }
  | { readonly type: 'cancel' };

/**
 * `tick` porte le temps ÉCOULÉ depuis `down` (jamais une horloge absolue —
 * l'appelant du DOM, lui, compare des `Date.now()`, mais la loi pure ne
 * connaît que la durée). En dessous de `LONG_PRESS_MS`, la pression reste
 * `pressing` — c'est `tick(LONG_PRESS_MS)` seul qui bascule sur `open`.
 */
export function pressReducer(state: PressState, event: PressEvent): PressState {
  switch (event.type) {
    case 'down':
      return { phase: 'pressing', x: event.x, y: event.y, at: event.at };
    case 'move': {
      if (state.phase !== 'pressing') return state;
      const dx = event.x - state.x;
      const dy = event.y - state.y;
      return Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MAX_DISTANCE_PX ? { phase: 'cancelled' } : state;
    }
    case 'tick':
      if (state.phase !== 'pressing') return state;
      return event.elapsedMs >= LONG_PRESS_MS ? { phase: 'open' } : state;
    case 'up':
      return state.phase === 'pressing' ? { phase: 'idle' } : state;
    case 'cancel':
      return { phase: 'cancelled' };
    default:
      return state;
  }
}

export type LongPressAnchor = { readonly element: HTMLElement; readonly rect: DOMRect };

/**
 * LE HOOK — vit UNE FOIS dans l'hôte (`thread.tsx`), jamais une instance par
 * rangée virtualisée (§ 5 étape 5 de la spécification) : chaque gestionnaire
 * lit `event.currentTarget`, jamais une référence figée à un élément — la
 * délégation qui rend le hook réutilisable sur cinquante rangées montées.
 *
 * `keydown` répond à `ContextMenu` (la touche dédiée) et `Shift+F10` — les
 * DEUX déclencheurs clavier du menu contextuel, comme `contextmenu` en
 * répond au clic droit.
 */
export function useLongPress(options: {
  readonly onOpen: (anchor: LongPressAnchor) => void;
}) {
  const stateRef = useRef<PressState>({ phase: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * LES SIX GESTIONNAIRES SONT STABLES (revue #5814) — ils sont étalés sur
   * CHAQUE rangée montée, et l'écran du fil se re-rend à chaque tick d'horloge
   * et à chaque frame de scène. Recréés à chaque rendu, ils faisaient
   * réattacher six propriétés d'événement sur cinquante rangées pour rien.
   * `onOpen` passe par une référence : le hook n'a alors AUCUNE dépendance
   * qui change, et l'appelant garde le droit d'écrire une fermeture en ligne.
   */
  const onOpenRef = useRef(options.onOpen);
  onOpenRef.current = options.onOpen;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const open = useCallback(
    (target: HTMLElement) => {
      clearTimer();
      stateRef.current = { phase: 'open' };
      onOpenRef.current({ element: target, rect: target.getBoundingClientRect() });
    },
    [clearTimer],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    stateRef.current = { phase: 'pressing', x: event.clientX, y: event.clientY, at: Date.now() };
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (stateRef.current.phase === 'pressing') open(target);
    }, LONG_PRESS_MS);
  }, [clearTimer, open]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (stateRef.current.phase !== 'pressing') return;
    const dx = event.clientX - stateRef.current.x;
    const dy = event.clientY - stateRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MAX_DISTANCE_PX) {
      stateRef.current = { phase: 'cancelled' };
      clearTimer();
    }
  }, [clearTimer]);

  const onPointerUp = useCallback(() => {
    if (stateRef.current.phase === 'pressing') stateRef.current = { phase: 'idle' };
    clearTimer();
  }, [clearTimer]);

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    open(event.currentTarget);
  }, [open]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const isMenuKey = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
    if (!isMenuKey) return;
    event.preventDefault();
    open(event.currentTarget);
  }, [open]);

  return useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onContextMenu,
      onKeyDown,
    }),
    [onPointerDown, onPointerMove, onPointerUp, onContextMenu, onKeyDown],
  );
}
