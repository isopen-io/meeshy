import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';

import { isTileDrag } from '@/lib/calls/call-self-tile';

/**
 * **GLISSER MA VIGNETTE** (#8747) — un doigt, ou la souris, l'emporte : elle
 * suit le geste (`offset`), puis `onDrop` reçoit le déplacement au lâcher.
 * Sous le seuil de `isTileDrag`, rien ne bouge et le toucher reste un toucher ;
 * un glissé, lui, n'est jamais un toucher : le clic qui le suit est avalé. Un
 * second doigt rend le geste au pincement.
 */

export type TileOffset = { readonly dx: number; readonly dy: number };

export type TileDrag = {
  readonly offset: TileOffset | null;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
};

type Grab = { readonly pointerId: number; readonly x: number; readonly y: number };

export function useTileDrag(onDrop: (offset: TileOffset) => void): TileDrag {
  const pointers = useRef(new Set<number>());
  const grab = useRef<Grab | null>(null);
  const dragged = useRef(false);
  const [offset, setOffset] = useState<TileOffset | null>(null);
  const release = (event: PointerEvent<HTMLElement>): void => {
    pointers.current.delete(event.pointerId);
    const held = grab.current;
    if (held === null || held.pointerId !== event.pointerId) return;
    grab.current = null;
    setOffset(null);
    if (dragged.current && event.type === 'pointerup') onDrop({ dx: event.clientX - held.x, dy: event.clientY - held.y });
  };
  return {
    offset,
    onPointerDown: (event) => {
      pointers.current.add(event.pointerId);
      if (pointers.current.size > 1) {
        grab.current = null;
        setOffset(null);
        return;
      }
      if (event.button !== 0) return;
      grab.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      dragged.current = false;
    },
    onPointerMove: (event) => {
      const held = grab.current;
      if (held === null || held.pointerId !== event.pointerId) return;
      const next = { dx: event.clientX - held.x, dy: event.clientY - held.y };
      if (!dragged.current && !isTileDrag(next)) return;
      if (!dragged.current) event.currentTarget.setPointerCapture?.(event.pointerId);
      dragged.current = true;
      setOffset(next);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onClickCapture: (event) => {
      if (!dragged.current) return;
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
