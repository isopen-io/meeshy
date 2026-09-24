import { describe, expect, test } from 'bun:test';

import { paintableStrokes, strokeWidth } from './drawing';

// T-D9 — miroir StrokeWidthMapping.
describe('strokeWidth — miroir StrokeWidthMapping (T-D9)', () => {
  test("{width:6, tool:'pen', captureVersion:0} ⇒ 6 (inchangé)", () => {
    expect(strokeWidth({ width: 6, tool: 'pen', captureVersion: 0 })).toBe(6);
  });

  test("marker ⇒ 12 (double, captureVersion absent)", () => {
    expect(strokeWidth({ width: 6, tool: 'marker' })).toBe(12);
  });

  test('captureVersion: 1, pressure 0.5 ⇒ 6 × 0.7 = 4.2', () => {
    expect(strokeWidth({ width: 6, tool: 'pen', captureVersion: 1 }, 0.5)).toBeCloseTo(4.2, 9);
  });

  test('width: 0.5, v1, pressure 1 ⇒ 0.5 (le plafond passe APRÈS le plancher)', () => {
    expect(strokeWidth({ width: 0.5, tool: 'pen', captureVersion: 1 }, 1)).toBeCloseTo(0.5, 9);
  });

  /* T-D9b (revue-correction #6901) — LE PLANCHER S'APPLIQUE AUSSI À LA BRANCHE
     LEGACY. `StrokeWidthMapping.effectiveWidth`
     (`packages/MeeshySDK/.../StrokeWidthMapping.swift:24`) : `guard
     captureVersion >= 1 else { return max(minWidth, base) }` — et le legacy web
     le porte aussi (`canvasV3StrokeWidth`, `CanvasV3Scene.tsx:778`). Le module
     rendait `base` nu, donc un trait legacy plus fin qu'une unité de design se
     peignait plus fin ici que sur les deux autres plateformes. Le témoin porte
     sur `captureVersion: 0` — sur `>= 1` les deux lois rendent 1 (T-D9
     ci-dessus le couvre déjà), donc rien n'y pourrait tomber (leçon 261). */
  test('width: 0.4, captureVersion: 0 ⇒ 1 (le plancher tient aussi sans pression)', () => {
    expect(strokeWidth({ width: 0.4, tool: 'pen', captureVersion: 0 })).toBe(1);
    expect(strokeWidth({ width: 0.4, tool: 'pen' })).toBe(1);
    // Le marqueur double AVANT le plancher : 0,6 × 2 = 1,2, jamais relevé à 1.
    expect(strokeWidth({ width: 0.6, tool: 'marker' })).toBeCloseTo(1.2, 9);
  });

  test("eraser ⇒ trait ÉCARTÉ par paintableStrokes", () => {
    const strokes = paintableStrokes({
      strokes: [
        { points: [{ x: 0, y: 0 }], width: 6, tool: 'eraser' },
        { points: [{ x: 0, y: 0 }], width: 6, tool: 'pen' },
      ],
    });
    expect(strokes.length).toBe(1);
    expect(strokes[0]?.tool).toBe('pen');
  });

  test('un trait sans point est écarté', () => {
    expect(paintableStrokes({ strokes: [{ points: [], width: 6, tool: 'pen' }] })).toEqual([]);
  });

  test('payload.strokes absent ⇒ []', () => {
    expect(paintableStrokes({})).toEqual([]);
  });
});
