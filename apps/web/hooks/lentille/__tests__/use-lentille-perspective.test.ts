/**
 * WL-105 (LWS-10) — `useLentillePerspective`.
 *
 * Preuves : (1) la courbe vient de `focusCurve('list', …)`, jamais recopiée
 * ; (2) UN SEUL `requestAnimationFrame` en vol à la fois, quel que soit le
 * nombre de rangs enregistrés ; (3) `prefers-reduced-motion` désactive la
 * boucle et remet les wrappers à l'identité (opacity 1, transform none).
 */
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { focusCurve, FOCUS_BAND_OFFSET } from '@meeshy/shared/utils/focus-curve';

let mockReducedMotion = false;
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { useLentillePerspective } from '../use-lentille-perspective';

function makeElementWithRect(rect: Partial<DOMRect>): HTMLDivElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = jest.fn(() => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}),
    ...rect,
  })) as unknown as () => DOMRect;
  return el;
}

describe('useLentillePerspective', () => {
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;
  let pendingFrames: Array<FrameRequestCallback>;
  let rafCallCount: number;

  beforeEach(() => {
    mockReducedMotion = false;
    pendingFrames = [];
    rafCallCount = 0;
    originalRAF = global.requestAnimationFrame;
    originalCAF = global.cancelAnimationFrame;

    // rAF déterministe : n'exécute RIEN automatiquement — le test avance
    // "une frame" en appelant `runOneFrame()` explicitement.
    global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      rafCallCount += 1;
      pendingFrames.push(cb);
      return pendingFrames.length;
    }) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = jest.fn() as unknown as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRAF;
    global.cancelAnimationFrame = originalCAF;
  });

  const runOneFrame = () => {
    const frame = pendingFrames.shift();
    act(() => frame?.(0));
  };

  it("courbe via la loi — `focusCurve('list', d)`, jamais recopiée", () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- assignation directe pour le test (ref non mutable via React ici)
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));

    // focusY = 1000 - FOCUS_BAND_OFFSET. Rang dont le midY tombe à distance
    // FOCUS_BAND_OFFSET (~140) au-dessus de la bande de focus : d = 140.
    const focusY = 1000 - FOCUS_BAND_OFFSET;
    const rowMidY = focusY - 140;
    const row = makeElementWithRect({ top: rowMidY, bottom: rowMidY });
    act(() => result.current.registerRow('row-1')(row));

    runOneFrame();

    const expected = focusCurve(140, 'list');
    expect(row.style.opacity).toBe(String(expected.alpha));
    expect(row.style.transform).toBe(`scale(${expected.scale})`);
  });

  it('planifie UN SEUL requestAnimationFrame par frame, quel que soit le nombre de rangs', () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));

    act(() => {
      result.current.registerRow('a')(makeElementWithRect({ top: 100, bottom: 164 }));
      result.current.registerRow('b')(makeElementWithRect({ top: 200, bottom: 264 }));
      result.current.registerRow('c')(makeElementWithRect({ top: 300, bottom: 364 }));
    });

    expect(rafCallCount).toBe(1); // la boucle initiale

    runOneFrame();
    expect(rafCallCount).toBe(2); // une SEULE reprogrammation, pas une par rang

    runOneFrame();
    expect(rafCallCount).toBe(3);
  });

  it("prefers-reduced-motion ⇒ perspective désactivée (aucun rAF, wrappers à l'identité)", () => {
    mockReducedMotion = true;

    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));

    const row = makeElementWithRect({ top: 100, bottom: 164 });
    act(() => result.current.registerRow('row-1')(row));

    expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    expect(row.style.opacity).toBe('1');
    expect(row.style.transform).toBe('none');
  });

  it('nettoie sa frame en vol au démontage (cancelAnimationFrame appelé)', () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { unmount } = renderHook(() => useLentillePerspective({ containerRef }));
    unmount();

    expect(global.cancelAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
