/**
 * `RiverLaneOverlay` — le tracé SVG des branches et connecteurs (R-134, miroir
 * web de `RiverLaneCanvas.swift`).
 *
 * NE CALCULE RIEN : reçoit un `RiverPaint` déjà résolu par `buildRiverPaint`
 * (`river-paint.ts`, pure) et pose des éléments SVG à l'opacité/aux
 * coordonnées fournies. `river.line`/`river.connector` sont consommés en CSS
 * pur (`var(--lentille-river-*)`) pour l'ÉPAISSEUR des traits — les
 * COORDONNÉES, elles, viennent de la mesure DOM réelle faite par `RiverThread`
 * (SVG ne sait pas placer un point avec `var()`, seule l'épaisseur le peut).
 *
 * Posé DERRIÈRE le contenu (`RiverThread` le monte avant la grille de bulles
 * dans l'ordre DOM, `position: absolute`) : chaque bulle opaque interrompt le
 * trait d'elle-même, son contour coloré reprend la course — aucune découpe à
 * calculer, c'est la superposition qui contourne (amendement R).
 *
 * `aria-hidden` — décorative. L'ordre chronologique du contenu
 * (`RiverThread`, `geometry.bubbles`) est ce qui prime pour VoiceOver/le
 * lecteur d'écran ; ce tracé ne porte aucune information que le contenu ne
 * porte déjà.
 *
 * Reduce motion : AUCUNE transition/animation CSS n'est posée ici — un
 * nouveau `paint` (nouvelle géométrie) remplace l'ancien sans mouvement, par
 * construction (§7bis).
 */
'use client';

import type { RiverPaint } from './river-paint';

const BIRTH_DOT_RADIUS = 2.6;
const ADDRESSED_RING_RADIUS = 6.5;
const ADDRESSED_RING_STROKE_WIDTH = 2;

export interface RiverLaneOverlayProps {
  readonly paint: RiverPaint;
  readonly widthPx: number;
  readonly heightPx: number;
}

export function RiverLaneOverlay({ paint, widthPx, heightPx }: RiverLaneOverlayProps) {
  return (
    <svg
      data-testid="river-lane-overlay"
      aria-hidden="true"
      focusable="false"
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      <defs>
        {paint.tails.map((tail) => (
          <linearGradient
            key={tail.gradientId}
            id={tail.gradientId}
            gradientUnits="userSpaceOnUse"
            x1={tail.x}
            y1={tail.y1}
            x2={tail.x}
            y2={tail.y2}
          >
            <stop offset="0" stopColor={tail.startColor} stopOpacity={tail.startOpacity} />
            <stop offset="1" stopColor={tail.endColor} stopOpacity={tail.endOpacity} />
          </linearGradient>
        ))}
      </defs>

      {paint.connectors.map((connector) => (
        <path
          key={connector.key}
          data-testid="river-connector"
          d={connector.d}
          fill="none"
          stroke={connector.color}
          strokeOpacity={connector.opacity}
          strokeDasharray="4 3"
          style={{ strokeWidth: 'var(--lentille-river-connector-stroke-width)' }}
        />
      ))}

      {paint.lines.map((line) => (
        <line
          key={line.key}
          data-testid="river-lane-line"
          x1={line.x}
          x2={line.x}
          y1={line.y1}
          y2={line.y2}
          stroke={line.color}
          strokeLinecap="round"
          style={{ strokeWidth: 'var(--lentille-river-line-width)' }}
        />
      ))}

      {paint.tails.map((tail) => (
        <line
          key={tail.key}
          data-testid="river-lane-tail"
          x1={tail.x}
          x2={tail.x}
          y1={tail.y1}
          y2={tail.y2}
          stroke={`url(#${tail.gradientId})`}
          style={{ strokeWidth: 'var(--lentille-river-line-width)' }}
        />
      ))}

      {paint.births.map((dot) => (
        <circle
          key={dot.key}
          data-testid="river-lane-birth"
          cx={dot.cx}
          cy={dot.cy}
          r={BIRTH_DOT_RADIUS}
          fill={dot.color}
        />
      ))}

      {paint.rings.map((ring) => (
        <circle
          key={ring.key}
          data-testid="river-lane-addressed-ring"
          cx={ring.cx}
          cy={ring.cy}
          r={ADDRESSED_RING_RADIUS}
          fill="none"
          stroke={ring.color}
          strokeWidth={ADDRESSED_RING_STROKE_WIDTH}
          strokeDasharray="3 2.5"
        />
      ))}
    </svg>
  );
}

export default RiverLaneOverlay;
