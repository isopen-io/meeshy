import { useEffect, useRef, type RefObject } from 'react';

import type { EventSurface } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';

import { listingAccumulators as live } from './listing-registry';
import { bindDecimatedScroll, createListingScrollAccumulator, type FrameDeps } from './scroll-accumulator';

/**
 * **LE PASSAGE DANS UN LISTING** (#10509) — un résumé `scroll/listing` par
 * `listingSessionId`, émis à la sortie de l'écran, au passage en
 * arrière-plan, ou toutes les 60 s d'un passage qui dure (segments
 * numérotés, l'agrégat somme). Pendant le geste : des références, jamais un
 * état React — le défilement ne re-rend rien.
 */
export const LISTING_SEGMENT_MS = 60_000;

type Every = (run: () => void, ms: number) => () => void;

const browserEvery: Every = (run, ms) => {
  const handle = setInterval(run, ms);
  return () => clearInterval(handle);
};

export function useListingScrollTelemetry(params: {
  readonly frame: RefObject<HTMLElement | null>;
  readonly surface: EventSurface;
  readonly listingSessionId: string;
  /** Le nombre de contenus chargés — chaque hausse après le premier chargement est une pagination. */
  readonly loaded: number;
  readonly frames?: FrameDeps;
  readonly now?: () => number;
  readonly every?: Every;
}): void {
  const { frame, surface, listingSessionId, loaded } = params;
  const deps = useRef({ frames: params.frames, now: params.now ?? (() => performance.now()), every: params.every ?? browserEvery });
  const loadedRef = useRef(loaded);

  useEffect(() => {
    const prior = loadedRef.current;
    loadedRef.current = loaded;
    if (prior > 0 && loaded > prior) live.get(listingSessionId)?.notePagination();
  }, [loaded, listingSessionId]);

  useEffect(() => {
    const { now, every, frames } = deps.current;
    const accumulator = createListingScrollAccumulator(now());
    live.set(listingSessionId, accumulator);
    let segment = 0;

    const emit = (): void => {
      if (!accumulator.hasActivity()) return;
      const at = now();
      readingTelemetry.recordV2({ type: 'scroll', action: 'listing', surface, listingSessionId, segment, ...accumulator.summary(at) });
      segment += 1;
      accumulator.reset(at);
    };

    const node = frame.current;
    const unbind =
      node === null
        ? () => undefined
        : bindDecimatedScroll(
            node,
            (top, at, atEnd) => {
              accumulator.sample(top, at);
              if (atEnd) accumulator.noteReachedEnd();
            },
            ...(frames === undefined ? [] : [frames]),
          );
    const stopEvery = every(emit, LISTING_SEGMENT_MS);
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') emit();
    };
    const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (hasDom) {
      window.addEventListener('pagehide', emit);
      document.addEventListener('visibilitychange', onHidden);
    }
    return () => {
      emit();
      unbind();
      stopEvery();
      if (hasDom) {
        window.removeEventListener('pagehide', emit);
        document.removeEventListener('visibilitychange', onHidden);
      }
      if (live.get(listingSessionId) === accumulator) live.delete(listingSessionId);
    };
  }, [frame, surface, listingSessionId]);
}
