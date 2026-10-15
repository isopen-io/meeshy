import type { ScrollListingSummary, VelocityHistogram } from '@/lib/api/social-events-v2-types';

import { ratio2 } from './content-accumulator';

export { createContentScrollAccumulator } from './content-accumulator';

/**
 * **LE DÉFILEMENT, AGRÉGÉ PAR PASSAGE** (#10509, décision § 5) — jamais par
 * image. L'échantillon est lu au plus à 10 Hz (`bindDecimatedScroll`), cumulé
 * en mémoire par des additions d'entiers dans un état de taille fixe, et
 * rien ne part avant la fin du passage : aucune écriture, aucun réseau, aucun
 * état React pendant le geste.
 */
export const SCROLL_SAMPLE_MS = 100;
export const SCROLL_STOP_MS = 1000;
const VELOCITY_EDGES = [500, 1500, 4000] as const;
const FLING_BUCKET = 3;
const POSITIONS_CAP = 1000;

export type ListingScrollTotals = Omit<ScrollListingSummary, 'listingSessionId' | 'segment'>;

const bucketOf = (velocity: number): number => {
  const index = VELOCITY_EDGES.findIndex((edge) => velocity < edge);
  return index === -1 ? VELOCITY_EDGES.length : index;
};

export function createListingScrollAccumulator(startedAt: number) {
  let since = startedAt;
  let lastTop: number | null = null;
  let lastAt = startedAt;
  let lastDirection = 0;
  let lastBucket = -1;
  let distance = 0;
  let upDistance = 0;
  let active = 0;
  const histogram = [0, 0, 0, 0];
  let directionChanges = 0;
  let flings = 0;
  let stops = 0;
  let refreshes = 0;
  let paginations = 0;
  let reachedEnd = false;
  let maxPosition = -1;
  let rendered = new Set<number>();
  let viewable = new Set<number>();

  function sample(top: number, at: number): void {
    const previous = lastTop;
    const dt = at - lastAt;
    lastTop = top;
    lastAt = at;
    if (previous === null || dt <= 0) return;
    const dy = Math.round(top - previous);
    const moved = Math.abs(dy);
    distance += moved;
    if (dy < 0) upDistance += moved;
    if (moved === 0) return;
    const direction = dy > 0 ? 1 : -1;
    if (lastDirection !== 0 && direction !== lastDirection) directionChanges += 1;
    lastDirection = direction;
    if (dt >= SCROLL_STOP_MS) {
      stops += 1;
      lastBucket = -1;
      return;
    }
    const bucket = bucketOf((moved * 1000) / dt);
    histogram[bucket] = (histogram[bucket] ?? 0) + dt;
    active += dt;
    if (bucket === FLING_BUCKET && lastBucket !== FLING_BUCKET) flings += 1;
    lastBucket = bucket;
  }

  function noteItem(position: number, isViewable: boolean): void {
    maxPosition = Math.max(maxPosition, position);
    if (rendered.size < POSITIONS_CAP) rendered.add(position);
    if (isViewable && viewable.size < POSITIONS_CAP) viewable.add(position);
  }

  function summary(at: number): ListingScrollTotals {
    return {
      durationMs: Math.max(0, Math.round(at - since)),
      activeScrollMs: Math.round(active),
      itemsRendered: rendered.size,
      itemsViewable: viewable.size,
      maxPosition: Math.max(0, maxPosition),
      distancePt: distance,
      velocityHistogram: [histogram[0] ?? 0, histogram[1] ?? 0, histogram[2] ?? 0, histogram[3] ?? 0] satisfies VelocityHistogram,
      directionChanges,
      upDistanceRatio: ratio2(upDistance, distance),
      flings,
      stops,
      refreshes,
      paginations,
      reachedEnd,
    };
  }

  function reset(at: number): void {
    since = at;
    lastAt = at;
    distance = 0;
    upDistance = 0;
    active = 0;
    histogram.fill(0);
    directionChanges = 0;
    flings = 0;
    stops = 0;
    refreshes = 0;
    paginations = 0;
    reachedEnd = false;
    maxPosition = -1;
    rendered = new Set();
    viewable = new Set();
  }

  const hasActivity = (): boolean => distance > 0 || rendered.size > 0 || refreshes > 0 || paginations > 0;

  return {
    sample,
    noteItem,
    noteRefresh: () => void (refreshes += 1),
    notePagination: () => void (paginations += 1),
    noteReachedEnd: () => void (reachedEnd = true),
    summary,
    reset,
    hasActivity,
  };
}

export type ListingScrollAccumulator = ReturnType<typeof createListingScrollAccumulator>;

type ScrollTarget = {
  readonly scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  addEventListener(type: 'scroll', run: () => void, options: { passive: true }): void;
  removeEventListener(type: 'scroll', run: () => void): void;
};

export type FrameDeps = {
  readonly raf: (run: (at: number) => void) => number;
  readonly cancel: (handle: number) => void;
};

const browserFrames = (): FrameDeps => ({
  raf: (run) => requestAnimationFrame(run),
  cancel: (handle) => cancelAnimationFrame(handle),
});

/**
 * L'écoute passive d'un défilement, décimée par `requestAnimationFrame` à
 * {@link SCROLL_SAMPLE_MS} : l'événement ne fait que lever un drapeau ; la
 * lecture de `scrollTop` (qui force la mise en page) n'arrive qu'à l'image
 * due. Le rappel de l'image est UNE fonction, créée une fois.
 */
export function bindDecimatedScroll(
  target: ScrollTarget,
  onSample: (top: number, at: number, atEnd: boolean) => void,
  deps: FrameDeps = browserFrames(),
): () => void {
  let pending = false;
  let handle = 0;
  let last = Number.NEGATIVE_INFINITY;

  const tick = (at: number): void => {
    if (at - last < SCROLL_SAMPLE_MS) {
      handle = deps.raf(tick);
      return;
    }
    pending = false;
    last = at;
    const top = target.scrollTop;
    onSample(top, at, top + target.clientHeight >= target.scrollHeight - 2);
  };

  const onScroll = (): void => {
    if (pending) return;
    pending = true;
    handle = deps.raf(tick);
  };

  target.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    target.removeEventListener('scroll', onScroll);
    if (pending) deps.cancel(handle);
    pending = false;
  };
}
