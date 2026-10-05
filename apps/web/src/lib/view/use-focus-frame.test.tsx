import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { focusFrame } from '@/lib/reading-mode/focus-frame';
import { useFocusFrame } from './use-focus-frame';

/**
 * `useFocusFrame` (#8506, #8536) — le câblage : mesurer la rangée élue, poser
 * les variables de la loupe du CONTENU, écarter les voisines, tout retirer
 * quand l'élection part. La GÉOMÉTRIE est jugée par `focus-frame.test.ts` ; happy-dom ne
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

const ROW: Box = { top: 100, bottom: 200, left: 0, right: 390 };
const CARD: Box = { top: 103, bottom: 197, left: 6, right: 376 };
const LOUPE: Box = { top: 140, bottom: 180, left: 57, right: 376 };
const INK: Box = { top: 150, bottom: 170, left: 57, right: 156 };
const IDENTITY: Box = { top: 110, bottom: 140, left: 16, right: 360 };
const STAMP: Box = { top: 173, bottom: 197, left: 280, right: 366 };

/**
 * #8536 — l'identité et le tampon sont LARGES exprès : comptés comme de
 * l'encre (ce que faisait la loupe de rangée), ils borneraient la loupe à
 * ×1. Seul le contenu (`[data-loupe]`) doit décider du gain.
 */
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
      <div className="focus-identity" ref={boxed(IDENTITY)} />
      <div data-row-content>
        <div data-loupe ref={boxed(LOUPE)}>
          <span data-ink ref={boxed(INK)} />
        </div>
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
    contentRoom: CARD.right - LOUPE.left,
    contentWidth: INK.right - LOUPE.left,
    contentHeight: LOUPE.bottom - LOUPE.top,
    reducedMotion,
  });

const vars = (row: HTMLElement) => ({
  s: row.style.getPropertyValue('--loupe-s'),
  grow: row.style.getPropertyValue('--loupe-grow'),
  air: row.style.getPropertyValue('--loupe-air'),
});

describe('useFocusFrame', () => {
  test('non élue -> rien n’est posé', () => {
    mount([]);
    expect(vars(rowOf('a'))).toEqual({ s: '', grow: '', air: '' });
    expect(list().style.getPropertyValue('--focus-push-up')).toBe('');
  });

  test('élue -> la loupe du CONTENU se pose par variables ; la rangée elle-même n’est jamais grossie', () => {
    mount(['a']);
    const frame = expected(false);
    expect(frame.scale).toBeGreaterThan(1.2);
    const row = rowOf('a');
    expect(vars(row)).toEqual({ s: String(frame.scale), grow: `${frame.grow}px`, air: `${frame.air}px` });
    expect(row.style.transform).toBe('');
    expect(row.style.transition).toBe('');
  });

  test('élue -> les voisines s’écartent de l’allongement du cadre', () => {
    mount(['a']);
    const frame = expected(false);
    expect(list().style.getPropertyValue('--focus-push-up')).toBe(`${frame.pushUp}px`);
    expect(list().style.getPropertyValue('--focus-push-down')).toBe(`${frame.pushDown}px`);
  });

  test('l’élection passe à la voisine -> l’ancienne retombe à plat, la liste suit la nouvelle', () => {
    mount(['a']);
    render(['b']);
    expect(vars(rowOf('a'))).toEqual({ s: '', grow: '', air: '' });
    expect(vars(rowOf('b')).s).toBe(String(expected(false).scale));
    expect(list().style.getPropertyValue('--focus-push-down')).toBe(`${expected(false).pushDown}px`);
  });

  test('plus aucune élue -> les voisines reviennent', () => {
    mount(['a']);
    render([]);
    expect(vars(rowOf('a'))).toEqual({ s: '', grow: '', air: '' });
    expect(list().style.getPropertyValue('--focus-push-up')).toBe('');
    expect(list().style.getPropertyValue('--focus-push-down')).toBe('');
  });

  test('Réduire le mouvement -> aucun agrandissement, mais le verre respire quand même', () => {
    reduced = true;
    mount(['a']);
    expect(vars(rowOf('a'))).toEqual({ s: '1', grow: '0px', air: `${expected(true).air}px` });
    expect(list().style.getPropertyValue('--focus-push-down')).toBe(`${expected(true).pushDown}px`);
  });
});
