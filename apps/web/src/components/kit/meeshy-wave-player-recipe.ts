import type { CSSProperties } from 'react';

import { interpolatedLevel } from '@/lib/view/waveform';

/**
 * K35 · MeeshyWavePlayer — LA LOI DES BARRES ET LA RECETTE (#18875, #18857).
 *
 * Le lecteur des vocaux DEVIENT le composant : il dessine un disque, une onde qui se
 * remplit et respire, une durée qui ne bouge pas de place, à partir de VALEURS (`samples`,
 * `progress`, `isPlaying`, `duration`). Il ne joue rien, ne charge rien, n'ouvre aucun
 * fichier : l'app et ses services jouent. L'interpolation des niveaux est celle de
 * `lib/view/waveform.ts` (`interpolatedLevel`), la loi de l'onde de l'enregistrement —
 * une seule source ; la largeur d'une barre, elle, est ICI (3 · 3, une barre tous les 6 px).
 */
export type MeeshyWavePlayerSize = 'row' | 'compact';
export type MeeshyWavePlayerPhase = 'ready' | 'buffering' | 'unavailable';
export type MeeshyWavePlayerClock = 'remaining' | 'elapsed' | 'total';

export type MeeshyWavePlayerWords = {
  readonly play: string;
  readonly pause: string;
  readonly replay: string;
  readonly buffering: string;
  readonly unavailable: string;
  readonly position: string;
  readonly positionText: (elapsedSeconds: number, totalSeconds: number) => string;
};

export const MEESHY_WAVE_PLAYER_MEASURE = {
  row: { disc: 60, glyph: 22, gap: 14, height: 60, waveHeight: 40 },
  compact: { disc: 44, glyph: 18, gap: 10, height: 44, waveHeight: 28 },
  barWidth: 3,
  barGap: 3,
  minBar: 3,
  zoneHeight: 44,
  tapTarget: 44,
  pressedScale: 0.94,
  unavailableOpacity: 0.4,
  keyStep: 0.05,
  clockWidth: 34,
} as const;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const unit = (value: number): number => (Number.isFinite(value) ? clamp(value, 0, 1) : 0);

const BAR_PITCH = MEESHY_WAVE_PLAYER_MEASURE.barWidth + MEESHY_WAVE_PLAYER_MEASURE.barGap;

export const meeshyWaveBarsLaw = {
  /** Une barre tous les 6 px au plus, une au moins. */
  barCount: (width: number): number => Math.max(1, Math.floor(width / BAR_PITCH)),
  /** Les niveaux, rééchantillonnés sur la largeur ; zéro niveau : des barres plates, jamais une onde inventée. */
  resample: (samples: readonly number[], width: number): readonly number[] => {
    const count = meeshyWaveBarsLaw.barCount(width);
    return samples.length === 0 ? Array.from({ length: count }, () => 0) : Array.from({ length: count }, (_, index) => interpolatedLevel(index, count, samples));
  },
  /** Jamais de barre sous 3 de haut, jamais au-delà de l'onde. */
  heights: (levels: readonly number[], waveHeight: number): readonly number[] =>
    levels.map((level) => clamp(Math.round(unit(level) * waveHeight), MEESHY_WAVE_PLAYER_MEASURE.minBar, waveHeight)),
  /** Le nombre de barres pleines ne dépend que de `progress` : 0 aucune, 1 toutes. */
  filled: (progress: number, count: number): number => Math.round(unit(progress) * count),
} as const;

export type MeeshyWavePlayerRecipeInput = {
  readonly size?: MeeshyWavePlayerSize | undefined;
  readonly phase?: MeeshyWavePlayerPhase | undefined;
  readonly isPlaying?: boolean | undefined;
  readonly progress?: number | undefined;
  readonly duration?: number | undefined;
  readonly clock?: MeeshyWavePlayerClock | undefined;
  readonly isScrubbing?: boolean | undefined;
  readonly scrubFraction?: number | undefined;
  readonly isPressed?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyWavePlayerRecipe = {
  readonly size: MeeshyWavePlayerSize;
  readonly disc: number;
  readonly glyph: number;
  readonly gap: number;
  readonly height: number;
  readonly waveHeight: number;
  readonly barWidth: number;
  readonly barGap: number;
  readonly zoneHeight: number;
  readonly tapTarget: number;
  readonly glyphKind: 'play' | 'pause' | 'replay';
  readonly barsLive: boolean;
  readonly showsRing: boolean;
  readonly isActionable: boolean;
  readonly discOpacity: number;
  readonly pressedScale: number;
  readonly clockSeconds: number | null;
  readonly shownProgress: number;
};

export const meeshyWavePlayerRecipe = (input: MeeshyWavePlayerRecipeInput = {}): MeeshyWavePlayerRecipe => {
  const { size = 'row', phase = 'ready', isPlaying = false, clock = 'remaining', duration } = input;
  const measure = MEESHY_WAVE_PLAYER_MEASURE;
  const shownProgress = input.isScrubbing === true ? unit(input.scrubFraction ?? input.progress ?? 0) : unit(input.progress ?? 0);
  const isAvailable = phase !== 'unavailable';
  const hasDuration = duration !== undefined && Number.isFinite(duration) && duration > 0;
  const seconds = (): number => {
    const total = duration ?? 0;
    if (!isPlaying || clock === 'total') return Math.round(total);
    return Math.round(clock === 'elapsed' ? total * shownProgress : total * (1 - shownProgress));
  };
  return {
    size,
    disc: measure[size].disc,
    glyph: measure[size].glyph,
    gap: measure[size].gap,
    height: measure[size].height,
    waveHeight: measure[size].waveHeight,
    barWidth: measure.barWidth,
    barGap: measure.barGap,
    zoneHeight: measure.zoneHeight,
    tapTarget: Math.max(measure[size].disc, measure.tapTarget),
    glyphKind: isPlaying ? 'pause' : unit(input.progress ?? 0) >= 1 ? 'replay' : 'play',
    barsLive: isPlaying && isAvailable && input.reduceMotion !== true,
    showsRing: phase === 'buffering',
    isActionable: isAvailable,
    discOpacity: isAvailable ? 1 : measure.unavailableOpacity,
    pressedScale: measure.pressedScale,
    clockSeconds: isAvailable && hasDuration ? seconds() : null,
    shownProgress,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyWavePlayerStyle = (recipe: MeeshyWavePlayerRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-wave-disc': rem(recipe.disc),
    '--kit-wave-glyph': rem(recipe.glyph),
    '--kit-wave-gap': rem(recipe.gap),
    '--kit-wave-height': rem(recipe.height),
    '--kit-wave-wave': rem(recipe.waveHeight),
    '--kit-wave-bar': rem(recipe.barWidth),
    '--kit-wave-bar-gap': rem(recipe.barGap),
    '--kit-wave-zone': rem(recipe.zoneHeight),
    '--kit-wave-target': rem(recipe.tapTarget),
    '--kit-wave-pressed': recipe.pressedScale,
    '--kit-wave-disc-opacity': recipe.discOpacity,
    '--kit-wave-clock': rem(MEESHY_WAVE_PLAYER_MEASURE.clockWidth),
    ...(tint === undefined ? {} : { '--kit-wave-tint': tint }),
  }) as CSSProperties;

export const meeshyWaveBarStyle = (height: number, index: number): CSSProperties =>
  ({ '--kit-wave-bar-h': rem(height), '--kit-wave-phase': index % 3 }) as CSSProperties;
