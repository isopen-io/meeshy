/**
 * La courbe de mise au point du mode Focal.
 *
 * Source : `docs/design/2026-08-15-focal-spec-integration.html` § 3 —
 *   `focusY = bas − 150`
 *   `d      = max(0, focusY − midY)`
 *   `f      = min(1, d / 380)`
 *   `échelle = 1 − 0.40·f`
 *   `opacité = 1 − 0.82·f`
 *
 * Le module est PUR et sans DOM : c'est ce qui rend l'effet testable et
 * garantit qu'il ne touche que `transform` et `opacity` — composées sur le GPU,
 * zéro relayout, donc fluide même sur un fil de 100 messages.
 */
export const FOCAL_OFFSET_FROM_BOTTOM = 150;
export const FOCAL_FALLOFF = 380;
export const FOCAL_SCALE_RANGE = 0.4;
export const FOCAL_OPACITY_RANGE = 0.82;

export type FocalGeometry = {
  /** Distance en pixels au-dessus de la ligne de focus (0 = au point ou en dessous). */
  distance: number;
  scale: number;
  opacity: number;
};

/**
 * Sur un conteneur plus court que deux fois l'offset (clavier ouvert sur
 * téléphone), la ligne de focus tomberait au-dessus du bord haut et TOUTES les
 * rangées basculeraient dans la zone lointaine. On la borne au milieu.
 */
export function focalFocusLine(viewportHeight: number): number {
  if (viewportHeight <= 0) return 0;
  return Math.max(viewportHeight / 2, viewportHeight - FOCAL_OFFSET_FROM_BOTTOM);
}

export function focalGeometry({
  rowMidY,
  focusY,
}: {
  rowMidY: number;
  focusY: number;
}): FocalGeometry {
  const distance = Math.max(0, focusY - rowMidY);
  const f = Math.min(1, distance / FOCAL_FALLOFF);

  return {
    distance,
    scale: 1 - FOCAL_SCALE_RANGE * f,
    opacity: 1 - FOCAL_OPACITY_RANGE * f,
  };
}

export function pickFocusedRowId(
  rows: ReadonlyArray<{ id: string; midY: number }>,
  focusY: number
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const distance = Math.abs(row.midY - focusY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = row.id;
    }
  }

  return bestId;
}
