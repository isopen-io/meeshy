/**
 * WL-105 (LWS-10) — `useLentillePerspective`.
 *
 * Preuves : (1) la courbe vient de `focusCurve('list', …)`, jamais recopiée
 * ; (2) UN SEUL `requestAnimationFrame` en vol à la fois, quel que soit le
 * nombre de rangs enregistrés ; (3) `prefers-reduced-motion` désactive la
 * PERSPECTIVE (aucune écriture `opacity`/`transform`, wrappers à l'identité).
 *
 * AMENDEMENT WL-108 du 3ᵉ point (documenté, jamais silencieux). Jusqu'à
 * WL-108 la liste n'élisait AUCUN rang : « perspective désactivée » (critère
 * LWS-10) pouvait donc s'implémenter en ne démarrant simplement pas la
 * boucle, et ce fichier verrouillait CETTE implémentation
 * (`expect(requestAnimationFrame).not.toHaveBeenCalled()`). WL-108 apporte
 * l'élection de la focus card, et LWS-8 est explicite : « Reduce motion ⇒
 * toutes les opacités à 1, focus card = fond seul, ÉLECTION CONSERVÉE ». La
 * boucle doit donc survivre pour continuer d'élire — exactement ce que fait
 * déjà `useFocalPerspective` (WF-111, §4.9 : « la surbrillance survit,
 * l'animation non »).
 *
 * Ce qui reste verrouillé ici est le CRITÈRE NORMATIF (aucune écriture
 * `opacity`/`transform`, identité préservée) ; ce qui est relâché est le
 * DÉTAIL D'IMPLÉMENTATION qui le portait avant que l'élection existe.
 * Aucune loi n'a bougé.
 *
 * WL-108 ajoute les preuves d'élection : `electFocusRow` + hystérésis
 * `FOCUS_BAND_HALF_HEIGHT` (les DEUX venant de la loi gelée), publication
 * gardée par le changement.
 */
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import {
  focusCurve,
  FOCUS_BAND_OFFSET,
  FOCUS_BAND_HALF_HEIGHT,
} from '@meeshy/shared/utils/focus-curve';

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

  it("prefers-reduced-motion ⇒ perspective désactivée : AUCUNE écriture opacity/transform, wrappers à l'identité", () => {
    mockReducedMotion = true;

    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));

    const row = makeElementWithRect({ top: 100, bottom: 164 });
    act(() => result.current.registerRow('row-1')(row));

    expect(row.style.opacity).toBe('1');
    expect(row.style.transform).toBe('none');

    // Même après plusieurs frames : la boucle tourne (l'élection en dépend)
    // mais n'écrit RIEN sur les wrappers.
    runOneFrame();
    runOneFrame();

    expect(row.style.opacity).toBe('1');
    expect(row.style.transform).toBe('none');
  });

  it('prefers-reduced-motion ⇒ ÉLECTION CONSERVÉE (LWS-8 : « la surbrillance survit, l\'animation non »)', () => {
    mockReducedMotion = true;

    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));

    const focusY = 1000 - FOCUS_BAND_OFFSET;
    act(() => {
      result.current.registerRow('loin')(makeElementWithRect({ top: 0, bottom: 0 }));
      result.current.registerRow('dans-la-bande')(
        makeElementWithRect({ top: focusY, bottom: focusY })
      );
    });

    runOneFrame();

    expect(result.current.election.getElectedId()).toBe('dans-la-bande');
  });

  it("élit le rang dont le midY tombe dans la bande — par `electFocusRow`, jamais une comparaison locale", () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));
    const focusY = 1000 - FOCUS_BAND_OFFSET;

    act(() => {
      result.current.registerRow('a')(makeElementWithRect({ top: focusY - 300, bottom: focusY - 300 }));
      result.current.registerRow('b')(makeElementWithRect({ top: focusY, bottom: focusY }));
    });

    runOneFrame();
    expect(result.current.election.getElectedId()).toBe('b');
  });

  it("hystérésis : l'élu garde la main tant qu'il reste dans la bande (oscillation sans tremblement)", () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));
    const focusY = 1000 - FOCUS_BAND_OFFSET;

    // `b` PILE au centre ; `a` juste au-dessus. On élit `a` d'abord en le
    // posant au centre, puis on le décale d'un demi-écart d'hystérésis :
    // strictement plus proche pour `b`, mais `a` reste DANS la bande.
    let aMid = focusY;
    let bMid = focusY + FOCUS_BAND_HALF_HEIGHT * 2;
    const a = makeElementWithRect({});
    const b = makeElementWithRect({});
    const rect = (mid: number) => ({
      top: mid, bottom: mid, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    a.getBoundingClientRect = (() => rect(aMid)) as unknown as () => DOMRect;
    b.getBoundingClientRect = (() => rect(bMid)) as unknown as () => DOMRect;

    act(() => {
      result.current.registerRow('a')(a);
      result.current.registerRow('b')(b);
    });

    runOneFrame();
    expect(result.current.election.getElectedId()).toBe('a');

    // `a` s'éloigne mais reste dans la bande ; `b` devient plus proche.
    aMid = focusY - FOCUS_BAND_HALF_HEIGHT;
    bMid = focusY + 1;
    runOneFrame();
    expect(result.current.election.getElectedId()).toBe('a');

    // `a` sort de la bande : `b` prend la main.
    aMid = focusY - FOCUS_BAND_HALF_HEIGHT * 3;
    runOneFrame();
    expect(result.current.election.getElectedId()).toBe('b');
  });

  it("ne publie que les CHANGEMENTS d'élu — pas une notification par frame", () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));
    const focusY = 1000 - FOCUS_BAND_OFFSET;

    act(() => {
      result.current.registerRow('a')(makeElementWithRect({ top: focusY, bottom: focusY }));
    });

    const notify = jest.fn();
    result.current.election.subscribe(notify);

    runOneFrame();
    expect(notify).toHaveBeenCalledTimes(1);

    runOneFrame();
    runOneFrame();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("aucun candidat ⇒ aucun élu (jamais un id périmé)", () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    // @ts-expect-error -- idem
    containerRef.current = container;

    const { result } = renderHook(() => useLentillePerspective({ containerRef }));
    const focusY = 1000 - FOCUS_BAND_OFFSET;

    const row = makeElementWithRect({ top: focusY, bottom: focusY });
    act(() => result.current.registerRow('a')(row));
    runOneFrame();
    expect(result.current.election.getElectedId()).toBe('a');

    act(() => result.current.registerRow('a')(null));
    runOneFrame();
    expect(result.current.election.getElectedId()).toBeNull();
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
