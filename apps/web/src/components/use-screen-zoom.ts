import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent, type RefObject, type WheelEvent } from 'react';

import { screenPanAfterDrag, screenPanClamp, screenZoomAfterPinch, screenZoomAfterWheel, screenZoomResets, screenZoomTransform, type ScreenFrame, type ScreenPan } from '@/lib/calls/screen-zoom';
import { DOUBLE_TAP_MS } from '@/lib/view/tap-gate';

/**
 * **ZOOMER UN ÉCRAN PARTAGÉ** (#9098, P15.11 ; miroir du `MagnificationGesture` de `GroupCallStageView.swift` et de
 * `CallReceivedScreenZoom.swift`) — deux doigts le grandissent EN DIRECT, de 1 à 4, autour du centre ; Ctrl + molette
 * (et le pincement d'un pavé tactile, que le navigateur rend ainsi) de même ; un double toucher le rend entier, mais
 * seulement une fois zoomé. L'écran qui change remonte le composant : le zoom repart de 1.
 *
 * DEUX MANIÈRES de rendre le geste. Sans calque (la une d'un groupe) l'hôte relit `zoom` à chaque mouvement. AVEC un
 * calque (l'écran reçu en duo, `ScreenZoomLayer`) le geste ne rend RIEN : une matrice `translate3d + scale` est écrite
 * sur le calque une fois par image (`requestAnimationFrame`), `will-change` ne dure que le temps du geste, et l'état
 * React ne change qu'au relâché — aucun reflow, aucune image perdue. Un doigt déplace alors l'image une fois zoomée,
 * passé le seuil qui sépare un glissé d'un toucher ; et un glissé n'est jamais un toucher (`useLayerListeners`).
 */

type Point = { readonly x: number; readonly y: number };

type Travel = { readonly dx: number; readonly dy: number };

type View = { readonly zoom: number; readonly pan: ScreenPan };

/** Le calque GPU de l'écran reçu, et la loi qui sépare un glissé d'un toucher — celle de ma vignette, que l'écran remet. */
export type ScreenZoomLayer = { readonly layer: RefObject<HTMLElement | null>; readonly isDrag: (travel: Travel) => boolean };

type Gesture = { readonly kind: 'pinch'; readonly distance: number; readonly base: View } | { readonly kind: 'drag'; readonly from: Point; readonly base: ScreenPan };

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

type Shared = { readonly current: MutableRefObject<View>; readonly moved: MutableRefObject<boolean>; readonly jump: (next: View) => void };

/**
 * Ce que le calque écoute hors de React. Ctrl + molette : un écouteur NON passif, seul à pouvoir retenir le défilement.
 * Le CLIC, à la fenêtre, avant l'écran d'appel qui range ses commandes au toucher : celui qui suit un glissé ou un
 * pincement n'est pas un toucher ; zoomé, un toucher attend le second (`DOUBLE_TAP_MS`) — deux touchers rendent 1× sans
 * ranger puis rendre les commandes, un seul les range, rejoué (iOS `highPriorityGesture`, Android `onDoubleTap`). À 1×,
 * rien n'attend.
 */
function useLayerListeners(calque: ScreenZoomLayer | undefined, { current, moved, jump }: Shared): void {
  useEffect(() => {
    const surface = calque?.layer.current?.parentElement;
    const page = surface?.ownerDocument.defaultView;
    if (!surface || !page) return undefined;
    const replayed = new WeakSet<Event>();
    const waiting: { timer: number | null } = { timer: null };
    const replay = (target: Node): void => {
      if (!target.isConnected) return;
      const again = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 1 });
      replayed.add(again);
      target.dispatchEvent(again);
    };
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (replayed.has(event) || !(target instanceof Node) || !surface.contains(target)) return;
      if (moved.current) return void ((moved.current = false), event.stopPropagation());
      if (waiting.timer !== null) {
        page.clearTimeout(waiting.timer);
        waiting.timer = null;
        event.stopPropagation();
        return jump(REST);
      }
      if (!screenZoomResets(current.current.zoom)) return;
      event.stopPropagation();
      waiting.timer = page.setTimeout(() => {
        waiting.timer = null;
        replay(target);
      }, DOUBLE_TAP_MS);
    };
    const onWheel = (event: globalThis.WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const zoom = screenZoomAfterWheel(current.current.zoom, event.deltaY);
      jump({ zoom, pan: screenPanClamp(current.current.pan, zoom, frameOf(surface)) });
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    page.addEventListener('click', onClick, { capture: true });
    return () => {
      surface.removeEventListener('wheel', onWheel);
      page.removeEventListener('click', onClick, { capture: true });
      if (waiting.timer !== null) page.clearTimeout(waiting.timer);
    };
  }, [calque?.layer]);
}

/** Écrire le calque sans React : une matrice par image pendant le geste, `will-change` le temps du geste seulement. */
function layerWriter(layer: RefObject<HTMLElement | null> | undefined, scheduled: MutableRefObject<number>, current: MutableRefObject<View>) {
  const write = (next: View): void => {
    const element = layer?.current;
    if (element) element.style.transform = cssOf(next);
  };
  return {
    lift: (): void => {
      const element = layer?.current;
      if (!element) return;
      element.style.willChange = 'transform';
      element.style.transition = 'none';
    },
    rest: (): void => {
      if (scheduled.current !== 0) cancelAnimationFrame(scheduled.current);
      scheduled.current = 0;
      const element = layer?.current;
      if (!element) return;
      write(current.current);
      element.style.willChange = '';
      element.style.transition = '';
    },
    frame: (): void => {
      if (scheduled.current !== 0) return;
      scheduled.current = requestAnimationFrame(() => {
        scheduled.current = 0;
        write(current.current);
      });
    },
  };
}

type Machine = {
  readonly calque: ScreenZoomLayer | undefined;
  readonly current: MutableRefObject<View>;
  readonly pointers: MutableRefObject<Map<number, Point>>;
  readonly gesture: MutableRefObject<Gesture | null>;
  readonly moved: MutableRefObject<boolean>;
  readonly frame: MutableRefObject<ScreenFrame>;
  readonly writer: ReturnType<typeof layerWriter>;
  readonly publish: (next: View) => void;
  readonly settle: () => void;
  readonly hold: (base: View) => void;
};

/** Les doigts : deux pincent ; un seul, zoomé, déplace l'image (calque seulement, bouton principal, passé le seuil d'un glissé). */
function pointerHandlers({ calque, current, pointers, gesture, moved, frame, writer, publish, settle, hold }: Machine): Pick<ScreenZoom['handlers'], 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'> {
  const layered = calque !== undefined;
  const release = (event: PointerEvent<HTMLElement>): void => {
    pointers.current.delete(event.pointerId);
    const started = gesture.current;
    if (started === null || pointers.current.size >= 2) return;
    const [rest] = [...pointers.current.values()];
    if (started.kind === 'pinch' && layered && rest !== undefined && screenZoomResets(current.current.zoom)) {
      gesture.current = { kind: 'drag', from: rest, base: current.current.pan };
      return;
    }
    settle();
  };
  const drag = (started: Extract<Gesture, { kind: 'drag' }>, point: Point): void => {
    const travel = { dx: point.x - started.from.x, dy: point.y - started.from.y };
    if (!moved.current && calque?.isDrag(travel) !== true) return;
    moved.current = true;
    publish({ zoom: current.current.zoom, pan: screenPanAfterDrag(started.base, travel, current.current.zoom, frame.current) });
  };
  return {
    onPointerDown: (event) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) moved.current = false;
      if (pointers.current.size === 2) {
        frame.current = frameOf(event.currentTarget);
        moved.current = true;
        gesture.current = { kind: 'pinch', distance: gap([...pointers.current.values()]), base: current.current };
        return hold(current.current);
      }
      if (!layered || pointers.current.size !== 1 || event.button !== 0 || !screenZoomResets(current.current.zoom)) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      frame.current = frameOf(event.currentTarget);
      gesture.current = { kind: 'drag', from: { x: event.clientX, y: event.clientY }, base: current.current.pan };
      writer.lift();
    },
    onPointerMove: (event) => {
      if (!pointers.current.has(event.pointerId)) return;
      const point = { x: event.clientX, y: event.clientY };
      pointers.current.set(event.pointerId, point);
      const started = gesture.current;
      if (started === null) return;
      if (started.kind === 'drag') return drag(started, point);
      if (started.distance === 0) return;
      const zoom = screenZoomAfterPinch(started.base.zoom, gap([...pointers.current.values()]) / started.distance);
      publish({ zoom, pan: layered ? screenPanClamp(started.base.pan, zoom, frame.current) : started.base.pan });
    },
    onPointerUp: release,
    onPointerCancel: release,
  };
}

export function useScreenZoom(calque?: ScreenZoomLayer): ScreenZoom {
  const layer = calque?.layer;
  const [view, setView] = useState<View>(REST);
  const [live, setLive] = useState<View | null>(null);
  const current = useRef<View>(REST);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const moved = useRef(false);
  const frame = useRef<ScreenFrame>({ width: 0, height: 0 });
  const scheduled = useRef(0);
  const writer = layerWriter(layer, scheduled, current);
  const jump = (next: View): void => {
    current.current = next;
    setView(next);
  };
  const publish = (next: View): void => {
    current.current = next;
    if (layer) writer.frame();
    else setLive(next);
  };
  const settle = (): void => {
    gesture.current = null;
    writer.rest();
    setView(current.current);
    setLive(null);
  };
  const hold = (base: View): void => (layer ? writer.lift() : setLive(base));
  useLayerListeners(calque, { current, moved, jump });

  return {
    zoom: (live ?? view).zoom,
    pinching: live !== null,
    transform: view.zoom === 1 ? undefined : cssOf(view),
    handlers: {
      ...pointerHandlers({ calque, current, pointers, gesture, moved, frame, writer, publish, settle, hold }),
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
