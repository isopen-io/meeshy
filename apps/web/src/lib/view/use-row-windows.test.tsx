import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ROW_ANCHOR_ATTRIBUTE, useRowWindows } from './use-row-windows';

/**
 * LA PASSE DE MESURE NE PEUT PAS OSCILLER (#12893). Elle court après CHAQUE
 * rendu, donc après le sien : si la géométrie qu'elle relit dépend de la
 * fenêtre qu'elle vient de poser, deux fenêtres peuvent se renvoyer l'une à
 * l'autre sans fin, de façon synchrone. Le navigateur l'a fait : une cale
 * dont la hauteur transitait encore se lisait à zéro, la section remontait,
 * le besoin revenait, la fenêtre aussi.
 *
 * Le témoin rejoue cette géométrie qui RÉPOND à la fenêtre : montées, les
 * rangées du bloc se lisent loin au-dessus de l'écran (besoin vide) ;
 * démontées, sa tête se lit juste au-dessus (besoin non vide).
 */

const H = 84;
const COUNT = 2;
const LIMIT = 200;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

type Probe = { reads: number; readonly rendered: string[] };

const rect = (top: number): DOMRect => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

function Block({ probe }: { readonly probe: Probe }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const rangeOf = useRowWindows({ frame, blocks: [{ id: 'a', count: COUNT }], rowHeight: H, marginPx: 0, extraRows: 0 });
  const range = rangeOf({ id: 'a', count: COUNT });
  probe.rendered.push(`${range.start}-${range.end}`);
  const anchor = (node: HTMLLIElement | null) => {
    if (node === null) return;
    node.getBoundingClientRect = () => {
      probe.reads += 1;
      if (probe.reads > LIMIT) throw new Error('la passe de mesure oscille');
      const mounted = node.parentElement?.querySelector('[data-row]') !== null;
      return rect(mounted ? -50 * H : -H);
    };
  };
  return (
    <div ref={frame}>
      <ul>
        <li ref={anchor} {...{ [ROW_ANCHOR_ATTRIBUTE]: 'a' }} />
        {Array.from({ length: range.end - range.start }, (_, i) => (
          <li key={range.start + i} data-row={`r-${range.start + i}`} />
        ))}
      </ul>
    </div>
  );
}

const oneFrame = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

describe('useRowWindows — une géométrie qui répond à la fenêtre ne la fait pas osciller', () => {
  test('la passe s’arrête sur une fenêtre et y reste, image après image', async () => {
    const probe: Probe = { reads: 0, rendered: [] };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Block probe={probe} />));
    await oneFrame();
    await oneFrame();
    const settled = probe.rendered.at(-1);
    const renders = probe.rendered.length;
    await oneFrame();
    expect(probe.reads).toBeLessThan(LIMIT);
    expect(container.querySelectorAll('[data-row]').length).toBeGreaterThan(0);
    expect(probe.rendered.at(-1)).toBe(settled);
    expect(probe.rendered.length).toBe(renders);
  });
});
