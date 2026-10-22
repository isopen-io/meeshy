/**
 * LE VERDICT DU GATE DE FIDÉLITÉ DES CADRES DE GLOIRE (#10159, § 8.3), sans
 * navigateur — ce que `check-glory-frames.ts` DÉCIDE une fois les mesures
 * faites. Deux familles de défauts, et deux sorts :
 *  - ce qui ROUGIT quel que soit le mode : une peinture INSTABLE (deux
 *    peintures des mêmes entrées, deux images — l'aperçu ne serait plus
 *    l'image finale), une cible qu'aucun manifeste versionné ne compose alors
 *    que sa collection n'est pas déclarée de démonstration (un manifeste qui
 *    dérive), et ZÉRO cible composée ;
 *  - ce que `--report` IMPRIME sans rougir : les écarts de tolérance (part des
 *    pixels à |Δ| ≤ 6, pire bloc), tant que les cibles et les contrats ne
 *    partagent pas la même géométrie (ci-dessous).
 *
 * LA GÉOMÉTRIE DES CIBLES. Le générateur applique `lib/anchors.json` (lot L2,
 * #10153 : Mee et Meo déplacés hors de la photo, un `dx`, `dy` et une échelle
 * par oiseau, en repère 540 × 960) à l'ENREGISTREMENT de chaque SVG, donc aux
 * cibles de L21a (#10177) ; le contrat versionné (`packages/shared/design/
 * glory-frames/*.json`) ne porte pas ces ancres. Le peintre pose donc les
 * oiseaux là où le contrat le dit, la cible les porte ailleurs — ce n'est pas
 * une tolérance du peintre, c'est un écart contrat ↔ cibles. La comparaison
 * exclut les oiseaux aux DEUX places et le rapport nomme l'écart par cadre.
 */

export type Box = readonly [number, number, number, number];

export type GloryMeasure = { readonly file: string; readonly stable: boolean; readonly share: number; readonly worstBlock: number };
export type GloryThresholds = { readonly share: number; readonly blockMeanDelta: number };
export type SkippedTarget = { readonly file: string; readonly collection: string };

export type GloryVerdictInput = {
  readonly measures: readonly GloryMeasure[];
  readonly skipped: readonly SkippedTarget[];
  /** Les collections de l'échantillon qui n'ont pas de manifeste versionné PAR CHOIX (démonstration, non livrées). */
  readonly demoCollections: readonly string[];
  readonly reportOnly: boolean;
  readonly thresholds: GloryThresholds;
};

export type GloryVerdict = {
  readonly unstable: readonly string[];
  readonly outOfTolerance: readonly string[];
  readonly unexpectedlySkipped: readonly string[];
  readonly nothingComposed: boolean;
  readonly red: boolean;
  readonly summary: string;
};

export const withinTolerance = (measure: GloryMeasure, thresholds: GloryThresholds): boolean => measure.share >= thresholds.share && measure.worstBlock <= thresholds.blockMeanDelta;

export function gloryVerdict(input: GloryVerdictInput): GloryVerdict {
  const unstable = input.measures.filter((measure) => !measure.stable).map((measure) => measure.file);
  const outOfTolerance = input.measures.filter((measure) => measure.stable && !withinTolerance(measure, input.thresholds)).map((measure) => measure.file);
  const demo = new Set(input.demoCollections);
  const unexpectedlySkipped = input.skipped.filter((target) => !demo.has(target.collection)).map((target) => target.file);
  const nothingComposed = input.measures.length === 0;
  const red = unstable.length > 0 || unexpectedlySkipped.length > 0 || nothingComposed || (!input.reportOnly && outOfTolerance.length > 0);
  const causes = [
    ...(nothingComposed ? ['aucune cible composée'] : []),
    ...(unstable.length > 0 ? [`${unstable.length} peinture(s) instable(s) : ${unstable.join(', ')}`] : []),
    ...(unexpectedlySkipped.length > 0 ? [`${unexpectedlySkipped.length} cible(s) sans manifeste versionné : ${unexpectedlySkipped.join(', ')}`] : []),
    ...(outOfTolerance.length > 0 ? [`${outOfTolerance.length} cible(s) hors tolérance : ${outOfTolerance.join(', ')}`] : []),
  ];
  const summary = red ? `ROUGE : ${causes.join(' ; ')}` : outOfTolerance.length > 0 ? `MESURE : ${causes.join(' ; ')}` : 'vert';
  return { unstable, outOfTolerance, unexpectedlySkipped, nothingComposed, red, summary };
}

/** Une ancre corrigée du générateur (`lib/anchors.json`) : l'oiseau `bird` (0 = Mee, 1 = Meo), déplacé en repère 540 × 960 et réduit. */
export type AnchorFix = { readonly bird: number; readonly dx: number; readonly dy: number; readonly scale: number };

/** La boîte d'un oiseau telle que la cible la porte : `translate(dx dy) scale(s)` depuis son coin, l'ancre étant ×`scale` en pixels de l'image. */
export const anchoredBox = (box: Box, fix: AnchorFix | undefined, scale: number): Box =>
  fix === undefined ? box : [box[0] + fix.dx * scale, box[1] + fix.dy * scale, box[2] * fix.scale, box[3] * fix.scale];

const BIRD_NAMES = ['Mee', 'Meo'] as const;
const signed = (value: number): string => `${value >= 0 ? '+' : '-'}${Math.abs(value)}`;

const fixLabel = (fix: AnchorFix, scale: number): string => {
  const parts = [
    ...(fix.dx === 0 ? [] : [`dx ${signed(Math.round(fix.dx * scale))}`]),
    ...(fix.dy === 0 ? [] : [`dy ${signed(Math.round(fix.dy * scale))}`]),
    ...(fix.scale === 1 ? [] : [`×${fix.scale}`]),
  ];
  return `${BIRD_NAMES[fix.bird] ?? `oiseau ${fix.bird}`} ${parts.join(' ')}`;
};

/** L'écart de géométrie d'un cadre, nommé pour le rapport ; `null` : la cible et le contrat posent les oiseaux au même endroit. */
export const geometryDrift = (fixes: readonly AnchorFix[], scale: number): string | null =>
  fixes.length === 0 ? null : `oiseaux posés ailleurs dans la cible (anchors.json, L2) : ${fixes.map((fix) => fixLabel(fix, scale)).join(' · ')}`;
