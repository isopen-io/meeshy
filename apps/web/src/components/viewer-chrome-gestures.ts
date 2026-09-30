import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { DISMISS_THRESHOLD } from '@/lib/view/media-stage';

/**
 * **LE GESTE COMMUN DES VISIONNEUSES PLEIN ÉCRAN** (#8879,
 * `docs/product/visionneuse-plein-ecran.md` § Gestes).
 *
 * La visionneuse de médias portait sa mécanique dans son corps
 * (`media-viewer.tsx`, `dragRef` + trois gestionnaires) ; le lecteur de
 * stories n'en avait AUCUNE — glisser vers le bas n'y fermait rien, alors que
 * c'est le geste de sortie d'iOS (`StoryViewerView+Canvas.swift`,
 * `.dismissViewer`) et celui de la visionneuse voisine. Deux plein écrans qui
 * ne se quittent pas du même doigt, c'est ce que la directive 2026-09-30
 * nomme.
 *
 * La LOI est pure (`resolveViewerSwipe`) ; le crochet la branche sur le
 * doigt et fait SUIVRE la scène pendant la descente — l'écriture passe par le
 * DOM (`follow.current.style`), jamais par un état : un glissé ne re-rend pas
 * l'écran soixante fois par seconde.
 */

/** Le seuil de fermeture — celui de la visionneuse de médias, UNE valeur (`media-stage.ts`). */
export const VIEWER_DISMISS_PX = DISMISS_THRESHOLD;

/** Le seuil de pagination — indépendant du seuil vertical : tourner une page n'est pas un geste de sortie. */
export const VIEWER_PAGE_PX = 60;

/** Au-delà, ce n'est plus un toucher : le clic qui suit le relâcher ne bascule pas le chrome. */
export const VIEWER_TAP_SLOP_PX = 10;

export type ViewerSwipe = 'dismiss' | 'up' | 'next' | 'previous' | 'none';

export function resolveViewerSwipe(params: {
  readonly dx: number;
  readonly dy: number;
  readonly paging: boolean;
  readonly rtl?: boolean;
}): ViewerSwipe {
  const { dx, dy, paging, rtl = false } = params;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (!paging || Math.abs(dx) < VIEWER_PAGE_PX) return 'none';
    const towardsNext = rtl ? dx > 0 : dx < 0;
    return towardsNext ? 'next' : 'previous';
  }
  if (dy >= VIEWER_DISMISS_PX) return 'dismiss';
  if (dy <= -VIEWER_DISMISS_PX) return 'up';
  return 'none';
}

export type ViewerSwipeOptions = {
  readonly onDismiss: () => void;
  /** Absents tous deux ⇒ la visionneuse ne pagine pas au doigt. */
  readonly onNext?: () => void;
  readonly onPrevious?: () => void;
  /** Un glissé vers le haut — plein cadre pour la visionneuse de médias, rien ailleurs. */
  readonly onUp?: () => void;
  /** L'élément qui DESCEND avec le doigt pendant un glissé de fermeture. */
  readonly follow?: RefObject<HTMLElement | null>;
  /** `false` quand une feuille est ouverte par-dessus, ou qu'une image est zoomée. */
  readonly enabled?: boolean;
  readonly rtl?: boolean;
};

type PointerHandler = (event: ReactPointerEvent<HTMLElement>) => void;

export type ViewerSwipeBinding = {
  readonly handlers: {
    readonly onPointerDown: PointerHandler;
    readonly onPointerMove: PointerHandler;
    readonly onPointerUp: PointerHandler;
    readonly onPointerCancel: PointerHandler;
  };
  /** Le DERNIER geste a-t-il bougé au-delà du toucher ? Lisible dans le `click` qui suit le relâcher. */
  readonly wasDrag: () => boolean;
};

type Track = { readonly startX: number; readonly startY: number; dx: number; dy: number };

export function useViewerSwipe(options: ViewerSwipeOptions): ViewerSwipeBinding {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const track = useRef<Track | null>(null);
  const moved = useRef(false);

  const settle = (): void => {
    const follow = optionsRef.current.follow?.current;
    if (follow !== null && follow !== undefined) follow.style.transform = '';
  };

  const onPointerDown: PointerHandler = (event) => {
    if (optionsRef.current.enabled === false || !event.isPrimary) return;
    track.current = { startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 };
    moved.current = false;
  };

  const onPointerMove: PointerHandler = (event) => {
    const current = track.current;
    if (current === null || !event.isPrimary) return;
    current.dx = event.clientX - current.startX;
    current.dy = event.clientY - current.startY;
    if (Math.hypot(current.dx, current.dy) > VIEWER_TAP_SLOP_PX) moved.current = true;
    const follow = optionsRef.current.follow?.current;
    if (follow === null || follow === undefined) return;
    follow.style.transform = Math.abs(current.dy) > Math.abs(current.dx) && current.dy > 0 ? `translateY(${current.dy}px)` : '';
  };

  const onPointerUp: PointerHandler = (event) => {
    const current = track.current;
    track.current = null;
    if (current === null || !event.isPrimary) return;
    settle();
    const { onDismiss, onNext, onPrevious, onUp, rtl } = optionsRef.current;
    const verdict = resolveViewerSwipe({
      dx: current.dx,
      dy: current.dy,
      paging: onNext !== undefined || onPrevious !== undefined,
      ...(rtl === undefined ? {} : { rtl }),
    });
    if (verdict === 'dismiss') onDismiss();
    else if (verdict === 'next') onNext?.();
    else if (verdict === 'previous') onPrevious?.();
    else if (verdict === 'up') onUp?.();
  };

  const onPointerCancel: PointerHandler = () => {
    track.current = null;
    settle();
  };

  return { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, wasDrag: () => moved.current };
}
