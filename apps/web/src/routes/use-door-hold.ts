import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** Au-delà, l'appui est TENU (la durée du geste long d'iOS). */
const HOLD_MS = 450;
/** Au-delà, le doigt défile le rail : ce n'est plus un appui. */
const SLOP_PX = 10;

/**
 * **L'APPUI LONG D'UNE PORTE** (#10306) — tenue, la porte fait SA seconde
 * action (la photothèque ouvre la caméra) ; le clic qui suit la levée est
 * avalé, sans quoi la photothèque s'ouvrirait par-dessus. Un clic court reste
 * l'action de la porte ; un doigt qui glisse défile le rail et n'ouvre rien ;
 * le menu contextuel du système ne s'interpose pas.
 */
export function useDoorHold(onHold: (() => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const held = useRef(false);

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => clear, []);

  if (onHold === undefined) return {};
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      clear();
      held.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        held.current = true;
        onHold();
      }, HOLD_MS);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const from = origin.current;
      if (from !== null && Math.hypot(event.clientX - from.x, event.clientY - from.y) > SLOP_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      if (!held.current) return;
      held.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => event.preventDefault(),
  };
}
