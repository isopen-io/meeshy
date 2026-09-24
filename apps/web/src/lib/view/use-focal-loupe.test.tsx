import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { FOCUS_LOUPE_GAIN } from '@/lib/reading-mode/metrics';
import { useFocalLoupe } from './use-focal-loupe';

/**
 * `useFocalLoupe` (#6586/#6588) — patron `use-pull-to-refresh.test.tsx`
 * (happy-dom + `createRoot` + `act`, `matchMedia` bouché pour piloter reduce
 * motion). `offsetWidth`/`offsetHeight` sont posés PAR INSTANCE (happy-dom ne
 * calcule aucun layout réel) : `390 × 60`, le même gabarit que les témoins
 * iOS (`FocalScrollPerspectiveTests`) et `law.test.ts`.
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

let matchMediaReduced = false;
let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = ((query: string) => ({
    matches: matchMediaReduced,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  matchMediaReduced = false;
});

let container: HTMLDivElement;
let root: Root;
let mounted = false;

afterEach(() => {
  if (mounted) {
    act(() => {
      root.unmount();
    });
    mounted = false;
  }
  container.remove();
});

function Host({ isFocused }: { readonly isFocused: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocalLoupe(ref, isFocused);
  return (
    <div
      data-testid="row"
      ref={(node) => {
        ref.current = node;
        if (node !== null) {
          Object.defineProperty(node, 'offsetWidth', { configurable: true, value: 390 });
          Object.defineProperty(node, 'offsetHeight', { configurable: true, value: 60 });
        }
      }}
    />
  );
}

function mount(isFocused: boolean): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(<Host isFocused={isFocused} />);
  });
  return container.querySelector('[data-testid="row"]') as HTMLDivElement;
}

function rerender(isFocused: boolean) {
  act(() => {
    root.render(<Host isFocused={isFocused} />);
  });
}

describe('useFocalLoupe', () => {
  test('non élue -> aucune transformation posée', () => {
    const row = mount(false);
    expect(row.style.transform).toBe('');
  });

  test('élue -> grandit du gain plein (390×60, jamais écrêté)', () => {
    const row = mount(true);
    expect(row.style.transform).toBe(`scale(${1 + FOCUS_LOUPE_GAIN})`);
  });

  /**
   * AUCUNE `transition` posée — witness de régression (§ doc-comment du
   * hook) : une transition CSS sur ce `transform` fait sauter le défilement
   * de la liste virtualisée de plus d'un millier de pixels au clic d'un
   * contrôle de la bande de focus, réélisant une rangée lointaine
   * (mesuré au navigateur, `check-reading-mode.mjs`).
   */
  test('aucune transition CSS posée sur ce transform', () => {
    const row = mount(true);
    expect(row.style.transition).toBe('');
  });

  test('cesse d’être élue -> retombe à plat', () => {
    const row = mount(true);
    expect(row.style.transform).toBe(`scale(${1 + FOCUS_LOUPE_GAIN})`);
    rerender(false);
    expect(row.style.transform).toBe('');
  });

  test('reduce motion -> jamais de transformation', () => {
    matchMediaReduced = true;
    const row = mount(true);
    expect(row.style.transform).toBe('');
  });
});
