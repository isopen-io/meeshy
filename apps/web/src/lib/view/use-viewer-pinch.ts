import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { scaleAfterViewerPinch } from './media-stage';

/**
 * **LE PINCEMENT DE LA VISIONNEUSE** (#9532) — Chrome agrandissait la page
 * entière sous deux doigts ; la coque Android, dont Capacitor coupe le zoom de
 * la WebView, n'agrandissait rien. Le geste appartient désormais à la page
 * image, le même partout : l'échelle suit les doigts (`scaleAfterViewerPinch`),
 * autour du point où ils se sont posés.
 *
 * Pendant le geste, l'écriture passe par le DOM (`image.current.style`),
 * jamais par un état : un pincement ne re-rend pas la page soixante fois par
 * seconde. L'échelle n'est remise à l'hôte (`onCommit`) qu'au relâcher.
 */
type Point = { readonly x: number; readonly y: number };
type Pinch = { readonly startScale: number; readonly startDistance: number };

const distanceBetween = ([a, b]: readonly Point[]): number => (a === undefined || b === undefined ? 0 : Math.hypot(b.x - a.x, b.y - a.y));

export function useViewerPinch(params: {
  readonly scale: number;
  readonly image: RefObject<HTMLImageElement | null>;
  readonly onCommit: (scale: number, origin: string) => void;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const live = useRef({ scale: params.scale, origin: '50% 50%' });

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size !== 2) return;
    const { scale, image } = paramsRef.current;
    const element = image.current;
    const points = [...pointers.current.values()];
    if (scale <= 1 && element !== null) {
      const box = element.getBoundingClientRect();
      const midX = (points[0]!.x + points[1]!.x) / 2 - box.left;
      const midY = (points[0]!.y + points[1]!.y) / 2 - box.top;
      live.current.origin = box.width > 0 && box.height > 0 ? `${(midX / box.width) * 100}% ${(midY / box.height) * 100}%` : '50% 50%';
    }
    pinch.current = { startScale: scale, startDistance: distanceBetween(points) };
    live.current.scale = scale;
    if (element !== null) {
      element.style.transitionDuration = '0ms';
      element.style.transformOrigin = live.current.origin;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = pinch.current;
    if (current === null) return;
    live.current.scale = scaleAfterViewerPinch({ ...current, distance: distanceBetween([...pointers.current.values()]) });
    const element = paramsRef.current.image.current;
    if (element !== null) element.style.transform = `scale(${live.current.scale})`;
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>): void => {
    pointers.current.delete(event.pointerId);
    if (pinch.current === null || pointers.current.size >= 2) return;
    pinch.current = null;
    const element = paramsRef.current.image.current;
    const origin = live.current.scale > 1 ? live.current.origin : '50% 50%';
    if (element !== null) {
      element.style.transitionDuration = '';
      element.style.transformOrigin = origin;
    }
    paramsRef.current.onCommit(live.current.scale, origin);
  };

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}
