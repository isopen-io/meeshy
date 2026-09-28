import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';

import { scaleAfterPinch, scaleAfterWheel, type SelfTileScale } from '@/lib/calls/call-self-tile';

/**
 * **PINCER MA VIGNETTE** (#8577) — deux doigts sur ma vignette en coin la
 * grandissent ou la rapetissent EN DIRECT, puis, au lâcher, elle s'accroche
 * à la taille la plus proche du geste (`scaleAfterPinch`). Ctrl + molette
 * fait de même d'un cran. Un pincement n'est jamais un toucher : le clic qui
 * le suit (la vignette passe en plein écran au toucher) est avalé.
 */

type Point = { readonly x: number; readonly y: number };

const gap = (points: readonly Point[]): number => {
  const [a, b] = points;
  return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
};

export type TilePinch = {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  readonly onWheel: (event: WheelEvent<HTMLElement>) => void;
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  readonly style: CSSProperties;
};

const LIVE_MIN = 0.5;

const LIVE_MAX = 2.2;

export function useTilePinch(scale: SelfTileScale, onScale: (scale: SelfTileScale) => void): TilePinch {
  const pointers = useRef(new Map<number, Point>());
  const start = useRef(0);
  const ratio = useRef(1);
  const pinched = useRef(false);
  const [live, setLive] = useState<number | null>(null);
  const release = (event: PointerEvent<HTMLElement>): void => {
    pointers.current.delete(event.pointerId);
    if (start.current === 0 || pointers.current.size >= 2) return;
    start.current = 0;
    setLive(null);
    const next = scaleAfterPinch(scale, ratio.current);
    if (next !== scale) onScale(next);
  };
  return {
    onPointerDown: (event) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size !== 2) return;
      start.current = gap([...pointers.current.values()]);
      ratio.current = 1;
      pinched.current = true;
      setLive(1);
    },
    onPointerMove: (event) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (start.current === 0) return;
      ratio.current = gap([...pointers.current.values()]) / start.current;
      setLive(Math.min(LIVE_MAX, Math.max(LIVE_MIN, ratio.current)));
    },
    onPointerUp: release,
    onPointerCancel: release,
    onWheel: (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const next = scaleAfterWheel(scale, event.deltaY);
      if (next !== scale) onScale(next);
    },
    onClickCapture: (event) => {
      if (!pinched.current) return;
      pinched.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    style: live === null ? { touchAction: 'none' } : { touchAction: 'none', transform: `scale(${live})`, transformOrigin: 'top right', transition: 'none' },
  };
}
