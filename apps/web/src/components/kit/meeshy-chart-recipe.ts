import type { CSSProperties } from 'react';

/**
 * K50 · MeeshyChart — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Un graphique de Meeshy n'est pas un tableau de bord : une teinte, un pic, deux bornes. Le
 * genre se choisit par la question posée, il ne change pas à chaud. Le composant montre une
 * série, il ne la calcule pas : l'hôte charge, agrège et formate les nombres, les dates et les
 * phrases dites. Ce que l'œil ne lit pas, la voix le dit.
 */
export type MeeshyChartKind = 'bars' | 'line' | 'donut' | 'funnel' | 'breakdown' | 'strip' | 'bubbles';
export type MeeshyChartSize = 'compact' | 'regular' | 'large';
export type MeeshyChartLayout = 'stacked' | 'inline';

export const MEESHY_CHART_MEASURE = {
  height: { compact: 96, regular: 128, large: 220 },
  stripCell: 26,
  funnelStage: 52,
  donut: 104,
  barGapTight: 3,
  barGapWide: 6,
  maxSegments: 5,
  stripFloor: 0.12,
  bubble: { min: 34, max: 78 },
  line: 2.5,
  areaOpacity: 0.15,
  breakdownBar: { stacked: 8, inline: 10 },
} as const;

export type MeeshyChartRecipeInput = {
  readonly kind: MeeshyChartKind;
  readonly size?: MeeshyChartSize | undefined;
  readonly pointCount: number;
  readonly layout?: MeeshyChartLayout | undefined;
};

export type MeeshyChartRecipe = {
  readonly kind: MeeshyChartKind;
  readonly height: number;
  readonly barGap: number;
  readonly isEmpty: boolean;
  readonly keepsTrack: boolean;
  readonly maxSegments: number;
  readonly foldsOthers: boolean;
  readonly breakdownBar: number;
  readonly hasAxis: boolean;
};

export const meeshyChartRecipe = (input: MeeshyChartRecipeInput): MeeshyChartRecipe => {
  const size = input.size ?? 'regular';
  const count = Math.max(Math.trunc(input.pointCount), 0);
  const m = MEESHY_CHART_MEASURE;
  const height =
    input.kind === 'strip' ? m.stripCell : input.kind === 'funnel' ? count * m.funnelStage : input.kind === 'donut' ? m.donut : input.kind === 'breakdown' ? 0 : m.height[size];
  return {
    kind: input.kind,
    height,
    barGap: size === 'large' ? m.barGapWide : m.barGapTight,
    isEmpty: count === 0,
    keepsTrack: input.kind === 'donut',
    maxSegments: m.maxSegments,
    foldsOthers: input.kind === 'donut' && count > m.maxSegments,
    breakdownBar: m.breakdownBar[input.layout ?? 'stacked'],
    hasAxis: input.kind === 'bars' || input.kind === 'line' || input.kind === 'strip',
  };
};

/** La teinte d'une cellule de bande : la valeur est portée par l'opacité, de 12 à 100 %. */
export const meeshyChartStripLevel = (fraction: number): number =>
  Math.round((MEESHY_CHART_MEASURE.stripFloor + (1 - MEESHY_CHART_MEASURE.stripFloor) * Math.min(Math.max(fraction, 0), 1)) * 1000) / 1000;

/** Le diamètre d'une bulle : l'aire est proportionnelle à la valeur, de 34 à 78. */
export const meeshyChartBubbleDiameter = (fraction: number): number => {
  const { min, max } = MEESHY_CHART_MEASURE.bubble;
  const area = min * min + (max * max - min * min) * Math.min(Math.max(fraction, 0), 1);
  return Math.round(Math.sqrt(area));
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyChartStyle = (recipe: MeeshyChartRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-chart-height': rem(recipe.height),
    '--kit-chart-gap': rem(recipe.barGap),
    '--kit-chart-bar': rem(recipe.breakdownBar),
    ...(tint === undefined ? {} : { '--kit-chart-tint': tint }),
  }) as CSSProperties;
