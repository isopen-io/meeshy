import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { noteListingItem } from './listing-registry';
import { LISTING_SEGMENT_MS, useListingScrollTelemetry } from './listing-scroll';

/**
 * LE PASSAGE DANS UN LISTING PART EN UN SEUL RÉSUMÉ (#10509) — à la sortie
 * de l'écran, au passage en arrière-plan, ou par segment de 60 s.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
let container: HTMLDivElement;
let root: Root | null = null;
let renders = 0;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  v2 = [];
  renders = 0;
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container.remove();
  readingTelemetry.recordV2 = original;
});

function Listing(props: { readonly loaded: number; readonly frames: { raf: (run: (at: number) => void) => number; cancel: () => void }; readonly now: () => number }) {
  renders += 1;
  const frame = useRef<HTMLDivElement | null>(null);
  useListingScrollTelemetry({ frame, surface: 'feed', listingSessionId: 'ls-1', loaded: props.loaded, frames: props.frames, now: props.now });
  return <div ref={frame} data-testid="frame" />;
}

describe('useListingScrollTelemetry', () => {
  test('1 000 événements scroll ⇒ UN seul événement, à la sortie, sans aucun re-rendu pendant le geste', () => {
    let clock = 0;
    let due: ((at: number) => void) | null = null;
    const frames = { raf: (run: (at: number) => void) => { due = run; return 1; }, cancel: () => undefined };
    root = createRoot(container);
    act(() => root?.render(<Listing loaded={10} frames={frames} now={() => clock} />));
    const rendersBefore = renders;
    const node = container.querySelector('[data-testid="frame"]') as HTMLDivElement;
    for (let i = 0; i < 1000; i += 1) {
      clock = i * 2;
      Object.defineProperty(node, 'scrollTop', { value: i * 3, configurable: true });
      node.dispatchEvent(new Event('scroll'));
      const run = due as ((at: number) => void) | null;
      due = null;
      run?.(clock);
    }
    noteListingItem({ listingSessionId: 'ls-1', position: 7 }, true);
    expect(v2).toEqual([]);
    expect(renders).toBe(rendersBefore);
    act(() => root?.unmount());
    root = null;
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({ type: 'scroll', action: 'listing', surface: 'feed', listingSessionId: 'ls-1', segment: 0, maxPosition: 7, itemsViewable: 1 });
    const summary = v2[0] as unknown as { distancePt: number; activeScrollMs: number; velocityHistogram: number[] };
    expect(summary.distancePt).toBeGreaterThan(2500);
    expect(summary.velocityHistogram.reduce((a, b) => a + b, 0)).toBe(summary.activeScrollMs);
  });

  test('une page de plus chargée compte une pagination', () => {
    const frames = { raf: () => 1, cancel: () => undefined };
    root = createRoot(container);
    act(() => root?.render(<Listing loaded={10} frames={frames} now={() => 0} />));
    act(() => root?.render(<Listing loaded={20} frames={frames} now={() => 5} />));
    act(() => root?.unmount());
    root = null;
    expect(v2[0]).toMatchObject({ paginations: 1 });
  });

  test('un passage sans rien (ni défilement, ni carte, ni page) n’envoie rien', () => {
    const frames = { raf: () => 1, cancel: () => undefined };
    root = createRoot(container);
    act(() => root?.render(<Listing loaded={0} frames={frames} now={() => 0} />));
    act(() => root?.unmount());
    root = null;
    expect(v2).toEqual([]);
  });

  test(`toutes les ${LISTING_SEGMENT_MS / 1000} s d’un passage qui dure, un segment part ; le suivant repart à zéro`, () => {
    let tick: (() => void) | null = null;
    function Long() {
      const frame = useRef<HTMLDivElement | null>(null);
      useListingScrollTelemetry({
        frame,
        surface: 'feed',
        listingSessionId: 'ls-2',
        loaded: 0,
        frames: { raf: () => 1, cancel: () => undefined },
        now: () => 0,
        every: (run, ms) => {
          expect(ms).toBe(LISTING_SEGMENT_MS);
          tick = run;
          return () => undefined;
        },
      });
      return <div ref={frame} />;
    }
    root = createRoot(container);
    act(() => root?.render(<Long />));
    noteListingItem({ listingSessionId: 'ls-2', position: 1 }, false);
    (tick as (() => void) | null)?.();
    noteListingItem({ listingSessionId: 'ls-2', position: 2 }, false);
    act(() => root?.unmount());
    root = null;
    expect(v2.map((e) => (e as { segment: number }).segment)).toEqual([0, 1]);
    expect(v2.map((e) => (e as { itemsRendered: number }).itemsRendered)).toEqual([1, 1]);
  });
});
