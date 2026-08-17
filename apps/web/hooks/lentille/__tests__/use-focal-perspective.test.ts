/**
 * WF-111 — `useFocalPerspective`.
 *
 * Preuves : (1) la courbe vient de `focusCurve('thread', …)`, MÊME
 * mécanique que `useLentillePerspective` (`computeFocusTransform` partagé) ;
 * (2) UN SEUL `requestAnimationFrame` en vol ; (3) l'élection utilise
 * `electFocusRow` avec la bande gelée (`FOCUS_BAND_OFFSET`/`HALF_HEIGHT`) ;
 * (4) `focusedId` ne se commet QUE quand `isSettled` devient `true` — jamais
 * pendant le défilement (§4.6, écart #3) ; (5) sous `prefers-reduced-motion`,
 * l'écriture opacity/transform s'arrête mais l'élection continue (§4.9).
 *
 * RENFORCEMENT REV-4/B1 (V4bis) — ce fichier « peuplait la ref à la main »
 * (`containerRef.current = container`, précédé d'un `@ts-expect-error`). Il
 * reçoit désormais l'ÉLÉMENT, la forme sûre de `PerspectiveContainer`. Aucune
 * assertion retirée ; deux AJOUTÉES en fin de fichier (rien ne tourne sous
 * OFF, une cible tardive démarre quand même la passe). Le cycle de vie réel du
 * fil — conteneur rendu par un ancêtre, une seule passe d'effets, sans
 * `StrictMode` — est verrouillé par
 * `components/conversations/focal/__tests__/FocalThread.perspective-lifecycle.test.tsx`.
 */
import { renderHook, act } from '@testing-library/react';
import { focusCurve, FOCUS_BAND_OFFSET } from '@meeshy/shared/utils/focus-curve';

let mockReducedMotion = false;
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { useFocalPerspective } from '../use-focal-perspective';

function makeElementWithRect(rect: Partial<DOMRect>): HTMLDivElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = jest.fn(() => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}),
    ...rect,
  })) as unknown as () => DOMRect;
  return el;
}

describe('useFocalPerspective', () => {
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

  it("courbe via la loi — focusCurve('thread', d), MÊME mécanique que la Lentille", () => {
    const container = makeElementWithRect({ top: 0, bottom: 1000 });

    const { result } = renderHook(() => useFocalPerspective({ container }));

    const focusY = 1000 - FOCUS_BAND_OFFSET;
    const rowMidY = focusY - 140;
    const row = makeElementWithRect({ top: rowMidY, bottom: rowMidY });
    act(() => result.current.registerRow('row-1')(row));

    runOneFrame();

    const expected = focusCurve(140, 'thread');
    expect(row.style.opacity).toBe(String(expected.alpha));
    expect(row.style.transform).toBe(`scale(${expected.scale})`);
  });

  it('planifie UN SEUL requestAnimationFrame par frame, quel que soit le nombre de rangs', () => {
    const container = makeElementWithRect({ top: 0, bottom: 1000 });

    const { result } = renderHook(() => useFocalPerspective({ container }));

    act(() => {
      result.current.registerRow('a')(makeElementWithRect({ top: 100, bottom: 164 }));
      result.current.registerRow('b')(makeElementWithRect({ top: 200, bottom: 264 }));
      result.current.registerRow('c')(makeElementWithRect({ top: 300, bottom: 364 }));
    });

    expect(rafCallCount).toBe(1);
    runOneFrame();
    expect(rafCallCount).toBe(2);
    runOneFrame();
    expect(rafCallCount).toBe(3);
  });

  it('nettoie sa frame en vol au démontage (cancelAnimationFrame appelé)', () => {
    const container = makeElementWithRect({ top: 0, bottom: 1000 });

    const { unmount } = renderHook(() => useFocalPerspective({ container }));
    unmount();

    expect(global.cancelAnimationFrame).toHaveBeenCalledTimes(1);
  });

  describe('élection (electFocusRow, bande gelée FOCUS_BAND_OFFSET/HALF_HEIGHT)', () => {
    it('isSettled=true (défaut) : commet le rang le plus proche de la bande dès la première frame', () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const focusY = 1000 - FOCUS_BAND_OFFSET;
      const { result } = renderHook(() => useFocalPerspective({ container }));

      act(() => {
        result.current.registerRow('far')(makeElementWithRect({ top: focusY - 300, bottom: focusY - 300 }));
        result.current.registerRow('near')(makeElementWithRect({ top: focusY - 5, bottom: focusY - 5 }));
      });

      runOneFrame();

      expect(result.current.focusedId).toBe('near');
    });

    it("isSettled=false : ne COMMET jamais focusedId, même après plusieurs frames de défilement (§4.6, jamais pendant le scroll)", () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const focusY = 1000 - FOCUS_BAND_OFFSET;
      const { result } = renderHook(() =>
        useFocalPerspective({ container, isSettled: false })
      );

      act(() => {
        result.current.registerRow('near')(makeElementWithRect({ top: focusY - 5, bottom: focusY - 5 }));
      });

      runOneFrame();
      runOneFrame();

      expect(result.current.focusedId).toBeNull();
    });

    it('isSettled bascule false → true : commet alors la dernière élection en vol', () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const focusY = 1000 - FOCUS_BAND_OFFSET;
      const { result, rerender } = renderHook(
        ({ isSettled }: { isSettled: boolean }) => useFocalPerspective({ container, isSettled }),
        { initialProps: { isSettled: false } }
      );

      act(() => {
        result.current.registerRow('near')(makeElementWithRect({ top: focusY - 5, bottom: focusY - 5 }));
      });
      runOneFrame();
      expect(result.current.focusedId).toBeNull();

      rerender({ isSettled: true });
      expect(result.current.focusedId).toBe('near');
    });
  });

  // behaviour-matrix:F13 — « la rangée optimiste reste à opacité 0.7 au-dessus
  // du pass de perspective (alpha = min(0.7, alphaPerspective)), confirmée à
  // 1.0 ». Couvert intégralement : le plafond ET son levée à la confirmation
  // (voir aussi FocalRow.test.tsx, "publie le plafond confirmé (1)").
  describe('setAlphaCeiling — §4.4 : alpha = min(alphaCeiling, alphaPerspective)', () => {
    it('sans plafond posé, l\'opacité de la courbe seule s\'applique', () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const { result } = renderHook(() => useFocalPerspective({ container }));
      const focusY = 1000 - FOCUS_BAND_OFFSET;
      const row = makeElementWithRect({ top: focusY, bottom: focusY });
      act(() => result.current.registerRow('row-1')(row));

      runOneFrame();

      expect(row.style.opacity).toBe(String(focusCurve(0, 'thread').alpha));
    });

    it('avec un plafond 0.7 posé, l\'opacité ne dépasse jamais 0.7 même au focus (distance 0 → alpha 1 sans plafond)', () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const { result } = renderHook(() => useFocalPerspective({ container }));
      const focusY = 1000 - FOCUS_BAND_OFFSET;
      const row = makeElementWithRect({ top: focusY, bottom: focusY });
      act(() => {
        result.current.registerRow('row-1')(row);
        result.current.setAlphaCeiling('row-1', 0.7);
      });

      runOneFrame();

      expect(row.style.opacity).toBe('0.7');
    });

    it('avec un plafond, loin de la bande la courbe reste sous le plafond : le plafond n\'élève jamais l\'opacité', () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const { result } = renderHook(() => useFocalPerspective({ container }));
      const focusY = 1000 - FOCUS_BAND_OFFSET;
      const farMidY = focusY - 380; // f=1, alpha au plancher (1 - 0.82) = 0.18
      const row = makeElementWithRect({ top: farMidY, bottom: farMidY });
      act(() => {
        result.current.registerRow('row-1')(row);
        result.current.setAlphaCeiling('row-1', 0.7);
      });

      runOneFrame();

      const expectedAlpha = focusCurve(380, 'thread').alpha;
      expect(Number(row.style.opacity)).toBeCloseTo(expectedAlpha);
      expect(Number(row.style.opacity)).toBeLessThan(0.7);
    });
  });

  describe('prefers-reduced-motion (§4.9 : « le focus toujours élu et matérialisé, la surbrillance survit »)', () => {
    it("continue de tourner (contrairement à la Lentille) et n'écrit PAS opacity/transform", () => {
      mockReducedMotion = true;

      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const focusY = 1000 - FOCUS_BAND_OFFSET;
      const { result } = renderHook(() => useFocalPerspective({ container }));

      const row = makeElementWithRect({ top: focusY - 5, bottom: focusY - 5 });
      act(() => result.current.registerRow('near')(row));

      // Un rAF EST planifié — contrairement à `useLentillePerspective` qui
      // coupe la boucle entière sous reduced motion.
      expect(rafCallCount).toBe(1);

      runOneFrame();

      expect(row.style.opacity).toBe('1');
      expect(row.style.transform).toBe('none');
      expect(result.current.focusedId).toBe('near');
    });
  });

  describe('câblage de la cible (REV-4/B1)', () => {
    /**
     * `enabled: false` est le seul interrupteur d'arrêt (densité `script` :
     * « zéro perspective »). Sans ce témoin, le correctif B1 pourrait
     * « réparer » le démarrage en le rendant inconditionnel.
     */
    it('enabled=false ⇒ AUCUNE frame planifiée (rien ne tourne sous OFF)', () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      renderHook(() => useFocalPerspective({ container, enabled: false }));

      expect(rafCallCount).toBe(0);
    });

    /**
     * La cible n'existe pas au premier effet et n'apparaît qu'ensuite —
     * exactement ce que l'ordre des effets React produit en production. La
     * passe doit démarrer À CE MOMENT-LÀ, pas jamais.
     */
    it('cible apparue APRÈS le premier effet ⇒ la passe démarre quand même', () => {
      const container = makeElementWithRect({ top: 0, bottom: 1000 });

      const { rerender } = renderHook(
        ({ target }: { target: HTMLElement | null }) => useFocalPerspective({ container: target }),
        { initialProps: { target: null as HTMLElement | null } }
      );

      expect(rafCallCount).toBe(0);

      rerender({ target: container });

      expect(rafCallCount).toBe(1);
    });
  });
});
