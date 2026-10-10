import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { scaleAfterViewerPinch, viewerZoomTransform, type ViewerZoom } from './media-stage';

/**
 * **LE PINCEMENT ET LE DÉPLACEMENT DE LA VISIONNEUSE** (#9532, #9562) — Chrome
 * agrandissait la page entière sous deux doigts ; la coque Android, dont
 * Capacitor coupe le zoom de la WebView, n'agrandissait rien. Le geste
 * appartient désormais à la page image, le même partout : l'échelle suit les
 * doigts (`scaleAfterViewerPinch`), autour du point où ils se sont posés.
 * Agrandie, la photo suit UN doigt depuis où le geste précédent l'a laissée,
 * comme le `panGesture` d'iOS ; revenue à la taille réelle, elle se recentre.
 *
 * Pendant le geste, l'écriture passe par le DOM (`image.current.style`),
 * jamais par un état : un pincement ne re-rend pas la page soixante fois par
 * seconde. Le cadrage n'est remis à l'hôte (`onCommit`) qu'au relâcher.
 */
type Point = { readonly x: number; readonly y: number };
type Pinch = { readonly startScale: number; readonly startDistance: number };
type Pan = { readonly from: Point; readonly start: Point };

const CENTERED: Point = { x: 0, y: 0 };

const distanceBetween = ([a, b]: readonly Point[]): number => (a === undefined || b === undefined ? 0 : Math.hypot(b.x - a.x, b.y - a.y));

export function useViewerPinch(params: {
  readonly zoom: ViewerZoom;
  readonly image: RefObject<HTMLImageElement | null>;
  readonly onCommit: (zoom: ViewerZoom) => void;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const pan = useRef<Pan | null>(null);
  const live = useRef<ViewerZoom>(params.zoom);

  const paint = (element: HTMLImageElement | null): void => {
    if (element !== null) element.style.transform = viewerZoomTransform(live.current);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const { zoom, image } = paramsRef.current;
    const element = image.current;
    if (pointers.current.size === 1) {
      if (zoom.scale <= 1) return;
      live.current = zoom;
      pan.current = { from: point, start: zoom.offset };
      if (element !== null) element.style.transitionDuration = '0ms';
      return;
    }
    if (pointers.current.size !== 2) return;
    const offset = pan.current === null ? zoom.offset : live.current.offset;
    pan.current = null;
    const points = [...pointers.current.values()];
    const base = { ...zoom, offset };
    const origin = zoom.scale <= 1 && element !== null ? originUnder(element, points) : zoom.origin;
    pinch.current = { startScale: zoom.scale, startDistance: distanceBetween(points) };
    live.current = { ...base, origin };
    if (element !== null) {
      element.style.transitionDuration = '0ms';
      element.style.transformOrigin = origin;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const element = paramsRef.current.image.current;
    const currentPinch = pinch.current;
    if (currentPinch !== null) {
      live.current = { ...live.current, scale: scaleAfterViewerPinch({ ...currentPinch, distance: distanceBetween([...pointers.current.values()]) }) };
      paint(element);
      return;
    }
    const currentPan = pan.current;
    if (currentPan === null) return;
    live.current = {
      ...live.current,
      offset: { x: currentPan.start.x + event.clientX - currentPan.from.x, y: currentPan.start.y + event.clientY - currentPan.from.y },
    };
    paint(element);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>): void => {
    pointers.current.delete(event.pointerId);
    const element = paramsRef.current.image.current;
    if (pinch.current !== null) {
      if (pointers.current.size >= 2) return;
      pinch.current = null;
      const zoomed = live.current.scale > 1;
      live.current = zoomed ? live.current : { scale: live.current.scale, origin: '50% 50%', offset: CENTERED };
      if (element !== null) {
        element.style.transitionDuration = '';
        element.style.transformOrigin = live.current.origin;
        paint(element);
      }
      paramsRef.current.onCommit(live.current);
      return;
    }
    if (pan.current === null || pointers.current.size > 0) return;
    pan.current = null;
    if (element !== null) element.style.transitionDuration = '';
    paramsRef.current.onCommit(live.current);
  };

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}

function originUnder(element: HTMLImageElement, [a, b]: readonly Point[]): string {
  const box = element.getBoundingClientRect();
  if (a === undefined || b === undefined || box.width <= 0 || box.height <= 0) return '50% 50%';
  const midX = (a.x + b.x) / 2 - box.left;
  const midY = (a.y + b.y) / 2 - box.top;
  return `${(midX / box.width) * 100}% ${(midY / box.height) * 100}%`;
}
