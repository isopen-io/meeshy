/**
 * `columns.ts` — géométrie horizontale des couloirs de la Rivière,
 * ARITHMÉTIQUE PURE (R-134, miroir de `RiverColumnLayout.swift`, R-133).
 *
 * PORTÉ tel quel depuis `apps/web/components/conversations/riviere/
 * river-column-layout.ts` (#5696, étape 2) — seule édition : `interface` →
 * `type` (CLAUDE.md, « prefer `type` over `interface` for data structures »).
 *
 * Cette fonction ne connaît RIEN de la loi (`@meeshy/shared/utils/
 * river-lanes`) : `laneWidthPx`/`gutterPx` sont des PIXELS MESURÉS par la
 * peau (travail 2, `getBoundingClientRect()`), jamais une cote recopiée ici
 * — et `laneCount` vient de `RiverGeometry.laneCount` (la loi). Aucune
 * constante de token n'est recopiée dans ce fichier (garde R15).
 *
 * Miroir arithmétique de la maquette normative
 * (`docs/design/2026-08-17-riviere-navigation.html`,
 * `railX = laneIndex * LANE_W + LANE_W / 2`) : le rail (la ligne verticale de
 * la branche) passe au CENTRE de son couloir, et la bulle est centrée dessus —
 * la ligne l'aborde par le haut, son contour la porte, et elle repart par le
 * bas.
 */

export type RiverColumnLayout = {
  readonly laneWidthPx: number;
  readonly gutterPx: number;
  readonly laneCount: number;
};

/** Largeur totale du contenu défilable — `laneCount` couloirs contigus. */
export function riverTotalWidthPx(layout: RiverColumnLayout): number {
  return Math.max(0, layout.laneCount) * layout.laneWidthPx;
}

/** Bord gauche du couloir `laneIndex`. */
export function riverLaneLeadingXPx(layout: RiverColumnLayout, laneIndex: number): number {
  return laneIndex * layout.laneWidthPx;
}

/** Rail — l'axe X où court la ligne de la branche, au CENTRE du couloir. */
export function riverRailXPx(layout: RiverColumnLayout, laneIndex: number): number {
  return riverLaneLeadingXPx(layout, laneIndex) + layout.laneWidthPx / 2;
}

/**
 * Largeur utile de la bulle dans son couloir — `laneWidthPx` moins la
 * gouttière des deux côtés, où passent les traits et les connecteurs.
 */
export function riverBubbleContentWidthPx(layout: RiverColumnLayout): number {
  return Math.max(0, layout.laneWidthPx - layout.gutterPx * 2);
}
