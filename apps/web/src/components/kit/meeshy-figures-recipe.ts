import type { CSSProperties } from 'react';

/**
 * K34 · MeeshyFigures — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Il montre un nombre, il ne le calcule pas. Une valeur en grand (Nunito, chiffres
 * tabulaires) et son unité dessous, qui se lisent d'un bloc ; deux à quatre chiffres en
 * bande, séparés par des filets ; au besoin UN dessin — une mini-courbe de sept points
 * sans axe, ou une jauge de part. L'hôte donne une valeur déjà écrite (espaces, « 12 k »,
 * « 2,4 Go », pourcentage) : aucune mise en forme ici. Les barres et les séries à axe
 * sont à K50, la jauge d'une rangée de part à K42.
 */
export type MeeshyFigureSize = 'hero' | 'large' | 'compact';
export type MeeshyFigureTrendDirection = 'up' | 'down' | 'flat';
export type MeeshyFigureTrend = { readonly direction: MeeshyFigureTrendDirection; readonly text: string };

export const MEESHY_FIGURES_MEASURE = {
  valueSize: { hero: 48, large: 34, compact: 24 },
  unitSize: 12.5,
  unitGap: 2,
  minShrink: 0.6,
  trendHeight: 20,
  trendGlyph: 12,
  ruleWidth: 1,
  ruleGap: 16,
  compactBelow: 360,
  bandMin: 2,
  bandMax: 4,
  spark: { width: 72, height: 28, stroke: 2, areaOpacity: 0.14, endDot: 6, pad: 3 },
  share: { badge: 38, valueSize: 17, bar: 8, minBar: 4, maxRows: 4 },
} as const;

export type MeeshyFiguresRecipeInput = {
  readonly size?: MeeshyFigureSize | undefined;
  readonly count?: number | undefined;
  readonly width?: number | undefined;
  readonly isStacked?: boolean | undefined;
};

export type MeeshyFiguresRecipe = {
  readonly size: MeeshyFigureSize;
  readonly valueSize: number;
  readonly unitSize: number;
  readonly unitGap: number;
  readonly minShrink: number;
  readonly trendHeight: number;
  readonly trendGlyph: number;
  readonly ruleWidth: number;
  readonly ruleGap: number;
  readonly isStacked: boolean;
  readonly spark: typeof MEESHY_FIGURES_MEASURE.spark;
  readonly shareMinBar: number;
  readonly shareBadge: number;
  readonly shareBar: number;
  readonly shareValueSize: number;
};

/** La recette d'une bande : la taille, le passage en compact sous 360 et l'empilement. */
export const meeshyFiguresRecipe = (input: MeeshyFiguresRecipeInput): MeeshyFiguresRecipe => {
  const squeezed = (input.count ?? 1) >= MEESHY_FIGURES_MEASURE.bandMax && input.width !== undefined && input.width < MEESHY_FIGURES_MEASURE.compactBelow;
  const size = squeezed ? 'compact' : (input.size ?? 'large');
  return {
    size,
    valueSize: MEESHY_FIGURES_MEASURE.valueSize[size],
    unitSize: MEESHY_FIGURES_MEASURE.unitSize,
    unitGap: MEESHY_FIGURES_MEASURE.unitGap,
    minShrink: MEESHY_FIGURES_MEASURE.minShrink,
    trendHeight: MEESHY_FIGURES_MEASURE.trendHeight,
    trendGlyph: MEESHY_FIGURES_MEASURE.trendGlyph,
    ruleWidth: MEESHY_FIGURES_MEASURE.ruleWidth,
    ruleGap: MEESHY_FIGURES_MEASURE.ruleGap,
    isStacked: input.isStacked === true,
    spark: MEESHY_FIGURES_MEASURE.spark,
    shareMinBar: MEESHY_FIGURES_MEASURE.share.minBar,
    shareBadge: MEESHY_FIGURES_MEASURE.share.badge,
    shareBar: MEESHY_FIGURES_MEASURE.share.bar,
    shareValueSize: MEESHY_FIGURES_MEASURE.share.valueSize,
  };
};

export type MeeshySparkDrawing = {
  readonly line: string;
  readonly area: string;
  readonly points: readonly (readonly [number, number])[];
  readonly end: readonly [number, number];
};

const fixed = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * La loi pure d'échelle de la mini-courbe : des valeurs, un tracé dans 72 × 28. Moins de
 * deux points : rien. Des valeurs égales tracent une droite au milieu (jamais de division
 * par zéro), des valeurs négatives se mettent à l'échelle comme les autres.
 */
export const meeshySparkPath = (points: readonly number[]): MeeshySparkDrawing | null => {
  if (points.length < 2) return null;
  const { width, height, pad } = MEESHY_FIGURES_MEASURE.spark;
  const finite = points.map((point) => (Number.isFinite(point) ? point : 0));
  const min = Math.min(...finite);
  const range = Math.max(...finite) - min;
  const top = pad;
  const bottom = height - pad;
  const placed = finite.map((value, index): readonly [number, number] => [
    (index / (finite.length - 1)) * width,
    range === 0 ? height / 2 : bottom - ((value - min) / range) * (bottom - top),
  ]);
  const line = placed.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${fixed(x)} ${fixed(y)}`).join(' ');
  const last = placed.at(-1) ?? [width, height / 2];
  return { line, area: `${line} L${fixed(width)} ${height} L0 ${height} Z`, points: placed, end: last };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyFiguresStyle = (recipe: MeeshyFiguresRecipe): CSSProperties =>
  ({
    '--kit-figure-value': rem(recipe.valueSize),
    '--kit-figure-unit': rem(recipe.unitSize),
    '--kit-figure-unit-gap': rem(recipe.unitGap),
    '--kit-figure-trend-h': rem(recipe.trendHeight),
    '--kit-figure-trend-glyph': rem(recipe.trendGlyph),
    '--kit-figure-rule': rem(recipe.ruleWidth),
    '--kit-figure-rule-gap': rem(recipe.ruleGap),
    '--kit-figure-shrink': recipe.minShrink,
    '--kit-share-badge': rem(recipe.shareBadge),
    '--kit-share-value': rem(recipe.shareValueSize),
    '--kit-share-min-bar': `${recipe.shareMinBar}px`,
  }) as CSSProperties;
