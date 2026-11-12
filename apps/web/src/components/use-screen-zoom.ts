import { useEffect, useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from 'react';

import { screenPanAfterDrag, screenPanClamp, screenZoomAfterPinch, screenZoomAfterWheel, screenZoomResets, screenZoomTransform, type ScreenFrame, type ScreenPan } from '@/lib/calls/screen-zoom';

/**
 * **ZOOMER UN ÉCRAN PARTAGÉ** (#9098, P15.11 ; miroir du `MagnificationGesture` de `GroupCallStageView.swift` et de
 * `CallReceivedScreenZoom.swift`) — deux doigts le grandissent EN DIRECT, de 1 à 4, autour du centre ; Ctrl + molette
 * (et le pincement d'un pavé tactile, que le navigateur rend ainsi) de même ; un double clic le rend entier, mais
 * seulement une fois zoomé. L'écran qui change remonte le composant : le zoom repart de 1.
 *
 * DEUX MANIÈRES de rendre le geste. Sans calque (la une d'un groupe) l'hôte relit `zoom` à chaque mouvement. AVEC un
 * calque (l'écran reçu en duo, `layer`) le geste ne rend RIEN : une matrice `translate3d + scale` est écrite sur le
 * calque une fois par image (`requestAnimationFrame`), `will-change` ne dure que le temps du geste, et l'état React
 * ne change qu'au relâché — aucun reflow, aucune image perdue. Un doigt déplace alors l'image une fois zoomée.
 */

type Point = { readonly x: number; readonly y: number };

type View = { readonly zoom: number; readonly pan: ScreenPan };

type Gesture = { readonly kind: 'pinch'; readonly distance: number; readonly base: View } | { readonly kind: 'drag'; readonly last: Point };

const REST: View = { zoom: 1, pan: { x: 0, y: 0 } };

const gap = (points: readonly Point[]): number => {
  const [a, b] = points;
  return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
};

const frameOf = (element: Element | null | undefined): ScreenFrame => {
  const rect = element?.getBoundingClientRect();
  return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
};

const cssOf = (view: View): string => (view.zoom === 1 ? '' : screenZoomTransform(view.zoom, view.pan));

export type ScreenZoom = {
  readonly zoom: number;
  readonly pinching: boolean;
  /** La matrice du calque au repos (vide à 1×) : celle que l'hôte pose sur son calque. */
  readonly transform: string | undefined;
  readonly handlers: {
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    readonly onWheel: (event: WheelEvent<HTMLElement>) => void;
    readonly onDoubleClick: () => void;
  };
};

export function useScreenZoom(layer?: RefObject<HTMLElement | null>): ScreenZoom {
  const [view, setView] = useState<View>(REST);
  const [live, setLive] = useState<View | null>(null);
  const current = useRef<View>(REST);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<ScreenFrame>({ width: 0, height: 0 });
  const scheduled = useRef(0);

  const write = (next: View): void => {
    const element = layer?.current;
    if (element) element.style.transform = cssOf(next);
  };
  const lift = (): void => {
    const element = layer?.current;
    if (!element) return;
    element.style.willChange = 'transform';
    element.style.transition = 'none';
  };
  const settle = (): void => {
    gesture.current = null;
    if (scheduled.current !== 0) cancelAnimationFrame(scheduled.current);
    scheduled.current = 0;
    setView(current.current);
    setLive(null);
    const element = layer?.current;
    if (!element) return;
    write(current.current);
    element.style.willChange = '';
    element.style.transition = '';
  };
  const publish = (next: View): void => {
    current.current = next;
    if (!layer) return setLive(next);
    if (scheduled.current !== 0) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = 0;
      write(current.current);
    });
  };
  const jump = (next: View): void => {
    current.current = next;
    setView(next);
  };

  /* Le défilement du navigateur ne se retient que par un écouteur NON passif : celui de React ne l'est pas. */
  useEffect(() => {
    const surface = layer?.current?.parentElement;
    if (!surface) return undefined;
    const onWheel = (event: globalThis.WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const zoom = screenZoomAfterWheel(current.current.zoom, event.deltaY);
      jump({ zoom, pan: screenPanClamp(current.current.pan, zoom, frameOf(surface)) });
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [layer]);

  const release = (event: PointerEvent<HTMLElement>): void => {
    pointers.current.delete(event.pointerId);
    const started = gesture.current;
    if (started === null || pointers.current.size >= 2) return;
    const [rest] = [...pointers.current.values()];
    if (started.kind === 'pinch' && layer && rest !== undefined && current.current.zoom > 1) {
      gesture.current = { kind: 'drag', last: rest };
      return;
    }
    settle();
  };

  return {
    zoom: (live ?? view).zoom,
    pinching: live !== null,
    transform: view.zoom === 1 ? undefined : cssOf(view),
    handlers: {
      onPointerDown: (event) => {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2) {
          frame.current = frameOf(event.currentTarget);
          gesture.current = { kind: 'pinch', distance: gap([...pointers.current.values()]), base: current.current };
          if (layer) lift();
          else setLive(current.current);
          return;
        }
        if (!layer || pointers.current.size !== 1 || !screenZoomResets(current.current.zoom)) return;
        frame.current = frameOf(event.currentTarget);
        gesture.current = { kind: 'drag', last: { x: event.clientX, y: event.clientY } };
        lift();
      },
      onPointerMove: (event) => {
        if (!pointers.current.has(event.pointerId)) return;
        const point = { x: event.clientX, y: event.clientY };
        pointers.current.set(event.pointerId, point);
        const started = gesture.current;
        if (started === null) return;
        if (started.kind === 'drag') {
          gesture.current = { kind: 'drag', last: point };
          return publish({ zoom: current.current.zoom, pan: screenPanAfterDrag(current.current.pan, { dx: point.x - started.last.x, dy: point.y - started.last.y }, current.current.zoom, frame.current) });
        }
        if (started.distance === 0) return;
        const zoom = screenZoomAfterPinch(started.base.zoom, gap([...pointers.current.values()]) / started.distance);
        publish({ zoom, pan: layer ? screenPanClamp(started.base.pan, zoom, frame.current) : started.base.pan });
      },
      onPointerUp: release,
      onPointerCancel: release,
      onWheel: (event) => {
        if (layer || !event.ctrlKey) return;
        event.preventDefault();
        jump({ zoom: screenZoomAfterWheel(current.current.zoom, event.deltaY), pan: REST.pan });
      },
      onDoubleClick: () => {
        if (screenZoomResets(current.current.zoom)) jump(REST);
      },
    },
  };
}
