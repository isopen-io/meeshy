import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { planReorderFlip, useListReorderFlip } from './list-reorder-flip';

/**
 * UNE REMONTÉE EN TÊTE S'ANIME (#11207). Une conversation qui reçoit un
 * message remonte en tête de liste : sans animation, elle SAUTE, et les
 * rangées qu'elle a dépassées sautent d'un cran avec elle. La technique FLIP
 * (First, Last, Invert, Play) mesure avant et après le commit, puis anime le
 * `transform` des seules rangées VISIBLES qui ont changé de place.
 */
describe('planReorderFlip — la loi pure', () => {
  const viewport = { top: 0, bottom: 600 };

  test('une rangée passée de 300 à 0 reçoit son écart ; une rangée restée en place, rien', () => {
    const plan = planReorderFlip({
      before: new Map([
        ['a', 0],
        ['f', 300],
      ]),
      after: new Map([
        ['f', { top: 0, bottom: 60 }],
        ['a', { top: 60, bottom: 120 }],
      ]),
      viewport,
    });
    expect(plan).toEqual([
      { id: 'f', dy: 300 },
      { id: 'a', dy: -60 },
    ]);
  });

  test('une rangée sans position d’avant (elle vient d’au-delà de l’écran) ne s’anime pas', () => {
    expect(planReorderFlip({ before: new Map(), after: new Map([['z', { top: 0, bottom: 60 }]]), viewport })).toEqual([]);
  });

  test('une rangée qui finit HORS de la fenêtre ne s’anime pas — rien d’invisible ne travaille', () => {
    const plan = planReorderFlip({
      before: new Map([['a', 540]]),
      after: new Map([['a', { top: 600, bottom: 660 }]]),
      viewport,
    });
    expect(plan).toEqual([]);
  });

  test('un écart sous le demi-pixel n’est pas un déplacement', () => {
    const plan = planReorderFlip({
      before: new Map([['a', 60.2]]),
      after: new Map([['a', { top: 60, bottom: 120 }]]),
      viewport,
    });
    expect(plan).toEqual([]);
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const ROW = 60;

type Played = { readonly id: string | undefined; readonly keyframes: readonly Keyframe[] };

describe('useListReorderFlip — mesure avant et après le commit, puis anime', () => {
  const played: Played[] = [];
  const mounted: { root: Root; host: HTMLElement }[] = [];
  let restore: (() => void) | null = null;
  let reduced = false;

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
    played.splice(0);
    reduced = false;
    const proto = HTMLElement.prototype;
    const originalRect = proto.getBoundingClientRect;
    const originalAnimate = proto.animate;
    const originalMatchMedia = window.matchMedia;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      const index = this.hasAttribute('data-row') ? [...(this.parentElement?.children ?? [])].indexOf(this) : -1;
      const top = index < 0 ? 0 : index * ROW;
      const height = index < 0 ? 600 : ROW;
      return { top, bottom: top + height, height, left: 0, right: 320, width: 320, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    };
    proto.animate = function (this: HTMLElement, keyframes: Keyframe[] | PropertyIndexedKeyframes | null) {
      played.push({ id: this.dataset.row, keyframes: Array.isArray(keyframes) ? keyframes : [] });
      return { cancel: () => {}, finished: Promise.resolve() } as unknown as Animation;
    } as typeof proto.animate;
    window.matchMedia = ((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    restore = () => {
      proto.getBoundingClientRect = originalRect;
      proto.animate = originalAnimate;
      window.matchMedia = originalMatchMedia;
    };
  });

  afterEach(() => {
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
    restore?.();
    restore = null;
  });

  const List = ({ ids }: { readonly ids: readonly string[] }) => {
    const frame = useRef<HTMLUListElement | null>(null);
    useListReorderFlip(frame, ids.map((id) => ({ id })));
    return createElement(
      'ul',
      { ref: frame, 'data-testid': 'frame' },
      ids.map((id) => createElement('li', { key: id, 'data-row': id }, id)),
    );
  };

  const IDS = Array.from({ length: 10 }, (_, i) => `r${i}`);
  const RAISED = ['r5', ...IDS.filter((id) => id !== 'r5')];

  const mount = (ids: readonly string[]) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(createElement(List, { ids })));
    const frame = host.querySelector<HTMLElement>('[data-testid="frame"]');
    if (frame === null) throw new Error('défileur absent');
    return { frame, rerender: (next: readonly string[]) => act(() => root.render(createElement(List, { ids: next }))) };
  };

  test('la rangée passée de l’index 5 à 0 reçoit une animation de transform, depuis sa place d’avant', () => {
    const { rerender } = mount(IDS);
    rerender(RAISED);
    const raised = played.find((p) => p.id === 'r5');
    expect(raised?.keyframes[0]?.transform).toBe(`translateY(${5 * ROW}px)`);
    expect(raised?.keyframes.at(-1)?.transform).toBe('translateY(0px)');
    const overtaken = played.filter((p) => p.id !== 'r5').map((p) => p.id);
    expect(overtaken.sort()).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
  });

  test('sous prefers-reduced-motion, aucune animation', () => {
    reduced = true;
    const { rerender } = mount(IDS);
    rerender(RAISED);
    expect(played).toEqual([]);
  });

  test('pendant un défilement actif, aucune animation — la liste suit le doigt', () => {
    const { frame, rerender } = mount(IDS);
    act(() => {
      frame.dispatchEvent(new Event('scroll'));
    });
    rerender(RAISED);
    expect(played).toEqual([]);
  });

  test('un rendu au même ordre (nouvelle identité de tableau) n’anime rien', () => {
    const { rerender } = mount(IDS);
    rerender([...IDS]);
    expect(played).toEqual([]);
  });
});
