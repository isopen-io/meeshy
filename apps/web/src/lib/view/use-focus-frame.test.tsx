import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { focusFrame } from '@/lib/reading-mode/focus-frame';
import { useFocusFrame } from './use-focus-frame';

/**
 * `useFocusFrame` (#8506) — le câblage : mesurer la rangée élue, poser la
 * loupe et ses variables, écarter les voisines, tout retirer quand l'élection
 * part. La GÉOMÉTRIE est jugée par `focus-frame.test.ts` ; happy-dom ne
 * calcule aucun layout, les boîtes sont donc posées par élément.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let reduced = false;
let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = ((query: string) => ({
    matches: reduced,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  reduced = false;
});

type Box = { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };

const boxed = (box: Box) => (node: HTMLElement | null) => {
  if (node === null) return;
  node.getBoundingClientRect = () =>
    ({ ...box, width: box.right - box.left, height: box.bottom - box.top, x: box.left, y: box.top }) as DOMRect;
};

const ROW: Box = { top: 100, bottom: 160, left: 0, right: 390 };
const CARD: Box = { top: 103, bottom: 157, left: 6, right: 376 };
const INK: Box = { top: 120, bottom: 140, left: 57, right: 156 };
const STAMP: Box = { top: 133, bottom: 157, left: 280, right: 366 };

function Row({ focused }: { readonly focused: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusFrame(ref, focused);
  return (
    <div
      data-testid="row"
      ref={(node) => {
        ref.current = node;
        boxed(ROW)(node);
      }}
    >
      <div className="focus-card" ref={boxed(CARD)} />
      <div data-row-content>
        <span data-ink ref={boxed(INK)} />
        {/* Le tampon est monté DANS le bloc de contenu, ancré au bord de fin :
            ce n'est pas de l'encre qui grossit vers la droite. */}
        <span className="focus-stamp" ref={boxed(STAMP)} />
      </div>
    </div>
  );
}

function List({ focused }: { readonly focused: readonly string[] }) {
  return (
    <ol>
      {['a', 'b'].map((id) => (
        <li key={id} data-id={id}>
          <Row focused={focused.includes(id)} />
        </li>
      ))}
    </ol>
  );
}

let container: HTMLDivElement;
let root: Root;

function render(focused: readonly string[]) {
  act(() => {
    root.render(<List focused={focused} />);
  });
}

function mount(focused: readonly string[]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  render(focused);
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const rowOf = (id: string) => container.querySelector(`li[data-id="${id}"] [data-testid="row"]`) as HTMLElement;
const list = () => container.querySelector('ol') as HTMLElement;

const expected = (reducedMotion: boolean) =>
  focusFrame({
    rowTop: ROW.top,
    rowBottom: ROW.bottom,
    cardTop: CARD.top,
    cardBottom: CARD.bottom,
    cardWidth: CARD.right - CARD.left,
    contentExtent: INK.right - CARD.left,
    reducedMotion,
  });

describe('useFocusFrame', () => {
  test('non élue -> rien n’est posé', () => {
    mount([]);
    expect(rowOf('a').style.transform).toBe('');
    expect(list().style.getPropertyValue('--focus-push-up')).toBe('');
  });

  test('élue -> la loupe grossit par le bord de début du cadre et par son centre', () => {
    mount(['a']);
    const frame = expected(false);
    expect(frame.scale).toBeGreaterThan(1.2);
    const row = rowOf('a');
    expect(row.style.transform).toBe(`scale(${frame.scale})`);
    expect(row.style.transformOrigin).toBe(`${CARD.left - ROW.left}px ${frame.originY}px`);
    expect(row.style.getPropertyValue('--loupe-s')).toBe(String(frame.scale));
    expect(row.style.getPropertyValue('--loupe-end-shift')).toBe(`${frame.endShift}px`);
    expect(row.style.transition).toBe('');
  });

  test('élue -> les voisines s’écartent de la croissance du cadre', () => {
    mount(['a']);
    const frame = expected(false);
    expect(list().style.getPropertyValue('--focus-push-up')).toBe(`${frame.pushUp}px`);
    expect(list().style.getPropertyValue('--focus-push-down')).toBe(`${frame.pushDown}px`);
  });

  test('l’élection passe à la voisine -> l’ancienne retombe à plat, la liste suit la nouvelle', () => {
    mount(['a']);
    render(['b']);
    expect(rowOf('a').style.transform).toBe('');
    expect(rowOf('a').style.getPropertyValue('--loupe-s')).toBe('');
    expect(rowOf('b').style.transform).toBe(`scale(${expected(false).scale})`);
    expect(list().style.getPropertyValue('--focus-push-up')).toBe(`${expected(false).pushUp}px`);
  });

  test('plus aucune élue -> les voisines reviennent', () => {
    mount(['a']);
    render([]);
    expect(rowOf('a').style.transform).toBe('');
    expect(list().style.getPropertyValue('--focus-push-up')).toBe('');
    expect(list().style.getPropertyValue('--focus-push-down')).toBe('');
  });

  test('Réduire le mouvement -> aucun agrandissement', () => {
    reduced = true;
    mount(['a']);
    expect(rowOf('a').style.transform).toBe('');
    expect(list().style.getPropertyValue('--focus-push-down')).toBe(`${expected(true).pushDown}px`);
  });
});
