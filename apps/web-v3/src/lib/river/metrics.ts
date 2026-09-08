/**
 * LES COTES DE PIXELS DE LA RIVIÈRE — DÉRIVÉES de
 * `packages/shared/design/lentille-tokens.json` → `river` (miroir LECTURE
 * SEULE de `RiverMetrics.swift`, lui-même relevé sur la maquette normative
 * `docs/design/2026-08-17-riviere-navigation.html` §7ter), gardées par
 * `scripts/check-river-metrics.mjs` — même dispositif que
 * `src/lib/reading-mode/metrics.ts` pour `FocalMetrics.swift`, un fichier À
 * PART parce que la Rivière a TROIS sources (JSON, Swift, TS) là où les
 * autres en ont deux (#5696, travail `river`, étape 6).
 *
 * **AUCUNE CONSTANTE DE LOI ICI** (garde R15, `RiverMetrics.swift:10-17`) :
 * `RIVER_MAX_LANES`/`RIVER_MIN_VOICES`/`RIVER_HEADER_FADE_RANKS`/
 * `RIVER_LANE_SILENCE_WINDOW_MS` vivent dans `@meeshy/shared/utils/
 * river-lanes` (`geometry.ts` les importe), jamais ici — dupliquer l'une
 * d'elles romprait « une seule maison par constante » et créerait deux
 * vérités qui peuvent diverger. Ce fichier ne porte QUE des géométries de
 * pixels, comme `RiverMetrics.swift`.
 */

/** `river.line.width` — trait vertical d'une branche ET bordure de la bulle (même épaisseur). */
export const LINE_WIDTH = 2.5;

/** `river.lane` — largeur de référence, bornes du pince, gouttière. */
export const LANE_WIDTH_REFERENCE = 300;
export const LANE_WIDTH_MIN = 210;
export const LANE_WIDTH_MAX = 540;
export const LANE_GUTTER = 28;

/** `river.bubble` — rayon de contournement, écarts, bornes. */
export const BUBBLE_DETOUR_RADIUS = 14;
export const BUBBLE_BASE_GAP = 8;
export const BUBBLE_CONTENT_PADDING = 14;
/**
 * `river.bubble.identityNameMaxWidth` — JSON `"44%"`, ici `0.44` (même
 * convention que `LentilleMetrics.Row.transformOriginX` : une FRACTION de la
 * largeur de bulle, pas un pourcentage littéral).
 */
export const BUBBLE_IDENTITY_NAME_MAX_WIDTH = 0.44;
export const BUBBLE_FLAT_BORDER_WIDTH = 1;

/** `river.connector` — trait, bornes de courbure. */
export const CONNECTOR_STROKE_WIDTH = 1.4;
export const CONNECTOR_MIN_BOW = 34;
export const CONNECTOR_BOW_RATIO = 0.5;

/** `river.row` — respiration verticale et couture de continuation. */
export const ROW_GAP = 14;
export const ROW_CONTINUATION_SEAM = 3;
export const ROW_CONTINUATION_DASH_LENGTH = 3;
export const ROW_CONTINUATION_DASH_GAP = 4;

/** `river.laneHeader.height` — hauteur de la bande d'en-tête, en PIXELS. */
export const LANE_HEADER_HEIGHT = 38;

/**
 * `RiverMetrics.Motion` — durées de PEAU, hors JSON partagé (même précédent
 * que `FocalMetrics.FocusChip`) : SECONDES côté Swift (`0.35`/`0.2`), ×1000
 * ici (comme `SCENE_*_MS` dans `reading-mode/metrics.ts`).
 */
export const MOTION_LANDING_DURATION_MS = 350;
export const MOTION_HANDLE_FADE_DURATION_MS = 200;

/**
 * `RiverMetrics.Connector.bow(laneDistancePoints:)` — miroir arithmétique :
 * `max(minBow, |Δcouloir| * bowRatio)`.
 */
export function connectorBow(laneDistancePx: number): number {
  return Math.max(CONNECTOR_MIN_BOW, Math.abs(laneDistancePx) * CONNECTOR_BOW_RATIO);
}
