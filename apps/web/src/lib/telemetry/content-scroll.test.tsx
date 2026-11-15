import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useContentScrollTelemetry, type ContentScrollProbe } from './content-scroll';
import { depthOf } from './scroll-depth';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
let container: HTMLDivElement;
let root: Root | null = null;

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

let probe: ContentScrollProbe | null = null;
let clock = 0;
function Carousel() {
  probe = useContentScrollTelemetry({ target: { kind: 'post', id: 'p1' }, contentKind: 'carousel', itemsTotal: 4, surface: 'feed', now: () => clock });
  return null;
}

describe('useContentScrollTelemetry — un scroll/content par contenu et par ouverture', () => {
  test('un carrousel parcouru envoie glissements et index maximal au démontage', () => {
    clock = 0;
    root = createRoot(container);
    act(() => root?.render(<Carousel />));
    probe?.noteIndex(1);
    probe?.noteIndex(3);
    expect(v2).toEqual([]);
    clock = 2500;
    act(() => root?.unmount());
    root = null;
    expect(v2).toEqual([
      {
        type: 'scroll',
        action: 'content',
        target: { kind: 'post', id: 'p1' },
        surface: 'feed',
        contentKind: 'carousel',
        itemsTotal: 4,
        maxIndexReached: 3,
        swipes: 2,
        maxScrollFraction: 0,
        readThroughFraction: 0,
        durationMs: 2500,
      },
    ]);
  });

  test('un carrousel jamais touché n’envoie rien', () => {
    root = createRoot(container);
    act(() => root?.render(<Carousel />));
    act(() => root?.unmount());
    root = null;
    expect(v2).toEqual([]);
  });
});

describe('depthOf — la profondeur atteinte', () => {
  test('la part du cadre vue et la part du contenu passée dans le cadre', () => {
    const frame = {
      scrollTop: 300,
      clientHeight: 500,
      scrollHeight: 1600,
      firstElementChild: { offsetTop: 0, offsetHeight: 1000 },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Parameters<typeof depthOf>[0];
    expect(depthOf(frame)).toEqual({ scrollFraction: 0.5, readThrough: 0.8 });
  });
});
