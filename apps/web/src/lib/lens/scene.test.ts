import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SCENE_OVERSCAN_PX, useScene } from './scene';

/**
 * LA PASSE DE PERSPECTIVE NE TOUCHE QUE CE QUI SE VOIT (#11207).
 *
 * Elle lisait et écrivait TOUTES les rangées `[data-row]` montées, à chaque
 * image : deux cents rangées chargées par la pagination, deux cents lectures
 * de géométrie et quatre cents écritures de style pour huit rangées à
 * l'écran. Un `IntersectionObserver` (racine : le défileur, marge :
 * `SCENE_OVERSCAN_PX`) tient l'ensemble visible ; la passe ne travaille que
 * sur lui.
 *
 * happy-dom DÉCLARE un `IntersectionObserver` mais ne calcule aucune
 * intersection (`use-out-of-view.test.tsx`) : le témoin pose son propre
 * constructeur et décide lui-même de ce qui est visible.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Recorded = {
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit | undefined;
  readonly observed: Set<Element>;
  disconnected: boolean;
};

const observers: Recorded[] = [];
let nativeObserver: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  private readonly record: Recorded;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.record = { callback, options, observed: new Set(), disconnected: false };
    observers.push(this.record);
  }
  observe(el: Element) {
    this.record.observed.add(el);
  }
  unobserve(el: Element) {
    this.record.observed.delete(el);
  }
  disconnect() {
    this.record.disconnected = true;
    this.record.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
}

const ROWS = 200;
const VISIBLE = 8;
const OVERSCAN_ROWS = 4;

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
  observers.splice(0);
  nativeObserver = globalThis.IntersectionObserver;
  (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
});

const mounted: { root: Root; host: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  if (nativeObserver !== undefined) (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = nativeObserver;
});

const List = ({ count }: { readonly count: number }) => {
  const frame = useRef<HTMLUListElement | null>(null);
  useScene(frame);
  return createElement(
    'ul',
    { ref: frame, 'data-testid': 'frame' },
    Array.from({ length: count }, (_, i) => createElement('li', { key: `r${i}`, 'data-row': `r${i}` }, createElement('div', null, `rangée ${i}`))),
  );
};

const mount = (count = ROWS) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(createElement(List, { count })));
  const frame = host.querySelector<HTMLElement>('[data-testid="frame"]');
  if (frame === null) throw new Error('défileur absent');
  return { frame, root, host, rows: [...frame.querySelectorAll<HTMLElement>('[data-row]')] };
};

const sceneObserver = (): Recorded => {
  const found = observers.find((o) => !o.disconnected);
  if (found === undefined) throw new Error('aucun observateur');
  return found;
};

const report = (observer: Recorded, rows: readonly HTMLElement[], isIntersecting: boolean) =>
  act(() => {
    observer.callback(
      rows.map((target) => ({ target, isIntersecting }) as unknown as IntersectionObserverEntry),
      observer as unknown as IntersectionObserver,
    );
  });

const nextFrames = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));

const written = (rows: readonly HTMLElement[]) =>
  rows.filter((row) => {
    const visual = row.firstElementChild;
    return visual instanceof HTMLElement && (visual.style.transform !== '' || visual.style.opacity !== '');
  });

/**
 * Les lectures de géométrie des RANGÉES, comptées PAR PASSE : chaque passe
 * commence par lire la boîte du défileur, qui ouvre un nouveau compte. (La
 * scène se rejoue d'elle-même pendant son entrée — plusieurs passes tiennent
 * dans l'attente du témoin.)
 */
const rectReadsPerPass = async (run: () => Promise<void>): Promise<readonly number[]> => {
  const proto = HTMLElement.prototype;
  const original = proto.getBoundingClientRect;
  const passes: number[] = [];
  proto.getBoundingClientRect = function (this: HTMLElement) {
    if (this.dataset.testid === 'frame') passes.push(0);
    if (this.hasAttribute('data-row') && passes.length > 0) passes[passes.length - 1] = (passes.at(-1) ?? 0) + 1;
    return original.call(this);
  };
  try {
    await run();
  } finally {
    proto.getBoundingClientRect = original;
  }
  return passes;
};

describe('useScene — la passe est bornée aux rangées visibles (+ la marge)', () => {
  test('l’observateur a le défileur pour racine et la marge de la scène, et voit chaque rangée', () => {
    const { frame, rows } = mount();
    const observer = sceneObserver();
    expect(observer.options?.root).toBe(frame);
    expect(observer.options?.rootMargin).toBe(`${SCENE_OVERSCAN_PX}px 0px`);
    expect(rows.every((row) => observer.observed.has(row))).toBe(true);
  });

  test('200 rangées montées, 8 visibles : au plus 8 + marge écritures et lectures par image', async () => {
    const { frame, rows } = mount();
    const inView = rows.slice(0, VISIBLE + OVERSCAN_ROWS);
    report(sceneObserver(), inView, true);
    await nextFrames();
    for (const row of rows) {
      const visual = row.firstElementChild;
      if (visual instanceof HTMLElement) visual.removeAttribute('style');
    }
    const passes = await rectReadsPerPass(async () => {
      act(() => {
        frame.dispatchEvent(new Event('scroll'));
      });
      await nextFrames();
    });
    expect(written(rows).length).toBeLessThanOrEqual(VISIBLE + OVERSCAN_ROWS);
    expect(written(rows.slice(VISIBLE + OVERSCAN_ROWS))).toEqual([]);
    expect(passes.length).toBeGreaterThan(0);
    expect(Math.max(...passes)).toBeLessThanOrEqual(VISIBLE + OVERSCAN_ROWS);
  });

  test('une rangée qui SORT de l’ensemble est rendue à l’identité, une fois', async () => {
    const { frame, rows } = mount();
    const observer = sceneObserver();
    report(observer, rows.slice(0, VISIBLE), true);
    act(() => {
      frame.dispatchEvent(new Event('scroll'));
    });
    await nextFrames();
    const leaving = rows[0];
    if (leaving === undefined) throw new Error('rangée absente');
    const visual = leaving.firstElementChild as HTMLElement;
    visual.style.transform = 'translateY(3px) scale(0.9)';
    visual.style.opacity = '0.5';
    report(observer, [leaving], false);
    expect(visual.style.opacity).toBe('1');
    expect(visual.style.transform).toBe('translateY(0px) scale(1)');
  });

  /**
   * UN DÉPLACEMENT N'EST PAS UN DÉMONTAGE (revue #11207). Preact déplace une
   * rangée par `insertBefore` : le `MutationObserver` voit une suppression,
   * et la rangée quittait l'ensemble SANS être rendue à l'identité — un saut
   * instantané la ramenait à l'écran avec l'opacité et l'échelle de son
   * ancienne place.
   */
  test('une rangée DÉPLACÉE (insertBefore) est rendue à l’identité, puis réobservée', async () => {
    const { frame, rows } = mount(20);
    const observer = sceneObserver();
    report(observer, rows.slice(0, VISIBLE), true);
    act(() => {
      frame.dispatchEvent(new Event('scroll'));
    });
    await nextFrames();
    const moving = rows[VISIBLE - 1];
    if (moving === undefined) throw new Error('rangée absente');
    const visual = moving.firstElementChild as HTMLElement;
    visual.style.transform = 'translateY(3px) scale(0.9)';
    visual.style.opacity = '0.5';
    await act(async () => {
      frame.insertBefore(moving, frame.firstChild);
      await Promise.resolve();
    });
    expect(visual.style.opacity).toBe('1');
    expect(visual.style.transform).toBe('translateY(0px) scale(1)');
    expect(observer.observed.has(moving)).toBe(true);
  });

  test('une rangée montée APRÈS coup est observée ; une rangée démontée ne l’est plus', async () => {
    const { root, host, rows } = mount(10);
    const observer = sceneObserver();
    act(() => root.render(createElement(List, { count: 12 })));
    await nextFrames();
    const grown = [...host.querySelectorAll<HTMLElement>('[data-row]')];
    expect(grown.length).toBe(12);
    expect(grown.every((row) => observer.observed.has(row))).toBe(true);
    act(() => root.render(createElement(List, { count: 4 })));
    await nextFrames();
    expect(rows.slice(4).some((row) => observer.observed.has(row))).toBe(false);
  });

  test('le démontage déconnecte l’observateur', () => {
    const { root, host } = mount(10);
    const observer = sceneObserver();
    act(() => root.unmount());
    mounted.splice(0);
    host.remove();
    expect(observer.disconnected).toBe(true);
  });
});
