import { hexColorCss } from '@/lib/canvas/background';
import type { CanvasObject } from '@/lib/canvas/document';
import { MARKER_ALPHA, paintableStrokes, strokeWidth } from '@/lib/canvas/drawing';

import type { SceneClockHandle } from './scene-clock';
import { SceneObjectFrame } from './scene-object-frame';

const meanPressure = (points: readonly { readonly pressure?: number }[]): number => {
  const values = points.map((p) => p.pressure).filter((p): p is number => typeof p === 'number');
  if (values.length === 0) return 1;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

/** Un DESSIN — plein cadre, en espace design 1080×1920, parité point à point
 * avec `StoryStrokeRasterizer` (écart de rendu ASSUMÉ, même arbitrage que le
 * legacy). Le fond, le média posé et les vidéos sont `aria-hidden` : le
 * dessin décore, il n'informe pas. */
export function SceneObjectDrawing({ object, clock }: { readonly object: CanvasObject; readonly clock: SceneClockHandle | null }) {
  const strokes = paintableStrokes(object.payload);
  if (strokes.length === 0) return null;
  return (
    <SceneObjectFrame object={object} kind="drawing" clock={clock} layout="fullBleed">
      <svg viewBox="0 0 1080 1920" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full">
        {strokes.map((stroke, i) => (
          <polyline
            key={i}
            points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={hexColorCss(stroke.colorHex) ?? '#000000'}
            strokeWidth={strokeWidth(stroke, meanPressure(stroke.points))}
            strokeOpacity={stroke.tool === 'marker' ? MARKER_ALPHA : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </SceneObjectFrame>
  );
}
