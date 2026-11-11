import { act, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStageFlip } from './use-stage-flip';

/**
 * **CHAQUE VIGNETTE PASSE DE SA CASE À LA SUIVANTE** (P14.10) — le crochet mesure l’ancienne scène au rendu qui
 * change la clé, rejoue l’inverse du déplacement sur la case de la même personne, et ne fait rien tant que la clé tient.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/* La mise en page que le témoin règle : où se trouve chaque case, selon la scène montrée. */
const layouts: Record<string, Record<string, { left: number; top: number; width: number; height: number }>> = {
  grid: { a: { left: 10, top: 10, width: 100, height: 100 }, b: { left: 120, top: 10, width: 100, height: 100 } },
  spot: { a: { left: 10, top: 10, width: 300, height: 400 }, b: { left: 10, top: 420, width: 84, height: 112 } },
};
let scene = 'grid';

const runs: { readonly target: Element; readonly frames: readonly Keyframe[]; readonly duration: number }[] = [];
let cancelled = 0;
const saved: { animate?: PropertyDescriptor | undefined; rect?: PropertyDescriptor | undefined; media?: PropertyDescriptor | undefined } = {};

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
  runs.length = 0;
  cancelled = 0;
  scene = 'grid';
  saved.animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  saved.rect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  saved.media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      runs.push({ target: this, frames, duration: Number(options.duration) });
      return { cancel: () => (cancelled += 1) };
    },
  });
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element) {
      const box = layouts[scene]?.[this.getAttribute('data-call-slot') ?? ''] ?? { left: 0, top: 0, width: 0, height: 0 };
      return { ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height };
    },
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
});
afterEach(() => {
  const restore = (target: object, key: string, descriptor: PropertyDescriptor | undefined) => (descriptor === undefined ? Reflect.deleteProperty(target, key) : Object.defineProperty(target, key, descriptor));
  restore(HTMLElement.prototype, 'animate', saved.animate);
  restore(Element.prototype, 'getBoundingClientRect', saved.rect);
  restore(window, 'matchMedia', saved.media);
});

function Scene({ shown }: { readonly shown: string }) {
  const root = useRef<HTMLDivElement>(null);
  /* La mise en page ne change qu'à la validation : au rendu, le DOM montre encore l'ancienne scène. */
  useLayoutEffect(() => {
    scene = shown;
  });
  useStageFlip(root, shown);
  return (
    <div ref={root}>
      <i data-call-slot="a" />
      <i data-call-slot="b" />
    </div>
  );
}

const mount = (shown: string) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Scene shown={shown} />));
  return {
    show: (next: string) => act(() => root.render(<Scene shown={next} />)),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('useStageFlip', () => {
  test('la première scène ne joue rien, et tant que la clé tient aucune case ne bouge', () => {
    const view = mount('grid');
    view.show('grid');
    expect(runs).toHaveLength(0);
    view.done();
  });

  test('la clé change : chaque case repart de son ancienne case, en transformation seule, 260 ms', () => {
    const view = mount('grid');
    view.show('spot');
    expect(runs.map((run) => run.target.getAttribute('data-call-slot'))).toEqual(['a', 'b']);
    expect(runs[0]?.frames).toEqual([{ transform: `translate(0px, 0px) scale(${100 / 300}, ${100 / 400})` }, { transform: 'none' }]);
    expect(runs[1]?.frames).toEqual([{ transform: `translate(110px, -410px) scale(${100 / 84}, ${100 / 112})` }, { transform: 'none' }]);
    expect(runs.every((run) => run.duration === 260)).toBe(true);
    view.done();
  });

  test('un mouvement en cours est annulé avant la mesure : un toucher pendant le mouvement répond', () => {
    const view = mount('grid');
    view.show('spot');
    view.show('grid');
    expect(runs).toHaveLength(4);
    view.done();
  });

  test('« Réduire les animations » : un fondu court au lieu du déplacement', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    const view = mount('grid');
    view.show('spot');
    expect(runs.map((run) => run.frames)).toEqual([[{ opacity: 0 }, { opacity: 1 }], [{ opacity: 0 }, { opacity: 1 }]]);
    expect(runs.every((run) => run.duration === 150)).toBe(true);
    view.done();
  });
});
