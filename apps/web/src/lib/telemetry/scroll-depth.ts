import { useEffect } from 'react';

import type { EventSurface, EventTargetRef, ScrollContentKind } from '@/lib/api/social-events-v2-types';

import { useContentScrollTelemetry } from './content-scroll';
import { bindDecimatedScroll } from './scroll-accumulator';

type DepthFrame = Pick<HTMLElement, 'scrollTop' | 'clientHeight' | 'scrollHeight' | 'firstElementChild' | 'addEventListener' | 'removeEventListener'>;

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * La profondeur atteinte dans un cadre qui défile : la part du cadre vue
 * (`maxScrollFraction`) et la part de son PREMIER enfant — le contenu
 * lui-même, avant ses commentaires — passée dans le cadre (`readThroughFraction`).
 */
export function depthOf(frame: DepthFrame): { readonly scrollFraction: number; readonly readThrough: number } {
  const bottom = frame.scrollTop + frame.clientHeight;
  const content = frame.firstElementChild as HTMLElement | null;
  const readThrough = content === null || content.offsetHeight <= 0 ? 1 : (bottom - content.offsetTop) / content.offsetHeight;
  return { scrollFraction: clamp01(frame.scrollHeight <= 0 ? 1 : bottom / frame.scrollHeight), readThrough: clamp01(readThrough) };
}

/** La profondeur de lecture d'un écran de contenu (détail d'un post et ses commentaires). */
export function useScrollDepthTelemetry(params: {
  readonly frame: { readonly current: DepthFrame | null };
  readonly target: EventTargetRef | null;
  readonly contentKind: ScrollContentKind;
  readonly surface?: EventSurface;
}): void {
  const { frame, target, contentKind, surface } = params;
  const probe = useContentScrollTelemetry({ target, contentKind, itemsTotal: 1, ...(surface === undefined ? {} : { surface }) });
  const active = target !== null;
  useEffect(() => {
    const node = frame.current;
    if (!active || node === null) return undefined;
    const note = () => {
      const { scrollFraction, readThrough } = depthOf(node);
      probe.noteFraction(scrollFraction, readThrough);
    };
    note();
    return bindDecimatedScroll(node, note);
  }, [frame, active, probe]);
}
