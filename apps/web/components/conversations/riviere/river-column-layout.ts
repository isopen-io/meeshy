/**
 * `river-column-layout.ts` — géométrie horizontale des couloirs, ARITHMÉTIQUE
 * PURE (R-134, miroir web de `RiverColumnLayout.swift`, R-133).
 *
 * Cette fonction ne connaît RIEN de la loi (`packages/shared/utils/
 * river-lanes.ts`) : `laneWidthPx`/`gutterPx` sont des PIXELS MESURÉS (la
 * grille CSS résout `var(--lentille-river-lane-*)`, la peau MESURE le rendu
 * réel — `RiverThread.tsx` lit `getBoundingClientRect()`, jamais un nombre
 * dupliqué ici) et `laneCount` vient de `RiverGeometry.laneCount` (la loi).
 * Aucune constante de token n'est recopiée dans ce fichier (garde R15).
 *
 * Miroir arithmétique de la maquette normative
 * (`docs/design/2026-08-17-riviere-navigation.html`,
 * `railX = laneIndex * LANE_W + LANE_W / 2`) : le rail (la ligne verticale de
 * la branche) passe au CENTRE de son couloir, et la bulle est centrée dessus —
 * la ligne l'aborde par le haut, son contour la porte, et elle repart par le
 * bas.
 */

export interface RiverColumnLayout {
  readonly laneWidthPx: number;
  readonly gutterPx: number;
  readonly laneCount: number;
}

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
