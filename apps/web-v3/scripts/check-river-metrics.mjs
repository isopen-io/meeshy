#!/usr/bin/env node
/**
 * VÉRIFIE QUE LES COTES DE LA RIVIÈRE N'ONT PAS DÉRIVÉ DE LEUR SOURCE
 * (#5696, travail `river`, étape 6 — critère (d)).
 *
 * TROIS sources, là où `check-curve.mjs` en compare deux :
 *
 *   1. JSON ↔ Swift — `packages/shared/design/lentille-tokens.json` → `river`
 *      (la source NORMATIVE) contre `RiverMetrics.swift` (miroir LECTURE
 *      SEULE, même parité que `RiverMetricsTests` côté iOS).
 *   2. Swift ↔ TS — `RiverMetrics.swift` contre `src/lib/river/metrics.ts`
 *      (la dérivation web), plus les deux cotes de MOUVEMENT hors JSON
 *      (`landingDuration`/`handleFadeDuration`, secondes → ×1000).
 *   3. GARDE R15 — `metrics.ts` ne porte AUCUNE constante de LOI
 *      (`RIVER_MAX_LANES`/`RIVER_MIN_VOICES`/`RIVER_HEADER_FADE_RANKS`/
 *      `RIVER_LANE_SILENCE_WINDOW_MS` vivent dans `@meeshy/shared/utils/
 *      river-lanes`, jamais ici) ; `columns.ts`/`focus.ts`/`metrics.ts`
 *      n'importent pas la loi, et `geometry.ts` (le `Core`) n'importe pas
 *      `metrics.ts` (le `Core` ne lit pas de pixels).
 *
 * Lit par EXTRACTION textuelle (regex), jamais en import — même raison que
 * `check-curve.mjs` : ne pas faire entrer Prisma dans une application de
 * 25 Ko pour vérifier une trentaine de littéraux.
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../..', import.meta.url).pathname;
const TOKENS_PATH = `${ROOT}packages/shared/design/lentille-tokens.json`;
const SWIFT_PATH = `${ROOT}apps/ios/Meeshy/Features/Main/Riviere/Core/RiverMetrics.swift`;
const TS_PATH = `${ROOT}apps/web-v3/src/lib/river/metrics.ts`;
const COLUMNS_PATH = `${ROOT}apps/web-v3/src/lib/river/columns.ts`;
const FOCUS_PATH = `${ROOT}apps/web-v3/src/lib/river/focus.ts`;
const GEOMETRY_PATH = `${ROOT}apps/web-v3/src/lib/river/geometry.ts`;

const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
const swift = readFileSync(SWIFT_PATH, 'utf8');
const ts = readFileSync(TS_PATH, 'utf8');
const columnsSource = readFileSync(COLUMNS_PATH, 'utf8');
const focusSource = readFileSync(FOCUS_PATH, 'utf8');
const geometrySource = readFileSync(GEOMETRY_PATH, 'utf8');

const failures = [];

/** Swift annote ses types : `public static let width: CGFloat = 2.5`. */
const swiftNumber = (name) => {
  const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(swift);
  return m === null ? null : Number(m[1]);
};

/** `export const NOM = 2.5;` — la dérivation web. */
const tsNumber = (name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(-?[0-9.]+)`).exec(ts);
  return m === null ? null : Number(m[1]);
};

const jsonAt = (path) => path.split('.').reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), tokens.river);

/**
 * `identityNameMaxWidth` : JSON porte `"44%"` (une CHAÎNE), Swift/TS portent
 * `0.44` (une FRACTION — même convention que `LentilleMetrics.Row.
 * transformOriginX`). `jsonNumber` normalise les deux formes.
 */
const jsonNumber = (path) => {
  const value = jsonAt(path);
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.endsWith('%')) {
    const n = Number(value.slice(0, -1));
    return Number.isNaN(n) ? null : n / 100;
  }
  return null;
};

/**
 * Les 18 jetons partagés par les TROIS sources — `jsonPath` (dans
 * `river.*`), `swiftName` (le champ Swift), `tsName` (la constante TS).
 * Unicité de chaque `swiftName` VÉRIFIÉE avant d'écrire cette table (aucun
 * autre champ de `RiverMetrics.swift` ne matche le même `\b<nom>` suivi d'un
 * `=`) : `width` ne matche que `Line.width` (`widthReference`/`widthMin`/
 * `widthMax`/`flatBorderWidth` continuent en lettres, pas de `\b` avant le
 * `=`) ; `gap` ne matche que `Row.gap` (`baseGap`/`continuationDashGap` ont
 * un `G` MAJUSCULE, un texte distinct de `gap` en minuscules) ; `height` ne
 * matche que `LaneHeader.height`.
 */
const TOKEN_MAPPINGS = [
  ['line.width', 'width', 'LINE_WIDTH', 'trait de branche (Line.width)'],
  ['lane.widthReference', 'widthReference', 'LANE_WIDTH_REFERENCE', 'largeur de référence du couloir (Lane.widthReference)'],
  ['lane.widthMin', 'widthMin', 'LANE_WIDTH_MIN', 'plancher du pince (Lane.widthMin)'],
  ['lane.widthMax', 'widthMax', 'LANE_WIDTH_MAX', 'plafond du pince (Lane.widthMax)'],
  ['lane.gutter', 'gutter', 'LANE_GUTTER', 'gouttière du couloir (Lane.gutter)'],
  ['bubble.detourRadius', 'detourRadius', 'BUBBLE_DETOUR_RADIUS', 'rayon de contournement (Bubble.detourRadius)'],
  ['bubble.baseGap', 'baseGap', 'BUBBLE_BASE_GAP', "écart de base où vit l'heure (Bubble.baseGap)"],
  ['bubble.contentPadding', 'contentPadding', 'BUBBLE_CONTENT_PADDING', 'retrait intérieur de la bulle (Bubble.contentPadding)'],
  ['bubble.identityNameMaxWidth', 'identityNameMaxWidth', 'BUBBLE_IDENTITY_NAME_MAX_WIDTH', "borne du nom en tête de groupe (Bubble.identityNameMaxWidth, JSON '44%' ↔ 0.44)"],
  ['bubble.flatBorderWidth', 'flatBorderWidth', 'BUBBLE_FLAT_BORDER_WIDTH', 'contour neutre de la vue sérialisée (Bubble.flatBorderWidth)'],
  ['connector.strokeWidth', 'strokeWidth', 'CONNECTOR_STROKE_WIDTH', 'trait du connecteur (Connector.strokeWidth)'],
  ['connector.minBow', 'minBow', 'CONNECTOR_MIN_BOW', 'plancher de courbure (Connector.minBow)'],
  ['connector.bowRatio', 'bowRatio', 'CONNECTOR_BOW_RATIO', 'ratio de courbure (Connector.bowRatio)'],
  ['row.gap', 'gap', 'ROW_GAP', 'respiration verticale entre deux rangs (Row.gap)'],
  ['row.continuationSeam', 'continuationSeam', 'ROW_CONTINUATION_SEAM', 'hauteur de la couture de continuation (Row.continuationSeam)'],
  ['row.continuationDashLength', 'continuationDashLength', 'ROW_CONTINUATION_DASH_LENGTH', 'longueur des tirets de continuation (Row.continuationDashLength)'],
  ['row.continuationDashGap', 'continuationDashGap', 'ROW_CONTINUATION_DASH_GAP', 'écart des tirets de continuation (Row.continuationDashGap)'],
  ['laneHeader.height', 'height', 'LANE_HEADER_HEIGHT', "hauteur de la bande d'en-tête de couloir (LaneHeader.height)"],
];

for (const [jsonPath, swiftName, tsName, what] of TOKEN_MAPPINGS) {
  const fromJson = jsonNumber(jsonPath);
  const fromSwift = swiftNumber(swiftName);
  const fromTs = tsNumber(tsName);

  if (fromJson === null || fromJson === undefined) {
    failures.push(`${what} : « river.${jsonPath} » introuvable dans lentille-tokens.json`);
    continue;
  }
  if (fromSwift === null) {
    failures.push(`${what} : « ${swiftName} » introuvable dans RiverMetrics.swift`);
    continue;
  }
  if (fromJson !== fromSwift) {
    failures.push(`${what} : lentille-tokens.json ${fromJson}, RiverMetrics.swift ${fromSwift}`);
    continue;
  }
  if (fromTs === null) {
    failures.push(`${what} : « ${tsName} » introuvable dans river/metrics.ts`);
    continue;
  }
  if (fromSwift !== fromTs) {
    failures.push(`${what} : RiverMetrics.swift ${fromSwift}, river/metrics.ts ${fromTs}`);
  }
}

/**
 * `RiverMetrics.Motion` — durées de PEAU, hors JSON partagé : SECONDES côté
 * Swift, ×1000 côté TS (même dispositif que `SCENE_MS_MAPPINGS` de
 * `check-curve.mjs`).
 */
const MOTION_MAPPINGS = [
  ['landingDuration', 'MOTION_LANDING_DURATION_MS', 'glissade d’un cadrage demandé (Motion.landingDuration)'],
  ['handleFadeDuration', 'MOTION_HANDLE_FADE_DURATION_MS', 'apparition/effacement de la poignée du temps (Motion.handleFadeDuration)'],
];

for (const [swiftName, tsName, what] of MOTION_MAPPINGS) {
  const seconds = swiftNumber(swiftName);
  const ms = tsNumber(tsName);
  if (seconds === null) {
    failures.push(`${what} : « ${swiftName} » introuvable dans RiverMetrics.swift`);
    continue;
  }
  if (ms === null) {
    failures.push(`${what} : « ${tsName} » introuvable dans river/metrics.ts`);
    continue;
  }
  if (Math.round(seconds * 1000) !== ms) {
    failures.push(`${what} : Swift ${seconds}s (×1000 = ${seconds * 1000}), dérivée ${ms}`);
  }
}

/**
 * GARDE R15 — `metrics.ts` ne porte AUCUNE constante de LOI, et les trois
 * fichiers purs de la peau (`columns.ts`, `focus.ts`, `metrics.ts`)
 * n'importent pas `river-lanes` ; `geometry.ts` (le `Core`) n'importe pas
 * `metrics.ts` (le `Core` ne lit pas de pixels).
 *
 * LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE (même leçon que
 * `check-curve.mjs` PARTIE 6) : sans ça, ce gate ne pourrait jamais passer —
 * le doc-comment de tête de `metrics.ts` NOMME les quatre constantes de loi
 * pour dire qu'elles ne sont PAS ici, ce qui ferait rougir une recherche
 * naïve sur un fichier pourtant conforme.
 */
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

const tsCode = withoutComments(ts);
const columnsCode = withoutComments(columnsSource);
const focusCode = withoutComments(focusSource);
const geometryCode = withoutComments(geometrySource);

const LAW_CONSTANT_NAMES = /\b(RIVER_)?(MAX_LANES|MIN_VOICES|HEADER_FADE_RANKS|LANE_SILENCE_WINDOW_MS)\b/;
if (LAW_CONSTANT_NAMES.test(tsCode)) {
  failures.push('river/metrics.ts porte une CONSTANTE DE LOI — elles vivent dans @meeshy/shared/utils/river-lanes (garde R15)');
}

const RIVER_LANES_IMPORT = /from\s+['"]@meeshy\/shared\/utils\/river-lanes['"]/;
for (const [label, source] of [
  ['river/columns.ts', columnsCode],
  ['river/focus.ts', focusCode],
  ['river/metrics.ts', tsCode],
]) {
  if (RIVER_LANES_IMPORT.test(source)) {
    failures.push(`${label} importe la LOI (river-lanes) — ces fichiers sont de l'arithmétique pure de PIXELS, ils ne la connaissent pas`);
  }
}

const METRICS_IMPORT = /from\s+['"]\.\/metrics['"]/;
if (METRICS_IMPORT.test(geometryCode)) {
  failures.push('river/geometry.ts (le Core) importe river/metrics.ts — le Core ne lit pas de pixels');
}

if (failures.length > 0) {
  console.error('\n  La Rivière a DÉRIVÉ de sa source (lentille-tokens.json → RiverMetrics.swift → river/metrics.ts) :\n');
  for (const failure of failures) console.error(`    · ${failure}`);
  console.error('\n  La source de vérité est AMONT (JSON → Swift). Accorder river/metrics.ts sur elle, jamais l’inverse.\n');
  process.exit(1);
}

console.log(
  `  La Rivière est conforme à lentille-tokens.json → RiverMetrics.swift` +
    ` (${TOKEN_MAPPINGS.length} cotes de pixels, ${MOTION_MAPPINGS.length} cotes de mouvement).` +
    `\n  Garde R15 tenue : aucune constante de loi dans river/metrics.ts ;` +
    ` columns.ts/focus.ts/metrics.ts n'importent pas la loi ; geometry.ts n'importe pas metrics.ts.`,
);
