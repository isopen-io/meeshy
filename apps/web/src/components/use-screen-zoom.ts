import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';

import { screenZoomAfterPinch, screenZoomAfterWheel } from '@/lib/calls/call-spotlight';

/**
 * **ZOOMER UN ÉCRAN PARTAGÉ À LA UNE** (#9098, miroir du `MagnificationGesture`
 * de `GroupCallStageView.swift`) — deux doigts le grandissent EN DIRECT, de 1
 * à 4, autour du centre ; Ctrl + molette (et le pincement d'un pavé tactile,
 * que le navigateur rend ainsi) de même ; un double toucher le rend entier.
 * L'écran qui change remonte le composant : le zoom repart de 1.
 */

type Point = { readonly x: number; readonly y: number };

const gap = (points: readonly Point[]): number => {
  const [a, b] = points;
  return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
};

export type ScreenZoom = {
  readonly zoom: number;
  readonly pinching: boolean;
  readonly handlers: {
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    readonly onWheel: (event: WheelEvent<HTMLElement>) => void;
    readonly onDoubleClick: () => void;
  };
};

export function useScreenZoom(): ScreenZoom {
  const [zoom, setZoom] = useState(1);
  const [live, setLive] = useState<number | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ readonly distance: number; readonly base: number } | null>(null);
  const release = (event: PointerEvent<HTMLElement>): void => {
    pointers.current.delete(event.pointerId);
    if (pinch.current === null || pointers.current.size >= 2) return;
    pinch.current = null;
    if (live !== null) setZoom(live);
    setLive(null);
  };
  return {
    zoom: live ?? zoom,
    pinching: live !== null,
    handlers: {
      onPointerDown: (event) => {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size !== 2) return;
        pinch.current = { distance: gap([...pointers.current.values()]), base: zoom };
        setLive(zoom);
      },
      onPointerMove: (event) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const started = pinch.current;
        if (started === null || started.distance === 0) return;
        setLive(screenZoomAfterPinch(started.base, gap([...pointers.current.values()]) / started.distance));
      },
      onPointerUp: release,
      onPointerCancel: release,
      onWheel: (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        setZoom((current) => screenZoomAfterWheel(current, event.deltaY));
      },
      onDoubleClick: () => setZoom(1),
    },
  };
}
