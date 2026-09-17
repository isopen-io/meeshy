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
